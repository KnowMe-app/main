// Real-DOM regression test for batch 33: the case editor's Огляд-tab "Представники" relation card
// must keep power-of-attorney data off the representative record and instead read/write it at
// relations.representativePowerOfAttorney on the case, showing the ДОВІРЕНІСТЬ date fields only
// once a representative has actually been chosen.
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
  couples: {},
  surrogateMothers: {},
  representatives: {
    'representative-1': {
      id: 'representative-1',
      name: { uk: { nominative: 'Коваль Олександр Володимирович', genitive: '' }, en: '' },
      passport: { number: 'ME680736', issuedBy: { uk: '', en: '' }, issueDate: '' },
      birthDate: '',
      address: { uk: '', en: '' },
    },
  },
  clinics: {},
  maternityHospitals: {},
  notaries: {},
});

const buildCases = () => ({
  'case-1': {
    id: 'case-1',
    relations: {
      coupleId: '', clinicId: '', surrogateMotherId: '', representativeIds: [], representativePowerOfAttorney: {},
    },
    childbirth: { maternityHospitalId: '', children: [] },
  },
});

beforeEach(() => {
  ref.mockImplementation((_db, path) => path);
  get.mockImplementation(async path => {
    if (path === 'documentsBuilder/parties') return { exists: () => true, val: () => buildParties() };
    if (path === 'documentsBuilder/cases') return { exists: () => true, val: () => buildCases() };
    return { exists: () => false, val: () => null };
  });
  set.mockResolvedValue(undefined);
  update.mockResolvedValue(undefined);
  window.localStorage.clear();
});

describe('spec: case editor Огляд tab - Представники relation card (batch 33)', () => {
  it('hides the ДОВІРЕНІСТЬ date fields until a representative is chosen, then reveals them', async () => {
    render(<MemoryRouter><PartiesPage isAdmin /></MemoryRouter>);
    fireEvent.click(await screen.findByTitle('Edit parties'));
    await screen.findByText('Огляд');

    expect(await screen.findByText('— немає —')).toBeInTheDocument();
    expect(screen.queryByText('Дата довіреності')).not.toBeInTheDocument();
    expect(screen.queryByText('Дата апостилю')).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Змінити' }).find(button => button.closest('[aria-label="Представники"]')));
    fireEvent.click(await screen.findByRole('button', { name: /Коваль Олександр Володимирович/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Застосувати' }));

    expect(await screen.findByText('Дата довіреності')).toBeInTheDocument();
    expect(screen.getByText('Дата апостилю')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Дата довіреності'), { target: { value: '2024-07-18' } });
    fireEvent.change(screen.getByLabelText('Дата апостилю'), { target: { value: '2024-07-20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти все' }));

    await waitFor(() => expect(update).toHaveBeenCalledWith('documentsBuilder/cases', expect.objectContaining({
      'case-1/relations': expect.objectContaining({
        representativeIds: ['representative-1'],
        representativePowerOfAttorney: { date: '2024-07-18', apostilleDate: '2024-07-20' },
      }),
    })));
  });

  it('does not offer power-of-attorney fields on the representative directory record itself', async () => {
    render(<MemoryRouter><PartiesPage isAdmin /></MemoryRouter>);
    fireEvent.click(await screen.findByTitle('Edit parties'));
    fireEvent.click(await screen.findByText('Representatives'));
    fireEvent.click(await screen.findByText('Коваль Олександр Володимирович'));

    expect(await screen.findByLabelText('Name (uk, nominative)')).toBeInTheDocument();
    expect(screen.queryByLabelText('Power of attorney date')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Power of attorney apostille')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Power of attorney apostille date')).not.toBeInTheDocument();
  });
});
