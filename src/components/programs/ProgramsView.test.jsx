import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { ProgramCard, ProgramsSummary } from './ProgramsView';
import { CardRoleBlock, isCounterpartyCard } from './CardRoleBlock';
import {
  loadOwnPrograms,
  peekOwnPrograms,
  PROGRAMS_CACHE_PREFIX,
  resetProgramsStoreForTests,
  saveCardPrograms,
  setProgramsTransport,
} from '../../utils/programsStore';
import { applyUkrainianInterface } from '../../testUtils/interfaceLanguage';

applyUkrainianInterface();

const rates = { usd: 41, eur: 48, rateDate: '2026-09-30' };

const programs = {
  p1: { id: 'p1', type: 'ed', title: 'Київ', requirements: { ageFrom: 21, ageTo: 29 }, payments: { final: { amount: 2500, currency: 'USD' } } },
  p2: { id: 'p2', type: 'ed', title: 'Кріобанк', requirements: { ageTo: 25 }, payments: { final: { amount: 1600, currency: 'USD' } } },
  p3: { id: 'p3', type: 'sm', payments: { final: { amount: 20000, currency: 'USD' } } },
};

const donorFacts = { age: 27 };

describe('програми в рядку стрічки', () => {
  it('каже донорці, скільки програм їй підходить, і діапазон її програм', () => {
    render(<ProgramsSummary card={{ programs }} viewerType="ed" facts={donorFacts} rates={rates} displayCurrency="USD" onDisplayCurrencyChange={jest.fn()} language="uk" />);
    const summary = screen.getByTestId('programs-summary');
    expect(summary).toHaveTextContent('Вам підходить 1 з 2 програм');
    // Пробіли між розрядами — нерозривні; toHaveTextContent зводить їх до звичайних.
    expect(summary).toHaveTextContent('1 600–2 500 $');
    expect(summary).toHaveTextContent('ще 1 — для сурогатних мам');
  });

  it('дотик розгортає програми з позначкою збігу', () => {
    render(<ProgramsSummary card={{ programs }} viewerType="ed" facts={donorFacts} rates={rates} displayCurrency="USD" onDisplayCurrencyChange={jest.fn()} language="uk" />);
    fireEvent.click(screen.getByTestId('programs-summary'));
    const cards = screen.getAllByTestId('program-card');
    expect(cards).toHaveLength(2);
    expect(within(cards[0]).getByText('Вам підходить')).toBeInTheDocument();
    expect(within(cards[1]).getByText('Не підходить')).toBeInTheDocument();
  });

  it('прихованої програми не видно, а можливі доплати стоять окремим блоком', () => {
    const withBonus = {
      p1: { ...programs.p1, bonuses: [{ label: 'Вагітність з першої спроби', amount: 500, currency: 'USD' }] },
      p2: { ...programs.p2, hidden: true },
    };
    render(<ProgramsSummary card={{ programs: withBonus }} viewerType="ed" facts={donorFacts} rates={rates} displayCurrency="USD" onDisplayCurrencyChange={jest.fn()} language="uk" />);
    expect(screen.getByTestId('programs-summary')).toHaveTextContent('Вам підходить 1 з 1 програми');
    fireEvent.click(screen.getByTestId('programs-summary'));
    expect(screen.getByText('Можливі доплати')).toBeInTheDocument();
    expect(screen.getByText('Вагітність з першої спроби')).toBeInTheDocument();
    const firstTry = screen.getByRole('checkbox', { name: /Вагітність з першої спроби/ });
    expect(firstTry).not.toBeChecked();
    expect(screen.getAllByText('2 500 $').length).toBeGreaterThan(0);
    fireEvent.click(firstTry);
    expect(screen.getByText('3 000 $')).toBeInTheDocument();
  });

  it('не показує застарілу назву програми', () => {
    render(<ProgramsSummary card={{ programs: { p1: programs.p1 } }} viewerType="ed" facts={donorFacts} rates={rates} displayCurrency="USD" onDisplayCurrencyChange={jest.fn()} language="uk" defaultOpen />);
    expect(screen.getByText('Донор ооцитів')).toBeInTheDocument();
    expect(screen.queryByText('Київ')).not.toBeInTheDocument();
  });

  it('у валюті читача діапазон — еквівалент із «≈»', () => {
    render(<ProgramsSummary card={{ programs }} viewerType="ed" facts={donorFacts} rates={rates} displayCurrency="EUR" onDisplayCurrencyChange={jest.fn()} language="uk" />);
    expect(screen.getByTestId('programs-summary')).toHaveTextContent('≈');
  });

  it('читачеві, якому програми не адресовані, — лише кількість', () => {
    render(<ProgramsSummary card={{ programs }} rates={rates} displayCurrency="USD" onDisplayCurrencyChange={jest.fn()} language="uk" />);
    expect(screen.getByTestId('programs-summary')).toHaveTextContent('3 програми');
  });
});

