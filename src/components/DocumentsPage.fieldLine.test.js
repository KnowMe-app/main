// Real-DOM regression test: a layoutV2 `fieldLine` block (label + underlined value + caption, e.g.
// "дружина ___ КАЦУРА ЮКАКО, ... р.н.,") shares ONE T/B/I/insert-variable toolbar and mode toggle
// across both its label and its value (previously two fully independent toolbars, stacked on top of
// each other, one per field) - a reported source of confusion: the "У лікувальній програмі ДРТ
// використано яйцеклітини" label and its {{oocyteSourceDisplay}} value looked like two disconnected
// blocks with two different sets of controls, even though they render as one line in the actual
// certificate. Bold/Italic/insert-variable already acted on whichever field held the browser
// selection (activeFieldRef) regardless of which copy of the button was pressed, so merging them
// into one shared button changes nothing about what they can do - only Align keeps two buttons,
// since a label's alignment and its value's alignment really do resolve to two different style
// overrides (styleOverrides.align vs valueStyleOverrides.align).
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
// carries a label - a stable per-block anchor.
const fieldLineBlocks = async () => {
  const removeButtons = await screen.findAllByTitle('Remove this field line');
  // eslint-disable-next-line testing-library/no-node-access
  return removeButtons.map(button => button.closest('.paragraph-editor-block'));
};

// One shared mode toggle now drives both the label and the value at once.
const openFieldLineTemplateMode = block => fireEvent.click(within(block).getByTitle(TEXT_MODE_TITLE));

