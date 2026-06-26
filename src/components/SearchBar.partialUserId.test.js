import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import SearchBar, { getFreshCachedSearchResult, getSearchCacheKeyForParams, doesCardMatchSearchParams, filterSearchResultByParams, getSelectedAdvancedSearchModes, parseExplicitSearchKeyCandidate, parsePartialUserIdPrefix, parseTelegramSearchValue, resolveExecutionPlan } from './SearchBar';
import { updateCard } from '../utils/cardsStorage';
import { resetMatchingLocalStorageCache, setIdsForQuery } from '../utils/cardIndex';

beforeAll(() => {
  window.IS_REACT_ACT_ENVIRONMENT = true;
});

describe('parsePartialUserIdPrefix', () => {
  it('allows exact-case catalog key prefixes for users/newUsers userId search', () => {
    expect(parsePartialUserIdPrefix('IORgRD')).toBe('IORgRD');
    expect(parsePartialUserIdPrefix('  AbC_123-XYZ  ')).toBe('AbC_123-XYZ');
  });

  it('keeps existing known userId prefixes working', () => {
    expect(parsePartialUserIdPrefix('AA1')).toBe('AA1');
    expect(parsePartialUserIdPrefix('-ab')).toBe('-ab');
  });

  it('does not treat phones, emails, urls, or too-short prefixes as catalog prefixes', () => {
    expect(parsePartialUserIdPrefix('380501234567')).toBeNull();
    expect(parsePartialUserIdPrefix('test@example.com')).toBeNull();
    expect(parsePartialUserIdPrefix('https://example.com/id')).toBeNull();
    expect(parsePartialUserIdPrefix('AB')).toBeNull();
  });
});

describe('parseExplicitSearchKeyCandidate', () => {
  it('treats a bare value as valid when telegram key is selected explicitly', () => {
    expect(parseExplicitSearchKeyCandidate('telegram', 'Anna_Smile0808')).toBe('Anna_Smile0808');
    expect(parseExplicitSearchKeyCandidate('telegram', ' @Anna_Smile0808 ')).toBe('Anna_Smile0808');
  });

  it('keeps labeled telegram parsing working before falling back to raw key normalization', () => {
    expect(parseExplicitSearchKeyCandidate('telegram', 'telegram: Anna_Smile0808')).toBe('Anna_Smile0808');
  });


  it('normalizes UK trigger telegram queries through the shared telegram parser', () => {
    expect(parseTelegramSearchValue('УК СМ ALIA 09.10.2025')).toBeNull();
    expect(parseTelegramSearchValue('УК СМ Надія @nadia_agent')).toBeNull();
    expect(parseTelegramSearchValue('УК СМ tg: nadia_agent')).toBeNull();
    expect(parseTelegramSearchValue('@plain_handle')).toBe('plain_handle');
    expect(parseTelegramSearchValue('https://t.me/plain_handle')).toBe('plain_handle');
  });
});

