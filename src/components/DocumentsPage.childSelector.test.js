// Regression test: the Childbirth/Transaction editor ("Дані для заяви в РАЦС") used to be mounted
// a second time on this page - a plain duplicate of the one on Parties, since both hosts rendered
// the exact same component. It's gone from here now (spec: "це повтор зі сторінки Parties,
// прибери з documents") - this page only keeps a minimal read-only "Дитина для документа" picker,
// needed so document generation still knows which of a multi-child case's children to resolve
// against (see PartiesPage.caseEditor.test.js for the actual editing behavior, unchanged there).
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

const buildParties = () => ({
  couples: {
    'couple-1': { id: 'couple-1', partners: [{ id: 'p1', role: 'wife', name: { uk: { nominative: 'Тестова Марія' }, en: 'Testova Mariia' } }] },
  },
  surrogateMothers: {},
  maternityHospitals: {
    'hospital-1': { id: 'hospital-1', shortName: { uk: 'Пологовий будинок №1', en: '' } },
  },
  notaries: {},
});

const buildCases = children => ({
  'case-1': {
    id: 'case-1',
    relations: { coupleId: 'couple-1', clinicId: '', surrogateMotherId: '', representativeIds: [] },
    childbirth: { maternityHospitalId: 'hospital-1', children },
  },
});

const mockGet = children => {
  get.mockImplementation(async path => {
    if (path === 'documentsBuilder/parties') return { exists: () => true, val: () => buildParties() };
    if (path === 'documentsBuilder/cases') return { exists: () => true, val: () => buildCases(children) };
    if (path === 'documentsBuilder/templates') return { exists: () => false, val: () => null };
    return { exists: () => false, val: () => null };
  });
};

beforeEach(() => {
  ref.mockImplementation((_db, path) => path);
  set.mockResolvedValue(undefined);
  update.mockResolvedValue(undefined);
  listStorageFolderFileNames.mockResolvedValue([]);
});

describe('spec: РАЦС editor is not duplicated on Documents Builder', () => {
  it('never renders the childbirth/transaction editing form, even for a multi-child case', async () => {
    mockGet([
      { id: 'child-1', sex: 'female', birthDate: '2026-05-16', birthPlace: { uk: 'Київ' }, medicalConclusion: { number: 'MC-1', date: '2026-05-16' } },
      { id: 'child-2', sex: 'male', birthDate: '2026-05-16', birthPlace: { uk: 'Київ' }, medicalConclusion: { number: 'MC-2', date: '2026-05-16' } },
    ]);

    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    await screen.findByText('Case');

    expect(screen.queryByLabelText('Пологовий будинок')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add child/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save transaction/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Дитина 1')).not.toBeInTheDocument();
  });

  it('shows a plain child picker for a multi-child case, defaulting to the first child', async () => {
    mockGet([
      { id: 'child-1', sex: 'female', birthDate: '2026-05-16', birthPlace: { uk: 'Київ' }, medicalConclusion: { number: 'MC-1', date: '2026-05-16' } },
      { id: 'child-2', sex: 'male', birthDate: '2026-05-17', birthPlace: { uk: 'Київ' }, medicalConclusion: { number: 'MC-2', date: '2026-05-17' } },
    ]);

    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);

    const picker = await screen.findByLabelText('Дитина для документа');
    expect(picker).toHaveValue('child-1');
    fireEvent.change(picker, { target: { value: 'child-2' } });
    expect(picker).toHaveValue('child-2');
  });

  it('hides the child picker entirely for a single-child case', async () => {
    mockGet([
      { id: 'child-1', sex: 'female', birthDate: '2026-05-16', birthPlace: { uk: 'Київ' }, medicalConclusion: { number: 'MC-1', date: '2026-05-16' } },
    ]);

    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    await screen.findByText('Case');

    expect(screen.queryByLabelText('Дитина для документа')).not.toBeInTheDocument();
  });

  // Regression: case.childbirth.children can arrive as a Firebase gap-object instead of a dense
  // array (same hazard PartiesPage.caseEditor.test.js covers for the editor) - this page's own
  // read of it (toArray) must tolerate that too.
  it('does not crash when case.childbirth.children arrives as a Firebase gap-object', async () => {
    mockGet({ 1: { id: 'child-1', sex: 'female', birthDate: '2026-05-16', birthPlace: { uk: 'Київ' }, medicalConclusion: { number: 'MC-1', date: '2026-05-16' } } });

    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);

    await screen.findByText('Case');
    await waitFor(() => expect(screen.queryByLabelText('Дитина для документа')).not.toBeInTheDocument());
  });
});
