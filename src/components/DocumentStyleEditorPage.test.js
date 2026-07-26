// Style Editor (batch 23 §4) - covers the core contract: layoutV2-only document picker, collapsed
// style groups that expand on click, and precise per-property Firebase writes (toggle on sets one
// leaf, toggle off deletes exactly that leaf, "reset whole group" clears the whole named style only
// after confirming) - never a bulk clear of the whole styleSheet.
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import {
  render, screen, fireEvent, waitFor, within,
} from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('firebase/database', () => ({
  ref: jest.fn(),
  get: jest.fn(),
  update: jest.fn(),
}));

jest.mock('./config', () => ({
  auth: { currentUser: { uid: 'test-admin' } },
  database: {},
}));

jest.mock('utils/accessLevel', () => ({ isInvoiceBuilderUid: () => true }));

// eslint-disable-next-line import/first
import { ref, get, update } from 'firebase/database';
// eslint-disable-next-line import/first
import DocumentStyleEditorPage from './DocumentStyleEditorPage';

const PARTIES = {
  couples: {
    'couple-1': { id: 'couple-1', partners: [{ id: 'p1', role: 'wife', name: { uk: { nominative: 'Тестова Марія' }, en: 'Testova Mariia' } }] },
  },
  clinics: {},
  surrogateMothers: {},
  maternityHospitals: {},
  notaries: {},
};

const CASES = {
  'case-1': { id: 'case-1', relations: { coupleId: 'couple-1' } },
};

const TEMPLATES = {
  'genetic-affinity-certificate': {
    id: 'genetic-affinity-certificate',
    catalogName: 'Genetic affinity certificate',
    rendererVersion: 2,
    languages: ['uk'],
    page: {
      size: 'A4', widthMm: 210, heightMm: 297, marginsMm: {
        top: 5, right: 15, bottom: 10, left: 15,
      },
    },
    styleSheet: {
      titleMain: { fontFamily: 'Times New Roman', fontSizePt: 14, fontWeight: 700, align: 'center' },
    },
    layoutV2: {
      contentWidthMm: 180,
      blocks: [{ type: 'paragraph', style: 'titleMain', text: 'ДОВІДКА' }],
    },
  },
  // Legacy (non-layoutV2) template - must never appear in the document picker.
  'legacy-doc': { id: 'legacy-doc', catalogName: 'Legacy document', title: { uk: 'Т' }, paragraphs: [] },
};

const mockGet = () => {
  get.mockImplementation(async path => {
    if (path === 'documentsBuilder/parties') return { exists: () => true, val: () => PARTIES };
    if (path === 'documentsBuilder/cases') return { exists: () => true, val: () => CASES };
    if (path === 'documentsBuilder/templates') return { exists: () => true, val: () => TEMPLATES };
    if (path === 'documentsBuilder/settings') return { exists: () => false, val: () => null };
    return { exists: () => false, val: () => null };
  });
};

beforeEach(() => {
  ref.mockImplementation((_db, path) => path || '__root__');
  update.mockResolvedValue(undefined);
});