describe('картка програми — калькулятор заробітку', () => {
  // Програма зі скріншота користувачки: «загальна сума» там була 23 800 $ —
  // без жодного з девʼяти щомісячних платежів.
  const surrogate = {
    id: 'p2',
    type: 'sm',
    location: 'Київ',
    payments: {
      final: { amount: 23000, currency: 'USD' },
      monthly: { amount: 500, currency: 'USD' },
      transfer: { amount: 200, currency: 'USD' },
      contract: { amount: 100, currency: 'USD' },
      cSection: { amount: 1500, currency: 'USD' },
      twins: { amount: 3000, currency: 'USD' },
    },
    otherPayments: [{ label: 'Доплата за повторну програму', amount: 500, currency: 'USD' }],
  };

  it('разом — усі гарантовані виплати, зі щомісячними × місяці', () => {
    render(<ProgramCard program={surrogate} rates={rates} language="uk" />);
    expect(screen.getByTestId('program-total')).toHaveTextContent('28 300 $');
    expect(screen.getByText(/500 \$ × 9 міс/)).toBeInTheDocument();
    expect(screen.getByText(/орієнтовно, термін вагітності/)).toBeInTheDocument();
  });

  it('відмічена можлива доплата додається до «разом»', () => {
    render(<ProgramCard program={surrogate} rates={rates} language="uk" />);
    fireEvent.click(screen.getByRole('checkbox', { name: /Кесарів розтин/ }));
    const total = screen.getByTestId('program-total');
    expect(total).toHaveTextContent('29 800 $');
    expect(total).toHaveTextContent('гарантовано 28 300 $');
    expect(screen.getByRole('checkbox', { name: /Кесарів розтин/ })).toHaveAttribute('aria-checked', 'true');
  });

  it('вимоги й покриття підписані окремо', () => {
    render(<ProgramCard program={{ ...surrogate, requirements: { ageTo: 35 }, coverage: ['travel'] }} rates={rates} language="uk" />);
    expect(screen.getByText('Вимоги')).toBeInTheDocument();
    expect(screen.getByText('Що покриває')).toBeInTheDocument();
  });

  it('читачеві без свого типу програми донорок і СМ — окремими рядками, а не одним діапазоном', () => {
    render(<ProgramsSummary card={{ programs: { p1: programs.p1, p2: surrogate } }} rates={rates} displayCurrency="USD" onDisplayCurrencyChange={jest.fn()} language="uk" />);
    const summary = screen.getByTestId('programs-summary');
    expect(summary).toHaveTextContent('Донор ооцитів · 2 500 $');
    expect(summary).toHaveTextContent('Сурогатна мати · 28 300 $');
    expect(summary).not.toHaveTextContent('2 500–28 300');
  });
});

