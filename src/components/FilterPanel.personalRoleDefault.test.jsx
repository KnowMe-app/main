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
    expect(last().userRole).toEqual({ ed: true, ag: true, ip: false, other: false });
    expect(store.get(MATCHING_ROLE_DEFAULT_MARKER_KEY)).toBe('ed');
  });

  it('СМ вперше бачить самі агенції', () => {
    const { last } = renderPanel(['sm']);
    expect(last().userRole).toEqual({ ed: false, ag: true, ip: false, other: false });
  });

  it('вдруге умовчання не перебиває вибору читачки', () => {
    store.set(MATCHING_ROLE_DEFAULT_MARKER_KEY, 'ed');
    store.set('matchingFilters', JSON.stringify({ userRole: { ed: true, ag: true, ip: true, other: true } }));
    const { last } = renderPanel('ed');
    expect(last().userRole).toEqual({ ed: true, ag: true, ip: true, other: true });
  });

  it('агенції лишає все', () => {
    const { last } = renderPanel('ag');
    expect(last().userRole).toEqual({ ed: true, ag: true, ip: true, other: true });
    expect(store.has(MATCHING_ROLE_DEFAULT_MARKER_KEY)).toBe(false);
  });

  it('спрацьовує, коли роль приїхала після монтування', () => {
    const { last, rerender, onChange } = renderPanel('');
    expect(last().userRole.ip).toBe(true);
    rerender(<FilterPanel mode="matching" nonAdminAllActive viewerRole="ed" onChange={onChange} />);
    expect(last().userRole).toEqual({ ed: true, ag: true, ip: false, other: false });
  });
});
