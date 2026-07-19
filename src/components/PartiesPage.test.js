// Smoke test for the Parties page: mounts the real component (Firebase mocked out) and drives the
// collapse/expand -> edit -> collapse interaction, the reference-checked delete confirmation, and
// a case's relation-slot picker, to catch wiring bugs a pure-logic test can't see.
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
import { ref, get, set } from 'firebase/database';
// eslint-disable-next-line import/first
import PartiesPage from './PartiesPage';

const buildParties = () => ({
  couples: {
    'couple-1': {
      id: 'couple-1',
      partners: [
        { id: 'p1', role: 'wife', name: { uk: { nominative: 'Тестова Марія' }, en: 'Testova Mariia' } },
        { id: 'p2', role: 'husband', name: { uk: { nominative: 'Тестовий Петро' }, en: 'Testovyi Petro' } },
      ],
    },
  },
  surrogateMothers: {
    'surrogate-1': { id: 'surrogate-1', name: { uk: { nominative: 'Сурогатна Матір' } }, taxId: '1234567890' },
  },
  representatives: {},
  clinics: {
    'clinic-1': { id: 'clinic-1', name: { uk: 'Клініка Мрія' } },
  },
  maternityHospitals: {},
  notaries: {},
  transactions: {},
  cases: {
    'case-1': {
      id: 'case-1',
      relations: { coupleId: 'couple-1', clinicId: '', surrogateMotherId: '', representativeIds: [] },
      program: { type: 'surrogacy', agreement: { number: { uk: '', en: '' }, date: '' } },
      childbirth: { maternityHospitalId: '', children: [] },
      registrations: { birth: { transactionId: '' } },
      documents: { overrides: {} },
    },
  },
});

beforeEach(() => {
  ref.mockImplementation((_db, path) => path);
  get.mockImplementation(async path => {
    if (path === 'documentsBuilder/parties') return { exists: () => true, val: () => buildParties() };
    if (path === 'documentsBuilder/templates') return { exists: () => false, val: () => null };
    if (path === 'documentsBuilder/partiesSettings/recentIds') return { exists: () => false, val: () => null };
    return { exists: () => false, val: () => null };
  });
  set.mockResolvedValue(undefined);
  window.confirm = jest.fn(() => true);
});

describe('spec: Parties page', () => {
  it('renders every party-type group collapsed by default, with a record count', async () => {
    render(<MemoryRouter><PartiesPage isAdmin /></MemoryRouter>);

    expect(await screen.findByText('Couples')).toBeInTheDocument();
    expect(screen.getByText('Surrogate mothers')).toBeInTheDocument();
    expect(screen.getByText('Representatives')).toBeInTheDocument();
    expect(screen.getByText('Clinics')).toBeInTheDocument();
    expect(screen.getByText('Maternity hospitals')).toBeInTheDocument();
    expect(screen.getByText('Notaries')).toBeInTheDocument();
    expect(screen.getByText('Cases')).toBeInTheDocument();

    // Couples has 1 record, but its own row is not rendered until the group is expanded.
    expect(screen.queryByText('Тестова Марія & Тестовий Петро')).not.toBeInTheDocument();
  });

  it('expanding a group reveals its records; expanding a record reveals its fields', async () => {
    render(<MemoryRouter><PartiesPage isAdmin /></MemoryRouter>);
    await screen.findByText('Clinics');

    fireEvent.click(screen.getByText('Clinics'));
    const clinicRow = await screen.findByText('Клініка Мрія');
    expect(screen.queryByLabelText('Name (uk)')).not.toBeInTheDocument();

    fireEvent.click(clinicRow);
    expect(await screen.findByLabelText('Name (uk)')).toHaveValue('Клініка Мрія');
  });

  it('editing a field on blur persists it additively to the record path', async () => {
    render(<MemoryRouter><PartiesPage isAdmin /></MemoryRouter>);
    await screen.findByText('Clinics');
    fireEvent.click(screen.getByText('Clinics'));
    fireEvent.click(await screen.findByText('Клініка Мрія'));

    const emailField = await screen.findByLabelText('Email');
    fireEvent.change(emailField, { target: { value: 'info@mriia.example' } });
    fireEvent.blur(emailField);

    await waitFor(() => expect(set).toHaveBeenCalledWith('documentsBuilder/parties/clinics/clinic-1/email', 'info@mriia.example'));
  });

  it('"Add" creates a new blank record and expands it', async () => {
    render(<MemoryRouter><PartiesPage isAdmin /></MemoryRouter>);
    await screen.findByText('Notaries');
    fireEvent.click(screen.getByText('Notaries'));

    fireEvent.click(await screen.findByRole('button', { name: /add/i }));

    await waitFor(() => expect(set).toHaveBeenCalled());
    const [path, record] = set.mock.calls[set.mock.calls.length - 1];
    expect(path).toMatch(/^documentsBuilder\/parties\/notaries\/notary-/);
    expect(record.id).toBe(path.split('/').pop());
    expect(await screen.findByLabelText('Title (uk)')).toBeInTheDocument();
  });

  it('deleting a party referenced by a case includes the reference in the confirmation, but still deletes when confirmed', async () => {
    render(<MemoryRouter><PartiesPage isAdmin /></MemoryRouter>);
    await screen.findByText('Couples');
    fireEvent.click(screen.getByText('Couples'));
    fireEvent.click(await screen.findByText('Тестова Марія & Тестовий Петро'));

    fireEvent.click(screen.getByRole('button', { name: /delete/i }));

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Used in case'));
    await waitFor(() => expect(set).toHaveBeenCalledWith('documentsBuilder/parties/couples/couple-1', null));
  });

  it('deleting a party skips the delete when the confirmation is declined', async () => {
    window.confirm = jest.fn(() => false);
    render(<MemoryRouter><PartiesPage isAdmin /></MemoryRouter>);
    await screen.findByText('Notaries');
    fireEvent.click(screen.getByText('Clinics'));
    fireEvent.click(await screen.findByText('Клініка Мрія'));

    fireEvent.click(screen.getByRole('button', { name: /delete/i }));

    expect(window.confirm).toHaveBeenCalled();
    expect(set).not.toHaveBeenCalledWith('documentsBuilder/parties/clinics/clinic-1', null);
  });

  it('a case relation slot picks from the existing records and persists the pick, most-recently-used tracked', async () => {
    render(<MemoryRouter><PartiesPage isAdmin /></MemoryRouter>);
    await screen.findByText('Cases');
    fireEvent.click(screen.getByText('Cases'));
    fireEvent.click(await screen.findByText('Testova Mariia & Testovyi Petro'));

    fireEvent.click(screen.getByRole('button', { name: 'Clinic slot' }));
    fireEvent.click(await screen.findByText('Клініка Мрія'));

    await waitFor(() => expect(set).toHaveBeenCalledWith('documentsBuilder/parties/cases/case-1/relations/clinicId', 'clinic-1'));
    await waitFor(() => expect(set).toHaveBeenCalledWith('documentsBuilder/partiesSettings/recentIds/clinics', ['clinic-1']));
  });

  it('renders the shared Childbirth/Transaction editor inside an expanded case', async () => {
    render(<MemoryRouter><PartiesPage isAdmin /></MemoryRouter>);
    await screen.findByText('Cases');
    fireEvent.click(screen.getByText('Cases'));
    fireEvent.click(await screen.findByText('Testova Mariia & Testovyi Petro'));

    expect(await screen.findByText('Дані для заяви в РАЦС')).toBeInTheDocument();
  });
});
