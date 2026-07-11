import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import BudgetPage from './BudgetPage';
import { fetchNbuUahExchangeRatesByDate } from './config';
import { get, set, update, remove } from 'firebase/database';

global.IS_REACT_ACT_ENVIRONMENT = true;

const fixtureCatalog = {
  packages: [
    {
      id: '3',
      name: 'Standard Program',
      listedPrice: 30000,
      currency: 'EUR',
      description: 'Program description here.',
      children: ['10'],
      paymentScheduleId: 'ps-3',
    },
  ],
  items: [
    {
      id: '10',
      name: 'Baby care in hospital per day',
      price: 200,
      description: 'Daily care in hospital.',
      category: 'deliveryAndNewborn',
    },
    {
      id: '11',
      name: 'Airport transfer',
      price: 90,
      description: 'Transfer from the airport.',
      category: 'logistics',
    },
  ],
  technical: {
    paymentSchedules: [
      { id: 'ps-3', payments: [{ title: 'Deposit', amount: 10000 }, { title: 'Final', amount: 20000 }] },
    ],
  },
  clientNotes: {},
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
  update: jest.fn(),
  remove: jest.fn(),
}));

jest.mock('utils/accessLevel', () => ({
  isAdminUid: () => true,
}));

describe('BudgetPage edit mode', () => {
  let container;

  beforeEach(() => {
    fetchNbuUahExchangeRatesByDate.mockImplementation(() => Promise.resolve({ eur: 46, usd: 42 }));
    get.mockImplementation(() => Promise.resolve({ exists: () => true, val: () => fixtureCatalog }));
    set.mockImplementation(() => Promise.resolve());
    update.mockImplementation(() => Promise.resolve());
    remove.mockImplementation(() => Promise.resolve());
    window.localStorage.setItem('budget:edit-mode', '1');
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
    container = null;
    jest.clearAllMocks();
    window.localStorage.clear();
  });

  const flush = () => act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

  const mountBudgetPage = root => {
    root.render(<BudgetPage isAdmin />);
  };

  it('renders name/price/description once each, no "from" for a plain price, undo disabled until an edit happens', async () => {
    const root = createRoot(container);
    await act(async () => {
      mountBudgetPage(root);
    });
    await flush();

    // The included item only renders once its package's "What's included" panel is open.
    const includedToggle = Array.from(container.querySelectorAll('button')).find(btn => btn.textContent.includes("What's included"));
    expect(includedToggle).toBeTruthy();
    await act(async () => {
      includedToggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flush();

    const html = container.innerHTML;

    // Name should not be duplicated as static text + a separate "Name" edit field.
    const nameOccurrences = (html.match(/Baby care in hospital per day/g) || []).length;
    expect(nameOccurrences).toBe(1);

    // No hardcoded "from" prefix for an item whose stored price has none.
    const priceInputs = Array.from(container.querySelectorAll('input[aria-label="Price"]'));
    const babyPriceInput = priceInputs.find(input => input.value.includes('200'));
    expect(babyPriceInput).toBeTruthy();
    expect(babyPriceInput.value).not.toMatch(/from/i);

    // "Name"/"Price"/"Description" labels only exist once, in the "Create new expense" form —
    // the package and item inline editors must not repeat them.
    expect((html.match(/>Name<\/span>/g) || []).length).toBe(1);
    expect((html.match(/>Price<\/span>/g) || []).length).toBe(1);
    expect((html.match(/>Description<\/span>/g) || []).length).toBe(1);

    // Payment schedule editor starts collapsed (no "Schedule ID" field visible).
    expect(html).not.toMatch(/Schedule ID/);

    // Undo/redo controls exist and start disabled (no edits made yet).
    const undoButton = Array.from(container.querySelectorAll('button')).find(btn => btn.title === 'Undo the last change');
    const redoButton = Array.from(container.querySelectorAll('button')).find(btn => btn.title === 'Redo the change');
    expect(undoButton).toBeTruthy();
    expect(redoButton).toBeTruthy();
    expect(undoButton.disabled).toBe(true);
    expect(redoButton.disabled).toBe(true);

    // Expanding the payment schedule editor reveals the Schedule ID field.
    const scheduleToggle = Array.from(container.querySelectorAll('button')).find(btn => btn.textContent.includes('Payment schedule editor'));
    expect(scheduleToggle).toBeTruthy();
    await act(async () => {
      scheduleToggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flush();
    expect(container.innerHTML).toMatch(/Schedule ID/);

    await act(async () => {
      root.unmount();
    });
  });

  it('supports undo/redo of an edit, rewriting the backend snapshot both times', async () => {
    const root = createRoot(container);
    await act(async () => {
      mountBudgetPage(root);
    });
    await flush();

    const queryInputByAriaLabel = label => container.querySelector(`input[aria-label="${label}"]`);
    const findButtonByTitle = title => Array.from(container.querySelectorAll('button')).find(btn => btn.title === title);

    const nameInput = queryInputByAriaLabel('Name');
    expect(nameInput.value).toBe('Standard Program');

    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    const setInputValue = (input, value) => {
      nativeInputValueSetter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };

    await act(async () => {
      nameInput.focus();
      setInputValue(nameInput, 'Renamed Program');
      nameInput.blur();
    });
    await flush();

    expect(update).toHaveBeenCalledWith('budget/packages/0', { name: 'Renamed Program' });
    expect(queryInputByAriaLabel('Name').value).toBe('Renamed Program');

    const undoButton = findButtonByTitle('Undo the last change');
    const redoButton = findButtonByTitle('Redo the change');
    expect(undoButton.disabled).toBe(false);
    expect(redoButton.disabled).toBe(true);

    await act(async () => {
      undoButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flush();

    expect(queryInputByAriaLabel('Name').value).toBe('Standard Program');
    expect(set).toHaveBeenCalledWith('budget/packages', expect.arrayContaining([
      expect.objectContaining({ name: 'Standard Program' }),
    ]));
    expect(findButtonByTitle('Undo the last change').disabled).toBe(true);
    expect(findButtonByTitle('Redo the change').disabled).toBe(false);

    await act(async () => {
      findButtonByTitle('Redo the change').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flush();

    expect(queryInputByAriaLabel('Name').value).toBe('Renamed Program');
    expect(set).toHaveBeenCalledWith('budget/packages', expect.arrayContaining([
      expect.objectContaining({ name: 'Renamed Program' }),
    ]));

    await act(async () => {
      root.unmount();
    });
  });

  it('removes package children and inserts a selected service after the requested child', async () => {
    const root = createRoot(container);
    await act(async () => {
      mountBudgetPage(root);
    });
    await flush();

    const includedToggle = Array.from(container.querySelectorAll('button')).find(btn => btn.textContent.includes("What's included"));
    expect(includedToggle).toBeTruthy();
    await act(async () => {
      includedToggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flush();

    const removeChildButton = Array.from(container.querySelectorAll('button')).find(btn => btn.title === 'Remove this service from the package');
    expect(removeChildButton).toBeTruthy();
    await act(async () => {
      removeChildButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flush();

    expect(update).toHaveBeenCalledWith('budget/packages/0', { children: [] });

    const freshCatalog = {
      ...fixtureCatalog,
      packages: [{ ...fixtureCatalog.packages[0], children: ['10'] }],
    };
    get.mockImplementation(() => Promise.resolve({ exists: () => true, val: () => freshCatalog }));
    update.mockClear();
    await act(async () => {
      root.unmount();
    });

    const secondRoot = createRoot(container);
    await act(async () => {
      mountBudgetPage(secondRoot);
    });
    await flush();

    const secondIncludedToggle = Array.from(container.querySelectorAll('button')).find(btn => btn.textContent.includes("What's included"));
    await act(async () => {
      secondIncludedToggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flush();

    const insertAfterButton = Array.from(container.querySelectorAll('button')).find(btn => btn.title === 'Insert service after this one');
    expect(insertAfterButton).toBeTruthy();
    await act(async () => {
      insertAfterButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flush();

    const transferButton = Array.from(container.querySelectorAll('button')).find(btn => btn.textContent.includes('Airport transfer'));
    expect(transferButton).toBeTruthy();
    await act(async () => {
      transferButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flush();

    expect(update).toHaveBeenCalledWith('budget/packages/0', { children: ['10', '11'] });

    await act(async () => {
      secondRoot.unmount();
    });
  });

  // P0 bug repro: a legacy record with float-noise saved before rounding was applied on write
  // (e.g. "18514.292958...") must never leak those raw decimals back into an admin input - neither
  // an item/package price field nor a payment-schedule amount field - once the field isn't focused.
  it('rounds float-noise prices and payment-schedule amounts to the cent when displayed and re-saved', async () => {
    const noisyCatalog = {
      packages: [{
        id: '3',
        name: 'Standard Program',
        listedPrice: 30000,
        currency: 'EUR',
        description: 'Program description here.',
        children: [],
        paymentScheduleId: 'ps-3',
      }],
      items: [{
        id: '12',
        name: 'Compensation to surrogate mother for the program',
        price: 18514.292958,
        description: '',
        category: 'surrogateMother',
      }],
      technical: {
        paymentSchedules: [{
          id: 'ps-3',
          payments: [{ title: 'Compensation to surrogate mother for the program', amount: 18514.292958 }],
        }],
      },
      clientNotes: {},
    };
    get.mockImplementation(() => Promise.resolve({ exists: () => true, val: () => noisyCatalog }));

    const root = createRoot(container);
    await act(async () => {
      mountBudgetPage(root);
    });
    await flush();

    const categoryToggle = Array.from(container.querySelectorAll('button')).find(btn => btn.textContent.includes('Surrogate Mother'));
    expect(categoryToggle).toBeTruthy();
    await act(async () => {
      categoryToggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flush();

    const priceInputs = Array.from(container.querySelectorAll('input[aria-label="Price"]'));
    const noisyPriceInput = priceInputs.find(input => input.value.includes('18514'));
    expect(noisyPriceInput).toBeTruthy();
    expect(noisyPriceInput.value).toBe('18514.29');

    const scheduleToggle = Array.from(container.querySelectorAll('button')).find(btn => btn.textContent.includes('Payment schedule editor'));
    expect(scheduleToggle).toBeTruthy();
    await act(async () => {
      scheduleToggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flush();

    const amountInput = container.querySelector('input[type="number"]');
    expect(amountInput).toBeTruthy();
    expect(amountInput.value).toBe('18514.29');

    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    await act(async () => {
      amountInput.focus();
      nativeInputValueSetter.call(amountInput, '18600.006');
      amountInput.dispatchEvent(new Event('input', { bubbles: true }));
      amountInput.blur();
    });
    await flush();

    expect(set).toHaveBeenCalledWith('budget/technical/paymentSchedules', expect.arrayContaining([
      expect.objectContaining({
        payments: expect.arrayContaining([expect.objectContaining({ amount: 18600.01 })]),
      }),
    ]));

    await act(async () => {
      root.unmount();
    });
  });

});
