// Real-DOM regression test for the case editor's РАЦС tab (childbirth/child data, batch 18 §6,
// re-skinned onto the tabbed case editor in batch 28): mounts the actual PartiesPage component
// (Firebase mocked out) and drives the maternity-hospital bottom-sheet picker and child fields
// through real form controls, to catch wiring bugs the pure-logic tests in
// documentsCatalogUtils.test.js can't see.
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
    'hospital-1': { id: 'hospital-1', name: { uk: 'Пологовий будинок №1', en: '' } },
  },
  notaries: {
    'notary-1': { id: 'notary-1', name: { uk: { nominative: 'Іванова Ганна Іванівна' } } },
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
  await screen.findByText('Огляд');
  fireEvent.click(screen.getByRole('button', { name: 'РАЦС' }));
  await screen.findByText('Пологи та дитина');
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

describe('spec: case editor РАЦС tab - childbirth/child data (batch 18 §6, batch 28)', () => {
  it('renders the maternity-hospital picker field and the single child', async () => {
    await openCaseOne();

    const hospitalField = await screen.findByLabelText('Пологовий будинок');
    expect(hospitalField).toHaveTextContent('Пологовий будинок №1');
    expect(screen.getByText('Дитина 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Стать')).toHaveValue('female');
  });

  it('requires missing genetic sources to be explicitly selected', async () => {
    await openCaseOne();
    fireEvent.click(screen.getByRole('button', { name: 'Програма ДРТ' }));

    const oocyteSource = screen.getByLabelText('Джерело яйцеклітин');
    const spermSource = screen.getByLabelText('Джерело сперматозоїдів');
    expect(oocyteSource).toHaveValue('');
    expect(spermSource).toHaveValue('');

    fireEvent.change(oocyteSource, { target: { value: 'role' } });
    fireEvent.change(spermSource, { target: { value: 'role' } });
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти все' }));

    await waitFor(() => expect(update).toHaveBeenCalledWith('documentsBuilder/cases', expect.objectContaining({
      'case-1/artProgram': expect.objectContaining({ oocyteSource: 'wife', spermSource: 'husband' }),
    })));
  });

  it('picking a different maternity hospital via the bottom sheet updates the field', async () => {
    const parties = buildParties();
    parties.maternityHospitals['hospital-2'] = { id: 'hospital-2', name: { uk: 'Пологовий будинок №2', en: '' } };
    get.mockImplementation(async path => {
      if (path === 'documentsBuilder/parties') return { exists: () => true, val: () => parties };
      if (path === 'documentsBuilder/cases') return { exists: () => true, val: () => buildCases() };
      return { exists: () => false, val: () => null };
    });
    await openCaseOne();
    await screen.findByLabelText('Пологовий будинок');

    fireEvent.click(screen.getByLabelText('Пологовий будинок'));
    fireEvent.click(await screen.findByRole('button', { name: 'Пологовий будинок №2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Застосувати' }));

    expect(await screen.findByLabelText('Пологовий будинок')).toHaveTextContent('Пологовий будинок №2');
  });

  it('"Додати дитину" adds a second child card', async () => {
    await openCaseOne();
    await screen.findByLabelText('Пологовий будинок');

    fireEvent.click(screen.getByRole('button', { name: /додати дитину/i }));

    expect(screen.getAllByText('Дитина 2').length).toBeGreaterThan(0);
    expect(screen.getByText('7/12')).toBeInTheDocument();
  });

  it('removing a child drops its card', async () => {
    await openCaseOne();
    await screen.findByLabelText('Пологовий будинок');

    fireEvent.click(screen.getByRole('button', { name: /додати дитину/i }));
    expect(screen.getAllByText('Дитина 2').length).toBeGreaterThan(0);

    const removeButtons = screen.getAllByTitle('Видалити дитину');
    fireEvent.click(removeButtons[removeButtons.length - 1]);

    expect(screen.queryByText('Дитина 2')).not.toBeInTheDocument();
  });

  it('"Зберегти все" persists the edited hospital/child fields to case.childbirth in a single batched update', async () => {
    await openCaseOne();
    await screen.findByLabelText('Пологовий будинок');

    fireEvent.change(screen.getByLabelText('№ медичного висновку'), { target: { value: 'MC-99' } });
    expect(await screen.findByRole('button', { name: 'Зберегти все' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти все' }));

    await waitFor(() => expect(update).toHaveBeenCalledWith('documentsBuilder/cases', expect.objectContaining({
      'case-1/childbirth': expect.objectContaining({
        maternityHospitalId: 'hospital-1',
        children: [expect.objectContaining({ id: 'child-1', medicalConclusion: expect.objectContaining({ number: 'MC-99' }) })],
      }),
    })));
    // A save that never touched the ART Program tab must not fabricate artProgram data (the
    // genetic-source mode selector always displays a default role even when untouched).
    expect(update).toHaveBeenCalledWith('documentsBuilder/cases', expect.objectContaining({ 'case-1/artProgram': null }));
  });

  it('editing the surrogacy agreement and picking a notary persists them alongside the childbirth data in the same save', async () => {
    const cases = buildCases();
    cases['case-1'].documents = {
      embryoOwnershipStatement: { statementDate: '2026-04-30', notaryId: 'legacy-notary' },
    };
    get.mockImplementation(async path => {
      if (path === 'documentsBuilder/parties') return { exists: () => true, val: () => buildParties() };
      if (path === 'documentsBuilder/cases') return { exists: () => true, val: () => cases };
      return { exists: () => false, val: () => null };
    });
    await openCaseOne();
    await screen.findByLabelText('Пологовий будинок');

    fireEvent.change(screen.getByLabelText('Номер (укр)'), { target: { value: 'Д-1' } });
    fireEvent.change(screen.getByLabelText('Дата договору'), { target: { value: '2026-05-01' } });
    fireEvent.click(screen.getByLabelText('Нотаріус'));
    fireEvent.click(await screen.findByRole('button', { name: 'Іванова Г.І.' }));
    fireEvent.click(screen.getByRole('button', { name: 'Застосувати' }));

    fireEvent.click(screen.getByRole('button', { name: 'Зберегти все' }));

    await waitFor(() => expect(update).toHaveBeenCalledWith('documentsBuilder/cases', expect.objectContaining({
      'case-1/documents': expect.objectContaining({
        surrogacyAgreement: { number: { uk: 'Д-1' }, date: '2026-05-01', notaryId: 'notary-1' },
        embryoOwnershipStatement: { statementDate: '2026-04-30', notaryId: 'legacy-notary' },
      }),
    })));
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

    expect(await screen.findByLabelText('Пологовий будинок')).toHaveTextContent('Пологовий будинок №1');
    expect(screen.getByText('Дитина 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Стать')).toHaveValue('female');
  });
});
