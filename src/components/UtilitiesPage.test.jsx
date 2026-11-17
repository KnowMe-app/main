import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { writeUtilitiesCache } from 'utils/utilitiesOfflineWrites';

const mockEnqueue = jest.fn();
const mockFetch = jest.fn();

jest.mock('./config', () => ({ auth: { currentUser: { uid: 'owner-1' } } }));
jest.mock('./ProfileDotsMenu', () => ({ ProfileDotsMenu: () => null }));
jest.mock('./utilitiesRemote', () => ({
  enqueueUtilitiesPatch: (...args) => mockEnqueue(...args),
  fetchUtilitiesData: (...args) => mockFetch(...args),
  listUtilitiesOwners: () => Promise.resolve([]),
}));
jest.mock('react-hot-toast', () => {
  const toast = jest.fn();
  toast.success = jest.fn();
  toast.error = jest.fn();
  return { __esModule: true, default: toast };
});

// eslint-disable-next-line import/first
import { UtilitiesManager } from './UtilitiesPage';

const DATA = {
  apartments: {
    a1: {
      name: 'кв. 645',
      payDay: 19,
      order: 1,
      cats: {
        light: { name: 'Світло', type: 'meter2', unit: 'кВт·год', order: 1 },
        water: { name: 'Вода', type: 'meter', unit: 'м³', order: 2 },
        zhek: { name: 'ЖЕК', type: 'sum', order: 3 },
      },
      init: { date: '2026-09-01', vals: { light: { day: { cur: 2120 }, night: { cur: 937 } }, water: { cur: 74 } } },
    },
  },
  months: {
    a1: {
      '2026-10': {
        date: '2026-10-31',
        closed: true,
        budget: '3500',
        carry: false,
        vals: {
          light: { day: { cur: '2456' }, night: { cur: '1059' }, tDay: '4.32', tNight: '2.16' },
          water: { cur: '84', t: '63.792' },
          zhek: { e: '1340-571.13' },
        },
      },
    },
  },
};

const renderPage = () => render(
  <MemoryRouter>
    <UtilitiesManager ownerId="owner-1" viewerId="owner-1" />
  </MemoryRouter>,
);

describe('UtilitiesPage', () => {
  beforeEach(() => {
    localStorage.clear();
    // CRA скидає реалізації моків перед кожним тестом (`resetMocks`).
    mockEnqueue.mockReset();
    mockEnqueue.mockImplementation(() => ({ patch: {}, delivered: Promise.resolve() }));
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(JSON.parse(JSON.stringify(DATA)));
    writeUtilitiesCache('owner-1', JSON.parse(JSON.stringify(DATA)));
  });

  it('показує підсумок закритого місяця й новий місяць', async () => {
    renderPage();
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    expect(screen.getByTestId('utilities-summary').textContent).toContain('жовтень 2026');
    expect(screen.getByTestId('utilities-open-month').textContent).toContain('Новий місяць — листопад');
  });

  it('переносить незмінне з минулого місяця одним тапом і пише через чергу', async () => {
    renderPage();
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId('utilities-carry-all'));
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    const [owner, patch] = mockEnqueue.mock.calls[0];
    expect(owner).toBe('owner-1');
    expect(patch).toMatchObject({
      'multiData/utilities/owner-1/months/a1/2026-11/vals/light/tDay': '4.32',
      'multiData/utilities/owner-1/months/a1/2026-11/vals/zhek/e': '1340-571.13',
      'multiData/utilities/owner-1/months/a1/2026-11/budget': '3500',
      'multiData/utilities/owner-1/months/a1/2026-11/closed': false,
    });
    expect(screen.getAllByText('без змін').length).toBeGreaterThan(0);
  });

  it('рахує набране одразу, а пише на blur', async () => {
    renderPage();
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const day = screen.getByTestId('utilities-field-vals.light.day.cur');
    fireEvent.change(day, { target: { value: '2500' } });
    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(screen.getByTestId('utilities-open-month').textContent.replace(/ /g, ' ')).toContain('44 кВт·год · чекає тарифу');
    fireEvent.blur(day);
    await waitFor(() => expect(mockEnqueue).toHaveBeenCalledWith('owner-1', expect.objectContaining({
      'multiData/utilities/owner-1/months/a1/2026-11/vals/light/day/cur': '2500',
    })));
  });
});
