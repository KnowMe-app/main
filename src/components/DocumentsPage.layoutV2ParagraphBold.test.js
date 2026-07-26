// Real-DOM regression test (batch 25 §3): a layoutV2 template previously had no way in the UI to
// select a text fragment inside one of its `paragraph`/`richParagraph` blocks and bold just that
// fragment - the Style Editor only edits whole named styles, and the legacy title/beforeTitle/
// paragraphs editor only ever touches the legacy (non-layoutV2) fields. This drives a genuine
// browser selection through the new per-block Bold button (mirroring the legacy Text-mode
// mechanism, batch 17) to prove the wiring end to end, not just the pure toggleLayoutV2ParagraphBold
// logic already covered in documentsCatalogUtils.test.js.
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

// eslint-disable-next-line import/first
import { ref, get, set } from 'firebase/database';
// eslint-disable-next-line import/first
import { listStorageFolderFileNames } from './config';
// eslint-disable-next-line import/first
import DocumentsPage from './DocumentsPage';

// Selects `text.slice(start, end)` of a single-text-node DOM element via a genuine browser
// Selection/Range, the same object getContainerSelectionOffsets (used by both the legacy Text-mode
// Bold button and this new layoutV2 one) reads from.
const selectTextNodeRange = (container, start, end) => {
  const textNode = container.firstChild;
  const range = document.createRange();
  range.setStart(textNode, start);
  range.setEnd(textNode, end);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
};

beforeEach(() => {
  ref.mockImplementation((_db, path) => path);
  get.mockImplementation(async path => {
    if (path === 'documentsBuilder/parties') {
      return { exists: () => true, val: () => ({}) };
    }
    if (path === 'documentsBuilder/cases') {
      return { exists: () => false, val: () => null };
    }
    if (path === 'documentsBuilder/templates') {
      return {
        exists: () => true,
        val: () => ({
          'doc-1': {
            id: 'doc-1',
            catalogName: 'Genetic affinity certificate',
            rendererVersion: 2,
            languages: ['uk'],
            page: {
              size: 'A4', widthMm: 210, heightMm: 297, marginsMm: {
                top: 5, right: 15, bottom: 10, left: 15,
              },
            },
            styleSheet: { body: { fontFamily: 'Times New Roman', fontSizePt: 10 } },
            layoutV2: {
              contentWidthMm: 180,
              blocks: [{ type: 'paragraph', style: 'body', text: 'Hello world else' }],
            },
          },
        }),
      };
    }
    return { exists: () => false, val: () => null };
  });
  set.mockResolvedValue(undefined);
  listStorageFolderFileNames.mockResolvedValue([]);
});

describe('spec: layoutV2 paragraph blocks - selection-based Bold (batch 25 §3)', () => {
  it('bolds only the selected fragment of a layoutV2 paragraph block, converting it to a richParagraph', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    fireEvent.click(await screen.findByTitle('Edit paragraphs'));

    const field = await screen.findByText('Hello world else');
    // eslint-disable-next-line testing-library/no-node-access
    const blockColumn = field.closest('.paragraph-editor-block');
    selectTextNodeRange(field, 6, 11); // "world"

    fireEvent.click(within(blockColumn).getByTitle('Bold the selected text'));

    await waitFor(() => expect(set).toHaveBeenCalledWith(
      'documentsBuilder/templates/doc-1',
      expect.objectContaining({
        layoutV2: expect.objectContaining({
          blocks: [{
            type: 'richParagraph',
            style: 'body',
            runs: [
              { text: 'Hello ', style: undefined },
              { text: 'world', style: 'inlineEmphasis' },
              { text: ' else', style: undefined },
            ],
          }],
        }),
      }),
    ));

    // The bold fragment now renders as <strong>, right in place - no separate preview to catch up.
    const boldFragment = await within(blockColumn).findByText('world');
    // eslint-disable-next-line testing-library/no-node-access
    expect(boldFragment.closest('strong')).toBeInTheDocument();
  });

  it('does not show the layoutV2 paragraph section for a legacy (non-layoutV2) template', async () => {
    get.mockImplementation(async path => {
      if (path === 'documentsBuilder/parties') return { exists: () => true, val: () => ({}) };
      if (path === 'documentsBuilder/cases') return { exists: () => false, val: () => null };
      if (path === 'documentsBuilder/templates') {
        return {
          exists: () => true,
          val: () => ({
            'doc-1': { id: 'doc-1', title: { uk: 'Заява' }, paragraphs: [{ uk: 'Звичайний текст.' }] },
          }),
        };
      }
      return { exists: () => false, val: () => null };
    });

    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    fireEvent.click(await screen.findByTitle('Edit paragraphs'));
    await screen.findByText('Звичайний текст.');

    expect(screen.queryByText('layoutV2 paragraphs - select text, Bold the fragment')).not.toBeInTheDocument();
  });
});
