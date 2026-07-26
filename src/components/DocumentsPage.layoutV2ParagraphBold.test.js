// Real-DOM regression test: a layoutV2 template's paragraph/richParagraph blocks get the exact
// same paragraph-row toolbar every other document already has (mode cycle, Bold, Italic,
// Insert-variable, alignment, formatting, insert/delete) - not just a lone Bold button on a
// read-only preview. See documentsCatalogUtils.js's layoutV2ParagraphMarkup/layoutV2ParagraphFromMarkup
// and the `lv2:<index>` scope getTemplateScopeText/withTemplateScopeText understand, which is what
// lets this reuse the entire existing paragraph editor instead of a bespoke layoutV2-only one.
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
// Selection/Range, the same object getContainerSelectionOffsets reads from.
const selectTextNodeRange = (container, start, end) => {
  // Testing Library deliberately has no API for creating a browser Selection. Use a TreeWalker
  // for this small browser-API boundary rather than reaching through the rendered element with
  // firstChild; all discovery and assertions remain user-facing Testing Library queries.
  const textNode = document.createTreeWalker(container, NodeFilter.SHOW_TEXT).nextNode();
  const range = document.createRange();
  range.setStart(textNode, start);
  range.setEnd(textNode, end);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
};

const TEXT_MODE_TITLE = "Text mode - select text and press Bold/Italic; wording isn't editable here. Tap to switch to Template mode.";

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

