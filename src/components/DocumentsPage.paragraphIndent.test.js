// Real-DOM regression test for the per-paragraph formatting popover (batch 2026-07-23 B §1.3/
// §1.4): font size + first-line indent are numeric plain-text fields in a popover opened from the
// paragraph toolbar - the old draggable slider is gone. An empty field shows the inherited
// document value as a ghost placeholder; typing sets the override (stored under the paragraph's
// single `style` key), clearing the field removes it - no separate reset control.
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
        }),
      };
    }
    if (path === 'documentsBuilder/cases') {
      return {
        exists: () => true,
        val: () => ({ 'case-1': { id: 'case-1', relations: { coupleId: 'couple-1' } } }),
      };
    }
    if (path === 'documentsBuilder/templates') {
      return {
        exists: () => true,
        val: () => ({
          'doc-1': {
            id: 'doc-1',
            title: { uk: 'Заява', en: 'Statement' },
            paragraphs: [
              { uk: 'Абзац з відступом.', en: 'Indented paragraph.', indentCm: 1 },
              { uk: 'Абзац без відступу.', en: 'Not-indented paragraph.' },
            ],
          },
        }),
      };
    }
    return { exists: () => false, val: () => null };
  });
  set.mockResolvedValue(undefined);
  listStorageFolderFileNames.mockResolvedValue([]);
});

const PARAGRAPH_FORMAT_TITLE = 'Paragraph formatting - font size (pt) and first-line indent (cm); empty = inherit the document value';

const openParagraphPopover = async paragraphText => {
  const field = await screen.findByText(paragraphText);
  // eslint-disable-next-line testing-library/no-node-access
  const block = field.closest('.paragraph-editor-block');
  fireEvent.click(within(block).getByTitle(PARAGRAPH_FORMAT_TITLE));
  return block;
};

describe('spec: per-paragraph formatting popover (no sliders anywhere, §1.4)', () => {
  it('renders no range slider for indents or the signer-block offset', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    fireEvent.click(await screen.findByTitle('Edit paragraphs'));
    await screen.findByText('Абзац з відступом.');
    expect(screen.queryAllByRole('slider')).toHaveLength(0);
  });

  it('shows the stored override, and the inherited document value only as a ghost placeholder', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    fireEvent.click(await screen.findByTitle('Edit paragraphs'));

    const indentedBlock = await openParagraphPopover('Абзац з відступом.');
    const indentField = within(indentedBlock).getByLabelText('First line indent (cm)');
    expect(indentField).toHaveValue('1');

    fireEvent.click(within(indentedBlock).getByTitle(PARAGRAPH_FORMAT_TITLE)); // close the first popover
    const plainBlock = await openParagraphPopover('Абзац без відступу.');
    const inheritedField = within(plainBlock).getByLabelText('First line indent (cm)');
    expect(inheritedField).toHaveValue('');
    expect(inheritedField).toHaveAttribute('placeholder', '1.5'); // notarial standard §3.1 default
  });

  it('typing an indent sets the override under the paragraph `style` key and persists on blur', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    fireEvent.click(await screen.findByTitle('Edit paragraphs'));

    const plainBlock = await openParagraphPopover('Абзац без відступу.');
    const indentField = within(plainBlock).getByLabelText('First line indent (cm)');
    fireEvent.change(indentField, { target: { value: '2.5' } });
    fireEvent.blur(indentField);

    // All per-paragraph styles persist together under each paragraph's single `style` key - the
    // legacy flat indentCm the first paragraph was loaded with is consolidated on the same write.
    await waitFor(() => expect(set).toHaveBeenCalledWith(
      'documentsBuilder/templates/doc-1',
      expect.objectContaining({
        paragraphs: [
          expect.objectContaining({ style: { indentCm: 1 } }),
          expect.objectContaining({ style: { indentCm: 2.5 } }),
        ],
      }),
    ));
    const [, persistedTemplate] = set.mock.calls.find(call => call[0] === 'documentsBuilder/templates/doc-1');
    expect(persistedTemplate.paragraphs.some(paragraph => 'indentCm' in paragraph)).toBe(false);
  });

  it('clearing the field removes the override (back to inheriting) - no separate reset control', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    fireEvent.click(await screen.findByTitle('Edit paragraphs'));

    const indentedBlock = await openParagraphPopover('Абзац з відступом.');
    const indentField = within(indentedBlock).getByLabelText('First line indent (cm)');
    fireEvent.change(indentField, { target: { value: '' } });
    fireEvent.blur(indentField);

    // Clearing the only style drops the paragraph's `style` key entirely - nothing redundant
    // stays behind on the backend record.
    await waitFor(() => expect(set).toHaveBeenCalledWith(
      'documentsBuilder/templates/doc-1',
      expect.objectContaining({
        paragraphs: [
          expect.not.objectContaining({ style: expect.anything() }),
          expect.anything(),
        ],
      }),
    ));
    expect(screen.queryByTitle('Скинути до відступу документа')).not.toBeInTheDocument();
  });

  it('a per-paragraph font size persists under the same `style` key as the indent', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    fireEvent.click(await screen.findByTitle('Edit paragraphs'));

    const indentedBlock = await openParagraphPopover('Абзац з відступом.');
    const sizeField = within(indentedBlock).getByLabelText('Font size (pt)');
    expect(sizeField).toHaveValue('');
    expect(sizeField).toHaveAttribute('placeholder', '12');
    fireEvent.change(sizeField, { target: { value: '10' } });
    fireEvent.blur(sizeField);

    await waitFor(() => expect(set).toHaveBeenCalledWith(
      'documentsBuilder/templates/doc-1',
      expect.objectContaining({
        paragraphs: [
          expect.objectContaining({ style: { indentCm: 1, fontSize: 10 } }),
          expect.anything(),
        ],
      }),
    ));
  });
});