describe('картка агенції й батьків', () => {
  const context = { viewerType: 'ed', facts: donorFacts, rates, displayCurrency: 'USD', onDisplayCurrencyChange: jest.fn() };

  beforeEach(() => {
    resetProgramsStoreForTests();
    window.localStorage.clear();
  });

  afterEach(() => setProgramsTransport(null));

  it('програми картки бере спершу з браузера — без запиту', () => {
    const read = jest.fn();
    setProgramsTransport({ read });
    window.localStorage.setItem(`${PROGRAMS_CACHE_PREFIX}AG1`, JSON.stringify({ at: 10, items: programs }));
    render(<CardRoleBlock card={{ userId: 'AG1', role: 'ag', programsAt: 10 }} programsContext={context} language="uk" />);
    expect(screen.getByTestId('programs-summary')).toHaveTextContent('Вам підходить 1 з 2 програм');
    expect(read).not.toHaveBeenCalled();
  });

  it('застарілу копію перечитує один раз, коли картка вже в списку', async () => {
    const read = jest.fn().mockResolvedValue({ updatedAt: 20, items: { p1: programs.p1 } });
    setProgramsTransport({ read });
    window.localStorage.setItem(`${PROGRAMS_CACHE_PREFIX}AG1`, JSON.stringify({ at: 10, items: programs }));
    render(<CardRoleBlock card={{ userId: 'AG1', role: 'ag', programsAt: 20 }} programsContext={context} language="uk" />);
    expect(await screen.findByText('Вам підходить 1 з 1 програми')).toBeInTheDocument();
    expect(read).toHaveBeenCalledTimes(1);
    expect(JSON.parse(window.localStorage.getItem(`${PROGRAMS_CACHE_PREFIX}AG1`)).at).toBe(20);
  });

  it('картка без версії програм не питає нічого', () => {
    const read = jest.fn();
    setProgramsTransport({ read });
    const { container } = render(<CardRoleBlock card={{ userId: 'AG2', role: 'ag' }} programsContext={context} language="uk" />);
    expect(container).toBeEmptyDOMElement();
    expect(read).not.toHaveBeenCalled();
  });

  it('дві ролі — друга анкета підписана роллю', () => {
    window.localStorage.setItem(`${PROGRAMS_CACHE_PREFIX}ED1`, JSON.stringify({ at: 10, items: programs }));
    render(<CardRoleBlock card={{ userId: 'ED1', role: ['ed', 'ag'], programsAt: 10 }} programsContext={context} language="uk" />);
    expect(screen.getByText('Агенція')).toBeInTheDocument();
  });

  it('батьки кажуть, кого шукають', () => {
    render(<CardRoleBlock card={{ role: 'ip', seeking: 'both' }} language="uk" />);
    expect(screen.getByText(/донорку й сурогатну маму/)).toBeInTheDocument();
  });

  it('донорку блок не чіпає', () => {
    expect(isCounterpartyCard({ role: 'ed' })).toBe(false);
    expect(isCounterpartyCard({ role: ['ag', 'ed'] })).toBe(false);
    const { container } = render(<CardRoleBlock card={{ role: 'ed' }} language="uk" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('конкурентне читання власних програм', () => {
  beforeEach(() => {
    resetProgramsStoreForTests();
    window.localStorage.clear();
  });

  afterEach(() => setProgramsTransport(null));

  it('порожня стара відповідь не стирає нові pending-програми', async () => {
    let finishRead;
    const read = jest.fn(() => new Promise(resolve => { finishRead = resolve; }));
    const writeError = new Error('offline');
    setProgramsTransport({ read, write: jest.fn().mockRejectedValue(writeError) });

    const loading = loadOwnPrograms('OWNER1');
    const saving = saveCardPrograms('OWNER1', { p1: programs.p1 }).catch(error => error);
    finishRead(null);

    await expect(loading).resolves.toEqual(expect.objectContaining({ pending: true }));
    await expect(saving).resolves.toBe(writeError);
    const pending = peekOwnPrograms('OWNER1');
    expect(pending?.pending).toBe(true);
    expect(pending?.items?.p1).toEqual(expect.objectContaining({
      id: programs.p1.id,
      type: programs.p1.type,
    }));
    expect(pending?.items?.p1.title).toBeUndefined();
  });
});