describe('resolveExecutionPlan', () => {
  it('checks every selected key as primary without fallback keys', () => {
    expect(resolveExecutionPlan({
      allKeys: ['telegram', 'phone', 'email'],
      selectedKeys: ['telegram', 'phone'],
      detectedKey: 'telegram',
      rawQuery: 'Anna_Smile0808',
    })).toEqual({
      primaryKeys: ['telegram', 'phone'],
      fallbackKeys: [],
    });
  });

  it('checks every available key when no explicit key subset is selected', () => {
    expect(resolveExecutionPlan({
      allKeys: ['telegram', 'phone', 'email'],
      selectedKeys: [],
      detectedKey: 'telegram',
      rawQuery: 'Anna_Smile0808',
    })).toEqual({
      primaryKeys: ['telegram', 'phone', 'email'],
      fallbackKeys: [],
    });
  });


  it('only treats explicitly configured advanced scopes as selected', () => {
    const enabled = key => ({ searchId: true, searchKey: true, equalToAllCards: true, partialUserId: true }[key]);

    expect(getSelectedAdvancedSearchModes({}, enabled)).toEqual([]);
    expect(getSelectedAdvancedSearchModes({ searchIdPrefixes: ['telegram'] }, enabled)).toEqual(['searchId']);
    expect(getSelectedAdvancedSearchModes({ equalToKeys: ['telegram'] }, enabled)).toEqual(['equalToAllCards']);
    expect(getSelectedAdvancedSearchModes({ searchIdPrefixes: ['telegram'], equalToKeys: ['telegram'] }, key => key === 'searchId')).toEqual(['searchId']);
    expect(getSelectedAdvancedSearchModes({ enabledSearchKeys: { partialUserId: true } }, enabled)).toEqual(['partialUserId']);
    expect(getSelectedAdvancedSearchModes({ enabledSearchKeys: { searchId: true, searchKey: true, equalToAllCards: true } }, enabled)).toEqual(['searchId', 'searchKey', 'equalToAllCards']);
    expect(getSelectedAdvancedSearchModes({ enabledSearchKeys: { searchId: true, telegram: false } }, enabled)).toEqual([]);
    expect(getSelectedAdvancedSearchModes({ enabledSearchKeys: { equalToAllCards: true, telegram: false } }, enabled)).toEqual([]);
    expect(getSelectedAdvancedSearchModes({ enabledSearchKeys: { searchId: true, telegram: true } }, enabled)).toEqual(['searchId']);
    expect(getSelectedAdvancedSearchModes({ enabledSearchKeys: { searchId: true }, searchIdPrefixes: [] }, enabled)).toEqual([]);
  });
});




