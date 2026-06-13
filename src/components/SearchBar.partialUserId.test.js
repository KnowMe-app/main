import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import SearchBar, { getFreshCachedSearchResult, getSearchCacheKeyForParams, getSelectedAdvancedSearchModes, parseExplicitSearchKeyCandidate, parsePartialUserIdPrefix, parseTelegramSearchValue, resolveExecutionPlan } from './SearchBar';
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
    expect(parseTelegramSearchValue('УК СМ ALIA 09.10.2025')).toBe('УК СМ ALIA 09.10.2025');
    expect(parseTelegramSearchValue('УК СМ Надія @nadia_agent')).toBe('УК СМ Надія @nadia_agent');
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
});
