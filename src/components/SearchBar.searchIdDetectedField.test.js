import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import SearchBar from './SearchBar';
import { makeSearchKeyValue } from '../utils/searchKeyUtils';

beforeAll(() => {
  window.IS_REACT_ACT_ENVIRONMENT = true;
});

// Той самий набір, що стояв на панелі адміна, коли хендл «не знаходився»:
// точний searchId плюс кілька полів, і `phone` у списку першим.
const enabledSearchKeys = {
  searchId: true,
  partialUserId: true,
  equalToAllCards: false,
  searchKey: false,
  broadTextSearch: false,
  phone: true,
  telegram: true,
  instagram: true,
  name: true,
  surname: true,
};

const runSearch = async query => {
  localStorage.clear();
  const readKeys = [];
  const searchFunc = jest.fn(async (params, options) => {
    if (!('searchId' in params)) return {};
    const key = makeSearchKeyValue(params, options).modifiedSearchValue.toLowerCase();
    readKeys.push(key);
    return key === 'nadiyka1993' ? { userId: 'KPb8', telegram: 'nadiyka1993' } : {};
  });
  const setUsers = jest.fn();
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  // eslint-disable-next-line testing-library/no-unnecessary-act
  await act(async () => {
    root.render(React.createElement(SearchBar, {
      searchFunc,
      search: query,
      setSearch: jest.fn(),
      setUsers,
      setState: jest.fn(),
      setUserNotFound: jest.fn(),
      enabledSearchKeys,
      searchOptions: {
        searchIdPrefixes: ['phone', 'telegram', 'instagram', 'name', 'surname'],
        enabledSearchKeys,
        cacheScope: { collections: ['users'] },
      },
    }));
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
  });

  // eslint-disable-next-line testing-library/no-unnecessary-act
  await act(async () => root.unmount());
  document.body.removeChild(container);
  return { searchFunc, readKeys, setUsers };
};

describe('поле, яким нормалізується ключ searchId', () => {
  it('упізнає Telegram у набраному «@handle», а не в уже розібраному значенні', async () => {
    const { searchFunc, readKeys, setUsers } = await runSearch('@nadiyka1993');

    expect(searchFunc).toHaveBeenCalledWith(
      { searchId: 'nadiyka1993' },
      expect.objectContaining({ searchIdDetectedField: 'telegram' }),
    );
    // Доти поле бралось першим зі списку — `phone`, — і хендл зводився до
    // цифр: читався ключ `1993`.
    expect(readKeys).toEqual(['nadiyka1993']);
    expect(setUsers).toHaveBeenCalledWith({ KPb8: expect.objectContaining({ userId: 'KPb8' }) });
  });

  it('не підставляє перше обране поле, коли поле не впізнано', async () => {
    const { searchFunc, readKeys } = await runSearch('nadiyka1993');

    const searchIdCall = searchFunc.mock.calls.find(([params]) => 'searchId' in params);
    expect(searchIdCall[1].searchIdDetectedField).toBeUndefined();
    expect(readKeys).toEqual(['nadiyka1993']);
  });

  it('телефон і далі нормалізується як телефон', async () => {
    const { searchFunc } = await runSearch('+38 050 967 74 93');

    const searchIdCall = searchFunc.mock.calls.find(([params]) => 'searchId' in params);
    expect(searchIdCall[1].searchIdDetectedField).toBe('phone');
    expect(makeSearchKeyValue(searchIdCall[0], searchIdCall[1]).modifiedSearchValue)
      .toBe('380509677493');
  });
});
