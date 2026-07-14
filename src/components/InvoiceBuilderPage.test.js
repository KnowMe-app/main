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
  // Special Offer, initial payment: hidden from the public catalog, no payment schedule at all -
  // a single lump-sum package (spec §2.2).
  {
    id: 'p6', name: 'Special Offer — Initial Payment', listedPrice: 7580, description: '', children: ['10'], hidden: true,
  },
  // Special Offer, programme fee: hidden, with a percent-based schedule (spec §2.3, ps-6 format).
  {
    id: 'p7', name: 'Special Offer — Programme Fee', listedPrice: 29700, description: '', children: ['11'], hidden: true, paymentScheduleId: 'ps-6',
  },
];

const fixtureTechnical = {
  paymentSchedules: [
    { id: 'ps-1', payments: [{ title: 'To start the program', amount: 150 }, { title: 'Final payment', amount: 100 }] },
    {
      id: 'ps-6',
      payments: [
        { percent: 25, title: 'On confirmation of pregnancy by ultrasound' },
        { percent: 25, title: 'Milestone 2' },
        { percent: 25, title: 'Milestone 3' },
        { percent: 25, title: 'Milestone 4' },
      ],
    },
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

  const nativeSelectValueSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  const selectOption = (select, value) => {
    nativeSelectValueSetter.call(select, value);
    select.dispatchEvent(new Event('change', { bubbles: true }));
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

    await act(async () => { root.unmount(); });
  });

  it('adds a whole package from the catalog, then removing one of its services makes it a custom package', async () => {
    const root = mount();
    await flush();

    const packageSelect = container.querySelector('select[aria-label="Choose package from catalog"]');
    expect(packageSelect).toBeTruthy();
    await act(async () => { selectOption(packageSelect, 'p1'); });
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

  // Special Offer packages (hidden: true) are deliberately excluded from the public Program
  // Budget PDF, but an admin must still be able to pick them here - labeled so they're never
  // mistaken for one of the public programs.
  it('lists hidden "Special Offer" packages in the catalog picker, and adds one with no payment schedule at its full listed price', async () => {
    const root = mount();
    await flush();

    expect(container.innerHTML).toContain('Special Offer — Initial Payment');
    expect(container.innerHTML).toContain('Special offer');

    const packageSelect = container.querySelector('select[aria-label="Choose package from catalog"]');
    expect(packageSelect).toBeTruthy();
    await act(async () => { selectOption(packageSelect, 'p6'); });
    await flush();

    const lastServicesCall = set.mock.calls.filter(([path]) => path === 'invoiceBuilder/invoiceServices').pop();
    const packageEntry = lastServicesCall[1].find(entry => entry.kind === 'package' && entry.catalogId === 'p6');
    expect(packageEntry).toBeTruthy();
    // No payment schedule on this package (spec §2.2) - the whole package is billed as a single
    // payment at its full listed price, with no milestone/percent breakdown to pick from.
    expect(container.innerHTML).toContain('7580');

    await act(async () => { root.unmount(); });
  });

  // Regression: "% of package" used to always default to 0% (previously always 100%) with no
  // link to the catalog's own Payment Schedule - an admin had to know the right number by heart.
  // It should now seed the first click from the package's first unbilled schedule milestone
  // (150/250 = 60% here), not a hardcoded constant.
  it('"% of package" defaults to the package\'s next unused Payment Schedule share, not 0% or 100%', async () => {
    const root = mount();
    await flush();

    const packageSelect = container.querySelector('select[aria-label="Choose package from catalog"]');
    await act(async () => { selectOption(packageSelect, 'p1'); });
    await flush();

    const percentButton = findButton('% From package');
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

  // Bug report: ps-6-style schedules (Special Offer - Programme Fee, p7) have several equal-percent
  // milestones (25%, 25%, 25%, 25%) - clicking "% of package" a second time used to be rejected as
  // "already on the invoice" because the two resulting rows shared the same (packageId, percent)
  // identity, even though they represent two distinct schedule milestones.
  it('allows two equal-percent schedule milestones from the same package on one invoice', async () => {
    const root = mount();
    await flush();

    const packageSelect = container.querySelector('select[aria-label="Choose package from catalog"]');
    await act(async () => { selectOption(packageSelect, 'p7'); });
    await flush();

    const percentButton = findButton('% From package');
    expect(percentButton).toBeTruthy();
    await act(async () => { percentButton.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush();
    await act(async () => { percentButton.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush();

    const lastServicesCall = set.mock.calls.filter(([path]) => path === 'invoiceBuilder/invoiceServices').pop();
    const percentEntries = lastServicesCall[1].filter(entry => entry.kind === 'percent');
    expect(percentEntries).toHaveLength(2);
    expect(percentEntries[0].percent).toBe(25);
    expect(percentEntries[1].percent).toBe(25);

    await act(async () => { root.unmount(); });
  });

  // Bug report: adding a package used to only offer the full listed price, with no way to bill
  // just a share of it (e.g. the first Payment Schedule milestone) - the only route to a percent
  // row required adding the whole package first, then deleting it again. The catalog picker's
  // package entry now offers a "% of package" action directly, with no full package row involved.
  it('adds a "% of package" share straight from the catalog picker, without adding the full package first', async () => {
    const root = mount();
    await flush();

    await act(async () => { findButton('From catalog').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush();
    await act(async () => { findButton('% of package', true).dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush();

    const percentButton = findButton('Full program');
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

  // design-tasks-2 §5: clicking a package under "Recent (click to add)" swaps it with the active
  // package - the clicked one becomes the package in Package & PDF components, and the previously
  // active one drops back into Recent - instead of invisibly appending a second package entry.
  it('clicking a Recent package swaps it with the active package', async () => {
    const activePackage = { id: 'entry-pkg-1', kind: 'package', catalogId: 'p1', children: [{ id: 'child-1', kind: 'item', catalogId: '10' }] };
    const recentPackage = { id: 'recent-pkg-6', kind: 'package', catalogId: 'p6', children: [{ id: 'child-2', kind: 'item', catalogId: '10' }] };
    get.mockImplementation(path => {
      if (path === 'invoiceBuilder') {
        return Promise.resolve({
          exists: () => true,
          val: () => ({ ...fixtureInvoiceData, invoiceServices: [activePackage], recentServices: [recentPackage] }),
        });
      }
      if (path === 'budget/items') return Promise.resolve({ exists: () => true, val: () => fixtureItems });
      if (path === 'budget/packages') return Promise.resolve({ exists: () => true, val: () => fixturePackages });
      if (path === 'budget/technical') return Promise.resolve({ exists: () => true, val: () => fixtureTechnical });
      return Promise.resolve({ exists: () => false, val: () => null });
    });

    const root = mount();
    await flush();

    const recentChip = findButton('Special Offer — Initial Payment');
    expect(recentChip).toBeTruthy();
    await act(async () => { recentChip.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush();

    const lastServicesCall = set.mock.calls.filter(([path]) => path === 'invoiceBuilder/invoiceServices').pop();
    const packageEntries = lastServicesCall[1].filter(entry => entry.kind === 'package');
    expect(packageEntries).toHaveLength(1);
    expect(packageEntries[0].catalogId).toBe('p6');

    const lastRecentCall = set.mock.calls.filter(([path]) => path === 'invoiceBuilder/recentServices').pop();
    expect(lastRecentCall[1].some(entry => entry.kind === 'package' && entry.catalogId === 'p1')).toBe(true);

    await act(async () => { root.unmount(); });
  });

  it('deletes a custom service from the invoice', async () => {
    const root = mount();
    await flush();

    const nameField = container.querySelector('textarea[placeholder="Add a custom line…"]');
    const priceField = container.querySelector('textarea[aria-label="New custom line price"]');
    await act(async () => {
      nameField.focus();
      setFieldValue(nameField, 'Courier fee');
    });
    await act(async () => {
      priceField.focus();
      setFieldValue(priceField, '25');
      priceField.blur();
    });
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

    const nameField = container.querySelector('textarea[placeholder="Add a custom line…"]');
    const priceField = container.querySelector('textarea[aria-label="New custom line price"]');
    await act(async () => {
      nameField.focus();
      setFieldValue(nameField, 'Courier fee');
    });
    await act(async () => {
      priceField.focus();
      setFieldValue(priceField, '25');
      priceField.blur();
    });
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

  // Round4 #7: Beneficiary/Payer fields should show only the value (or a placeholder when empty),
  // never a "TITLE"/"IBAN"/"CUSTOMER 1"-style label above every field.
  it('shows no field labels above Beneficiary/Payer values, only placeholders', async () => {
    const root = mount();
    await flush();

    const beneficiaryToggle = Array.from(container.querySelectorAll('[role="button"]')).find(el => el.textContent.includes('Beneficiary'));
    const payerToggle = Array.from(container.querySelectorAll('[role="button"]')).find(el => el.textContent.includes('Payer'));
    await act(async () => { beneficiaryToggle.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await act(async () => { payerToggle.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush();

    const removedLabels = ['Title', 'IBAN', 'Bank name', 'SWIFT code', 'Customer 1'];
    const spanTexts = Array.from(container.querySelectorAll('span')).map(span => span.textContent.trim());
    removedLabels.forEach(label => expect(spanTexts).not.toContain(label));

    expect(container.querySelector('textarea[placeholder="Title"]')).toBeTruthy();
    expect(container.querySelector('textarea[placeholder="IBAN"]')).toBeTruthy();
    expect(container.querySelector('textarea[placeholder="Name"]')).toBeTruthy();

    await act(async () => { root.unmount(); });
  });

  // round4 #5/#6: a committed tax rate joins a shared recent-rates list (comma or period decimal),
  // offered as a one-click quick-pick with its own delete, the same pattern used for services.
  it('remembers a committed tax rate for one-click reuse, with a trash icon to forget it', async () => {
    const root = mount();
    await flush();

    const taxField = container.querySelector('textarea[aria-label="Taxes (%)"]');
    expect(taxField).toBeTruthy();
    await act(async () => {
      taxField.focus();
      setFieldValue(taxField, '8,5');
      taxField.blur();
    });
    await flush();

    let persistedTaxPercent = set.mock.calls.filter(([path]) => path === 'invoiceBuilder/taxPercent').pop();
    expect(persistedTaxPercent[1]).toBe(8.5);
    let persistedRates = set.mock.calls.filter(([path]) => path === 'invoiceBuilder/recentTaxRates').pop();
    expect(persistedRates[1]).toEqual([{ id: expect.any(String), value: 8.5 }]);
    expect(findButton('8.5%')).toBeTruthy();

    // Change the field away, then click the saved 8.5% chip to reapply it in one click.
    await act(async () => {
      taxField.focus();
      setFieldValue(taxField, '0');
      taxField.blur();
    });
    await flush();
    await act(async () => { findButton('8.5%').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush();

    persistedTaxPercent = set.mock.calls.filter(([path]) => path === 'invoiceBuilder/taxPercent').pop();
    expect(persistedTaxPercent[1]).toBe(8.5);

    // Delete it from recent - it disappears from the quick-pick list without touching the invoice's own tax field.
    const deleteButton = Array.from(container.querySelectorAll('button')).find(btn => btn.title === 'Remove this rate from recent');
    expect(deleteButton).toBeTruthy();
    await act(async () => { deleteButton.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush();

    expect(findButton('8.5%')).toBeFalsy();
    persistedRates = set.mock.calls.filter(([path]) => path === 'invoiceBuilder/recentTaxRates').pop();
    expect(persistedRates[1]).toEqual([]);

    await act(async () => { root.unmount(); });
  });

  describe('expected expenses', () => {
    // round7 spec D: Expected Expenses lives behind its own top-level tab, structurally separate
    // from the regular invoice-creation flow - every test below must switch to it first.
    const switchToExpectedExpensesTab = async () => {
      await act(async () => { findButton('Expected expenses', true).dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      await flush();
    };

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
      await switchToExpectedExpensesTab();

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

    // Special Offer — Programme Fee (ps-6): its payment schedule uses { percent: 25 } entries
    // instead of { amount }, so building the plan must resolve them the same way an amount-based
    // schedule (like ps-1) is resolved.
    it('builds an Expected Expenses plan from a percent-based schedule (ps-6 format)', async () => {
      const root = mount();
      await flush();
      await switchToExpectedExpensesTab();

      await act(async () => { findButton('Choose a package').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      await flush();
      const packageButton = findButton('Special Offer — Programme Fee');
      expect(packageButton).toBeTruthy();
      await act(async () => { packageButton.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      await flush();

      const persistedCalls = set.mock.calls.filter(([path]) => path === 'invoiceBuilder/expectedExpenses');
      expect(persistedCalls.length).toBeGreaterThan(0);
      const plan = persistedCalls[persistedCalls.length - 1][1];
      expect(plan.packageId).toBe('p7');
      expect(plan.milestones).toHaveLength(4);
      plan.milestones.forEach(milestone => {
        expect(milestone.services[0]).toMatchObject({ kind: 'percent', packageId: 'p7', percent: 25 });
      });
      // 29,700 EUR x 25% = 7,425 EUR per milestone (checklist item in the import spec), before tax.
      expect(container.innerHTML).toContain('Subtotal: €7,425');

      await act(async () => { root.unmount(); });
    });

    it('adding a service to a schedule group updates its due amount and is persisted on that group only', async () => {
      const root = mount();
      await flush();
      await switchToExpectedExpensesTab();

      await createPlan();

      const milestoneNameFields = Array.from(container.querySelectorAll('textarea[placeholder="Add a custom line…"]'));
      expect(milestoneNameFields).toHaveLength(2);
      const milestoneAddRow = milestoneNameFields[0].parentElement;
      const priceField = milestoneAddRow.querySelector('textarea[aria-label="New custom line price"]');
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
      await switchToExpectedExpensesTab();

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
      await switchToExpectedExpensesTab();

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
      await switchToExpectedExpensesTab();

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
      await switchToExpectedExpensesTab();

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
      await switchToExpectedExpensesTab();

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

    // round4 #4: a package with no Budget catalog entry has no catalog schedule to build a plan
    // from, so the admin builds one by hand - each row is a fixed amount, not a live percent share.
    it('builds an Expected Expenses plan from a hand-built custom schedule, and saves it to Recent for reuse', async () => {
      const root = mount();
      await flush();
      await switchToExpectedExpensesTab();

      await act(async () => { findButton('Custom package/schedule').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      await flush();

      const nameField = container.querySelector('textarea[placeholder="Package name"]');
      const priceField = container.querySelector('textarea[placeholder="Total price"]');
      await act(async () => {
        nameField.focus();
        setFieldValue(nameField, 'Bespoke concierge programme');
        priceField.focus();
        setFieldValue(priceField, '10000');
      });

      const titleField = container.querySelector('textarea[placeholder="Payment title"]');
      const amountField = container.querySelector('textarea[placeholder="Amount"]');
      await act(async () => {
        titleField.focus();
        setFieldValue(titleField, 'Deposit');
        amountField.focus();
        setFieldValue(amountField, '4000');
      });

      await act(async () => { findButton('Add row').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      await flush();
      const titleFields = container.querySelectorAll('textarea[placeholder="Payment title"]');
      const amountFields = container.querySelectorAll('textarea[placeholder="Amount"]');
      await act(async () => {
        titleFields[1].focus();
        setFieldValue(titleFields[1], 'Final payment');
        amountFields[1].focus();
        setFieldValue(amountFields[1], '6000');
      });

      await act(async () => { findButton('Create plan').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      await flush();

      const plan = set.mock.calls.filter(([path]) => path === 'invoiceBuilder/expectedExpenses').pop()[1];
      expect(plan.packageId).toBe('');
      expect(plan.packageSnapshot).toMatchObject({ name: 'Bespoke concierge programme', listedPrice: 10000 });
      expect(plan.milestones).toHaveLength(2);
      expect(plan.milestones[0]).toMatchObject({ title: 'Deposit' });
      expect(plan.milestones[0].services[0]).toMatchObject({ kind: 'custom', name: 'Deposit', price: 4000 });
      expect(plan.milestones[1].services[0]).toMatchObject({ kind: 'custom', name: 'Final payment', price: 6000 });

      // A catalog-schedule-only action must not appear for a plan with no catalog package behind it.
      expect(findButton('Recalculate')).toBeFalsy();

      const savedSchedules = set.mock.calls.filter(([path]) => path === 'invoiceBuilder/recentPaymentSchedules').pop();
      // `price` rides along so reloading the schedule from Recent restores the package total too
      // (see loadRecentSchedule).
      expect(savedSchedules[1]).toEqual([{
        id: expect.any(String),
        name: 'Bespoke concierge programme',
        price: 10000,
        payments: [{ title: 'Deposit', amount: 4000 }, { title: 'Final payment', amount: 6000 }],
      }]);

      await act(async () => { root.unmount(); });
    });

    it('reloads a saved custom schedule from Recent, and deleting it removes it from the list', async () => {
      const root = mount();
      await flush();
      await switchToExpectedExpensesTab();

      // Seed one recent schedule the way createExpectedExpensesPlanFromCustomSchedule would.
      await act(async () => { findButton('Custom package/schedule').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      await flush();
      await act(async () => {
        setFieldValue(container.querySelector('textarea[placeholder="Package name"]'), 'Saved plan');
        setFieldValue(container.querySelector('textarea[placeholder="Total price"]'), '5000');
        setFieldValue(container.querySelector('textarea[placeholder="Payment title"]'), 'Only payment');
        setFieldValue(container.querySelector('textarea[placeholder="Amount"]'), '5000');
      });
      await act(async () => { findButton('Create plan').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      await flush();
      await act(async () => { findButton('Delete plan').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      await flush();

      await act(async () => { findButton('Custom package/schedule').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      await flush();

      const savedChip = findButton('Saved plan');
      expect(savedChip).toBeTruthy();
      await act(async () => { savedChip.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      await flush();

      expect(container.querySelector('textarea[placeholder="Payment title"]').value).toBe('Only payment');
      expect(container.querySelector('textarea[placeholder="Amount"]').value).toBe('5000');

      const deleteButton = Array.from(container.querySelectorAll('button')).find(btn => btn.title === 'Remove this schedule from recent');
      expect(deleteButton).toBeTruthy();
      await act(async () => { deleteButton.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      await flush();

      expect(findButton('Saved plan')).toBeFalsy();
      const savedSchedules = set.mock.calls.filter(([path]) => path === 'invoiceBuilder/recentPaymentSchedules').pop();
      expect(savedSchedules[1]).toEqual([]);

      await act(async () => { root.unmount(); });
    });
  });

  // design-tasks-3 §5/§6/§7: per-payer saved services, copying them across payers, and the
  // read-only Issued Invoices history with payment tracking and the Reissue flow.
  describe('payer saved services and issued invoices', () => {
    const activeCase = { id: 'case-a', customers: [{ name: 'Amny Athamny', address: 'Netherlands' }] };
    const otherCase = {
      id: 'case-b',
      customers: [{ name: 'Ben Adam', address: 'Israel' }],
      savedServices: [
        { id: 'saved-1', kind: 'item', catalogId: '11' },
        { id: 'saved-2', kind: 'custom', name: 'Saved one-off', price: 500 },
      ],
    };
    const issuedInvoice = {
      id: 'issued-1',
      payerCaseId: 'case-a',
      invoiceNumber: '01/07/2026',
      invoiceDate: '2026-07-01',
      rows: [{ name: 'Baby care in hospital per day', price: 200, kind: 'item' }],
      entries: [{ id: 'issued-entry-1', kind: 'item', catalogId: '10' }],
      taxPercent: 0,
      debtOrDeposit: 0,
      amountDue: 200,
      payment: { receivedOn: '', amount: '', currency: 'EUR' },
    };

    const mockInvoiceData = overrides => {
      get.mockImplementation(path => {
        if (path === 'invoiceBuilder') {
          return Promise.resolve({
            exists: () => true,
            val: () => ({
              ...fixtureInvoiceData,
              payerCases: [activeCase, otherCase],
              payerCaseIds: ['case-a', 'case-b'],
              ...overrides,
            }),
          });
        }
        if (path === 'budget/items') return Promise.resolve({ exists: () => true, val: () => fixtureItems });
        if (path === 'budget/packages') return Promise.resolve({ exists: () => true, val: () => fixturePackages });
        if (path === 'budget/technical') return Promise.resolve({ exists: () => true, val: () => fixtureTechnical });
        return Promise.resolve({ exists: () => false, val: () => null });
      });
    };

    it('saves the current package & services onto the active payer case', async () => {
      mockInvoiceData({});
      const root = mount();
      await flush();

      await act(async () => { findButton('Save for payer').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      await flush();

      const lastCasesCall = set.mock.calls.filter(([path]) => path === 'invoiceBuilder/payerCases').pop();
      expect(lastCasesCall).toBeTruthy();
      const savedCase = lastCasesCall[1].find(payerCase => payerCase.id === 'case-a');
      expect(savedCase.savedServices).toHaveLength(1);
      expect(savedCase.savedServices[0]).toMatchObject({ kind: 'item', catalogId: '10' });
      // The other payer's own saved set is untouched.
      const untouchedCase = lastCasesCall[1].find(payerCase => payerCase.id === 'case-b');
      expect(untouchedCase.savedServices).toHaveLength(2);

      await act(async () => { root.unmount(); });
    });

    it('copies another payer\'s saved package & services into the editor with fresh ids', async () => {
      mockInvoiceData({});
      const root = mount();
      await flush();

      const copySelect = container.querySelector('select[aria-label="Copy package & services from another payer"]');
      expect(copySelect).toBeTruthy();
      await act(async () => { selectOption(copySelect, 'case-b'); });
      await flush();

      const lastServicesCall = set.mock.calls.filter(([path]) => path === 'invoiceBuilder/invoiceServices').pop();
      expect(lastServicesCall[1]).toHaveLength(2);
      expect(lastServicesCall[1][0]).toMatchObject({ kind: 'item', catalogId: '11' });
      expect(lastServicesCall[1][1]).toMatchObject({ kind: 'custom', name: 'Saved one-off', price: 500 });
      // Cloned, never shared: the copies must not reuse the source case's entry ids.
      expect(lastServicesCall[1].map(entry => entry.id)).not.toContain('saved-1');

      await act(async () => { root.unmount(); });
    });

    it('shows the payer\'s issued invoices read-only and persists the payment tracking fields', async () => {
      mockInvoiceData({ issuedInvoices: [issuedInvoice] });
      const root = mount();
      await flush();

      // Collapsed by default - the reveal button shows the count for the active payer.
      expect(container.innerHTML).toContain('1 invoice');
      const revealButton = Array.from(container.querySelectorAll('[role="button"]'))
        .find(node => node.textContent.includes('Issued invoices'));
      expect(revealButton).toBeTruthy();
      await act(async () => { revealButton.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      await flush();

      expect(container.innerHTML).toContain('Invoice No. 01/07/2026');

      const amountField = container.querySelector('textarea[aria-label="Amount received"]');
      expect(amountField).toBeTruthy();
      await act(async () => {
        amountField.focus();
        setFieldValue(amountField, '150');
        amountField.blur();
      });
      await flush();

      const currencySelect = container.querySelector('select[aria-label="Currency of the received amount"]');
      expect(currencySelect.value).toBe('EUR');
      await act(async () => { selectOption(currencySelect, 'USD'); });
      await flush();

      const lastIssuedCall = set.mock.calls.filter(([path]) => path === 'invoiceBuilder/issuedInvoices').pop();
      expect(lastIssuedCall[1][0].payment).toMatchObject({ amount: '150', currency: 'USD' });
      // The static record itself is never rewritten by payment tracking.
      expect(lastIssuedCall[1][0].rows).toEqual(issuedInvoice.rows);

      await act(async () => { root.unmount(); });
    });

    it('reissuing an invoice moves its contents into the editor and the editor content into Recent', async () => {
      mockInvoiceData({
        issuedInvoices: [{
          ...issuedInvoice,
          entries: [{ id: 'issued-entry-2', kind: 'custom', name: 'Reissued line', price: 750 }],
        }],
      });
      const root = mount();
      await flush();

      const revealButton = Array.from(container.querySelectorAll('[role="button"]'))
        .find(node => node.textContent.includes('Issued invoices'));
      await act(async () => { revealButton.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      await flush();

      await act(async () => { findButton('Reissue invoice').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      await flush();

      // The issued invoice's contents are back in the editor (cloned, fresh ids)...
      const lastServicesCall = set.mock.calls.filter(([path]) => path === 'invoiceBuilder/invoiceServices').pop();
      expect(lastServicesCall[1]).toHaveLength(1);
      expect(lastServicesCall[1][0]).toMatchObject({ kind: 'custom', name: 'Reissued line', price: 750 });
      expect(lastServicesCall[1][0].id).not.toBe('issued-entry-2');

      // ...and what the editor previously held (the id10 catalog service) dropped into Recent.
      const lastRecentCall = set.mock.calls.filter(([path]) => path === 'invoiceBuilder/recentServices').pop();
      expect(lastRecentCall[1].some(entry => entry.kind === 'item' && entry.catalogId === '10')).toBe(true);

      await act(async () => { root.unmount(); });
    });
  });
});
