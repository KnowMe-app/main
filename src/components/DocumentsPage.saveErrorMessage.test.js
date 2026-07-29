// Real-DOM regression test (batch 26 §3): "Could not save the paragraph edits" used to fire no
// matter what actually went wrong - a stray `undefined` value the edit itself produced (which
// Firebase's set() rejects outright), a permission error, a network blip, all looked identical to
// the admin. persistTemplate/writeTemplateToFirebase (DocumentsPage.jsx) now (a) sanitizes the
// template before every write, so a stray undefined never reaches Firebase and blocks the save at
// all, and (b) classifies whatever *does* fail via describeDocumentSaveError instead of showing one
// generic string regardless of cause.
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import {
  render, screen, fireEvent, waitFor, within,
} from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('firebase/database', () => ({
  ref: jest.fn(),
  get: jest.fn(),
  set: jest.fn(),
  update: jest.fn(),
}));

jest.mock('./config', () => ({
  auth: { currentUser: { uid: 'test-admin' } },
  database: {},
  deleteStorageFile: jest.fn(),
  getStorageFileDataUrl: jest.fn(),
  listStorageFolderFileNames: jest.fn(),
  uploadFileToStorageFolder: jest.fn(),
}));

jest.mock('utils/accessLevel', () => ({ isInvoiceBuilderUid: () => true }));
jest.mock('utils/pdfImageEncoding', () => ({ reencodePdfImageDataUrl: jest.fn() }));

const mockToastError = jest.fn();
jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { error: (...args) => mockToastError(...args), success: jest.fn() },
}));

// eslint-disable-next-line import/first
import { ref, get, set } from 'firebase/database';
// eslint-disable-next-line import/first
import { listStorageFolderFileNames } from './config';
// eslint-disable-next-line import/first
import DocumentsPage from './DocumentsPage';

beforeEach(() => {
  mockToastError.mockClear();
  ref.mockImplementation((_db, path) => path);
  get.mockImplementation(async path => {
    if (path === 'documentsBuilder/parties') return { exists: () => true, val: () => ({}) };
    if (path === 'documentsBuilder/cases') return { exists: () => false, val: () => null };
    if (path === 'documentsBuilder/templates') {
      return {
        exists: () => true,
        val: () => ({
          'doc-1': {
            id: 'doc-1',
            title: { uk: 'Заява', en: 'Statement' },
            paragraphs: [{ uk: 'Абзац.', en: 'Paragraph.' }],
          },
        }),
      };
    }
    return { exists: () => false, val: () => null };
  });
  listStorageFolderFileNames.mockResolvedValue([]);
});

const PARAGRAPH_FORMAT_TITLE = 'Paragraph formatting - font size (pt), first-line indent (cm), and condition; empty = inherit/always shown';

const triggerParagraphSave = async () => {
  render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
  fireEvent.click(await screen.findByTitle('Edit paragraphs'));
  const field = await screen.findByText('Абзац.');
  // eslint-disable-next-line testing-library/no-node-access
  const block = field.closest('.paragraph-editor-block');
  fireEvent.click(within(block).getByTitle(PARAGRAPH_FORMAT_TITLE));
  const indentField = within(block).getByLabelText('First line indent (cm)');
  fireEvent.change(indentField, { target: { value: '2' } });
  fireEvent.blur(indentField);
};

describe('spec (batch 26 §3): a rejected save names its actual cause instead of one generic message', () => {
  it('a stray-undefined-value rejection reads as an invalid-value message, not the old generic one', async () => {
    set.mockRejectedValue(new Error("Reference.set failed: First argument contains undefined in property 'paragraphs.0.style'"));
    await triggerParagraphSave();
    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
    const [message] = mockToastError.mock.calls[0];
    expect(message).toMatch(/empty value/i);
    expect(message).not.toBe('Could not save the paragraph edits.');
  });

  it('a permission-denied rejection reads as a permission message', async () => {
    set.mockRejectedValue(new Error('PERMISSION_DENIED: Permission denied'));
    await triggerParagraphSave();
    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
    expect(mockToastError.mock.calls[0][0]).toMatch(/permission/i);
  });

  it('a network-failure rejection reads as a network message', async () => {
    set.mockRejectedValue(new Error('network request failed'));
    await triggerParagraphSave();
    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
    expect(mockToastError.mock.calls[0][0]).toMatch(/network/i);
  });

  it('an unclassified rejection still falls back to this action\'s own specific message', async () => {
    set.mockRejectedValue(new Error('something odd happened'));
    await triggerParagraphSave();
    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
    expect(mockToastError.mock.calls[0][0]).toBe('Could not save the paragraph edits.');
  });

  it('a template edit that would carry a stray undefined is sanitized before ever reaching Firebase', async () => {
    set.mockResolvedValue(undefined);
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    fireEvent.click(await screen.findByTitle('Edit paragraphs'));
    const field = await screen.findByText('Абзац.');
    // eslint-disable-next-line testing-library/no-node-access
    const block = field.closest('.paragraph-editor-block');
    fireEvent.click(within(block).getByTitle(PARAGRAPH_FORMAT_TITLE));
    const indentField = within(block).getByLabelText('First line indent (cm)');
    fireEvent.change(indentField, { target: { value: '2' } });
    fireEvent.blur(indentField);

    await waitFor(() => expect(set).toHaveBeenCalled());
    const [, savedTemplate] = set.mock.calls.find(call => call[0] === 'documentsBuilder/templates/doc-1');
    const traverse = value => {
      if (Array.isArray(value)) return value.every(traverse);
      if (value && typeof value === 'object') return Object.values(value).every(entry => entry !== undefined && traverse(entry));
      return true;
    };
    expect(traverse(savedTemplate)).toBe(true);
  });
});
