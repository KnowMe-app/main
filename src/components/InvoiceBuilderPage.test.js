import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import InvoiceBuilderPage from './InvoiceBuilderPage';
import { fetchNbuUahExchangeRatesByDate } from './config';
import { get, set } from 'firebase/database';

global.IS_REACT_ACT_ENVIRONMENT = true;

const fixtureItems = [
  { id: '10', name: 'Baby care in hospital per day', price: 200, description: 'Daily care in hospital.' },
  { id: '11', name: 'Airport transfer', price: 90, description: 'Transfer from the airport.' },
];

const fixturePackages = [
  { id: 'p1', name: 'Full program', listedPrice: 250, description: 'Everything included.', children: ['10', '11'] },
];

const fixtureInvoiceData = {
  beneficiaries: [{ id: 'b1', title: 'PE KOVAL OLEKSANDR', address: 'Kyiv', iban: 'UA1', bankName: 'Bank', swiftCode: 'SWIFT', paymentPurpose: '' }],
  beneficiaryIds: ['b1'],
  customers: [{ name: 'Amny Athamny', address: 'Netherlands' }],
  recentServices: [],
  invoiceServices: ['id10'],
  notes: [],
  taxPercent: 0,
};

jest.mock('./config', () => ({
  auth: { currentUser: { uid: 'admin-uid' } },
  database: {},
  fetchNbuUahExchangeRatesByDate: jest.fn(),
}));

jest.mock('firebase/database', () => ({
  ref: (_database, path) => path,
  get: jest.fn(),
  set: jest.fn(),
}));

jest.mock('utils/accessLevel', () => ({
  isAdminUid: () => true,
}));

describe('InvoiceBuilderPage', () => {
  let container;

  beforeEach(() => {
    fetchNbuUahExchangeRatesByDate.mockImplementation(() => Promise.resolve({ eur: 46, usd: 42 }));
    get.mockImplementation(path => {
      if (path === 'invoiceBuilder') return Promise.resolve({ exists: () => true, val: () => fixtureInvoiceData });
      if (path === 'budget/items') return Promise.resolve({ exists: () => true, val: () => fixtureItems });
      if (path === 'budget/packages') return Promise.resolve({ exists: () => true, val: () => fixturePackages });
      return Promise.resolve({ exists: () => false, val: () => null });
    });
    set.mockImplementation(() => Promise.resolve());
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
    container = null;
    jest.clearAllMocks();
  });

  const flush = () => act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });

  const mount = () => {
    const root = createRoot(container);
    act(() => {
      root.render(<InvoiceBuilderPage isAdmin />);
    });
    return root;
  };

  const findButton = (text, exact = false) => Array.from(container.querySelectorAll('button'))
    .find(btn => (exact ? btn.textContent.trim() === text : btn.textContent.includes(text)));

  const nativeTextareaValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
  const setFieldValue = (field, value) => {
    nativeTextareaValueSetter.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  };

  it('renders the catalog-linked service from budget/items without touching the shared catalog', async () => {
    const root = mount();
    await flush();

    expect(container.innerHTML).toContain('Baby care in hospital per day');
    expect(container.innerHTML).toContain('200');

    await act(async () => { root.unmount(); });
  });

  it('overriding a catalog item price only writes invoiceBuilder/invoiceServices, never budget/items', async () => {
    const root = mount();
    await flush();

    const priceField = container.querySelector('textarea[aria-label="Price (EUR)"]');
    expect(priceField).toBeTruthy();
    expect(priceField.value).toBe('200');

    await act(async () => {
      priceField.focus();
      setFieldValue(priceField, '350');
      priceField.blur();
    });
    await flush();

    const persistedCalls = set.mock.calls.filter(([path]) => path === 'invoiceBuilder/invoiceServices');
    expect(persistedCalls).toHaveLength(1);
    const [, persistedValue] = persistedCalls[0];
    expect(persistedValue[0]).toMatchObject({ kind: 'item', catalogId: '10', price: 350, customized: true });
    expect(set.mock.calls.some(([path]) => path.startsWith('budget/'))).toBe(false);
    expect(container.innerHTML).toContain('Custom');

    await act(async () => { root.unmount(); });
  });

  it('adds a whole package from the catalog, then removing one of its services makes it a custom package', async () => {
    const root = mount();
    await flush();

    await act(async () => { findButton('Add from catalog').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush();
    await act(async () => { findButton('Packages', true).dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush();

    const packageButton = findButton('Full program');
    expect(packageButton).toBeTruthy();
    await act(async () => { packageButton.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush();

    expect(container.innerHTML).toContain('Airport transfer');
    let lastServicesCall = set.mock.calls.filter(([path]) => path === 'invoiceBuilder/invoiceServices').pop();
    expect(lastServicesCall[1][1]).toMatchObject({ kind: 'package', catalogId: 'p1' });
    expect(lastServicesCall[1][1].children).toHaveLength(2);

    const removeFromPackageButton = Array.from(container.querySelectorAll('button'))
      .find(btn => btn.title === 'Remove from package');
    expect(removeFromPackageButton).toBeTruthy();
    await act(async () => { removeFromPackageButton.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush();

    lastServicesCall = set.mock.calls.filter(([path]) => path === 'invoiceBuilder/invoiceServices').pop();
    const packageEntry = lastServicesCall[1].find(entry => entry.kind === 'package');
    expect(packageEntry.children).toHaveLength(1);
    expect(packageEntry.customized).toBe(true);
    expect(container.innerHTML).toContain('Custom package');

    await act(async () => { root.unmount(); });
  });

  it('deletes a custom service from the invoice', async () => {
    const root = mount();
    await flush();

    const nameField = container.querySelector('textarea[placeholder="New custom service name"]');
    const priceField = container.querySelector('textarea[placeholder="Price"]');
    await act(async () => {
      nameField.focus();
      setFieldValue(nameField, 'Courier fee');
      setFieldValue(priceField, '25');
    });

    const addCustomButton = nameField.parentElement.querySelector('button');
    expect(addCustomButton.textContent.trim()).toBe('Add');
    await act(async () => { addCustomButton.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush();

    expect(container.innerHTML).toContain('Courier fee');

    const removeButtons = Array.from(container.querySelectorAll('button[title="Remove"]'));
    expect(removeButtons.length).toBeGreaterThan(0);
    await act(async () => { removeButtons[removeButtons.length - 1].dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush();

    expect(container.innerHTML).not.toContain('Courier fee');
    const lastServicesCall = set.mock.calls.filter(([path]) => path === 'invoiceBuilder/invoiceServices').pop();
    expect(lastServicesCall[1].some(entry => entry.name === 'Courier fee')).toBe(false);

    await act(async () => { root.unmount(); });
  });
});