describe('spec: a layoutV2 fieldLine shares one toolbar across its label and its value', () => {
  it('has exactly one T/B/I/insert-variable button whether or not the block carries a label', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    fireEvent.click(await screen.findByTitle('Edit paragraphs'));

    const [wifeBlock, surrogateBlock] = await fieldLineBlocks();
    expect(within(wifeBlock).getByTitle(TEXT_MODE_TITLE)).toBeInTheDocument();
    expect(within(wifeBlock).getByTitle('Bold the selected text')).toBeInTheDocument();
    expect(within(wifeBlock).getByTitle('Italicize the selected text')).toBeInTheDocument();
    expect(within(wifeBlock).getByTitle('Insert a variable')).toBeInTheDocument();
    // The label's own alignment and the value's own alignment stay two distinct controls (they
    // write two different style overrides) - the only pair that isn't merged into one.
    expect(within(wifeBlock).getAllByLabelText(/Вирівнювання/)).toHaveLength(2);
    expect(within(wifeBlock).getByText('Label')).toBeVisible();
    expect(within(wifeBlock).getByText('Value')).toBeVisible();
    expect(within(wifeBlock).getByTitle('Field line formatting - font size (pt) and condition; empty = inherit/always shown')).toBeInTheDocument();
    expect(within(wifeBlock).getByTitle('Remove this field line')).toBeInTheDocument();

    expect(within(surrogateBlock).getByTitle(TEXT_MODE_TITLE)).toBeInTheDocument();
    expect(within(surrogateBlock).getByTitle('Bold the selected text')).toBeInTheDocument();
    // No label on this block, so only the value's Align button shows up.
    expect(within(surrogateBlock).getAllByLabelText(/Вирівнювання/)).toHaveLength(1);
    expect(within(surrogateBlock).queryByPlaceholderText(/Label before the underlined value/)).not.toBeInTheDocument();
  });

  it('the label and value fields render side by side inside one shared row, not stacked as separate blocks', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    fireEvent.click(await screen.findByTitle('Edit paragraphs'));

    const [wifeBlock] = await fieldLineBlocks();
    // eslint-disable-next-line testing-library/no-node-access
    const contentRow = wifeBlock.querySelector('.field-line-content-row');
    expect(contentRow).toBeInTheDocument();
    openFieldLineTemplateMode(wifeBlock);
    expect(within(contentRow).getByPlaceholderText('Label before the underlined value, e.g. «дружина»')).toBeInTheDocument();
    expect(within(contentRow).getByPlaceholderText('Field value')).toBeInTheDocument();
    // The short label consumes only its intrinsic width; the value takes the remaining room.
    // eslint-disable-next-line testing-library/no-node-access
    expect(contentRow.firstChild).toHaveStyle({ flex: '0 1 auto', maxWidth: '45%' });
    // eslint-disable-next-line testing-library/no-node-access
    expect(contentRow.lastChild).toHaveStyle({ flex: '1 1 0' });
  });

  it('the "+" button inserts a new paragraph before the whole line, never between its label and value', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    fireEvent.click(await screen.findByTitle('Edit paragraphs'));

    const [wifeBlock] = await fieldLineBlocks();
    expect(within(wifeBlock).getByTitle('Insert a new paragraph above this one')).toBeInTheDocument();
    fireEvent.click(within(wifeBlock).getByTitle('Insert a new paragraph above this one'));

    await waitFor(() => expect(set).toHaveBeenCalledWith(
      'documentsBuilder/templates/doc-1',
      expect.objectContaining({
        layoutV2: expect.objectContaining({
          blocks: [
            expect.objectContaining({ type: 'paragraph', text: '' }),
            expect.objectContaining({ label: 'дружина' }),
            expect.objectContaining({ type: 'fieldLine', value: 'Кацура Юкако, донор ооцитів' }),
          ],
        }),
      }),
    ));
  });

  it('switching the shared mode to Template shows the raw {{}} markup for both the value and the label', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    fireEvent.click(await screen.findByTitle('Edit paragraphs'));

    const [wifeBlock] = await fieldLineBlocks();
    openFieldLineTemplateMode(wifeBlock);
    expect(within(wifeBlock).getByPlaceholderText('Field value')).toHaveValue('{{wife.name.uk.nominative}}, {{wife.birthDate}} р.н.,');
    expect(within(wifeBlock).getByPlaceholderText('Label before the underlined value, e.g. «дружина»')).toHaveValue('дружина');
  });

  it('editing the value in Template mode persists straight to layoutV2.blocks[index].value on blur', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    fireEvent.click(await screen.findByTitle('Edit paragraphs'));

    const [, surrogateBlock] = await fieldLineBlocks();
    openFieldLineTemplateMode(surrogateBlock);
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

  it('editing the label in Template mode persists straight to layoutV2.blocks[index].label on blur', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    fireEvent.click(await screen.findByTitle('Edit paragraphs'));

    const [wifeBlock] = await fieldLineBlocks();
    openFieldLineTemplateMode(wifeBlock);
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

  it('Bold on a selected fragment of the value produces valueRuns via the one shared Bold button, still tagged fieldLine', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    fireEvent.click(await screen.findByTitle('Edit paragraphs'));

    const [, surrogateBlock] = await fieldLineBlocks();
    openFieldLineTemplateMode(surrogateBlock);
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

  it('Bold on a selected fragment of the label actually works via the same shared Bold button (the reported bug: it always failed with "Select some text first")', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    fireEvent.click(await screen.findByTitle('Edit paragraphs'));

    const [wifeBlock] = await fieldLineBlocks();
    openFieldLineTemplateMode(wifeBlock);
    const labelField = within(wifeBlock).getByPlaceholderText('Label before the underlined value, e.g. «дружина»');
    fireEvent.focus(labelField);
    // "дружина" - bold just "друж" (the first 4 characters).
    labelField.setSelectionRange(0, 4);

    fireEvent.click(within(wifeBlock).getByTitle('Bold the selected text'));

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

  it('cycling the label\'s Align (the first of the two buttons) writes styleOverrides.align, never valueStyleOverrides', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    fireEvent.click(await screen.findByTitle('Edit paragraphs'));

    const [wifeBlock] = await fieldLineBlocks();
    const alignButtons = within(wifeBlock).getAllByLabelText(/Вирівнювання/);
    fireEvent.click(alignButtons[0]);

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

  it('cycling the value\'s Align (the second of the two buttons) writes valueStyleOverrides.align, never styleOverrides', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    fireEvent.click(await screen.findByTitle('Edit paragraphs'));

    const [wifeBlock] = await fieldLineBlocks();
    const alignButtons = within(wifeBlock).getAllByLabelText(/Вирівнювання/);
    fireEvent.click(alignButtons[alignButtons.length - 1]);

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
// instead of a plain `label` string - before an earlier fix, that meant `block.label !== undefined`
// was false, so the label field never rendered at all, and with an unset/blank `value` too the whole
// row looked like a totally empty, unreachable block in the builder.
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
    openFieldLineTemplateMode(block);
    expect(within(block).getByPlaceholderText('Label before the underlined value, e.g. «дружина»')).toHaveValue('**та**/або сперматозоїди');
  });

  it('editing that label persists as plain `label` when the edit drops the bold, clearing `labelRuns`', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    fireEvent.click(await screen.findByTitle('Edit paragraphs'));

    const [block] = await fieldLineBlocks();
    openFieldLineTemplateMode(block);
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