describe('SearchBar result validation', () => {
  it('filters cached telegram search results before rendering them', () => {
    const result = {
      valid: { userId: 'valid', telegram: 'УК СМ ALIA 09.10.2025' },
      stale: { userId: 'stale', telegram: 'other_handle' },
      missing: { userId: 'missing', name: 'No Telegram' },
    };

    expect(filterSearchResultByParams(result, { telegram: 'УК СМ ALIA 09.10.2025' })).toEqual({
      valid: result.valid,
    });
  });

  it('validates searchId results against the selected telegram prefix', () => {
    expect(doesCardMatchSearchParams(
      { userId: 'valid', telegram: 'УК СМ ALIA 09.10.2025' },
      { searchId: 'УК СМ ALIA 09.10.2025' },
      { searchIdPrefixes: ['telegram'] },
    )).toBe(true);
    expect(doesCardMatchSearchParams(
      { userId: 'wrong', instagram: 'УК СМ ALIA 09.10.2025' },
      { searchId: 'УК СМ ALIA 09.10.2025' },
      { searchIdPrefixes: ['telegram'] },
    )).toBe(false);
  });


  it('validates UK-trigger telegram searchId results by full value or handle', () => {
    const card = {
      userId: 'uk-trigger-match',
      telegram: ['УК СМ Sasha @SashaLjr', 'SashaLjr'],
    };

    expect(doesCardMatchSearchParams(
      card,
      { searchId: 'УК СМ Sasha @SashaLjr' },
      { searchIdPrefixes: ['telegram'] },
    )).toBe(true);
    expect(doesCardMatchSearchParams(
      { userId: 'handle-only-match', telegram: ['SashaLjr'] },
      { searchId: 'УК СМ Sasha @SashaLjr' },
      { searchIdPrefixes: ['telegram'] },
    )).toBe(true);
  });

  it('allows UK-trigger telegram handle prefix matches only when prefix matching is enabled', () => {
    const card = {
      userId: 'uk-trigger-prefix-match',
      telegram: ['Oksana_Koshel'],
    };

    expect(doesCardMatchSearchParams(
      card,
      { telegram: 'УК СМ Оксана Кошель @Oksana' },
      { allowTelegramPrefixMatches: true },
    )).toBe(true);
    expect(doesCardMatchSearchParams(
      card,
      { telegram: 'УК СМ Оксана Кошель @Oksana' },
    )).toBe(false);
  });

  it('allows partial UK-trigger telegram value prefix matches only when prefix matching is enabled', () => {
    const result = {
      exact: { userId: 'exact', telegram: 'УК СМ Оксана' },
      longer: { userId: 'longer', telegram: 'УК СМ Оксана Кошель @Oksana_Koshel' },
      other: { userId: 'other', telegram: 'УК СМ Інша' },
    };

    expect(filterSearchResultByParams(
      result,
      { telegram: 'УК СМ Оксана' },
      { allowTelegramPrefixMatches: true },
    )).toEqual({
      exact: result.exact,
      longer: result.longer,
    });
    expect(filterSearchResultByParams(
      result,
      { telegram: 'УК СМ Оксана' },
    )).toEqual({
      exact: result.exact,
    });
  });

  it('keeps partial userId validation as a prefix match', () => {
    expect(doesCardMatchSearchParams(
      { userId: 'Anna123' },
      { userId: 'Anna' },
      { forcePartialUserIdSearch: true },
    )).toBe(true);
  });

  it('keeps default name and short phone searches as substring matches', () => {
    expect(doesCardMatchSearchParams(
      { userId: 'name-match', name: 'Anna' },
      { name: 'Ann' },
    )).toBe(true);
    expect(doesCardMatchSearchParams(
      { userId: 'phone-match', phone: '380501234567' },
      { phone: '1234' },
    )).toBe(true);
  });

  it('uses exact validation for equalTo fields and normalized date bucket values', () => {
    expect(doesCardMatchSearchParams(
      { userId: 'comment-miss', myComment: 'abcd' },
      { myComment: 'abc' },
      { forceEqualToAllCards: true },
    )).toBe(false);
    expect(doesCardMatchSearchParams(
      { userId: 'date-match', getInTouch: '2025-01-30' },
      { getInTouch: '30.01.2025' },
      { forceSearchKeyBucket: true },
    )).toBe(true);
    expect(doesCardMatchSearchParams(
      { userId: 'timestamp-match', lastAction: new Date('2025-01-30T15:00:00Z').getTime() },
      { lastAction: '30.01.2025' },
      { forceSearchKeyBucket: true },
    )).toBe(true);
    expect(filterSearchResultByParams(
      {
        wrongDateField: { userId: 'wrongDateField', getInTouch: '13.06.2026', createdAt: '14.05.2026' },
        createdAtMatch: { userId: 'createdAtMatch', getInTouch: '14.05.2026', createdAt: '13.06.2026' },
      },
      { createdAt: '13.06.2026' },
      { forceEqualToAllCards: true, equalToKeys: ['createdAt'] },
    )).toEqual({
      createdAtMatch: { userId: 'createdAtMatch', getInTouch: '14.05.2026', createdAt: '13.06.2026' },
    });
  });
});

