// Real-DOM regression test for the selection-based Bold/Italic feature: mounts the actual
// DocumentsPage component (Firebase mocked out) and drives a genuine browser selection through
// the Bold button, to catch any wiring bug independent of mobile-specific touch quirks (this is
// the actual React component, not just the pure logic it calls).
//
// NOTE: this project's Jest config sets `resetMocks: true`, which strips every mock's
// implementation before each test - so the mock bodies below must be (re-)installed in
// beforeEach, not just in the jest.mock(...) factory (which only runs once at hoist time).
//
// Post-migration: the per-case "data mode" resolved-text override system is gone entirely, but
// title/paragraph rows keep the same template/input/text mode cycle beforeTitle always had.
// Template and Input both edit the shared markup directly - Bold/Italic only ever act in Template
// mode now, on the raw `**`/`*` markers, and are never gated on whether a case is selected (there
// is no per-case value involved at all). Text mode became a read-only preview resolved against
// whichever case is currently selected (real values substituted, not raw {{tokens}}) - there is
// nowhere left to persist a formatting edit made against resolved text, so Bold/Italic are simply
// disabled there.
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
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
      return { exists: () => false, val: () => null };
    }
    if (path === 'documentsBuilder/templates') {
      return {
        exists: () => true,
        val: () => ({
          'doc-1': {
            id: 'doc-1',
            title: { uk: 'Тест', en: 'Test' },
            paragraphs: [{ uk: 'Звичайний текст без форматування.', en: 'Plain text without formatting.' }],
          },
        }),
      };
    }
    return { exists: () => false, val: () => null };
  });
  set.mockResolvedValue(undefined);
  listStorageFolderFileNames.mockResolvedValue([]);
});

describe('spec: selection-based bold/italic applies to the browser selection, not the whole paragraph', () => {
  it('bolds only the selected fragment of a Template-mode paragraph field, with no case selected', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);

    const expandButton = await screen.findByTitle('Edit paragraphs');
    fireEvent.click(expandButton);

    // Default mode is 'text' (a read-only resolved preview - there's nowhere left to persist a
    // formatting edit made against resolved text, since per-case overrides no longer exist), so
    // switch to Template mode first to reach the editable raw-markup textarea.
    const field = await screen.findByText('Звичайний текст без форматування.');
    // eslint-disable-next-line testing-library/no-node-access
    const paragraphBlock = field.closest('.paragraph-editor-block');
    fireEvent.click(within(paragraphBlock).getByTitle(
      "Text mode - select text and press Bold/Italic; wording isn't editable here. Tap to switch to Template mode.",
    ));
    const textarea = await within(paragraphBlock).findByDisplayValue('Звичайний текст без форматування.');
    fireEvent.focus(textarea);
    textarea.setSelectionRange(10, 15); // "текст"

    // Bold/Italic also appear on the Title row above (unified toolbar across every editable row)
    // - scope the query to this paragraph's own boxed controls, same as a sighted admin would
    // click the toolbar right above this specific field. No case exists in this fixture at all,
    // proving Bold/Italic here never depend on a case being selected.
    const boldButton = within(paragraphBlock).getByTitle('Bold the selected text');
    fireEvent.click(boldButton);

    await waitFor(() => expect(set).toHaveBeenCalledWith(
      'documentsBuilder/templates/doc-1',
      expect.objectContaining({ paragraphs: [expect.objectContaining({ uk: 'Звичайний **текст** без форматування.' })] }),
    ));
    // The change is applied in place, right in the raw-markup textarea - never a separate preview
    // to catch up, and never written to a per-case override path.
    expect(await within(paragraphBlock).findByDisplayValue('Звичайний **текст** без форматування.')).toBeInTheDocument();
  });

  it('also applies via touch (mobile), where preventing the selection-dismissing touchstart suppresses the synthetic click', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);

    const expandButton = await screen.findByTitle('Edit paragraphs');
    fireEvent.click(expandButton);

    const field = await screen.findByText('Звичайний текст без форматування.');
    // eslint-disable-next-line testing-library/no-node-access
    const paragraphBlock = field.closest('.paragraph-editor-block');
    fireEvent.click(within(paragraphBlock).getByTitle(
      "Text mode - select text and press Bold/Italic; wording isn't editable here. Tap to switch to Template mode.",
    ));
    const textarea = await within(paragraphBlock).findByDisplayValue('Звичайний текст без форматування.');
    fireEvent.focus(textarea);
    textarea.setSelectionRange(10, 15); // "текст"

    const italicButton = within(paragraphBlock).getByTitle('Italicize the selected text');
    // No fireEvent.click - mobile browsers won't synthesize one once touchstart's default is
    // prevented (exactly what the button needs to do to keep the selection alive), so the
    // touchend handler itself must be what triggers the action.
    fireEvent.touchStart(italicButton);
    fireEvent.touchEnd(italicButton);

    await waitFor(() => expect(set).toHaveBeenCalledWith(
      'documentsBuilder/templates/doc-1',
      expect.objectContaining({ paragraphs: [expect.objectContaining({ uk: 'Звичайний *текст* без форматування.' })] }),
    ));
  });
});

