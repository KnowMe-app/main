import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import SearchBar from './SearchBar';
import { resetMatchingLocalStorageCache } from '../utils/cardIndex';

// Без мережі стрічка шукає лише серед збереженого на пристрої, і її порожня
// відповідь — не «в базі нічого немає». Поки вона лягала в негативний кеш
// запитів, після повернення звʼязку той самий запит шість годин не доходив
// до бази (13.11, ревʼю #3390).
beforeAll(() => {
  window.IS_REACT_ACT_ENVIRONMENT = true;
});

const options = {
  enabledSearchKeys: { telegram: true, searchId: false, partialUserId: false, searchKey: false, equalToAllCards: true },
  equalToKeys: ['telegram'],
  searchKeyFields: [],
};

const runSearch = async searchFunc => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  // eslint-disable-next-line testing-library/no-unnecessary-act
  await act(async () => {
    root.render(React.createElement(SearchBar, {
      searchFunc,
      search: '@offline_probe_handle',
      setSearch: jest.fn(),
      setUsers: jest.fn(),
      setState: jest.fn(),
      setUserNotFound: jest.fn(),
      enabledSearchKeys: options.enabledSearchKeys,
      searchOptions: options,
    }));
    await Promise.resolve();
  });
  await act(async () => { root.unmount(); });
  document.body.removeChild(container);
};

const setOnline = value => {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => value });
};

describe('офлайнова відповідь пошуку не лягає в кеш запитів', () => {
  beforeEach(() => {
    localStorage.clear();
    resetMatchingLocalStorageCache();
  });
  afterEach(() => setOnline(true));

  it('онлайн: порожня відповідь памʼятається, і другий той самий запит базу не питає', async () => {
    setOnline(true);
    const searchFunc = jest.fn().mockResolvedValue({});
    await runSearch(searchFunc);
    const calls = searchFunc.mock.calls.length;
    expect(calls).toBeGreaterThan(0);
    await runSearch(searchFunc);
    expect(searchFunc.mock.calls.length).toBe(calls);
  });

  it('без мережі порожня відповідь не памʼятається: зі звʼязком запит іде в базу знову', async () => {
    setOnline(false);
    const searchFunc = jest.fn().mockResolvedValue({});
    await runSearch(searchFunc);
    const calls = searchFunc.mock.calls.length;
    expect(calls).toBeGreaterThan(0);
    setOnline(true);
    await runSearch(searchFunc);
    expect(searchFunc.mock.calls.length).toBeGreaterThan(calls);
  });
});
