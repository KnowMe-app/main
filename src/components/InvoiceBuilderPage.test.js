import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import InvoiceBuilderPage from './InvoiceBuilderPage';
import { fetchNbuUahExchangeRatesByDate } from './config';
import { get, set } from 'firebase/database';
import expectedExpensesSeed from '../data/expectedExpensesSeed.json';

global.IS_REACT_ACT_ENVIRONMENT = true;

const fixtureItems = [
  { id: '10', name: 'Baby care in hospital per day', price: 200, description: 'Daily care in hospital.' },
  { id: '11', name: 'Airport transfer', price: 90, description: 'Transfer from the airport.' },
];

const fixturePackages = [
  {
    id: 'p1', name: 'Full program', listedPrice: 250, description: 'Everything included.', children: ['10', '11'], paymentScheduleId: 'ps-1',
  },
];

const fixtureTechnical = {
  paymentSchedules: [
    { id: 'ps-1', payments: [{ title: 'To start the program', amount: 150 }, { title: 'Final payment', amount: 100 }] },
  ],
  wireTransferSurchargeRate: 0.14,
};

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
      if (path === 'budget/technical') return Promise.resolve({ exists: () => true, val: () => fixtureTechnical });
      return Promise.resolve({ exists: () => false, val: () => null });
    });
    set.mockImplementation(() => Promise.resolve());
    window.confirm = jest.fn(() => true);
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
    // eslint-disable-next-line testing-library/no-unnecessary-act -- createRoot.render must be wrapped in act to flush the initial React 18 render in this test harness.
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

  describe('expected expenses', () => {
    const createPlan = async () => {
      await act(async () => { findButton('Choose a package').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      await flush();
      const packageButton = findButton('Full program');
      expect(packageButton).toBeTruthy();
      await act(async () => { packageButton.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      await flush();
    };

    it('builds a template from a package, auto-calculating package-percent rows from its catalog schedule', async () => {
      const root = mount();
      await flush();

      await createPlan();

      expect(container.innerHTML).toContain('To start the program');
      expect(container.innerHTML).toContain('Final payment');
      expect(container.innerHTML).toContain('Due: €171.00');
      expect(container.innerHTML).toContain('Due: €114.00');

      const persistedCalls = set.mock.calls.filter(([path]) => path === 'invoiceBuilder/expectedExpenses');
      expect(persistedCalls.length).toBeGreaterThan(0);
      const plan = persistedCalls[persistedCalls.length - 1][1];
      expect(plan.packageId).toBe('p1');
      expect(plan.expectedExpenses).toHaveLength(2);
      expect(plan.expectedExpenses[0][0]).toMatchObject({ kind: 'packagePercent', catalogId: 'p1', percent: 60, expectedExpenseRole: 'scheduled' });
      expect(plan.expectedExpenses[1][0]).toMatchObject({ kind: 'packagePercent', catalogId: 'p1', percent: 40, expectedExpenseRole: 'scheduled' });

      await act(async () => { root.unmount(); });
    });

    it('adding a service to a schedule group updates its due amount and is persisted on that group only', async () => {
      const root = mount();
      await flush();

      await createPlan();

      const milestoneNameFields = Array.from(container.querySelectorAll('textarea[placeholder="Custom line name…"]'));
      expect(milestoneNameFields).toHaveLength(2);
      const milestoneAddRow = milestoneNameFields[0].parentElement;
      const priceField = milestoneAddRow.querySelector('textarea[placeholder="Price"]');
      const addButton = Array.from(milestoneAddRow.querySelectorAll('button')).find(btn => btn.textContent.trim() === 'Add');

      await act(async () => {
        milestoneNameFields[0].focus();
        setFieldValue(milestoneNameFields[0], 'Deposit for transportation of SM');
        setFieldValue(priceField, '300');
      });
      await act(async () => { addButton.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      await flush();

      expect(container.innerHTML).toContain('Deposit for transportation of SM');
      expect(container.innerHTML).toContain('Due: €513.00');

      const plan = set.mock.calls.filter(([path]) => path === 'invoiceBuilder/expectedExpenses').pop()[1];
      expect(plan.expectedExpenses[0]).toHaveLength(2);
      expect(plan.expectedExpenses[0][1]).toBe('Deposit for transportation of SM || 300');
      expect(plan.expectedExpenses[1]).toHaveLength(1);

      await act(async () => { root.unmount(); });
    });

    it('recalculates scheduled package rows while preserving extra services', async () => {
      get.mockImplementation(path => {
        if (path === 'invoiceBuilder') return Promise.resolve({ exists: () => true, val: () => fixtureInvoiceData });
        if (path === 'budget/items') return Promise.resolve({ exists: () => true, val: () => fixtureItems });
        if (path === 'budget/packages') return Promise.resolve({ exists: () => true, val: () => fixturePackages });
        if (path === 'budget/technical') return Promise.resolve({ exists: () => true, val: () => fixtureTechnical });
        if (path === 'invoiceBuilder/expectedExpenses') {
          return Promise.resolve({
            exists: () => true,
            val: () => ({
              packageId: 'p1',
              expectedExpenses: [
                [
                  { id: 'stale-1', kind: 'packagePercent', catalogId: 'p1', percent: 10, expectedExpenseRole: 'scheduled' },
                  { id: 'custom-1', kind: 'custom', name: 'Deposit for transportation of SM', price: 300 },
                ],
                [{ id: 'stale-2', kind: 'packagePercent', catalogId: 'p1', percent: 10, expectedExpenseRole: 'scheduled' }],
              ],
            }),
          });
        }
        return Promise.resolve({ exists: () => false, val: () => null });
      });
      const root = mount();
      await flush();

      const recalculateButton = findButton('Recalculate');
      expect(recalculateButton).toBeTruthy();
      await act(async () => { recalculateButton.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      await flush();

      const plan = set.mock.calls.filter(([path]) => path === 'invoiceBuilder/expectedExpenses').pop()[1];
      expect(plan.expectedExpenses[0][0]).toMatchObject({ kind: 'packagePercent', catalogId: 'p1', percent: 60, expectedExpenseRole: 'scheduled' });
      expect(plan.expectedExpenses[0][1]).toBe('Deposit for transportation of SM || 300');
      expect(plan.expectedExpenses[1][0]).toMatchObject({ kind: 'packagePercent', catalogId: 'p1', percent: 40, expectedExpenseRole: 'scheduled' });

      await act(async () => { root.unmount(); });
    });

    it('replaces legacy unmarked scheduled package rows while preserving extra services', async () => {
      get.mockImplementation(path => {
        if (path === 'invoiceBuilder') return Promise.resolve({ exists: () => true, val: () => fixtureInvoiceData });
        if (path === 'budget/items') return Promise.resolve({ exists: () => true, val: () => fixtureItems });
        if (path === 'budget/packages') return Promise.resolve({ exists: () => true, val: () => fixturePackages });
        if (path === 'budget/technical') return Promise.resolve({ exists: () => true, val: () => fixtureTechnical });
        if (path === 'invoiceBuilder/expectedExpenses') {
          return Promise.resolve({
            exists: () => true,
            val: () => ({
              packageId: 'p1',
              expectedExpenses: [
                [
                  'idp1 || 10%',
                  'Deposit for transportation of SM || 300',
                ],
                ['idp1 || 10%'],
              ],
            }),
          });
        }
        return Promise.resolve({ exists: () => false, val: () => null });
      });
      const root = mount();
      await flush();

      const recalculateButton = findButton('Recalculate');
      expect(recalculateButton).toBeTruthy();
      await act(async () => { recalculateButton.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      await flush();

      const plan = set.mock.calls.filter(([path]) => path === 'invoiceBuilder/expectedExpenses').pop()[1];
      expect(plan.expectedExpenses[0]).toHaveLength(2);
      expect(plan.expectedExpenses[0][0]).toMatchObject({ kind: 'packagePercent', catalogId: 'p1', percent: 60, expectedExpenseRole: 'scheduled' });
      expect(plan.expectedExpenses[0][1]).toBe('Deposit for transportation of SM || 300');
      expect(plan.expectedExpenses[1]).toHaveLength(1);
      expect(plan.expectedExpenses[1][0]).toMatchObject({ kind: 'packagePercent', catalogId: 'p1', percent: 40, expectedExpenseRole: 'scheduled' });

      await act(async () => { root.unmount(); });
    });

    it('preserves user-added package percent rows when recalculating', async () => {
      get.mockImplementation(path => {
        if (path === 'invoiceBuilder') return Promise.resolve({ exists: () => true, val: () => fixtureInvoiceData });
        if (path === 'budget/items') return Promise.resolve({ exists: () => true, val: () => fixtureItems });
        if (path === 'budget/packages') return Promise.resolve({ exists: () => true, val: () => fixturePackages });
        if (path === 'budget/technical') return Promise.resolve({ exists: () => true, val: () => fixtureTechnical });
        if (path === 'invoiceBuilder/expectedExpenses') {
          return Promise.resolve({
            exists: () => true,
            val: () => ({
              packageId: 'p1',
              expectedExpenses: [
                [{ id: 'manual-percent', kind: 'packagePercent', catalogId: 'p1', percent: 10 }],
                [],
              ],
            }),
          });
        }
        return Promise.resolve({ exists: () => false, val: () => null });
      });
      const root = mount();
      await flush();

      const recalculateButton = findButton('Recalculate');
      expect(recalculateButton).toBeTruthy();
      await act(async () => { recalculateButton.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      await flush();

      const plan = set.mock.calls.filter(([path]) => path === 'invoiceBuilder/expectedExpenses').pop()[1];
      expect(plan.expectedExpenses[0][0]).toMatchObject({ kind: 'packagePercent', catalogId: 'p1', percent: 60, expectedExpenseRole: 'scheduled' });
      expect(plan.expectedExpenses[0][1]).toBe('idp1 || 10%');
      expect(plan.expectedExpenses[1][0]).toMatchObject({ kind: 'packagePercent', catalogId: 'p1', percent: 40, expectedExpenseRole: 'scheduled' });

      await act(async () => { root.unmount(); });
    });


    it('deletes the whole plan', async () => {
      const root = mount();
      await flush();

      await createPlan();
      expect(container.innerHTML).toContain('To start the program');

      const deleteButton = findButton('Delete plan');
      expect(deleteButton).toBeTruthy();
      await act(async () => { deleteButton.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      await flush();

      expect(container.innerHTML).not.toContain('To start the program');
      expect(container.innerHTML).toContain('Choose a package');
      const plan = set.mock.calls.filter(([path]) => path === 'invoiceBuilder/expectedExpenses').pop()[1];
      expect(plan).toBeNull();

      await act(async () => { root.unmount(); });
    });

    it('uploads a standalone expected-expenses JSON straight into invoiceBuilder/expectedExpenses', async () => {
      const root = mount();
      await flush();

      const heading = Array.from(container.querySelectorAll('h2')).find(h => h.textContent === 'Expected expenses');
      const panel = heading.closest('section');
      const uploadButton = Array.from(panel.querySelectorAll('button')).find(btn => btn.textContent.includes('Upload JSON'));
      const fileInput = panel.querySelector('input[type="file"]');
      expect(uploadButton).toBeTruthy();
      expect(fileInput).toBeTruthy();

      const fileText = JSON.stringify(expectedExpensesSeed);
      const file = new File([fileText], 'expected-expenses.json', { type: 'application/json' });
      // jsdom's File/Blob doesn't implement .text() - the component relies on it, so stub it here.
      file.text = () => Promise.resolve(fileText);
      Object.defineProperty(fileInput, 'files', { value: [file] });
      await act(async () => { fileInput.dispatchEvent(new Event('change', { bubbles: true })); });
      await flush();

      expect(container.innerHTML).toContain('Expected expenses has 6 groups');

      const plan = set.mock.calls.filter(([path]) => path === 'invoiceBuilder/expectedExpenses').pop()[1];
      expect(plan.packageId).toBe('3');
      expect(plan).toEqual(expectedExpensesSeed);
      expect(plan.expectedExpenses).toHaveLength(6);
      expect(plan.expectedExpenses[1][1]).toBe('Deposit for transportation of SM || 300');

      await act(async () => { root.unmount(); });
    });
  });
});