describe('spec: Text mode is a read-only preview resolved against the selected case', () => {
  it('disables Bold/Italic in Text mode - there is nowhere left to persist a formatting edit against resolved text', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    const expandButton = await screen.findByTitle('Edit paragraphs');
    fireEvent.click(expandButton);

    const field = await screen.findByText('Звичайний текст без форматування.');
    // eslint-disable-next-line testing-library/no-node-access
    const paragraphBlock = field.closest('.paragraph-editor-block');
    expect(within(paragraphBlock).getByTitle('Bold the selected text')).toBeDisabled();
    expect(within(paragraphBlock).getByTitle('Italicize the selected text')).toBeDisabled();
  });
});

describe('spec: per-row template/input/text mode cycle replaces the old global toggle', () => {
  it('does not render the old global Template/Data section toggle', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    await screen.findByTitle('Edit paragraphs');
    expect(screen.queryByTitle('Edit the raw {{placeholder}} tokens of the shared template')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Edit the resolved values of the selected case directly')).not.toBeInTheDocument();
  });

  it('switching a paragraph to Template mode edits and persists the shared template directly, with no case needed', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    const expandButton = await screen.findByTitle('Edit paragraphs');
    fireEvent.click(expandButton);

    // Default mode ('text') shows the raw template text as a rendered display, not a textarea.
    const field = await screen.findByText('Звичайний текст без форматування.');
    // eslint-disable-next-line testing-library/no-node-access
    const paragraphBlock = field.closest('.paragraph-editor-block');

    // One cycling button, not three separate ones: text -> template is one tap.
    const modeButton = within(paragraphBlock).getByTitle(
      "Text mode - select text and press Bold/Italic; wording isn't editable here. Tap to switch to Template mode.",
    );
    fireEvent.click(modeButton);

    const textarea = await within(paragraphBlock).findByDisplayValue('Звичайний текст без форматування.');
    fireEvent.change(textarea, { target: { value: 'Змінений шаблонний текст.' } });
    fireEvent.blur(textarea);

    await waitFor(() => expect(set).toHaveBeenCalledWith(
      'documentsBuilder/templates/doc-1',
      expect.objectContaining({ paragraphs: [expect.objectContaining({ uk: 'Змінений шаблонний текст.' })] }),
    ));
  });

  it('shows an inline-editable Documents-list name next to the checkbox, separate from the in-document title', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    await screen.findByTitle('Edit paragraphs');

    // No catalogName saved yet, so the field falls back to showing the title text - but editing it
    // writes catalogName only, never template.title.
    const nameInput = await screen.findByDisplayValue('Тест');
    fireEvent.change(nameInput, { target: { value: 'Оновлена назва' } });
    fireEvent.blur(nameInput);

    await waitFor(() => expect(set).toHaveBeenCalledWith(
      'documentsBuilder/templates/doc-1',
      expect.objectContaining({ catalogName: 'Оновлена назва', title: expect.objectContaining({ uk: 'Тест' }) }),
    ));
  });
});
