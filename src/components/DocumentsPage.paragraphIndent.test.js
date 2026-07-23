// Real-DOM regression test for the per-paragraph first-line indent slider (spec: "відступи теж
// повтори, додай можливість їх совати" - the reference notarial statement indents only its
// opening declaration, not the paragraphs after it, and the admin needs a draggable control to
// set that per paragraph, not a single document-wide value).
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
          cases: { 'case-1': { id: 'case-1', relations: { coupleId: 'couple-1' } } },
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

describe('spec: per-paragraph first-line indent slider', () => {
  it('shows each paragraph\'s own indent value, defaulting to the document-wide setting when unset', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    fireEvent.click(await screen.findByTitle('Edit paragraphs'));

    const indentedField = await screen.findByText('Абзац з відступом.');
    // eslint-disable-next-line testing-library/no-node-access
    const indentedBlock = indentedField.closest('.paragraph-editor-block');
    expect(within(indentedBlock).getByLabelText('Відступ абзацу 1')).toHaveValue('1');
    expect(within(indentedBlock).getByText('1.00 см')).toBeInTheDocument();

    const plainField = screen.getByText('Абзац без відступу.');
    // eslint-disable-next-line testing-library/no-node-access
    const plainBlock = plainField.closest('.paragraph-editor-block');
    expect(within(plainBlock).getByLabelText('Відступ абзацу 2')).toHaveValue('1.5'); // document default (notarial standard §3.1)
    expect(within(plainBlock).queryByTitle('Скинути до відступу документа')).not.toBeInTheDocument();
  });

  it('dragging the slider updates the value live and persists the whole template on release', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    fireEvent.click(await screen.findByTitle('Edit paragraphs'));

    const plainField = await screen.findByText('Абзац без відступу.');
    // eslint-disable-next-line testing-library/no-node-access
    const plainBlock = plainField.closest('.paragraph-editor-block');
    const slider = within(plainBlock).getByLabelText('Відступ абзацу 2');

    fireEvent.change(slider, { target: { value: '2.5' } });
    expect(within(plainBlock).getByText('2.50 см')).toBeInTheDocument();
    expect(set).not.toHaveBeenCalled(); // not yet released

    fireEvent.mouseUp(slider);

    await waitFor(() => expect(set).toHaveBeenCalledWith(
      'documentsBuilder/templates/doc-1',
      expect.objectContaining({
        paragraphs: [
          expect.objectContaining({ indentCm: 1 }),
          expect.objectContaining({ indentCm: 2.5 }),
        ],
      }),
    ));
  });

  it('the reset button clears the override back to the document default and persists immediately', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    fireEvent.click(await screen.findByTitle('Edit paragraphs'));

    const indentedField = await screen.findByText('Абзац з відступом.');
    // eslint-disable-next-line testing-library/no-node-access
    const indentedBlock = indentedField.closest('.paragraph-editor-block');
    fireEvent.click(within(indentedBlock).getByTitle('Скинути до відступу документа'));

    await waitFor(() => expect(set).toHaveBeenCalledWith(
      'documentsBuilder/templates/doc-1',
      expect.objectContaining({
        paragraphs: [
          expect.objectContaining({ indentCm: undefined }),
          expect.anything(),
        ],
      }),
    ));
    await waitFor(() => expect(within(indentedBlock).getByLabelText('Відступ абзацу 1')).toHaveValue('1.5'));
    expect(within(indentedBlock).queryByTitle('Скинути до відступу документа')).not.toBeInTheDocument();
  });
});
