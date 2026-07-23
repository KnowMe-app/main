// Real-DOM regression test: Bold/Italic now also work on raw Template-mode text (beforeTitle
// blocks, and a paragraph while in Template mode), not just a case's resolved-value override -
// needed so an admin can mark up a shared placeholder like {{surrogateMother.name.uk.nominative}}
// as bold directly, the way the reference notarial statement does. Also covers the align/bold
// picker removal on beforeTitle rows (spec: "прибери прапорці лефт, bold, вони не треба").
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

beforeEach(() => {
  ref.mockImplementation((_db, path) => path);
  get.mockImplementation(async path => {
    if (path === 'documentsBuilder/parties') {
      return {
        exists: () => true,
        val: () => ({
          couples: { 'couple-1': { id: 'couple-1', partners: [{ id: 'p1', role: 'wife', name: { uk: { nominative: 'Тестова Марія' }, en: 'Testova Mariia' } }] } },
          surrogateMothers: { 'surrogate-1': { id: 'surrogate-1', name: { uk: { nominative: 'Сурогатна Матір' } } } },
          cases: { 'case-1': { id: 'case-1', relations: { coupleId: 'couple-1', surrogateMotherId: 'surrogate-1' } } },
        }),
      };
    }
    if (path === 'documentsBuilder/templates') {
      return {
        exists: () => true,
        val: () => ({
          'doc-1': {
            id: 'doc-1',
            title: { uk: 'Заява', en: 'Statement' },
            beforeTitle: [{ uk: 'Сурогатна мати {{surrogateMother.name.uk.nominative}}', en: '', align: 'left' }],
            paragraphs: [{ uk: 'Звичайний текст без форматування.', en: 'Plain text without formatting.' }],
          },
        }),
      };
    }
    return { exists: () => false, val: () => null };
  });
  set.mockResolvedValue(undefined);
  listStorageFolderFileNames.mockResolvedValue([]);
  window.confirm = jest.fn(() => true);
});

