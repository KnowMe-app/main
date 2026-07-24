// Real-DOM regression test for the Childbirth/Transaction case editor ("Дані для заяви в РАЦС",
// Batch 18 §6): mounts the actual PartiesPage component (Firebase mocked out) and drives the
// maternity hospital/child/transaction fields through real form controls, to catch wiring bugs
// the pure-logic tests in documentsCatalogUtils.test.js can't see. This editor used to also be
// mounted a second time on the Documents Builder page - a plain duplicate of what's here, since
// both hosts rendered the exact same component - so it now lives solely on Parties (spec: "це
// повтор зі сторінки Parties, прибери з documents").
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
}));

jest.mock('utils/accessLevel', () => ({ isInvoiceBuilderUid: () => true }));

// eslint-disable-next-line import/first
import { ref, get, set, update } from 'firebase/database';
// eslint-disable-next-line import/first
import PartiesPage from './PartiesPage';

const buildParties = () => ({
  couples: {
    'couple-1': { id: 'couple-1', partners: [{ id: 'p1', role: 'wife', name: { uk: { nominative: 'Тестова Марія' }, en: 'Testova Mariia' } }] },
  },
  surrogateMothers: {
    'surrogate-1': { id: 'surrogate-1', name: { uk: { nominative: 'Сурогатна Матір' } }, taxId: '1234567890', address: { uk: 'Київ' } },
  },
  representatives: {},
  clinics: {},
  maternityHospitals: {
    'hospital-1': { id: 'hospital-1', shortName: { uk: 'Пологовий будинок №1', en: '' } },
  },
  notaries: {
    'notary-1': { id: 'notary-1', name: { uk: { nominative: 'Нотаріус Іванова Іванівна', short: 'Іванова І.І.' } } },
  },
});

const buildCases = () => ({
  'case-1': {
    id: 'case-1',
    relations: {
      coupleId: 'couple-1', clinicId: '', surrogateMotherId: 'surrogate-1', representativeIds: [],
    },
    childbirth: {
      maternityHospitalId: 'hospital-1',
      children: [{
        id: 'child-1', sex: 'female', birthDate: '2026-05-16', birthPlace: { uk: 'Київ', en: 'Kyiv' }, medicalConclusion: { number: 'MC-1', date: '2026-05-16' },
      }],
    },
  },
});

const openCaseOne = async () => {
  render(<MemoryRouter><PartiesPage isAdmin /></MemoryRouter>);
  fireEvent.click(await screen.findByTitle('Edit parties'));
  fireEvent.click(await screen.findByText('Cases'));
  fireEvent.click(await screen.findByText(/Testova Mariia/));
};

beforeEach(() => {
  ref.mockImplementation((_db, path) => path);
  get.mockImplementation(async path => {
    if (path === 'documentsBuilder/parties') {
      return { exists: () => true, val: () => buildParties() };
    }
    if (path === 'documentsBuilder/cases') {
      return { exists: () => true, val: () => buildCases() };
    }
    return { exists: () => false, val: () => null };
  });
  set.mockResolvedValue(undefined);
  update.mockResolvedValue(undefined);
  window.localStorage.clear(); // read/edit mode persists across reloads (spec §10) - not across tests
});