describe('spec: layoutV2 paragraph blocks get the full paragraph toolbar', () => {
  it('bolds only the selected fragment in Text mode (default), converting it to a richParagraph', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    fireEvent.click(await screen.findByTitle('Edit paragraphs'));

    const field = await screen.findByText('Hello world else');
    selectTextNodeRange(field, 6, 11); // "world"
    // Text mode tracks the active field off a mouseup (the last event of a real drag-select), not
    // a focus event - the read-only display is never focusable itself.
    fireEvent.mouseUp(field);

    fireEvent.click(screen.getByTitle('Bold the selected text'));

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
    expect(await screen.findByText('world', { selector: 'strong' })).toBeInTheDocument();
  });

  it('italicizes the selected fragment via Template mode, mapping to styleOverrides.fontStyle', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    fireEvent.click(await screen.findByTitle('Edit paragraphs'));

    const field = await screen.findByText('Hello world else');
    // eslint-disable-next-line testing-library/no-node-access
    const block = field.closest('.paragraph-editor-block');
    fireEvent.click(within(block).getByTitle(TEXT_MODE_TITLE));
    const textarea = await within(block).findByPlaceholderText('Paragraph');
    fireEvent.focus(textarea);
    textarea.setSelectionRange(6, 11); // "world"

    fireEvent.click(within(block).getByTitle('Italicize the selected text'));

    await waitFor(() => expect(set).toHaveBeenCalledWith(
      'documentsBuilder/templates/doc-1',
      expect.objectContaining({
        layoutV2: expect.objectContaining({
          blocks: [{
            type: 'richParagraph',
            style: 'body',
            runs: [
              { text: 'Hello ', style: undefined, styleOverrides: undefined },
              { text: 'world', style: undefined, styleOverrides: { fontStyle: 'italic' } },
              { text: ' else', style: undefined, styleOverrides: undefined },
            ],
          }],
        }),
      }),
    ));
  });

  it('inserts a new blank paragraph and removes it again, both via the standard +/trash buttons', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    fireEvent.click(await screen.findByTitle('Edit paragraphs'));
    const field = await screen.findByText('Hello world else');
    // eslint-disable-next-line testing-library/no-node-access
    const block = field.closest('.paragraph-editor-block');

    fireEvent.click(within(block).getByTitle('Insert a new paragraph above this one'));
    await waitFor(() => expect(set).toHaveBeenCalledWith(
      'documentsBuilder/templates/doc-1',
      expect.objectContaining({
        layoutV2: expect.objectContaining({
          blocks: [
            { type: 'paragraph', style: 'body', text: '' },
            { type: 'paragraph', style: 'body', text: 'Hello world else' },
          ],
        }),
      }),
    ));

    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    // "Hello world else" matches even before the re-render lands (it was already on screen pre-
    // insert) - wait for the second row's own Delete button to actually exist first, so the block
    // this test then clicks is the freshly re-rendered one, not a stale reference to the old row.
    await waitFor(() => expect(screen.getAllByTitle('Remove this paragraph')).toHaveLength(2));
    const secondField = screen.getByText('Hello world else');
    // eslint-disable-next-line testing-library/no-node-access
    const secondBlock = secondField.closest('.paragraph-editor-block');
    fireEvent.click(within(secondBlock).getByTitle('Remove this paragraph'));
    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() => expect(set).toHaveBeenLastCalledWith(
      'documentsBuilder/templates/doc-1',
      expect.objectContaining({
        layoutV2: expect.objectContaining({
          blocks: [{ type: 'paragraph', style: 'body', text: '' }],
        }),
      }),
    ));
    confirmSpy.mockRestore();
  });

  it('cycles alignment onto the block\'s own styleOverrides, never the shared named style', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    fireEvent.click(await screen.findByTitle('Edit paragraphs'));
    const field = await screen.findByText('Hello world else');
    // eslint-disable-next-line testing-library/no-node-access
    const block = field.closest('.paragraph-editor-block');

    fireEvent.click(within(block).getByLabelText(/Вирівнювання: left/));

    await waitFor(() => expect(set).toHaveBeenCalledWith(
      'documentsBuilder/templates/doc-1',
      expect.objectContaining({
        layoutV2: expect.objectContaining({
          blocks: [{ type: 'paragraph', style: 'body', text: 'Hello world else', styleOverrides: { align: 'center' } }],
        }),
        // The shared named style itself is untouched - only this one block's override changed.
        styleSheet: expect.objectContaining({ body: { fontFamily: 'Times New Roman', fontSizePt: 10 } }),
      }),
    ));
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

    expect(screen.queryByTitle('Insert a new paragraph above this one')).not.toBeInTheDocument();
  });

  // A layoutV2-only document (no legacy beforeTitle/title/paragraphs/logo, e.g.
  // genetic-affinity-certificate) has no real second renderer to switch to/from - the "Exact
  // layout" toggle is a fake choice for it and must stay hidden, unlike a document that either
  // still has real legacy content or is stuck on rendererVersion 1 despite carrying layoutV2
  // blocks (the recovery case the toggle exists for).
  it('hides the renderer toggle for a settled layoutV2-only document, but keeps it for recovery', async () => {
    get.mockImplementation(async path => {
      if (path === 'documentsBuilder/parties') return { exists: () => true, val: () => ({}) };
      if (path === 'documentsBuilder/cases') return { exists: () => false, val: () => null };
      if (path === 'documentsBuilder/templates') {
        return {
          exists: () => true,
          val: () => ({
            'settled-doc': {
              id: 'settled-doc',
              catalogName: 'Settled layoutV2-only doc',
              rendererVersion: 2,
              languages: ['uk'],
              layoutV2: { blocks: [{ type: 'paragraph', style: 'body', text: 'Hello' }] },
            },
            'stuck-doc': {
              id: 'stuck-doc',
              catalogName: 'Stuck on rendererVersion 1',
              rendererVersion: 1,
              languages: ['uk'],
              layoutV2: { blocks: [{ type: 'paragraph', style: 'body', text: 'Hello' }] },
            },
          }),
        };
      }
      return { exists: () => false, val: () => null };
    });

    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);

    // eslint-disable-next-line testing-library/no-node-access
    const settledRowHead = (await screen.findByDisplayValue('Settled layoutV2-only doc')).closest('div');
    fireEvent.click(within(settledRowHead).getByTitle(/Document layout settings/));
    expect(screen.queryByText(/Exact layout/)).not.toBeInTheDocument();

    // eslint-disable-next-line testing-library/no-node-access
    const stuckRowHead = (await screen.findByDisplayValue('Stuck on rendererVersion 1')).closest('div');
    fireEvent.click(within(stuckRowHead).getByTitle(/Document layout settings/));
    expect(await screen.findByText(/Exact layout/)).toBeInTheDocument();
  });

  // A layoutV2-only document (no legacy beforeTitle/title/paragraphs/logo, e.g.
  // genetic-affinity-certificate) has no real second renderer to switch to/from - the "Exact
  // layout" toggle is a fake choice for it and must stay hidden, unlike a document that either
  // still has real legacy content or is stuck on rendererVersion 1 despite carrying layoutV2
  // blocks (the recovery case the toggle exists for).
  it('hides the renderer toggle for a settled layoutV2-only document, but keeps it for recovery', async () => {
    get.mockImplementation(async path => {
      if (path === 'documentsBuilder/parties') return { exists: () => true, val: () => ({}) };
      if (path === 'documentsBuilder/cases') return { exists: () => false, val: () => null };
      if (path === 'documentsBuilder/templates') {
        return {
          exists: () => true,
          val: () => ({
            'settled-doc': {
              id: 'settled-doc',
              catalogName: 'Settled layoutV2-only doc',
              rendererVersion: 2,
              languages: ['uk'],
              layoutV2: { blocks: [{ type: 'paragraph', style: 'body', text: 'Hello' }] },
            },
            'stuck-doc': {
              id: 'stuck-doc',
              catalogName: 'Stuck on rendererVersion 1',
              rendererVersion: 1,
              languages: ['uk'],
              layoutV2: { blocks: [{ type: 'paragraph', style: 'body', text: 'Hello' }] },
            },
          }),
        };
      }
      return { exists: () => false, val: () => null };
    });

    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);

    // eslint-disable-next-line testing-library/no-node-access
    const settledRowHead = (await screen.findByDisplayValue('Settled layoutV2-only doc')).closest('div');
    fireEvent.click(within(settledRowHead).getByTitle(/Document layout settings/));
    expect(screen.queryByText(/Exact layout/)).not.toBeInTheDocument();

    // eslint-disable-next-line testing-library/no-node-access
    const stuckRowHead = (await screen.findByDisplayValue('Stuck on rendererVersion 1')).closest('div');
    fireEvent.click(within(stuckRowHead).getByTitle(/Document layout settings/));
    expect(await screen.findByText(/Exact layout/)).toBeInTheDocument();
  });
});
