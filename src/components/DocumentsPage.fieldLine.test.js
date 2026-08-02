// Real-DOM regression test: a layoutV2 `fieldLine` block (label + underlined value + caption, e.g.
// "дружина ___ КАЦУРА ЮКАКО, ... р.н.,") used to have no editor at all - the Blocks loop only ever
// recognized letterhead/paragraph/richParagraph, so a fieldLine's `value` (its only templated
// content) silently never showed up in the builder even though it printed in the real PDF/DOCX (a
// case in point: the surrogate mother's own name/birth-date line on the genetic affinity
// certificate). Its value now shares the exact same T/B/I/insert-variable/align toolbar every
// other paragraph has - this locks that in, plus the still-plain label field alongside it.
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

const TEXT_MODE_TITLE = "Text mode - select text and press Bold/Italic; wording isn't editable here. Tap to switch to Template mode.";

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
                  value: 'Кацура Юкако, донор ооцитів',
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

// Every fieldLine row (and every other paragraph row) defaults to Text mode, which shows resolved
// (case-substituted) wording rather than the raw {{}} markup - switching to Template mode is what
// exposes the same editable-markup textarea a legacy paragraph's Template mode already shows.
const fieldLineBlocks = async () => {
  const modeButtons = await screen.findAllByTitle(TEXT_MODE_TITLE);
  // eslint-disable-next-line testing-library/no-node-access
  return modeButtons.map(button => button.closest('.paragraph-editor-block'));
};

