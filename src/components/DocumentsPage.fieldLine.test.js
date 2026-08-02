// Real-DOM regression test: a layoutV2 `fieldLine` block (label + underlined value + caption, e.g.
// "дружина ___ КАЦУРА ЮКАКО, ... р.н.,") used to have no editor at all - the Blocks loop only ever
// recognized letterhead/paragraph/richParagraph, so a fieldLine's `value` (its only templated
// content) silently never showed up in the builder even though it printed in the real PDF/DOCX (a
// case in point: the surrogate mother's own name/birth-date line on the genetic affinity
// certificate). Both its value AND its label (a fully independent field slot, e.g. bold-in-part
// "**та**/або сперматозоїди") now share the exact same T/B/I/insert-variable/align toolbar every
// other paragraph has - this locks that in. The label toolbar in particular fixes a real bug: it
// used to be a bare, unformattable text input, so selecting text in it and pressing Bold always
// failed with "Select some text first" (the toolbar only ever tracked the value field's selection).
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

// Each fieldLine row always has exactly one "Remove this field line" button, whether or not it
// carries a label - a stable per-block anchor, unlike the mode-cycle buttons (one or two per
// block depending on whether a label is present).
const fieldLineBlocks = async () => {
  const removeButtons = await screen.findAllByTitle('Remove this field line');
  // eslint-disable-next-line testing-library/no-node-access
  return removeButtons.map(button => button.closest('.paragraph-editor-block'));
};

// The value's own toolbar/field always renders before the label's (see the JSX order in
// DocumentsPage) - so among a block's Text-mode buttons, the first is always the value's, the last
// (when a label exists at all) is the label's.
const openValueTemplateMode = block => fireEvent.click(within(block).getAllByTitle(TEXT_MODE_TITLE)[0]);
const openLabelTemplateMode = block => {
  const buttons = within(block).getAllByTitle(TEXT_MODE_TITLE);
  fireEvent.click(buttons[buttons.length - 1]);
};

