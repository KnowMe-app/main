import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { ProgramsSummary } from './ProgramsView';
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
      title: programs.p1.title,
    }));
  });
});