describe('spec: a layoutV2 fieldLine block gets the full standard paragraph toolbar', () => {
  it('has the same T/B/I/insert-variable/align/settings/delete buttons a paragraph block has, for both fieldLine rows', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    fireEvent.click(await screen.findByTitle('Edit paragraphs'));

    const [wifeBlock, surrogateBlock] = await fieldLineBlocks();
    [wifeBlock, surrogateBlock].forEach(block => {
      expect(within(block).getByTitle(TEXT_MODE_TITLE)).toBeInTheDocument();
      expect(within(block).getByTitle('Bold the selected text')).toBeInTheDocument();
      expect(within(block).getByTitle('Italicize the selected text')).toBeInTheDocument();
      expect(within(block).getByTitle('Insert a variable')).toBeInTheDocument();
      expect(within(block).getByLabelText(/Вирівнювання/)).toBeInTheDocument();
      expect(within(block).getByTitle('Field line formatting - font size (pt) and condition; empty = inherit/always shown')).toBeInTheDocument();
      expect(within(block).getByTitle('Remove this field line')).toBeInTheDocument();
    });

    // Only one label field exists (the surrogate mother's fieldLine carries no `label` key at all).
    expect(within(wifeBlock).getByDisplayValue('дружина')).toBeInTheDocument();
    expect(within(surrogateBlock).queryByPlaceholderText(/Label before the underlined value/)).not.toBeInTheDocument();
  });

  it('switching to Template mode shows the raw {{}} markup for the value, editable like any other paragraph', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    fireEvent.click(await screen.findByTitle('Edit paragraphs'));

    const [wifeBlock] = await fieldLineBlocks();
    fireEvent.click(within(wifeBlock).getByTitle(TEXT_MODE_TITLE));
    expect(within(wifeBlock).getByPlaceholderText('Field value')).toHaveValue('{{wife.name.uk.nominative}}, {{wife.birthDate}} р.н.,');
  });

  it('editing the value in Template mode persists straight to layoutV2.blocks[index].value on blur', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    fireEvent.click(await screen.findByTitle('Edit paragraphs'));

    const [, surrogateBlock] = await fieldLineBlocks();
    fireEvent.click(within(surrogateBlock).getByTitle(TEXT_MODE_TITLE));
    const valueField = within(surrogateBlock).getByPlaceholderText('Field value');
    fireEvent.change(valueField, { target: { value: '{{surrogateMother.name.uk.nominative}}' } });
    fireEvent.blur(valueField);

    await waitFor(() => expect(set).toHaveBeenCalledWith(
      'documentsBuilder/templates/doc-1',
      expect.objectContaining({
        layoutV2: expect.objectContaining({
          blocks: [
            expect.objectContaining({ label: 'дружина' }),
            expect.objectContaining({ type: 'fieldLine', value: '{{surrogateMother.name.uk.nominative}}' }),
          ],
        }),
      }),
    ));
  });

  it('Bold on a selected fragment of the value produces valueRuns, still tagged fieldLine, never converted to a paragraph', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    fireEvent.click(await screen.findByTitle('Edit paragraphs'));

    const [, surrogateBlock] = await fieldLineBlocks();
    fireEvent.click(within(surrogateBlock).getByTitle(TEXT_MODE_TITLE));
    const valueField = within(surrogateBlock).getByPlaceholderText('Field value');
    fireEvent.focus(valueField);
    // "Кацура Юкако, донор ооцитів" - bold just "Кацура Юкако" (the first 12 characters).
    valueField.setSelectionRange(0, 12);

    fireEvent.click(within(surrogateBlock).getByTitle('Bold the selected text'));

    await waitFor(() => expect(set).toHaveBeenCalledWith(
      'documentsBuilder/templates/doc-1',
      expect.objectContaining({
        layoutV2: expect.objectContaining({
          blocks: [
            expect.anything(),
            expect.objectContaining({
              type: 'fieldLine',
              value: 'Кацура Юкако, донор ооцитів',
              valueRuns: [
                { text: 'Кацура Юкако', style: 'inlineEmphasis' },
                { text: ', донор ооцитів', style: undefined },
              ],
            }),
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

  it('the field-line settings popover exposes font size (for the value) and condition, same shape as a paragraph block', async () => {
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

  it('cycling Align on the value writes valueStyleOverrides.align, never the label\'s styleOverrides', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    fireEvent.click(await screen.findByTitle('Edit paragraphs'));

    const [wifeBlock] = await fieldLineBlocks();
    fireEvent.click(within(wifeBlock).getByLabelText(/Вирівнювання/));

    await waitFor(() => expect(set).toHaveBeenCalledWith(
      'documentsBuilder/templates/doc-1',
      expect.objectContaining({
        layoutV2: expect.objectContaining({
          blocks: [
            expect.objectContaining({ valueStyleOverrides: expect.objectContaining({ align: expect.any(String) }) }),
            expect.anything(),
          ],
        }),
      }),
    ));
    const [, persistedTemplate] = set.mock.calls.find(call => call[0] === 'documentsBuilder/templates/doc-1');
    expect(persistedTemplate.layoutV2.blocks[0].styleOverrides).toBeUndefined();
  });
});

// A fieldLine block can carry a bold-in-part `labelRuns` (e.g. bold "та" + "/або сперматозоїди")
// instead of a plain `label` string - before this fix, that meant `block.label !== undefined` was
// false, so the label field never rendered at all, and with an unset/blank `value` too the whole
// row looked like a totally empty, unreachable block in the builder (exactly what a user reported
// seeing between the "яйцеклітини" fieldLine and "Перенесення ембріона...").
describe('spec: a fieldLine with labelRuns (not plain label) is still visible/editable, never a blank block', () => {
  beforeEach(() => {
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
                blocks: [{
                  type: 'fieldLine',
                  style: 'body',
                  labelRuns: [
                    { text: 'та', style: 'inlineEmphasis' },
                    { text: '/або сперматозоїди' },
                  ],
                  value: '',
                  caption: '(прізвище, ініціали / код донора)',
                }],
              },
            },
          }),
        };
      }
      return { exists: () => false, val: () => null };
    });
  });

  it('shows the labelRuns text (plain, concatenated) as the label field\'s value instead of leaving it blank', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    fireEvent.click(await screen.findByTitle('Edit paragraphs'));

    expect(await screen.findByDisplayValue('та/або сперматозоїди')).toBeInTheDocument();
  });

  it('editing that label persists as plain `label`, dropping `labelRuns`', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    fireEvent.click(await screen.findByTitle('Edit paragraphs'));

    const labelField = await screen.findByDisplayValue('та/або сперматозоїди');
    fireEvent.change(labelField, { target: { value: 'сперматозоїди' } });
    fireEvent.blur(labelField);

    await waitFor(() => expect(set).toHaveBeenCalledWith(
      'documentsBuilder/templates/doc-1',
      expect.objectContaining({
        layoutV2: expect.objectContaining({
          blocks: [expect.objectContaining({ type: 'fieldLine', label: 'сперматозоїди' })],
        }),
      }),
    ));
    const [, persistedTemplate] = set.mock.calls.find(call => call[0] === 'documentsBuilder/templates/doc-1');
    expect(persistedTemplate.layoutV2.blocks[0].labelRuns).toBeUndefined();
  });
});
