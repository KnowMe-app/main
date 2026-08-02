// Real-DOM regression test: a layoutV2 `fieldLine` block (label + underlined value + caption, e.g.
// "дружина ___ КАЦУРА ЮКАКО, ... р.н.,") used to have no editor at all - the Blocks loop only ever
// recognized letterhead/paragraph/richParagraph, so a fieldLine's `value` (its only templated
// content) silently never showed up in the builder even though it printed in the real PDF/DOCX (a
// case in point: the surrogate mother's own name/birth-date line on the genetic affinity
// certificate). This locks in the plain value/label editor added for it.
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
    if (path === 'documentsBuilder/parties') return { exists: () => true, val: () => ({}) };
    if (path === 'documentsBuilder/cases') return { exists: () => false, val: () => null };
    if (path === 'documentsBuilder/templates') {
      return {
        exists: () => true,
        val: () => ({
          'doc-1': {
            id: 'doc-1',
            catalogName: 'Genetic affinity certificate',
            rendererVersion: 2,
            languages: ['uk'],
            layoutV2: {
              contentWidthMm: 180,
              blocks: [
                {
                  type: 'fieldLine',
                  style: 'body',
                  label: 'дружина',
                  value: '{{wife.name.uk.nominative}}, {{wife.birthDate}} р.н.,',
                  caption: '(прізвище, ім’я, по батькові, рік народження)',
                },
                {
                  type: 'fieldLine',
                  style: 'body',
                  value: '{{surrogateMother.name.uk.nominative}}, {{surrogateMother.birthDate}} р.н.,',
                  caption: '(прізвище, ім’я, по батькові, рік народження)',
                },
              ],
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

describe('spec: a layoutV2 fieldLine block gets a plain label/value editor', () => {
  it('shows the current label and value, and has no label field at all for a fieldLine with none', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    fireEvent.click(await screen.findByTitle('Edit paragraphs'));

    expect(await screen.findByDisplayValue('дружина')).toBeInTheDocument();
    const values = await screen.findAllByDisplayValue(/р\.н\.,$/);
    expect(values).toHaveLength(2);
    expect(values[0]).toHaveValue('{{wife.name.uk.nominative}}, {{wife.birthDate}} р.н.,');
    expect(values[1]).toHaveValue('{{surrogateMother.name.uk.nominative}}, {{surrogateMother.birthDate}} р.н.,');

    // Only one label field exists (the surrogate mother's fieldLine carries no `label` key at all).
    expect(screen.getAllByPlaceholderText(/Label before the underlined value/)).toHaveLength(1);
  });

  it('editing the value persists straight to layoutV2.blocks[index].value on blur', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    fireEvent.click(await screen.findByTitle('Edit paragraphs'));

    const surrogateValueField = await screen.findByDisplayValue('{{surrogateMother.name.uk.nominative}}, {{surrogateMother.birthDate}} р.н.,');
    fireEvent.change(surrogateValueField, { target: { value: '{{surrogateMother.name.uk.nominative}}' } });
    fireEvent.blur(surrogateValueField);

    await waitFor(() => expect(set).toHaveBeenCalledWith(
      'documentsBuilder/templates/doc-1',
      expect.objectContaining({
        layoutV2: expect.objectContaining({
          blocks: [
            expect.objectContaining({ label: 'дружина' }),
            expect.objectContaining({ value: '{{surrogateMother.name.uk.nominative}}' }),
          ],
        }),
      }),
    ));
  });

  it('editing the label persists straight to layoutV2.blocks[index].label on blur', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    fireEvent.click(await screen.findByTitle('Edit paragraphs'));

    const labelField = await screen.findByDisplayValue('дружина');
    fireEvent.change(labelField, { target: { value: 'та дружина' } });
    fireEvent.blur(labelField);

    await waitFor(() => expect(set).toHaveBeenCalledWith(
      'documentsBuilder/templates/doc-1',
      expect.objectContaining({
        layoutV2: expect.objectContaining({
          blocks: [
            expect.objectContaining({ label: 'та дружина' }),
            expect.anything(),
          ],
        }),
      }),
    ));
  });

  it('the field-line settings popover exposes a condition field, same as a paragraph block', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    fireEvent.click(await screen.findByTitle('Edit paragraphs'));

    const labelField = await screen.findByDisplayValue('дружина');
    // eslint-disable-next-line testing-library/no-node-access
    const block = labelField.closest('.paragraph-editor-block');
    fireEvent.click(within(block).getByTitle('Field line formatting - font size (pt) and condition; empty = inherit/always shown'));

    const conditionField = await screen.findByLabelText('Condition (context path, ! to negate; empty = always shown)');
    fireEvent.change(conditionField, { target: { value: 'geneticAffinityCertificate.oocyteSourceIsWife' } });
    fireEvent.blur(conditionField);

    await waitFor(() => expect(set).toHaveBeenCalledWith(
      'documentsBuilder/templates/doc-1',
      expect.objectContaining({
        layoutV2: expect.objectContaining({
          blocks: [
            expect.objectContaining({ condition: 'geneticAffinityCertificate.oocyteSourceIsWife' }),
            expect.anything(),
          ],
        }),
      }),
    ));
  });
});
