// Real-DOM regression test for the Childbirth/Transaction case editor ("Дані для заяви в РАЦС",
// Batch 18 §6): mounts the actual DocumentsPage component (Firebase mocked out) and drives the
// maternity hospital/child/transaction fields through real form controls, to catch wiring bugs
// the pure-logic tests in documentsCatalogUtils.test.js can't see.
//
// NOTE: this project's Jest config sets `resetMocks: true`, so mock bodies must be (re-)installed
// in beforeEach rather than only in the jest.mock(...) factory.
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
  surrogateMothers: {
    'surrogate-1': { id: 'surrogate-1', name: { uk: { nominative: 'Сурогатна Матір' } }, taxId: '1234567890', address: { uk: 'Київ' } },
  },
  maternityHospitals: {
    'hospital-1': { id: 'hospital-1', shortName: 'Пологовий будинок №1' },
  },
  notaries: {
    'notary-1': { id: 'notary-1', name: { uk: { nominative: 'Нотаріус Іванова Іванівна', short: 'Іванова І.І.' } } },
  },
  transactions: {},
  cases: {
    'case-1': {
      id: 'case-1',
      relations: {
        coupleId: 'couple-1', clinicId: '', surrogateMotherId: 'surrogate-1', representativeIds: [],
      },
      program: { type: 'surrogacy', agreement: { number: { uk: '', en: '' }, date: '' } },
      childbirth: {
        maternityHospitalId: 'hospital-1',
        children: [{
          id: 'child-1', sex: 'female', birthDate: '2026-05-16', birthPlace: { uk: 'Київ', en: 'Kyiv' }, medicalConclusion: { number: 'MC-1', date: '2026-05-16' },
        }],
      },
      registrations: { birth: { transactionId: '' } },
      documents: { overrides: {} },
    },
  },
});

beforeEach(() => {
  ref.mockImplementation((_db, path) => path);
  get.mockImplementation(async path => {
    if (path === 'documentsBuilder/parties') {
      return { exists: () => true, val: () => buildParties() };
    }
    if (path === 'documentsBuilder/templates') {
      return { exists: () => false, val: () => null };
    }
    return { exists: () => false, val: () => null };
  });
  set.mockResolvedValue(undefined);
  update.mockResolvedValue(undefined);
  listStorageFolderFileNames.mockResolvedValue([]);
});

describe('spec: Childbirth/Transaction case editor (Batch 18 §6)', () => {
  it('renders the maternity hospital select and the single child, without a child selector', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);

    expect(await screen.findByLabelText('Пологовий будинок')).toHaveValue('hospital-1');
    expect(screen.getByText('Дитина 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Стать')).toHaveValue('female');
    expect(screen.queryByLabelText('Дитина для документа')).not.toBeInTheDocument();
  });

  it('"Add child" adds a second child card and reveals the child selector for the document', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    await screen.findByLabelText('Пологовий будинок');

    fireEvent.click(screen.getByRole('button', { name: /add child/i }));

    expect(screen.getAllByText('Дитина 2').length).toBeGreaterThan(0);
    expect(await screen.findByLabelText('Дитина для документа')).toBeInTheDocument();
  });

  it('removing a child drops its card and the selector again if only one remains', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    await screen.findByLabelText('Пологовий будинок');

    fireEvent.click(screen.getByRole('button', { name: /add child/i }));
    expect(screen.getAllByText('Дитина 2').length).toBeGreaterThan(0);

    const removeButtons = screen.getAllByTitle('Remove this child');
    fireEvent.click(removeButtons[removeButtons.length - 1]);

    expect(screen.queryByText('Дитина 2')).not.toBeInTheDocument();
    expect(screen.queryAllByText('Дитина 2')).toHaveLength(0);
    expect(screen.queryByLabelText('Дитина для документа')).not.toBeInTheDocument();
  });

  it('"Save childbirth details" persists the edited hospital/child fields to case.childbirth', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    await screen.findByLabelText('Пологовий будинок');

    fireEvent.change(screen.getByLabelText('№ медичного висновку'), { target: { value: 'MC-99' } });
    fireEvent.click(screen.getByRole('button', { name: /save childbirth details/i }));

    await waitFor(() => expect(set).toHaveBeenCalledWith(
      'documentsBuilder/parties/cases/case-1/childbirth',
      expect.objectContaining({
        maternityHospitalId: 'hospital-1',
        children: [expect.objectContaining({ id: 'child-1', medicalConclusion: expect.objectContaining({ number: 'MC-99' }) })],
      }),
    ));
  });

  it('"Save transaction" creates a birth-registration-surrogate-consent transaction and points the case at it', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    await screen.findByLabelText('Пологовий будинок');

    fireEvent.change(screen.getByLabelText('Дата заяви'), { target: { value: '2026-05-18' } });
    fireEvent.change(screen.getByLabelText('Нотаріус'), { target: { value: 'notary-1' } });
    fireEvent.change(screen.getByLabelText('Номер реєстру'), { target: { value: '12345' } });
    fireEvent.click(screen.getByRole('button', { name: /save transaction/i }));

    await waitFor(() => expect(update).toHaveBeenCalled());
    const [path, payload] = update.mock.calls[update.mock.calls.length - 1];
    expect(path).toBe('documentsBuilder/parties');
    const transactionKey = Object.keys(payload).find(key => key.startsWith('transactions/'));
    expect(transactionKey).toBeDefined();
    const transactionId = transactionKey.split('/')[1];
    expect(payload[transactionKey]).toEqual(expect.objectContaining({
      id: transactionId,
      type: 'birth-registration-surrogate-consent',
      caseId: 'case-1',
      coupleId: 'couple-1',
      surrogateMotherId: 'surrogate-1',
      notaryId: 'notary-1',
      statementDate: '2026-05-18',
      registryNumber: '12345',
    }));
    expect(payload[`cases/case-1/registrations/birth/transactionId`]).toBe(transactionId);
  });
});
