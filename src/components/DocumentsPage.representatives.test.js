// Довіреність питає `representatives.0.*` і `representatives.1.*`, а другого представника можна
// було обрати лише в редакторі кейсу на /parties — на сторінці документів друге місце стояло
// прочерками. Тепер кейс має тут два вибори «Представник 1/2», і вибір другого пише
// relations/representativeIds кейсу, не чіпаючи першого.
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

const person = (id, uk, en, number = '', birthDate = '') => ({
  id, name: { uk: { nominative: uk, genitive: '' }, en }, passport: { number, issuedBy: { uk: '', en: '' }, issueDate: '' }, birthDate,
});

beforeEach(() => {
  ref.mockImplementation((_db, path) => path);
  get.mockImplementation(async path => {
    if (path === 'documentsBuilder/parties') {
      return {
        exists: () => true,
        val: () => ({
          couples: {}, surrogateMothers: {}, clinics: {}, maternityHospitals: {}, notaries: {},
          representatives: {
            'representative-1': person('representative-1', 'Коваль Олександр Володимирович', 'Koval Oleksandr Volodymyrovych'),
            'representative-2': person('representative-2', 'Коваль Ірина Ігорівна', 'Koval Iryna Ihorivna'),
            // Тезка першого: різнять їх лише паспорт і дата народження.
            'representative-3': person('representative-3', 'Коваль Олександр Володимирович', 'Koval Oleksandr Volodymyrovych', 'KM123456', '1990-02-03'),
          },
        }),
      };
    }
    if (path === 'documentsBuilder/cases') {
      return {
        exists: () => true,
        val: () => ({ 'case-1': { id: 'case-1', relations: { coupleId: '', clinicId: '', surrogateMotherId: '', representativeIds: ['representative-1'] } } }),
      };
    }
    return { exists: () => false, val: () => null };
  });
  set.mockResolvedValue(undefined);
  update.mockResolvedValue(undefined);
  listStorageFolderFileNames.mockResolvedValue([]);
});

describe('сторінка документів: два представники кейсу', () => {
  it('обирає другого представника й зберігає обох у кейсі', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);

    const first = await screen.findByLabelText('Представник 1');
    const second = screen.getByLabelText('Представник 2');
    expect(first).toHaveValue('representative-1');
    expect(second).toHaveValue('');
    // Перший уже стоїть на першому місці — вдруге його не пропонують.
    expect(screen.getByRole('option', { name: 'Представник 2: Коваль Олександр Володимирович' })).toBeDisabled();

    fireEvent.change(second, { target: { value: 'representative-2' } });

    await waitFor(() => expect(update).toHaveBeenCalledWith('documentsBuilder/cases', {
      'case-1/relations/representativeIds': ['representative-1', 'representative-2'],
    }));
    expect(screen.getByLabelText('Представник 2')).toHaveValue('representative-2');
  });

  it('тезок розрізняє паспорт і дата народження', async () => {
    render(<MemoryRouter><DocumentsPage isAdmin /></MemoryRouter>);
    await screen.findByLabelText('Представник 2');
    expect(screen.getByRole('option', { name: 'Представник 2: Коваль Олександр Володимирович' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Представник 2: Коваль Олександр Володимирович · Паспорт KM 123456 · 03.02.1990 р.н.' })).toBeEnabled();
  });
});
