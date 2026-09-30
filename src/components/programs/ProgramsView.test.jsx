import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { ProgramsSummary } from './ProgramsView';
import { CardRoleBlock, isCounterpartyCard } from './CardRoleBlock';
import { buildProgramsBrief } from '../../utils/donorPrograms';
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

  it('дотик розгортає програми з позначкою збігу й дочитує анкету', () => {
    const onOpen = jest.fn();
    render(<ProgramsSummary card={{ programs }} viewerType="ed" facts={donorFacts} rates={rates} displayCurrency="USD" onDisplayCurrencyChange={jest.fn()} language="uk" onOpen={onOpen} />);
    fireEvent.click(screen.getByTestId('programs-summary'));
    const cards = screen.getAllByTestId('program-card');
    expect(cards).toHaveLength(2);
    expect(within(cards[0]).getByText('Вам підходить')).toBeInTheDocument();
    expect(within(cards[1]).getByText('Не підходить')).toBeInTheDocument();
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('у валюті читача діапазон — еквівалент із «≈»', () => {
    render(<ProgramsSummary card={{ programsBrief: buildProgramsBrief(programs) }} viewerType="ed" facts={donorFacts} rates={rates} displayCurrency="EUR" onDisplayCurrencyChange={jest.fn()} language="uk" />);
    expect(screen.getByTestId('programs-summary')).toHaveTextContent('≈');
  });

  it('читачеві, якому програми не адресовані, — лише кількість', () => {
    render(<ProgramsSummary card={{ programs }} rates={rates} displayCurrency="USD" onDisplayCurrencyChange={jest.fn()} language="uk" />);
    expect(screen.getByTestId('programs-summary')).toHaveTextContent('3 програми');
  });
});

describe('картка агенції й батьків', () => {
  it('агенцію описують послуги, а не зріст', () => {
    const card = { role: 'ag', services: 'ed,legal' };
    expect(isCounterpartyCard(card)).toBe(true);
    render(<CardRoleBlock card={card} language="uk" />);
    expect(screen.getByText('Донорство ооцитів')).toBeInTheDocument();
    expect(screen.getByText('Юридичний супровід')).toBeInTheDocument();
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