describe('spec: Childbirth/Transaction case editor (Batch 18 §6), on Parties', () => {
  it('renders the maternity hospital select and the single child, without a child selector', async () => {
    await openCaseOne();

    const hospitalSelect = await screen.findByLabelText('Пологовий будинок');
    expect(hospitalSelect).toHaveValue('hospital-1');
    // shortName is a bilingual { uk, en } record (same shape as name/address on every other
    // maternity hospital field) - rendering it as an <option> label must resolve to the uk string,
    // not the object itself (which crashes React: "Objects are not valid as a React child").
    expect(screen.getByText('Пологовий будинок №1')).toBeInTheDocument();
    expect(screen.getByText('Дитина 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Стать')).toHaveValue('female');
    expect(screen.queryByLabelText('Дитина для документа')).not.toBeInTheDocument();
  });

  it('"Add child" adds a second child card and reveals the child selector', async () => {
    await openCaseOne();
    await screen.findByLabelText('Пологовий будинок');

    fireEvent.click(screen.getByRole('button', { name: /add child/i }));

    expect(screen.getAllByText('Дитина 2').length).toBeGreaterThan(0);
    expect(await screen.findByLabelText('Дитина для документа')).toBeInTheDocument();
  });

  it('removing a child drops its card and the selector again if only one remains', async () => {
    await openCaseOne();
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
    await openCaseOne();
    await screen.findByLabelText('Пологовий будинок');

    fireEvent.change(screen.getByLabelText('№ медичного висновку'), { target: { value: 'MC-99' } });
    fireEvent.click(screen.getByRole('button', { name: /save childbirth details/i }));

    await waitFor(() => expect(set).toHaveBeenCalledWith(
      'documentsBuilder/cases/case-1/childbirth',
      expect.objectContaining({
        maternityHospitalId: 'hospital-1',
        children: [expect.objectContaining({ id: 'child-1', medicalConclusion: expect.objectContaining({ number: 'MC-99' }) })],
      }),
    ));
  });

  it('"Save surrogacy agreement" persists the agreement number/date directly to case.documents.surrogacyAgreement', async () => {
    await openCaseOne();
    await screen.findByLabelText('Пологовий будинок');

    fireEvent.change(screen.getByLabelText('Номер (укр)'), { target: { value: 'Д-1' } });
    fireEvent.change(screen.getByLabelText('Дата договору'), { target: { value: '2026-05-01' } });
    fireEvent.click(screen.getByRole('button', { name: /save surrogacy agreement/i }));

    await waitFor(() => expect(set).toHaveBeenCalledWith(
      'documentsBuilder/cases/case-1/documents/surrogacyAgreement',
      { number: { uk: 'Д-1' }, date: '2026-05-01' },
    ));
  });

  it('"Save birth registration details" persists the statement date/notary directly to case.documents.birthRegistrationConsent, with no registry number field', async () => {
    await openCaseOne();
    await screen.findByLabelText('Пологовий будинок');

    expect(screen.queryByLabelText('Номер реєстру')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Дата заяви'), { target: { value: '2026-05-18' } });
    fireEvent.change(screen.getByLabelText('Нотаріус'), { target: { value: 'notary-1' } });
    fireEvent.click(screen.getByRole('button', { name: /save birth registration details/i }));

    await waitFor(() => expect(set).toHaveBeenCalledWith(
      'documentsBuilder/cases/case-1/documents/birthRegistrationConsent',
      { statementDate: '2026-05-18', notaryId: 'notary-1' },
    ));
    expect(update).not.toHaveBeenCalled();
  });

  // Regression: Firebase RTDB silently turns a JS array into a `{"1": {...}}`-shaped plain object
  // once a child has ever been removed by key rather than re-set as a dense array (or the case was
  // edited straight in the Firebase console) - `childbirthDraft.children.map(...)` then threw
  // "children.map is not a function" with no error boundary to catch it, blanking the whole page.
  it('does not crash when a case.childbirth.children arrives as a Firebase gap-object instead of an array', async () => {
    get.mockImplementation(async path => {
      if (path === 'documentsBuilder/parties') {
        return { exists: () => true, val: () => buildParties() };
      }
      if (path === 'documentsBuilder/cases') {
        const cases = buildCases();
        // `.children` here is a plain-object field on the fixture, not a DOM node, but the
        // testing-library lint rule can't tell the two apart from the property name alone.
        // eslint-disable-next-line testing-library/no-node-access
        cases['case-1'].childbirth.children = { 1: cases['case-1'].childbirth.children[0] };
        return { exists: () => true, val: () => cases };
      }
      return { exists: () => false, val: () => null };
    });

    await openCaseOne();

    expect(await screen.findByLabelText('Пологовий будинок')).toHaveValue('hospital-1');
    expect(screen.getByText('Дитина 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Стать')).toHaveValue('female');
  });
});