describe('spec: beforeTitle rows drop the align/bold pickers, unified with paragraph style', () => {
  it('renders the beforeTitle text with a Bold/Italic toolbar, no align <select> or Bold checkbox', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    fireEvent.click(await screen.findByTitle('Edit paragraphs'));

    await screen.findByDisplayValue('Сурогатна мати {{surrogateMother.name.uk.nominative}}');

    expect(screen.queryByText('left')).not.toBeInTheDocument();
    expect(screen.queryByText('right')).not.toBeInTheDocument();
    expect(screen.queryByText('Bold')).not.toBeInTheDocument();
  });

  it('has the same +/Bold/Italic/Insert-variable/Remove buttons as a paragraph row, but no template/input/text mode button (spec follow-up)', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    fireEvent.click(await screen.findByTitle('Edit paragraphs'));

    const textarea = await screen.findByDisplayValue('Сурогатна мати {{surrogateMother.name.uk.nominative}}');
    // eslint-disable-next-line testing-library/no-node-access
    const block = textarea.closest('.paragraph-editor-block');

    expect(within(block).getByTitle('Insert a new block above this one')).toBeInTheDocument();
    expect(within(block).getByTitle('Bold the selected text')).toBeInTheDocument();
    expect(within(block).getByTitle('Italicize the selected text')).toBeInTheDocument();
    expect(within(block).getByTitle('Insert a variable')).toBeInTheDocument();
    expect(within(block).getByTitle('Remove this block')).toBeInTheDocument();
    // No template/input/text mode cycle - beforeTitle always edits the raw markup directly.
    expect(within(block).queryByText('{}')).not.toBeInTheDocument();
    expect(within(block).queryByText('I')).not.toBeInTheDocument();
    expect(within(block).queryByText('T')).not.toBeInTheDocument();
  });

  it('"+" inserts a new block above this one, persisted straight to the template', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    fireEvent.click(await screen.findByTitle('Edit paragraphs'));

    const textarea = await screen.findByDisplayValue('Сурогатна мати {{surrogateMother.name.uk.nominative}}');
    // eslint-disable-next-line testing-library/no-node-access
    const block = textarea.closest('.paragraph-editor-block');
    fireEvent.click(within(block).getByTitle('Insert a new block above this one'));

    await waitFor(() => expect(set).toHaveBeenCalledWith(
      'documentsBuilder/templates/doc-1',
      expect.objectContaining({
        beforeTitle: [
          expect.objectContaining({ uk: '' }),
          expect.objectContaining({ uk: 'Сурогатна мати {{surrogateMother.name.uk.nominative}}' }),
        ],
      }),
    ));
  });

  it('"Remove" deletes this block, persisted straight to the template', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    fireEvent.click(await screen.findByTitle('Edit paragraphs'));

    const textarea = await screen.findByDisplayValue('Сурогатна мати {{surrogateMother.name.uk.nominative}}');
    // eslint-disable-next-line testing-library/no-node-access
    const block = textarea.closest('.paragraph-editor-block');
    fireEvent.click(within(block).getByTitle('Remove this block'));

    await waitFor(() => expect(set).toHaveBeenCalledWith(
      'documentsBuilder/templates/doc-1',
      expect.objectContaining({ beforeTitle: [] }),
    ));
  });

  it('Bold wraps the raw beforeTitle text in ** and writes it straight to the template (no case needed)', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    fireEvent.click(await screen.findByTitle('Edit paragraphs'));

    const textarea = await screen.findByDisplayValue('Сурогатна мати {{surrogateMother.name.uk.nominative}}');
    fireEvent.focus(textarea);
    textarea.setSelectionRange(0, 14); // "Сурогатна мати"

    // eslint-disable-next-line testing-library/no-node-access
    const block = textarea.closest('.paragraph-editor-block');
    fireEvent.click(within(block).getByTitle('Bold the selected text'));

    await waitFor(() => expect(set).toHaveBeenCalledWith(
      'documentsBuilder/templates/doc-1',
      expect.objectContaining({
        beforeTitle: [expect.objectContaining({ uk: '**Сурогатна мати** {{surrogateMother.name.uk.nominative}}' })],
      }),
    ));
  });

  // Notarial layout standard §3.3: the signer block gets one left-offset handle for the whole
  // block (30-65% of the text width, default ≈47% = 8.5 cm), persisted per document as a single
  // beforeTitleOffsetPercent field - not the old per-block width slider.
  it('the signer-block offset handle defaults to 8.5 cm (≈47%) and persists a dragged value on release', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    fireEvent.click(await screen.findByTitle('Edit paragraphs'));

    await screen.findByDisplayValue('Сурогатна мати {{surrogateMother.name.uk.nominative}}');
    const slider = screen.getByLabelText('Відступ блоку підписанта');
    expect(slider).toHaveValue('47.2');

    fireEvent.change(slider, { target: { value: '60' } });
    expect(screen.getByText('60.0% (≈10.8 см)')).toBeInTheDocument();
    expect(set).not.toHaveBeenCalled(); // not yet released

    fireEvent.mouseUp(slider);

    await waitFor(() => expect(set).toHaveBeenCalledWith(
      'documentsBuilder/templates/doc-1',
      expect.objectContaining({ beforeTitleOffsetPercent: 60 }),
    ));
  });
});

describe('spec: Bold/Italic also work on a paragraph while in Template mode', () => {
  it('Bold wraps the raw {{placeholder}} markup text and persists to the shared template, not a per-case override', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    fireEvent.click(await screen.findByTitle('Edit paragraphs'));

    // Default mode is 'text'; one tap of the cycling mode button goes straight to 'template'
    // (spec §3: template -> input -> text -> template).
    const field = await screen.findByText('Звичайний текст без форматування.');
    // eslint-disable-next-line testing-library/no-node-access
    const block = field.closest('.paragraph-editor-block');
    fireEvent.click(within(block).getByTitle(
      "Text mode - select text and press Bold/Italic; wording isn't editable here. Tap to switch to Template mode.",
    ));
    const textarea = await within(block).findByDisplayValue('Звичайний текст без форматування.');
    fireEvent.focus(textarea);
    textarea.setSelectionRange(10, 15); // "текст"

    fireEvent.click(within(block).getByTitle('Bold the selected text'));

    await waitFor(() => expect(set).toHaveBeenCalledWith(
      'documentsBuilder/templates/doc-1',
      expect.objectContaining({
        paragraphs: [expect.objectContaining({ uk: 'Звичайний **текст** без форматування.' })],
      }),
    ));
  });
});