describe('SearchBar cache-first search', () => {
  beforeEach(() => {
    resetMatchingLocalStorageCache('SearchBar cache-first test');
  });

  it('returns cached cards for repeated partial userId searches without calling the backend search function', async () => {
    updateCard('Anna123', { userId: 'Anna123', name: 'Anna Cached' });
    setIdsForQuery(
      getSearchCacheKeyForParams('userId', 'Anna123', { forcePartialUserIdSearch: true }),
      ['Anna123'],
    );

    const cachedResult = getFreshCachedSearchResult('userId', 'Anna123', {
      forcePartialUserIdSearch: true,
    });
    expect(cachedResult.hit).toBe(true);
    expect(cachedResult.cards).toHaveLength(1);
    expect(cachedResult.cards[0].name).toBe('Anna Cached');

    const searchFunc = jest.fn().mockResolvedValue({});
    const setUsers = jest.fn();

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    // eslint-disable-next-line testing-library/no-unnecessary-act
    await act(async () => {
      root.render(React.createElement(SearchBar, {
        searchFunc,
        search: 'Anna123',
        setSearch: jest.fn(),
        setUsers,
        setState: jest.fn(),
        setUserNotFound: jest.fn(),
        enabledSearchKeys: {
          partialUserId: true,
          searchId: false,
          searchKey: false,
          equalToAllCards: false,
        },
        searchOptions: {
          enablePartialUserIdSearch: true,
          enabledSearchKeys: {
            partialUserId: true,
            searchId: false,
            searchKey: false,
            equalToAllCards: false,
          },
        },
      }));
      await Promise.resolve();
    });

    expect(setUsers).toHaveBeenCalledWith({
      Anna123: expect.objectContaining({
        userId: 'Anna123',
        name: 'Anna Cached',
      }),
    });
    expect(searchFunc).not.toHaveBeenCalled();

    // eslint-disable-next-line testing-library/no-unnecessary-act
    await act(async () => {
      root.unmount();
    });
    document.body.removeChild(container);
  });


  it('enables telegram prefix matching for UK-trigger searchId searches', async () => {
    const searchFunc = jest.fn().mockResolvedValue({
      oksana: { userId: 'oksana', telegram: ['Oksana_Koshel'] },
    });
    const setUsers = jest.fn();

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    // eslint-disable-next-line testing-library/no-unnecessary-act
    await act(async () => {
      root.render(React.createElement(SearchBar, {
        searchFunc,
        search: 'УК СМ Оксана Кошель @Oksana',
        setSearch: jest.fn(),
        setUsers,
        setState: jest.fn(),
        setUserNotFound: jest.fn(),
        enabledSearchKeys: {
          searchId: true,
          partialUserId: false,
          searchKey: false,
          equalToAllCards: false,
        },
        searchOptions: {
          enabledSearchKeys: {
            searchId: true,
            partialUserId: false,
            searchKey: false,
            equalToAllCards: false,
          },
          searchIdPrefixes: ['telegram'],
        },
      }));
      await Promise.resolve();
    });

    expect(searchFunc).toHaveBeenCalledWith(
      { searchId: 'УК СМ Оксана Кошель @Oksana' },
      expect.objectContaining({
        searchIdPrefixes: ['telegram'],
        allowTelegramPrefixMatches: true,
      }),
    );
    expect(setUsers).toHaveBeenCalledWith({
      oksana: expect.objectContaining({ userId: 'oksana' }),
    });

    // eslint-disable-next-line testing-library/no-unnecessary-act
    await act(async () => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it('enables telegram prefix matching for partial UK-trigger searchId searches without handles', async () => {
    const searchFunc = jest.fn().mockResolvedValue({
      exact: { userId: 'exact', telegram: 'УК СМ Оксана' },
      longer: { userId: 'longer', telegram: 'УК СМ Оксана Кошель @Oksana_Koshel' },
    });
    const setUsers = jest.fn();

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    // eslint-disable-next-line testing-library/no-unnecessary-act
    await act(async () => {
      root.render(React.createElement(SearchBar, {
        searchFunc,
        search: 'УК СМ Оксана',
        setSearch: jest.fn(),
        setUsers,
        setState: jest.fn(),
        setUserNotFound: jest.fn(),
        enabledSearchKeys: {
          searchId: true,
          partialUserId: false,
          searchKey: false,
          equalToAllCards: false,
        },
        searchOptions: {
          enabledSearchKeys: {
            searchId: true,
            partialUserId: false,
            searchKey: false,
            equalToAllCards: false,
          },
          searchIdPrefixes: ['telegram'],
        },
      }));
      await Promise.resolve();
    });

    expect(searchFunc).toHaveBeenCalledWith(
      { searchId: 'УК СМ Оксана' },
      expect.objectContaining({
        searchIdPrefixes: ['telegram'],
        allowTelegramPrefixMatches: true,
      }),
    );
    expect(setUsers).toHaveBeenCalledWith({
      exact: expect.objectContaining({ userId: 'exact' }),
      longer: expect.objectContaining({ userId: 'longer' }),
    });

    // eslint-disable-next-line testing-library/no-unnecessary-act
    await act(async () => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it('does not search date buckets when searchKeyFields is explicitly empty', async () => {
    const searchFunc = jest.fn().mockResolvedValue({});
    const setUsers = jest.fn();

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    // eslint-disable-next-line testing-library/no-unnecessary-act
    await act(async () => {
      root.render(React.createElement(SearchBar, {
        searchFunc,
        search: 'УК СМ Марія Бекер 02.06.2026',
        setSearch: jest.fn(),
        setUsers,
        setState: jest.fn(),
        setUserNotFound: jest.fn(),
        enabledSearchKeys: {
          telegram: true,
          searchId: false,
          partialUserId: false,
          searchKey: true,
          equalToAllCards: true,
        },
        searchOptions: {
          enabledSearchKeys: {
            telegram: true,
            searchId: false,
            partialUserId: false,
            searchKey: true,
            equalToAllCards: true,
          },
          equalToKeys: ['telegram'],
          searchKeyFields: [],
        },
      }));
      await Promise.resolve();
    });

    expect(searchFunc).toHaveBeenCalledWith(
      { telegram: 'УК СМ Марія Бекер 02.06.2026' },
      expect.objectContaining({
        forceEqualToAllCards: true,
        equalToKeys: ['telegram'],
      }),
    );
    expect(searchFunc).not.toHaveBeenCalledWith(
      expect.objectContaining({ lastAction: expect.anything() }),
      expect.anything(),
    );
    expect(searchFunc).not.toHaveBeenCalledWith(
      expect.objectContaining({ getInTouch: expect.anything() }),
      expect.anything(),
    );

    // eslint-disable-next-line testing-library/no-unnecessary-act
    await act(async () => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it('renders UK-trigger telegram prefix matches as a list even when one match is returned', async () => {
    const searchFunc = jest.fn().mockResolvedValue({
      userId: 'oksana',
      telegram: 'УК СМ Оксана',
    });
    const setUsers = jest.fn();
    const setState = jest.fn();

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    // eslint-disable-next-line testing-library/no-unnecessary-act
    await act(async () => {
      root.render(React.createElement(SearchBar, {
        searchFunc,
        search: 'УК СМ Оксана',
        setSearch: jest.fn(),
        setUsers,
        setState,
        setUserNotFound: jest.fn(),
        enabledSearchKeys: {
          telegram: true,
          searchId: false,
          partialUserId: false,
          searchKey: false,
          equalToAllCards: false,
        },
      }));
      await Promise.resolve();
    });

    expect(searchFunc).toHaveBeenCalledWith(
      { telegram: 'УК СМ Оксана' },
      expect.objectContaining({
        allowTelegramPrefixMatches: true,
      }),
    );
    expect(setState).not.toHaveBeenCalledWith(expect.objectContaining({ userId: 'oksana' }));
    expect(setUsers).toHaveBeenLastCalledWith({
      oksana: expect.objectContaining({
        userId: 'oksana',
        telegram: 'УК СМ Оксана',
      }),
    });

    // eslint-disable-next-line testing-library/no-unnecessary-act
    await act(async () => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it('keeps scoped searchId prefix cache entries isolated for repeated searches', () => {
    updateCard('ig-user', { userId: 'ig-user', name: 'Instagram Match' });
    updateCard('tg-user', { userId: 'tg-user', name: 'Telegram Match' });

    setIdsForQuery(
      getSearchCacheKeyForParams('searchId', 'shared-id', { searchIdPrefixes: ['instagram'] }),
      ['ig-user'],
    );
    setIdsForQuery(
      getSearchCacheKeyForParams('searchId', 'shared-id', { searchIdPrefixes: ['telegram'] }),
      ['tg-user'],
    );

    const instagramResult = getFreshCachedSearchResult('searchId', 'shared-id', {
      searchIdPrefixes: ['instagram'],
    });
    const telegramResult = getFreshCachedSearchResult('searchId', 'shared-id', {
      searchIdPrefixes: ['telegram'],
    });

    expect(instagramResult.hit).toBe(true);
    expect(instagramResult.ids).toEqual(['ig-user']);
    expect(telegramResult.hit).toBe(true);
    expect(telegramResult.ids).toEqual(['tg-user']);
    expect(getFreshCachedSearchResult('searchId', 'shared-id').hit).toBe(false);
  });



  it('does not treat pruned positive cache entries as negative hits', () => {
    const cacheKey = getSearchCacheKeyForParams('instagram', 'missing-card');
    setIdsForQuery(cacheKey, ['missing-user']);

    const cachedResult = getFreshCachedSearchResult('instagram', 'missing-card');

    expect(cachedResult.hit).toBe(false);
    expect(cachedResult.negativeHit).toBe(false);
  });

  it('keeps negative cache entries isolated by collection scope', () => {
    const usersScope = { cacheScope: { collections: ['users'] } };
    const allCollectionsScope = { cacheScope: { collections: ['newUsers', 'users'] } };
    setIdsForQuery(
      getSearchCacheKeyForParams('instagram', 'collection-only', usersScope),
      [],
      { isNegativeHit: true }
    );

    expect(getFreshCachedSearchResult('instagram', 'collection-only', usersScope).negativeHit).toBe(true);
    expect(getFreshCachedSearchResult('instagram', 'collection-only', allCollectionsScope).negativeHit).toBe(false);
  });

  it('caches negative search results so repeated identical searches skip backend calls', async () => {
    const searchFunc = jest.fn().mockResolvedValue({});
    const setUserNotFound = jest.fn();

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    // eslint-disable-next-line testing-library/no-unnecessary-act
    await act(async () => {
      root.render(React.createElement(SearchBar, {
        searchFunc,
        search: 'https://www.instagram.com/_sky.lol_?igsh=MTd4Y2swbGJmc3Vsbw==',
        setSearch: jest.fn(),
        setUsers: jest.fn(),
        setState: jest.fn(),
        setUserNotFound,
        enabledSearchKeys: {
          userId: false,
          facebook: false,
          instagram: true,
          ameblo: false,
          telegram: false,
          email: false,
          tiktok: false,
          phone: false,
          vk: false,
          other: false,
        },
      }));
      await Promise.resolve();
    });

    expect(searchFunc).toHaveBeenCalledTimes(1);
    const cachedResult = getFreshCachedSearchResult('instagram', '_sky.lol_', {
      searchIdPrefixes: ['instagram'],
    });
    expect(cachedResult.negativeHit).toBe(true);

    // eslint-disable-next-line testing-library/no-unnecessary-act
    await act(async () => {
      root.unmount();
    });

    const secondRoot = createRoot(container);
    // eslint-disable-next-line testing-library/no-unnecessary-act
    await act(async () => {
      secondRoot.render(React.createElement(SearchBar, {
        searchFunc,
        search: 'https://www.instagram.com/_sky.lol_?igsh=MTd4Y2swbGJmc3Vsbw==',
        setSearch: jest.fn(),
        setUsers: jest.fn(),
        setState: jest.fn(),
        setUserNotFound,
        enabledSearchKeys: {
          userId: false,
          facebook: false,
          instagram: true,
          ameblo: false,
          telegram: false,
          email: false,
          tiktok: false,
          phone: false,
          vk: false,
          other: false,
        },
      }));
      await Promise.resolve();
    });

    expect(searchFunc).toHaveBeenCalledTimes(1);
    expect(setUserNotFound).toHaveBeenLastCalledWith(true);

    // eslint-disable-next-line testing-library/no-unnecessary-act
    await act(async () => {
      secondRoot.unmount();
    });
    document.body.removeChild(container);
  });
});
