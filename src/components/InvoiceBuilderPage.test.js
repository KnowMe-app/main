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
  isInvoiceBuilderUid: () => true,
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

  // Regression: opening a description just to read the full text (then clicking away without
  // typing anything) used to unconditionally commit it on blur, which flipped `customized: true`
  // and detached the row from the shared catalog - merely viewing a description should never do that.
  it('opening and closing a description without editing it does not mark the item customized', async () => {
    const root = mount();
    await flush();

    const descriptionToggle = findButton('Daily care in hospital.', true);
    expect(descriptionToggle).toBeTruthy();
    await act(async () => { descriptionToggle.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush();

    const descriptionField = container.querySelector('textarea[aria-label="Description"]');
    expect(descriptionField).toBeTruthy();
    await act(async () => {
      descriptionField.focus();
      descriptionField.blur();
    });
    await flush();

    expect(set.mock.calls.some(([path]) => path === 'invoiceBuilder/invoiceServices')).toBe(false);
    expect(container.innerHTML).not.toContain('Custom<');
    expect(findButton('Daily care in hospital.', true)).toBeTruthy();

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

  // P0 (round4 #2): a package with no Budget catalog entry must be creatable straight from the
  // invoice - it should never claim to be "missing from the catalog" (it was never in one), and
  // its own children/name/price must persist on the invoice itself.
  it('adds a custom package with no Budget catalog entry, storing its full contents on the invoice', async () => {
    const root = mount();
    await flush();

    const nameField = container.querySelector('textarea[placeholder="New custom package name"]');
    expect(nameField).toBeTruthy();
    await act(async () => {
      nameField.focus();
      setFieldValue(nameField, 'Bespoke concierge programme');
    });
    await act(async () => { findButton('Add custom package').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush();

    const lastServicesCall = set.mock.calls.filter(([path]) => path === 'invoiceBuilder/invoiceServices').pop();
    const packageEntry = lastServicesCall[1].find(entry => entry.kind === 'package' && entry.name === 'Bespoke concierge programme');
    expect(packageEntry).toMatchObject({ catalogId: '', customized: true, children: [] });

    expect(container.innerHTML).toContain('Bespoke concierge programme');
    expect(container.innerHTML).toContain('Custom package');
    expect(container.innerHTML).not.toContain('Missing');

    await act(async () => { root.unmount(); });
  });

  // Regression: "% of package" used to always default to 0% (previously always 100%) with no
  // link to the catalog's own Payment Schedule - an admin had to know the right number by heart.
  // It should now seed the first click from the package's first unbilled schedule milestone
  // (150/250 = 60% here), not a hardcoded constant.
  it('"% of package" defaults to the package\'s next unused Payment Schedule share, not 0% or 100%', async () => {
    const root = mount();
    await flush();

    await act(async () => { findButton('Add from catalog').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush();
    await act(async () => { findButton('Packages', true).dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush();
    await act(async () => { findButton('Full program').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush();

    const percentButton = findButton('% of package');
    expect(percentButton).toBeTruthy();
    await act(async () => { percentButton.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush();

    let lastServicesCall = set.mock.calls.filter(([path]) => path === 'invoiceBuilder/invoiceServices').pop();
    let percentEntry = lastServicesCall[1].find(entry => entry.kind === 'percent');
    expect(percentEntry.percent).toBe(60);

    // A second click should seed from the schedule's next step (Final payment: 100/250 = 40%),
    // not repeat 0%/100% or the same 60% again.
    await act(async () => { percentButton.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush();

    lastServicesCall = set.mock.calls.filter(([path]) => path === 'invoiceBuilder/invoiceServices').pop();
    const percentEntries = lastServicesCall[1].filter(entry => entry.kind === 'percent');
    expect(percentEntries).toHaveLength(2);
    expect(percentEntries[1].percent).toBe(40);

    await act(async () => { root.unmount(); });
  });

  // Bug report: adding a package used to only offer the full listed price, with no way to bill
  // just a share of it (e.g. the first Payment Schedule milestone) - the only route to a percent
  // row required adding the whole package first, then deleting it again. The catalog picker's
  // package entry now offers a "% of package" action directly, with no full package row involved.
  it('adds a "% of package" share straight from the catalog picker, without adding the full package first', async () => {
    const root = mount();
    await flush();

    await act(async () => { findButton('Add from catalog').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush();
    await act(async () => { findButton('Packages', true).dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush();

    const percentButton = findButton('% of package');
    expect(percentButton).toBeTruthy();
    await act(async () => { percentButton.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush();

    const lastServicesCall = set.mock.calls.filter(([path]) => path === 'invoiceBuilder/invoiceServices').pop();
    const services = lastServicesCall[1];
    expect(services.some(entry => entry.kind === 'package')).toBe(false);
    const percentEntry = services.find(entry => entry.kind === 'percent');
    expect(percentEntry).toMatchObject({ packageId: 'p1', percent: 60 });

    await act(async () => { root.unmount(); });
  });

  it('deletes a custom service from the invoice', async () => {
    const root = mount();
    await flush();

    const nameField = container.querySelector('textarea[placeholder="New custom service name"]');
    const priceField = container.querySelector('textarea[placeholder="Price or GIFT"]');
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

  // Bug report: after editing a service's description, the field stayed permanently expanded
  // (full multi-line textarea) instead of collapsing back to the single-line toggle like every
  // sibling row - descriptionOpen never reset to false on blur.
  it('collapses a service description back to the single-line toggle after editing it', async () => {
    const root = mount();
    await flush();

    const nameField = container.querySelector('textarea[placeholder="New custom service name"]');
    const priceField = container.querySelector('textarea[placeholder="Price or GIFT"]');
    await act(async () => {
      nameField.focus();
      setFieldValue(nameField, 'Courier fee');
      setFieldValue(priceField, '25');
    });
    const addCustomButton = nameField.parentElement.querySelector('button');
    await act(async () => { addCustomButton.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush();

    const descriptionToggle = findButton('+ Add description', true);
    expect(descriptionToggle).toBeTruthy();
    await act(async () => { descriptionToggle.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush();

    const descriptionField = container.querySelector('textarea[aria-label="Description"]');
    expect(descriptionField).toBeTruthy();
    await act(async () => {
      descriptionField.focus();
      setFieldValue(descriptionField, 'Same-day courier from the clinic.');
      descriptionField.blur();
    });
    await flush();

    expect(container.querySelector('textarea[aria-label="Description"]')).toBeFalsy();
    expect(findButton('Same-day courier from the clinic.', true)).toBeTruthy();

    await act(async () => { root.unmount(); });
  });

  // Regression (P0, round4 #1): selecting/starting a different client used to have no dedicated
  // affordance at all, so admins fell back to "Add customer", which appended the new client's
  // name onto the previous one instead of replacing it - two unrelated cases then rendered as one
  // merged payer. "New case" must start a blank payer while keeping the old one selectable again.
  it('starting a new payer case replaces the active payer instead of merging with the previous client', async () => {
    const root = mount();
    await flush();

    const payerToggle = Array.from(container.querySelectorAll('[role="button"]')).find(el => el.textContent.includes('Payer'));
    await act(async () => { payerToggle.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush();

    const activeNameFieldValues = () => Array.from(container.querySelectorAll('textarea[placeholder="Name"]')).map(field => field.value);
    expect(activeNameFieldValues()).toEqual(['Amny Athamny']);

    await act(async () => { findButton('New case').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush();

    // The previous client's name field must be gone from the active payer, not merged alongside a
    // second, blank one - "New case" replaces the active payer, it never appends to it.
    expect(activeNameFieldValues()).toEqual(['']);

    const nameField = container.querySelector('textarea[placeholder="Name"]');
    await act(async () => {
      nameField.focus();
      setFieldValue(nameField, 'Kyogoku');
      nameField.blur();
    });
    await flush();

    expect(activeNameFieldValues()).toEqual(['Kyogoku']);

    // Switching back to the previous case must restore it exactly, still with no merging.
    const caseSelect = Array.from(container.querySelectorAll('select')).find(select => Array.from(select.options).some(option => option.text.includes('Amny Athamny')));
    expect(caseSelect).toBeTruthy();
    const originalCaseOption = Array.from(caseSelect.options).find(option => option.text.includes('Amny Athamny'));
    await act(async () => {
      caseSelect.value = originalCaseOption.value;
      caseSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flush();

    expect(activeNameFieldValues()).toEqual(['Amny Athamny']);

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
      expect(container.innerHTML).toContain('Due: €171');
      expect(container.innerHTML).toContain('Due: €114');

      const persistedCalls = set.mock.calls.filter(([path]) => path === 'invoiceBuilder/expectedExpenses');
      expect(persistedCalls.length).toBeGreaterThan(0);
      const plan = persistedCalls[persistedCalls.length - 1][1];
      expect(plan.packageId).toBe('p1');
      expect(plan.milestones).toHaveLength(2);
      expect(plan.milestones[0]).toMatchObject({ title: 'To start the program', taxPercent: 14, showPackageOverview: true });
      expect(plan.milestones[0].services[0]).toMatchObject({ kind: 'percent', packageId: 'p1', percent: 60 });
      expect(plan.milestones[1]).toMatchObject({ title: 'Final payment', showPackageOverview: false });
      expect(plan.milestones[1].services[0]).toMatchObject({ kind: 'percent', packageId: 'p1', percent: 40 });

      await act(async () => { root.unmount(); });
    });

    it('adding a service to a schedule group updates its due amount and is persisted on that group only', async () => {
      const root = mount();
      await flush();

      await createPlan();

      const milestoneNameFields = Array.from(container.querySelectorAll('textarea[placeholder="Custom line name…"]'));
      expect(milestoneNameFields).toHaveLength(2);
      const milestoneAddRow = milestoneNameFields[0].parentElement;
      const priceField = milestoneAddRow.querySelector('textarea[placeholder="Price or GIFT"]');
      const addButton = Array.from(milestoneAddRow.querySelectorAll('button')).find(btn => btn.textContent.trim() === 'Add');

      await act(async () => {
        milestoneNameFields[0].focus();
        setFieldValue(milestoneNameFields[0], 'Deposit for transportation of SM');
        setFieldValue(priceField, '300');
      });
      await act(async () => { addButton.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      await flush();

      expect(container.innerHTML).toContain('Deposit for transportation of SM');
      expect(container.innerHTML).toContain('Due: €513');

      const plan = set.mock.calls.filter(([path]) => path === 'invoiceBuilder/expectedExpenses').pop()[1];
      expect(plan.milestones[0].services).toHaveLength(2);
      expect(plan.milestones[0].services[1]).toMatchObject({ name: 'Deposit for transportation of SM', price: 300 });
      expect(plan.milestones[1].services).toHaveLength(1);

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
              packageSnapshot: { name: 'Full program', listedPrice: 250, currency: 'EUR', children: [] },
              milestones: [
                {
                  id: 'm1', title: 'Old title 1', taxPercent: 14, showPackageOverview: true,
                  services: [
                    { id: 'stale-1', kind: 'percent', packageId: 'p1', percent: 10, expectedExpenseRole: 'scheduled' },
                    { id: 'custom-1', kind: 'custom', name: 'Deposit for transportation of SM', price: 300 },
                  ],
                },
                {
                  id: 'm2', title: 'Old title 2', taxPercent: 14, showPackageOverview: false,
                  services: [{ id: 'stale-2', kind: 'percent', packageId: 'p1', percent: 10, expectedExpenseRole: 'scheduled' }],
                },
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
      expect(plan.milestones[0].services).toHaveLength(2);
      expect(plan.milestones[0].services[0]).toMatchObject({ kind: 'percent', packageId: 'p1', percent: 60, expectedExpenseRole: 'scheduled' });
      expect(plan.milestones[0].services[1]).toMatchObject({ name: 'Deposit for transportation of SM', price: 300 });
      expect(plan.milestones[1].services).toHaveLength(1);
      expect(plan.milestones[1].services[0]).toMatchObject({ kind: 'percent', packageId: 'p1', percent: 40, expectedExpenseRole: 'scheduled' });

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
              milestones: [
                { id: 'm1', title: 'Old title 1', taxPercent: 14, showPackageOverview: true, services: ['idp1 || 10%', 'Deposit for transportation of SM || 300'] },
                { id: 'm2', title: 'Old title 2', taxPercent: 14, showPackageOverview: false, services: ['idp1 || 10%'] },
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
      expect(plan.milestones[0].services).toHaveLength(2);
      expect(plan.milestones[0].services[0]).toMatchObject({ kind: 'percent', packageId: 'p1', percent: 60, expectedExpenseRole: 'scheduled' });
      expect(plan.milestones[0].services[1]).toMatchObject({ kind: 'custom', name: 'Deposit for transportation of SM', price: 300 });
      expect(plan.milestones[1].services).toHaveLength(1);
      expect(plan.milestones[1].services[0]).toMatchObject({ kind: 'percent', packageId: 'p1', percent: 40, expectedExpenseRole: 'scheduled' });

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
              milestones: [
                { id: 'm1', title: 'Old title 1', taxPercent: 14, showPackageOverview: true, services: [{ id: 'manual-percent', kind: 'percent', packageId: 'p1', percent: 10 }] },
                { id: 'm2', title: 'Old title 2', taxPercent: 14, showPackageOverview: false, services: [] },
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
      expect(plan.milestones[0].services).toHaveLength(2);
      expect(plan.milestones[0].services[0]).toMatchObject({ kind: 'percent', packageId: 'p1', percent: 60, expectedExpenseRole: 'scheduled' });
      expect(plan.milestones[0].services[1]).toMatchObject({ kind: 'percent', packageId: 'p1', percent: 10 });
      expect(plan.milestones[0].services[1].expectedExpenseRole).toBeUndefined();
      expect(plan.milestones[1].services).toHaveLength(1);
      expect(plan.milestones[1].services[0]).toMatchObject({ kind: 'percent', packageId: 'p1', percent: 40, expectedExpenseRole: 'scheduled' });

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

      expect(container.innerHTML).toContain('To start the program');
      expect(container.innerHTML).toContain('On the 36th week of pregnancy');

      const plan = set.mock.calls.filter(([path]) => path === 'invoiceBuilder/expectedExpenses').pop()[1];
      expect(plan.packageId).toBe('3');
      expect(plan.milestones).toHaveLength(6);
      expect(plan.milestones[1].services[1]).toMatchObject({ name: 'Deposit for transportation of SM', price: 300 });

      await act(async () => { root.unmount(); });
    });
  });
});
