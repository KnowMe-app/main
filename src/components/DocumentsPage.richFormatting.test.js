// Real-DOM regression test for the selection-based Bold/Italic feature (batch 13 §1): mounts the
// actual DocumentsPage component (Firebase mocked out) and drives a genuine browser textarea
// selection through the Bold button, to catch any wiring bug independent of mobile-specific touch
// quirks (this is the actual React component, not just the pure logic it calls).
//
// NOTE: this project's Jest config sets `resetMocks: true`, which strips every mock's
// implementation before each test - so the mock bodies below must be (re-)installed in
// beforeEach, not just in the jest.mock(...) factory (which only runs once at hoist time).
//
// Post-migration (batch 2026-07-24): the per-case "data mode" resolved-text overrides on
// title/paragraph rows are gone. A paragraph (and the title) is now always the raw
// `{{placeholder}}` template markup - there is no mode-toggle button and no rendered
// resolved-value display for these rows anymore, so Bold/Italic act directly on the textarea's
// native selection and always persist to the shared template.
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
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

// eslint-disable-next-line import/first
import { ref, get, set } from 'firebase/database';
// eslint-disable-next-line import/first
import { listStorageFolderFileNames } from './config';
// eslint-disable-next-line import/first
import DocumentsPage from './DocumentsPage';

beforeEach(() => {
  ref.mockImplementation((_db, path) => path);
  get.mockImplementation(async path => {
    if (path === 'documentsBuilder/parties') {
      return {
        exists: () => true,
        val: () => ({
          couples: { 'couple-1': { id: 'couple-1', partners: [{ id: 'p1', role: 'wife', name: { uk: { nominative: 'Тестова Марія' }, en: 'Testova Mariia' } }] } },
        }),
      };
    }
    if (path === 'documentsBuilder/cases') {
      return {
        exists: () => true,
        val: () => ({
          'case-1': { id: 'case-1', relations: { coupleId: 'couple-1' } },
        }),
      };
    }
    if (path === 'documentsBuilder/templates') {
      return {
        exists: () => true,
        val: () => ({
          'doc-1': {
            id: 'doc-1',
            title: { uk: 'Тест', en: 'Test' },
            paragraphs: [{ uk: 'Звичайний текст без форматування.', en: 'Plain text without formatting.' }],
          },
        }),
      };
    }
    return { exists: () => false, val: () => null };
  });
  set.mockResolvedValue(undefined);
  listStorageFolderFileNames.mockResolvedValue([]);
});

describe('spec: selection-based bold/italic applies to the browser selection, not the whole paragraph', () => {
  it('bolds only the selected fragment of a paragraph field (raw template markup)', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);

    const expandButton = await screen.findByTitle('Edit paragraphs');
    fireEvent.click(expandButton);

    // A paragraph is always the raw template textarea now - no mode to switch, no separate
    // rendered display to select text in.
    const textarea = await screen.findByDisplayValue('Звичайний текст без форматування.');
    // eslint-disable-next-line testing-library/no-node-access
    const paragraphBlock = textarea.closest('.paragraph-editor-block');

    fireEvent.focus(textarea);
    textarea.setSelectionRange(10, 15); // "текст"

    // Bold/Italic also appear on the Title row above (spec: unified format across every
    // editable row) - scope the query to this paragraph's own boxed controls, same as a sighted
    // admin would click the toolbar right above this specific field.
    const boldButton = within(paragraphBlock).getByTitle('Bold the selected text');
    fireEvent.click(boldButton);

    await waitFor(() => expect(set).toHaveBeenCalled());
    const [, payload] = set.mock.calls[set.mock.calls.length - 1];
    expect(payload.paragraphs[0].uk).toBe('Звичайний **текст** без форматування.');
    // The change is applied in place, right in the raw markup textarea - never a separate
    // preview to catch up.
    expect(await within(paragraphBlock).findByDisplayValue('Звичайний **текст** без форматування.')).toBeInTheDocument();
  });

  it('also applies via touch (mobile), where preventing the selection-dismissing touchstart suppresses the synthetic click', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);

    const expandButton = await screen.findByTitle('Edit paragraphs');
    fireEvent.click(expandButton);

    const textarea = await screen.findByDisplayValue('Звичайний текст без форматування.');
    // eslint-disable-next-line testing-library/no-node-access
    const paragraphBlock = textarea.closest('.paragraph-editor-block');

    fireEvent.focus(textarea);
    textarea.setSelectionRange(10, 15); // "текст"

    const italicButton = within(paragraphBlock).getByTitle('Italicize the selected text');
    // No fireEvent.click - mobile browsers won't synthesize one once touchstart's default is
    // prevented (exactly what the button needs to do to keep the selection alive), so the
    // touchend handler itself must be what triggers the action.
    fireEvent.touchStart(italicButton);
    fireEvent.touchEnd(italicButton);

    await waitFor(() => expect(set).toHaveBeenCalled());
    const [, payload] = set.mock.calls[set.mock.calls.length - 1];
    expect(payload.paragraphs[0].uk).toBe('Звичайний *текст* без форматування.');
  });
});

describe('spec: title/paragraph rows have a single always-template editing surface', () => {
  it('does not render the old global Template/Data section toggle', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    await screen.findByTitle('Edit paragraphs');
    expect(screen.queryByTitle('Edit the raw {{placeholder}} tokens of the shared template')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Edit the resolved values of the selected case directly')).not.toBeInTheDocument();
  });

  it('editing a paragraph directly edits and persists the shared template, not a per-case override', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    const expandButton = await screen.findByTitle('Edit paragraphs');
    fireEvent.click(expandButton);

    // Paragraphs no longer have a mode-toggle button (spec: raw {{placeholder}} markup is the
    // only surface, shared across every case) - the textarea is already showing/editing it.
    const textarea = await screen.findByDisplayValue('Звичайний текст без форматування.');
    // eslint-disable-next-line testing-library/no-node-access
    const paragraphBlock = textarea.closest('.paragraph-editor-block');
    expect(within(paragraphBlock).queryByTitle(
      "Text mode - select text and press Bold/Italic; wording isn't editable here. Tap to switch to Template mode.",
    )).not.toBeInTheDocument();

    fireEvent.change(textarea, { target: { value: 'Змінений шаблонний текст.' } });
    fireEvent.blur(textarea);

    await waitFor(() => expect(set).toHaveBeenCalledWith(
      'documentsBuilder/templates/doc-1',
      expect.objectContaining({ paragraphs: [expect.objectContaining({ uk: 'Змінений шаблонний текст.' })] }),
    ));
  });

  it('shows an inline-editable Documents-list name next to the checkbox, separate from the in-document title', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    await screen.findByTitle('Edit paragraphs');

    // No catalogName saved yet, so the field falls back to showing the title text - but editing it
    // writes catalogName only (spec batch 21 §6), never template.title.
    const nameInput = await screen.findByDisplayValue('Тест');
    fireEvent.change(nameInput, { target: { value: 'Оновлена назва' } });
    fireEvent.blur(nameInput);

    await waitFor(() => expect(set).toHaveBeenCalledWith(
      'documentsBuilder/templates/doc-1',
      expect.objectContaining({ catalogName: 'Оновлена назва', title: expect.objectContaining({ uk: 'Тест' }) }),
    ));
  });
});
