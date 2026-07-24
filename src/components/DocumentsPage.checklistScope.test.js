// Spec (2026-07-24 follow-up): non-blocking completeness warnings ("Незаповнені обов'язкові
// поля...") must only show for data the *checked* documents actually need - generating an
// early-stage document (e.g. a surrogacy agreement) that never references childbirth/birth-
// registration data must never nag about a birth that hasn't happened yet. Separately, opening a
// case from the Case dropdown (not just generating from it) must immediately bump it to the front
// of that list for next time.
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
import { ref, get, set, update } from 'firebase/database';
// eslint-disable-next-line import/first
import { listStorageFolderFileNames } from './config';
// eslint-disable-next-line import/first
import DocumentsPage from './DocumentsPage';

const PARTIES = {
  couples: {
    'couple-1': { id: 'couple-1', partners: [{ id: 'p1', role: 'wife', name: { uk: { nominative: 'Тестова Марія' }, en: 'Testova Mariia' } }] },
  },
  clinics: { 'clinic-1': { id: 'clinic-1', medicalCenterName: { uk: 'МЦ Тест', en: 'MC Test' } } },
  surrogateMothers: {},
  maternityHospitals: {},
  notaries: {},
};

// No coupleId/clinicId/surrogateMotherId, no childbirth.children - deliberately incomplete on
// every axis, so every checklist item WOULD fire if it weren't scoped to the checked document.
const CASE_2 = {
  'case-1': { id: 'case-1', relations: {} },
};

const TEMPLATES = {
  // References only clinic.* - never wife/husband/couple/surrogateMother/childbirth data.
  'surrogacy-agreement': {
    id: 'surrogacy-agreement',
    title: { uk: 'Договір', en: 'Agreement' },
    paragraphs: [{ uk: '{{clinic.medicalCenterName.uk}}', en: '{{clinic.medicalCenterName.en}}' }],
  },
  // References childbirth/birth-registration data explicitly.
  'birth-registration-surrogate-consent': {
    id: 'birth-registration-surrogate-consent',
    title: { uk: 'Заява', en: 'Statement' },
    paragraphs: [{ uk: '{{child.birthDate}} {{birthRegistration.notaryId}}', en: '' }],
  },
};

const mockGet = () => {
  get.mockImplementation(async path => {
    if (path === 'documentsBuilder/parties') return { exists: () => true, val: () => PARTIES };
    if (path === 'documentsBuilder/cases') return { exists: () => true, val: () => CASE_2 };
    if (path === 'documentsBuilder/templates') return { exists: () => true, val: () => TEMPLATES };
    if (path === 'documentsBuilder/settings') return { exists: () => false, val: () => null };
    return { exists: () => false, val: () => null };
  });
};

beforeEach(() => {
  ref.mockImplementation((_db, path) => path);
  set.mockResolvedValue(undefined);
  update.mockResolvedValue(undefined);
  listStorageFolderFileNames.mockResolvedValue([]);
});

describe('spec: completeness checklist is scoped to the checked documents', () => {
  it('shows nothing when no document is checked, even for a wildly incomplete case', async () => {
    mockGet();
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    await screen.findByText('Case');
    expect(screen.queryByText(/Незаповнені обов'язкові поля/)).not.toBeInTheDocument();
  });

  // The per-document checkbox has no accessible label of its own (it sits next to an inline-
  // editable title textarea, not a <label>), so it can't be queried by the document's title text
  // directly - the two document checkboxes are the first ones rendered (the Format panel's own
  // checkboxes come later in the page), in the same order as TEMPLATES above.
  const DOCUMENT_CHECKBOX_INDEX = { Договір: 0, Заява: 1 };
  const checkDocumentByTitle = async title => {
    await screen.findByDisplayValue(title);
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[DOCUMENT_CHECKBOX_INDEX[title]]);
  };

  it('checking a document that only needs clinic data warns about clinicId, never about childbirth', async () => {
    mockGet();
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    await screen.findByText('Case');

    await checkDocumentByTitle('Договір');

    const warning = await screen.findByText(/Незаповнені обов'язкові поля/);
    expect(warning.textContent).toContain('case.relations.clinicId');
    expect(warning.textContent).not.toContain('case.childbirth.children');
    expect(warning.textContent).not.toContain('case.relations.surrogateMotherId');
  });

  it('checking the birth-registration document brings the childbirth checklist back', async () => {
    mockGet();
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    await screen.findByText('Case');

    await checkDocumentByTitle('Заява');

    const warning = await screen.findByText(/Незаповнені обов'язкові поля/);
    expect(warning.textContent).toContain('case.childbirth.children');
  });
});

describe('spec: opening a case from the dropdown makes it the most-recently-opened one', () => {
  it('persists recentCaseIds immediately on selection, not only after generating a document', async () => {
    const casesTwo = {
      'case-1': { id: 'case-1', relations: {} },
      'case-2': { id: 'case-2', relations: {} },
    };
    get.mockImplementation(async path => {
      if (path === 'documentsBuilder/parties') return { exists: () => true, val: () => PARTIES };
      if (path === 'documentsBuilder/cases') return { exists: () => true, val: () => casesTwo };
      if (path === 'documentsBuilder/templates') return { exists: () => true, val: () => TEMPLATES };
      if (path === 'documentsBuilder/settings') return { exists: () => false, val: () => null };
      return { exists: () => false, val: () => null };
    });

    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    await screen.findByText('Case');

    // The Case dropdown is the first <select> on the page (layout is a button group, not a select).
    const [caseSelect] = screen.getAllByRole('combobox');
    fireEvent.change(caseSelect, { target: { value: 'case-2' } });

    await waitFor(() => {
      expect(set.mock.calls.some(([path]) => path === 'documentsBuilder/settings')).toBe(true);
    });
    const settingsCall = set.mock.calls.find(([path]) => path === 'documentsBuilder/settings');
    expect(settingsCall[1].recentCaseIds[0]).toBe('case-2');
  });
});