describe('spec: document-level formatting popover in the header row (§1.2)', () => {
  it('stores typed defaults as the document\'s sparse format overrides, cleared field = shared value', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    fireEvent.click(await screen.findByTitle('Edit paragraphs'));
    await screen.findByText('Абзац з відступом.');

    fireEvent.click(screen.getByTitle('Document formatting - font size (pt) and first-line indent (cm) inherited by all paragraphs'));
    const sizeField = screen.getByLabelText('Font size (pt)');
    expect(sizeField).toHaveValue('');
    expect(sizeField).toHaveAttribute('placeholder', '12'); // the shared reference default
    fireEvent.change(sizeField, { target: { value: '14' } });
    fireEvent.blur(sizeField);

    await waitFor(() => expect(set).toHaveBeenCalledWith(
      'documentsBuilder/templates/doc-1',
      expect.objectContaining({ format: { fontSize: 14 } }),
    ));
  });
});

describe('spec: one alignment button per paragraph, MS Word cycle (§1.5)', () => {
  it('shows the effective alignment (justify for body text) and one click stores the next state', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    fireEvent.click(await screen.findByTitle('Edit paragraphs'));

    const field = await screen.findByText('Абзац без відступу.');
    // eslint-disable-next-line testing-library/no-node-access
    const block = field.closest('.paragraph-editor-block');
    const alignButton = within(block).getByLabelText('Вирівнювання: justify');

    fireEvent.click(alignButton); // Justify → Left (the cycle wraps around)

    await waitFor(() => expect(set).toHaveBeenCalledWith(
      'documentsBuilder/templates/doc-1',
      expect.objectContaining({
        paragraphs: [
          expect.anything(),
          expect.objectContaining({ style: { align: 'left' } }),
        ],
      }),
    ));
    await within(block).findByLabelText('Вирівнювання: left');
  });
});

describe('spec: PDF-true preview block (Task 4)', () => {
  it('renders a collapsible preview block as the last block of the expanded document', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    fireEvent.click(await screen.findByTitle('Edit paragraphs'));
    await screen.findByText('Абзац з відступом.');

    expect(screen.getByText('PDF preview')).toBeInTheDocument();
    // Default expanded (spec §4.2) - the collapse control is showing.
    expect(screen.getByTitle('Collapse the PDF preview')).toBeInTheDocument();
    // Lazy: nothing generated until the block is actually visible (no IntersectionObserver in
    // jsdom, so it stays in the not-yet-visible state).
    expect(screen.getByText('Прев\'ю згенерується, щойно блок буде видно.')).toBeInTheDocument();
  });
});
