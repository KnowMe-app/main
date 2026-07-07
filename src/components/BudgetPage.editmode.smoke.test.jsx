import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';

jest.mock('./config', () => ({
  auth: { currentUser: { uid: 'admin-uid' } },
  database: {},
  fetchNbuUahExchangeRatesByDate: async () => ({ eur: 48.2, usd: 41.1 }),
}));

jest.mock('utils/accessLevel', () => ({
  isAdminUid: () => true,
}));

jest.mock('file-saver', () => ({ saveAs: () => {} }));

const mockCatalogFixture = {
  packages: [
    {
      id: '1',
      name: 'Standard program',
      listedPrice: 39000,
      currency: 'EUR',
      description: 'Client-facing description',
      children: ['10', '11'],
      paymentScheduleId: 'ps-1',
    },
    {
      id: '4',
      name: 'Guaranteed program',
      listedPrice: 59000,
      currency: 'EUR',
      description: 'Guaranteed description',
      children: ['10'],
    },
  ],
  items: [
    { id: '10', name: 'Coordination service', price: 2000, category: 'coordination', description: 'Included item' },
    { id: '11', name: 'IVF cycle', price: 8000, category: 'ivf', description: 'Included item 2' },
    { id: '20', name: 'Extra insurance', price: 1200, category: 'insurance', description: 'Optional expense' },
    { id: '21', name: 'Extra legal help', price: 900, category: 'legalAndRegistration', description: 'Optional expense 2' },
  ],
  clientNotes: { general: ['Note one'] },
  technical: {
    paymentSchedules: [
      { id: 'ps-1', payments: [{ title: 'First payment', amount: 10000 }] },
    ],
  },
};

jest.mock('firebase/database', () => ({
  get: async () => ({
    exists: () => true,
    val: () => mockCatalogFixture,
  }),
  ref: () => ({}),
  set: async () => {},
  update: async () => {},
  remove: async () => {},
}));

const BudgetPage = require('./BudgetPage').default;

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const renderPage = async () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<BudgetPage isAdmin />);
  });
  return { container, root };
};

const click = async element => {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

afterEach(() => {
  document.body.innerHTML = '';
  window.localStorage.clear();
});

describe('BudgetPage edit mode smoke', () => {
  it('renders a compact admin layout in edit mode', async () => {
    window.localStorage.setItem('budget:edit-mode', '1');
    const { container } = await renderPage();

    // Client-only decorations are hidden in edit mode.
    expect(container.textContent).not.toContain('Request this program');
    expect(container.textContent).not.toContain("What's included");

    // Collapsed tools per program.
    expect(container.textContent).toContain('Payments (1)');
    expect(container.textContent).toContain('Included (2)');
    expect(container.textContent).toContain('Expand all');

    // Schedule editor stays collapsed until toggled.
    expect(container.textContent).not.toContain('Payment schedule editor');
    const paymentsToggle = [...container.querySelectorAll('button')]
      .find(button => button.textContent.includes('Payments (1)'));
    await click(paymentsToggle);
    expect(container.textContent).toContain('Payment schedule editor');

    // Included items expand into editable rows with row actions.
    const includedToggle = [...container.querySelectorAll('button')]
      .find(button => button.textContent.includes('Included (2)'));
    await click(includedToggle);
    expect([...container.querySelectorAll('button')]
      .some(button => button.getAttribute('aria-label') === 'Hide expense')).toBe(true);

    // Expand all opens every expense category at once.
    const expandAll = [...container.querySelectorAll('button')]
      .find(button => button.textContent === 'Expand all');
    await click(expandAll);
    const inputValues = [...container.querySelectorAll('input')].map(input => input.value);
    expect(inputValues).toContain('Extra insurance');
    expect(inputValues).toContain('Extra legal help');
  });

  it('keeps the client layout in preview mode', async () => {
    const { container } = await renderPage();

    expect(container.textContent).toContain('Request this program');
    expect(container.textContent).toContain("What's included");
    expect(container.textContent).not.toContain('Expand all');
    expect(container.textContent).not.toContain('Included (');
  });
});