describe('spec: a layoutV2 fieldLine value gets the full standard paragraph toolbar', () => {
  it('has the same T/B/I/insert-variable/align/settings/delete buttons a paragraph block has', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    fireEvent.click(await screen.findByTitle('Edit paragraphs'));

    const [wifeBlock, surrogateBlock] = await fieldLineBlocks();
    // wifeBlock has a label too, so its own toolbar's controls are duplicated (value + label) -
    // surrogateBlock has none, so its value's toolbar is the only one.
    expect(within(wifeBlock).getAllByTitle(TEXT_MODE_TITLE)).toHaveLength(2);
    expect(within(wifeBlock).getAllByTitle('Bold the selected text')).toHaveLength(2);
    expect(within(wifeBlock).getAllByTitle('Italicize the selected text')).toHaveLength(2);
    expect(within(wifeBlock).getAllByTitle('Insert a variable')).toHaveLength(2);
    expect(within(wifeBlock).getAllByLabelText(/Вирівнювання/)).toHaveLength(2);
    // Only the value gets a settings popover (font size + condition) and a delete button - one
    // each, never duplicated for the label.
    expect(within(wifeBlock).getByTitle('Field line formatting - font size (pt) and condition; empty = inherit/always shown')).toBeInTheDocument();
    expect(within(wifeBlock).getByTitle('Remove this field line')).toBeInTheDocument();

    expect(within(surrogateBlock).getAllByTitle(TEXT_MODE_TITLE)).toHaveLength(1);
    expect(within(surrogateBlock).getAllByTitle('Bold the selected text')).toHaveLength(1);
    expect(within(surrogateBlock).queryByPlaceholderText(/Label before the underlined value/)).not.toBeInTheDocument();
  });

  it('switching to Template mode shows the raw {{}} markup for the value, editable like any other paragraph', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    fireEvent.click(await screen.findByTitle('Edit paragraphs'));

    const [wifeBlock] = await fieldLineBlocks();
    openValueTemplateMode(wifeBlock);
    expect(within(wifeBlock).getByPlaceholderText('Field value')).toHaveValue('{{wife.name.uk.nominative}}, {{wife.birthDate}} р.н.,');
  });

  it('editing the value in Template mode persists straight to layoutV2.blocks[index].value on blur', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    fireEvent.click(await screen.findByTitle('Edit paragraphs'));

    const [, surrogateBlock] = await fieldLineBlocks();
    openValueTemplateMode(surrogateBlock);
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
    openValueTemplateMode(surrogateBlock);
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

  it('the field-line settings popover exposes font size (for the value) and condition, same shape as a paragraph block', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    fireEvent.click(await screen.findByTitle('Edit paragraphs'));

    const [wifeBlock] = await fieldLineBlocks();
    fireEvent.click(within(wifeBlock).getByTitle('Field line formatting - font size (pt) and condition; empty = inherit/always shown'));

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

  it('cycling the value\'s Align writes valueStyleOverrides.align, never the label\'s styleOverrides', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    fireEvent.click(await screen.findByTitle('Edit paragraphs'));

    const [wifeBlock] = await fieldLineBlocks();
    // The value's Align button is the first of the two (value's toolbar renders before the label's).
    fireEvent.click(within(wifeBlock).getAllByLabelText(/Вирівнювання/)[0]);

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

describe('spec: a fieldLine label gets its own independent T/B/I/insert-variable/align toolbar', () => {
  it('switching to Template mode shows the raw label markup, independent of the value', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    fireEvent.click(await screen.findByTitle('Edit paragraphs'));

    const [wifeBlock] = await fieldLineBlocks();
    openLabelTemplateMode(wifeBlock);
    expect(within(wifeBlock).getByPlaceholderText('Label before the underlined value, e.g. «дружина»')).toHaveValue('дружина');
    // The value field is untouched, still whatever mode it defaulted to (Text) - not switched
    // along with the label.
    expect(within(wifeBlock).queryByPlaceholderText('Field value')).not.toBeInTheDocument();
  });

  it('editing the label in Template mode persists straight to layoutV2.blocks[index].label on blur', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    fireEvent.click(await screen.findByTitle('Edit paragraphs'));

    const [wifeBlock] = await fieldLineBlocks();
    openLabelTemplateMode(wifeBlock);
    const labelField = within(wifeBlock).getByPlaceholderText('Label before the underlined value, e.g. «дружина»');
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

  it('Bold on a selected fragment of the label actually works (the reported bug: it always failed with "Select some text first")', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    fireEvent.click(await screen.findByTitle('Edit paragraphs'));

    const [wifeBlock] = await fieldLineBlocks();
    openLabelTemplateMode(wifeBlock);
    const labelField = within(wifeBlock).getByPlaceholderText('Label before the underlined value, e.g. «дружина»');
    fireEvent.focus(labelField);
    // "дружина" - bold just "друж" (the first 4 characters).
    labelField.setSelectionRange(0, 4);

    // The label's own Bold button is the last of the two (value's toolbar renders first).
    const boldButtons = within(wifeBlock).getAllByTitle('Bold the selected text');
    fireEvent.click(boldButtons[boldButtons.length - 1]);

    await waitFor(() => expect(set).toHaveBeenCalledWith(
      'documentsBuilder/templates/doc-1',
      expect.objectContaining({
        layoutV2: expect.objectContaining({
          blocks: [
            expect.objectContaining({
              type: 'fieldLine',
              label: 'дружина',
              labelRuns: [
                { text: 'друж', style: 'inlineEmphasis' },
                { text: 'ина', style: undefined },
              ],
            }),
            expect.anything(),
          ],
        }),
      }),
    ));
  });

  it('cycling the label\'s Align writes styleOverrides.align (the same pair an ordinary paragraph uses), never valueStyleOverrides', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    fireEvent.click(await screen.findByTitle('Edit paragraphs'));

    const [wifeBlock] = await fieldLineBlocks();
    // The label's Align button is the second of the two.
    const alignButtons = within(wifeBlock).getAllByLabelText(/Вирівнювання/);
    fireEvent.click(alignButtons[alignButtons.length - 1]);

    await waitFor(() => expect(set).toHaveBeenCalledWith(
      'documentsBuilder/templates/doc-1',
      expect.objectContaining({
        layoutV2: expect.objectContaining({
          blocks: [
            expect.objectContaining({ styleOverrides: expect.objectContaining({ align: expect.any(String) }) }),
            expect.anything(),
          ],
        }),
      }),
    ));
    const [, persistedTemplate] = set.mock.calls.find(call => call[0] === 'documentsBuilder/templates/doc-1');
    expect(persistedTemplate.layoutV2.blocks[0].valueStyleOverrides).toBeUndefined();
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

  it('shows the labelRuns text as the label field\'s value in Template mode, bold preserved via the raw **markup**', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    fireEvent.click(await screen.findByTitle('Edit paragraphs'));

    const [block] = await fieldLineBlocks();
    openLabelTemplateMode(block);
    expect(within(block).getByPlaceholderText('Label before the underlined value, e.g. «дружина»')).toHaveValue('**та**/або сперматозоїди');
  });

  it('editing that label persists as plain `label` when the edit drops the bold, clearing `labelRuns`', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    fireEvent.click(await screen.findByTitle('Edit paragraphs'));

    const [block] = await fieldLineBlocks();
    openLabelTemplateMode(block);
    const labelField = within(block).getByPlaceholderText('Label before the underlined value, e.g. «дружина»');
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
