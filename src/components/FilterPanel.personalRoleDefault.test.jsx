import React from 'react';
import { render } from '@testing-library/react';
import FilterPanel, { MATCHING_ROLE_DEFAULT_MARKER_KEY } from './FilterPanel';

jest.mock('./SearchFilters', () => ({ SearchFilters: () => null }));

const store = new Map();
beforeEach(() => {
  store.clear();
  jest.spyOn(Storage.prototype, 'getItem').mockImplementation(key => (store.has(key) ? store.get(key) : null));
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation((key, value) => { store.set(key, String(value)); });
});
afterEach(() => jest.restoreAllMocks());

const renderPanel = viewerRole => {
  const onChange = jest.fn();
  const utils = render(<FilterPanel mode="matching" nonAdminAllActive viewerRole={viewerRole} onChange={onChange} />);
  return { ...utils, onChange, last: () => onChange.mock.calls[onChange.mock.calls.length - 1][0] };
};

describe('«Тип профілю» за замовчуванням для донорки й СМ', () => {
  it('донорка вперше бачить самі агенції', () => {
    const { last } = renderPanel('ed');
    expect(last().userRole).toEqual({ ed: true, sm: false, ag: true, ip: false, other: false });
    expect(store.get(MATCHING_ROLE_DEFAULT_MARKER_KEY)).toBe('ed');
  });

  it('СМ вперше бачить самі агенції', () => {
    const { last } = renderPanel(['sm']);
    expect(last().userRole).toEqual({ ed: false, sm: true, ag: true, ip: false, other: false });
  });

  it('вдруге умовчання не перебиває вибору читачки', () => {
    store.set(MATCHING_ROLE_DEFAULT_MARKER_KEY, 'ed');
    store.set('matchingFilters', JSON.stringify({ userRole: { ed: true, ag: true, ip: true, other: true } }));
    const { last } = renderPanel('ed');
    // Фільтр, збережений до чіпа «Сурогатна мати», бере для неї значення «Інших».
    expect(last().userRole).toEqual({ ed: true, sm: true, ag: true, ip: true, other: true });
  });

  it('клініці лишає все', () => {
    const { last } = renderPanel('cl');
    expect(last().userRole).toEqual({ ed: true, sm: true, ag: true, ip: true, other: true });
    expect(store.has(MATCHING_ROLE_DEFAULT_MARKER_KEY)).toBe(false);
  });

  it('спрацьовує, коли роль приїхала після монтування', () => {
    const { last, rerender, onChange } = renderPanel('');
    expect(last().userRole.ip).toBe(true);
    rerender(<FilterPanel mode="matching" nonAdminAllActive viewerRole="ed" onChange={onChange} />);
    expect(last().userRole).toEqual({ ed: true, sm: false, ag: true, ip: false, other: false });
  });
});

describe('«Тип профілю» за замовчуванням для агенції', () => {
  it('агенція вперше бачить донорок і СМ, без інших агенцій і батьків', () => {
    const { last } = renderPanel('ag');
    // «Інші» (анкети без ролі, клініки) лишаються: інакше стрічка йшла б
    // переліченням бакетів індексу, тобто не за датою публікації.
    expect(last().userRole).toEqual({ ed: true, sm: true, ag: false, ip: false, other: true });
    expect(store.get(MATCHING_ROLE_DEFAULT_MARKER_KEY)).toBe('ag');
  });

  it('донорка-агентка гортає як агенція', () => {
    const { last } = renderPanel(['ed', 'ag']);
    expect(last().userRole).toEqual({ ed: true, sm: true, ag: false, ip: false, other: true });
  });

  it('вдруге умовчання не перебиває вибору агенції', () => {
    store.set(MATCHING_ROLE_DEFAULT_MARKER_KEY, 'ag');
    store.set('matchingFilters', JSON.stringify({ userRole: { ed: true, sm: true, ag: true, ip: false, other: true } }));
    const { last } = renderPanel('ag');
    expect(last().userRole).toEqual({ ed: true, sm: true, ag: true, ip: false, other: true });
  });
});

describe('«Тип профілю» за замовчуванням для біологічних батьків', () => {
  it('батьки, що шукають донорку, починають з донорок', () => {
    const onChange = jest.fn();
    render(<FilterPanel mode="matching" nonAdminAllActive viewerRole="ip" viewerSeekingRole="ed" onChange={onChange} />);
    expect(onChange.mock.calls[onChange.mock.calls.length - 1][0].userRole)
      .toEqual({ ed: true, sm: false, ag: false, ip: false, other: false });
    expect(store.get(MATCHING_ROLE_DEFAULT_MARKER_KEY)).toBe('ip|ed');
  });

  it('без відповіді на «Кого шукаєте» лишає все', () => {
    const onChange = jest.fn();
    render(<FilterPanel mode="matching" nonAdminAllActive viewerRole="ip" onChange={onChange} />);
    expect(onChange.mock.calls[onChange.mock.calls.length - 1][0].userRole)
      .toEqual({ ed: true, sm: true, ag: true, ip: true, other: true });
  });
});