describe('DocumentStyleEditorPage', () => {
  it('only lists layoutV2 templates in the document picker', async () => {
    mockGet();
    render(<MemoryRouter><DocumentStyleEditorPage isAdmin /></MemoryRouter>);
    await screen.findByText('Genetic affinity certificate');
    expect(screen.queryByText('Legacy document')).not.toBeInTheDocument();
  });

  it('shows every named style as a collapsed group, expanding on click', async () => {
    mockGet();
    render(<MemoryRouter><DocumentStyleEditorPage isAdmin /></MemoryRouter>);
    await screen.findByText('Genetic affinity certificate');
    // "titleMain" has one override (fontSizePt/fontWeight/align/fontFamily = 4), so its count badge
    // shows - the group itself starts collapsed, so the property rows aren't in the document yet.
    const titleMainHead = await screen.findByText(/titleMain/);
    expect(screen.queryByText('Font size (pt)')).not.toBeInTheDocument();
    fireEvent.click(titleMainHead);
    expect(await screen.findByText('Font size (pt)')).toBeInTheDocument();
  });

  it('writes exactly one styleSheet leaf when a property is toggled on', async () => {
    mockGet();
    render(<MemoryRouter><DocumentStyleEditorPage isAdmin /></MemoryRouter>);
    await screen.findByText('Genetic affinity certificate');
    fireEvent.click(await screen.findByText(/titleMain/));
    const checkbox = await screen.findByRole('checkbox', { name: 'Line height' });
    expect(checkbox).not.toBeChecked();
    fireEvent.click(checkbox);
    await waitFor(() => expect(update).toHaveBeenCalledWith(
      '__root__',
      { 'documentsBuilder/templates/genetic-affinity-certificate/styleSheet/titleMain/lineHeight': 1 },
    ));
  });

  it('deletes exactly one styleSheet leaf (never the whole style) when an already-set property is toggled off', async () => {
    mockGet();
    render(<MemoryRouter><DocumentStyleEditorPage isAdmin /></MemoryRouter>);
    await screen.findByText('Genetic affinity certificate');
    fireEvent.click(await screen.findByText(/titleMain/));
    const checkbox = await screen.findByRole('checkbox', { name: /^Font size \(pt\)/ });
    expect(checkbox).toBeChecked();
    fireEvent.click(checkbox);
    await waitFor(() => expect(update).toHaveBeenCalledWith(
      '__root__',
      { 'documentsBuilder/templates/genetic-affinity-certificate/styleSheet/titleMain/fontSizePt': null },
    ));
  });

  // Batch 25 §2 reaffirms batch 23/24's request for Align and Bold/font-weight controls on this
  // page - both are already wired into every style group via LAYOUT_V2_STYLE_KEYS/PROPERTY_CONTROLS
  // (documentsCatalogUtils.js / DocumentStyleEditorPage.jsx), so this pins that down as a concrete
  // regression test rather than leaving it as something only visible by reading the source.
  it('offers an Align select (left/center/right/justify) and a Font weight select in every style group', async () => {
    mockGet();
    render(<MemoryRouter><DocumentStyleEditorPage isAdmin /></MemoryRouter>);
    await screen.findByText('Genetic affinity certificate');
    fireEvent.click(await screen.findByText(/titleMain/));

    // eslint-disable-next-line testing-library/no-node-access
    const alignRow = (await screen.findByText('Align')).closest('label');
    const alignSelect = within(alignRow).getByRole('combobox');
    expect(alignSelect).not.toBeDisabled();
    expect(alignSelect).toHaveValue('center');
    expect(Array.from(alignSelect.options).map(option => option.value)).toEqual(['left', 'center', 'right', 'justify']);

    // eslint-disable-next-line testing-library/no-node-access
    const fontWeightRow = (await screen.findByText('Font weight')).closest('label');
    const fontWeightSelect = within(fontWeightRow).getByRole('combobox');
    expect(fontWeightSelect).not.toBeDisabled();
    expect(fontWeightSelect).toHaveValue('700');
    expect(Array.from(fontWeightSelect.options).map(option => option.value)).toEqual(['400', '500', '600', '700']);
  });

  it('asks for confirmation before resetting a whole group, and clears only that named style', async () => {
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    mockGet();
    render(<MemoryRouter><DocumentStyleEditorPage isAdmin /></MemoryRouter>);
    await screen.findByText('Genetic affinity certificate');
    fireEvent.click(await screen.findByText(/titleMain/));
    fireEvent.click(await screen.findByText('Reset this whole group to default'));
    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() => expect(update).toHaveBeenCalledWith(
      '__root__',
      { 'documentsBuilder/templates/genetic-affinity-certificate/styleSheet/titleMain': null },
    ));
    confirmSpy.mockRestore();
  });
});
