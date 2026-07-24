// Real-DOM regression test for the Insert-variable toolbar button + modal (spec: "поруч з
// курсивом кнопку при натисканні на яку відкривається модальне вікно в якому можна обрати
// змінні"): mounts the actual DocumentsPage component (Firebase mocked out), opens the picker from
// a Template-mode paragraph field, and drives a real click on a grouped item to insert {{path}} at
// the captured cursor position.
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import {
  render, screen, fireEvent, waitFor, within, act,
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
          couples: { 'couple-1': { id: 'couple-1', partners: [{ id: 'p1', role: 'wife', name: { uk: { nominative: 'Кьогоку Ая' }, en: 'Kyogoku Aya' } }] } },
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
            paragraphs: [{ uk: 'Я, ', en: 'I, ' }],
          },
        }),
      };
    }
    return { exists: () => false, val: () => null };
  });
  set.mockResolvedValue(undefined);
  listStorageFolderFileNames.mockResolvedValue([]);
});

describe('spec: insert-variable button + modal', () => {
  it('is disabled outside Template mode and enabled once the paragraph is switched to Template mode', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    fireEvent.click(await screen.findByTitle('Edit paragraphs'));
    const field = await screen.findByText('Я,');
    // eslint-disable-next-line testing-library/no-node-access
    const block = field.closest('.paragraph-editor-block');

    expect(within(block).getByTitle('Insert a variable')).toBeDisabled();

    fireEvent.click(within(block).getByTitle(
      "Text mode - select text and press Bold/Italic; wording isn't editable here. Tap to switch to Template mode.",
    ));
    expect(within(block).getByTitle('Insert a variable')).toBeEnabled();
  });

  it('opens the modal grouped one-per-role (Дружина/Сурогатна мати/Довірена особа/...), showing the resolved value', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    fireEvent.click(await screen.findByTitle('Edit paragraphs'));
    const field = await screen.findByText('Я,');
    // eslint-disable-next-line testing-library/no-node-access
    const block = field.closest('.paragraph-editor-block');
    // Default mode is 'text'; one tap of the cycling mode button goes straight to 'template'.
    fireEvent.click(within(block).getByTitle(
      "Text mode - select text and press Bold/Italic; wording isn't editable here. Tap to switch to Template mode.",
    ));
    const textarea = await within(block).findByPlaceholderText('Paragraph (uk)');
    fireEvent.focus(textarea);
    textarea.setSelectionRange(3, 3);

    fireEvent.click(within(block).getByTitle('Insert a variable'));

    expect(await screen.findByText('Дружина')).toBeInTheDocument();
    expect(screen.getByText('Сурогатна мати')).toBeInTheDocument();
    expect(screen.getByText('Довірена особа')).toBeInTheDocument();
    // No clinic is linked, so it defaults into the Ukrainian group (empty); the foreign-clinic
    // group's predicate fails entirely and it doesn't render at all.
    expect(screen.getByText('Клініка — українська')).toBeInTheDocument();
    expect(screen.queryByText('Клініка — іноземна')).not.toBeInTheDocument();
    // The picked wife's name is shown in its resolved final-format form, not the raw path.
    expect(screen.getByText('Кьогоку Ая')).toBeInTheDocument();
    expect(screen.queryByText('wife.name.uk.nominative')).not.toBeInTheDocument();
  });

  it('clicking an item inserts {{path}} at the captured cursor position and persists to the template', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    fireEvent.click(await screen.findByTitle('Edit paragraphs'));
    const field = await screen.findByText('Я,');
    // eslint-disable-next-line testing-library/no-node-access
    const block = field.closest('.paragraph-editor-block');
    // Default mode is 'text'; one tap of the cycling mode button goes straight to 'template'.
    fireEvent.click(within(block).getByTitle(
      "Text mode - select text and press Bold/Italic; wording isn't editable here. Tap to switch to Template mode.",
    ));
    const textarea = await within(block).findByPlaceholderText('Paragraph (uk)');
    fireEvent.focus(textarea);
    textarea.setSelectionRange(3, 3); // right after "Я, "

    fireEvent.click(within(block).getByTitle('Insert a variable'));
    fireEvent.click(await screen.findByText('Кьогоку Ая'));

    await waitFor(() => expect(set).toHaveBeenCalledWith(
      'documentsBuilder/templates/doc-1',
      expect.objectContaining({
        paragraphs: [expect.objectContaining({ uk: 'Я, {{wife.name.uk.nominative}}' })],
      }),
    ));
    // The modal closes itself after a pick.
    await waitFor(() => expect(screen.queryByText('Дружина')).not.toBeInTheDocument());
  });

  it('locks page scroll while open and restores it on close (spec: modal scroll must never leak to the page)', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    fireEvent.click(await screen.findByTitle('Edit paragraphs'));
    const field = await screen.findByText('Я,');
    // eslint-disable-next-line testing-library/no-node-access
    const block = field.closest('.paragraph-editor-block');
    // Default mode is 'text'; one tap of the cycling mode button goes straight to 'template'.
    fireEvent.click(within(block).getByTitle(
      "Text mode - select text and press Bold/Italic; wording isn't editable here. Tap to switch to Template mode.",
    ));
    const textarea = await within(block).findByPlaceholderText('Paragraph (uk)');
    fireEvent.focus(textarea);
    textarea.setSelectionRange(3, 3);

    expect(document.body.style.overflow).not.toBe('hidden');
    fireEvent.click(within(block).getByTitle('Insert a variable'));
    await screen.findByText('Дружина');
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.click(screen.getByLabelText('Закрити'));
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('reveals the technical {{path}} only while the item is pressed and held, not on a normal click', async () => {
    jest.useFakeTimers({ advanceTimers: true });
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    fireEvent.click(await screen.findByTitle('Edit paragraphs'));
    const field = await screen.findByText('Я,');
    // eslint-disable-next-line testing-library/no-node-access
    const block = field.closest('.paragraph-editor-block');
    // Default mode is 'text'; one tap of the cycling mode button goes straight to 'template'.
    fireEvent.click(within(block).getByTitle(
      "Text mode - select text and press Bold/Italic; wording isn't editable here. Tap to switch to Template mode.",
    ));
    const textarea = await within(block).findByPlaceholderText('Paragraph (uk)');
    fireEvent.focus(textarea);
    textarea.setSelectionRange(3, 3);
    fireEvent.click(within(block).getByTitle('Insert a variable'));

    const item = await screen.findByText('Кьогоку Ая');
    expect(screen.queryByText('wife.name.uk.nominative')).not.toBeInTheDocument();

    fireEvent.mouseDown(item);
    act(() => jest.advanceTimersByTime(500));
    expect(await screen.findByText('wife.name.uk.nominative')).toBeInTheDocument();

    fireEvent.mouseUp(item);
    expect(screen.queryByText('wife.name.uk.nominative')).not.toBeInTheDocument();
    jest.useRealTimers();
  });

  it('the × button and clicking the overlay both close the modal without inserting anything', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    fireEvent.click(await screen.findByTitle('Edit paragraphs'));
    const field = await screen.findByText('Я,');
    // eslint-disable-next-line testing-library/no-node-access
    const block = field.closest('.paragraph-editor-block');
    // Default mode is 'text'; one tap of the cycling mode button goes straight to 'template'.
    fireEvent.click(within(block).getByTitle(
      "Text mode - select text and press Bold/Italic; wording isn't editable here. Tap to switch to Template mode.",
    ));
    const textarea = await within(block).findByPlaceholderText('Paragraph (uk)');
    fireEvent.focus(textarea);
    textarea.setSelectionRange(3, 3);

    fireEvent.click(within(block).getByTitle('Insert a variable'));
    fireEvent.click(await screen.findByLabelText('Закрити'));

    expect(screen.queryByText('Дружина')).not.toBeInTheDocument();
    expect(set).not.toHaveBeenCalledWith('documentsBuilder/templates/doc-1', expect.anything());
  });
});
