import React, { useEffect, useState, useRef } from 'react';
import { useAutoResize } from '../hooks/useAutoResize';
import styled from 'styled-components';
import { createCache } from '../hooks/cardsCache';
import { getCacheKey } from '../utils/cache';
import {
  normalizeQueryKey,
  getIdsByQuery,
  getCard,
  setIdsForQuery,
  loadQueries,
  saveQueries,
  TTL_MS,
  serializeQueryFilters,
} from '../utils/cardIndex';
import { updateCard, searchCachedCards } from '../utils/cardsStorage';
import { parseUkTriggerQuery } from '../utils/parseUkTrigger';
import toast from 'react-hot-toast';

const SearchIcon = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="gray"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const InputDiv = styled.div`
  display: flex;
  align-items: center;
  position: relative;
  margin: 10px 0;
  padding: 10px;
  background-color: #fff;
  border: 3px solid;
  border-image: linear-gradient(45deg, red, orange, yellow, green, blue, indigo, violet) 1;
  border-radius: 5px;
  box-sizing: border-box;
  flex: 1 1 auto;
  min-width: 0;
  height: auto;
`;

const InputFieldContainer = styled.div`
  display: flex;
  align-items: center;
  position: relative;
  height: auto;
  flex: 1 1 auto;
  min-width: 0;
`;

const InputField = styled.textarea`
  border: none;
  outline: none;
  flex: 1;
  display: flex;
  align-items: center;
  padding: 0 0 0 10px;
  max-width: 100%;
  min-width: 0;
  pointer-events: auto;
  resize: none;
  overflow: hidden;
  min-height: 24px;
  line-height: normal;
  
`;

const ClearButton = styled.button`
  position: absolute;
  right: 0px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  cursor: pointer;
  color: gray;
  font-size: 18px;
  width: 35px;
  height: 35px;

  &:hover {
    color: black;
  }
`;

const HistoryList = styled.ul`
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: #fff;
  border: 1px solid #ccc;
  z-index: 10;
  list-style: none;
  margin: 0;
  padding: 0;
`;

const HistoryItem = styled.li`
  display: flex;
  justify-content: space-between;
  padding: 5px 10px;
  cursor: pointer;
  color: black;

  &:hover {
    background-color: #f0f0f0;
  }
`;

const HistoryRemove = styled.button`
  border: none;
  background: none;
  cursor: pointer;
  color: gray;

  &:hover {
    color: black;
  }
`;

const { loadCache: loadHistoryCache, saveCache: saveHistoryCache } =
  createCache('searchHistory', 0);

const parseFacebookId = url => {
  const idParamRegex = /[?&]id=(\d+)/;
  const matchIdParam = url.match(idParamRegex);
  if (matchIdParam && matchIdParam[1]) return matchIdParam[1];
  const facebookIdRegex = /facebook\.com\/(?:.*\/)?(\d+)$/;
  const matchId = url.match(facebookIdRegex);
  if (matchId && matchId[1]) return matchId[1];
  const facebookUsernameRegex = /facebook\.com\/([\w.-]+)(?:[/?#]|$)/;
  const matchUsername = url.match(facebookUsernameRegex);
  if (matchUsername && matchUsername[1]) return matchUsername[1];
  const numberRegex = /^\d{14,15}$/;
  if (numberRegex.test(url)) return url;
  const textFormatRegex = /(?:facebook|fb|фейсбук|фб)\s*:?\s*(\w+)/i;
  const matchTextFormat = url.match(textFormatRegex);
  if (matchTextFormat && matchTextFormat[1]) return matchTextFormat[1];
  return null;
};

const parseInstagramId = input => {
  if (typeof input === 'string' && input.includes('instagram')) {
    const instagramRegex = /instagram\.com\/(?:p\/|stories\/|explore\/)?([^/?#]+)/;
    const match = input.match(instagramRegex);
    if (match && match[1]) return match[1];
  }
  const pattern = /(?:\binst(?:agram)?\s*:?\s+|\binstagram\s*:?\s+|\bін(?:ст|стаграм)?\s*:?\s+|\bin\s*:?\s+)([a-zA-Z0-9._]+)/i;
  const match = input.match(pattern);
  if (match && match[1]) return match[1];
  return null;
};

const parsePhoneNumber = phone => {
  const digitsOnly = String(phone || '').replace(/\D/g, '');
  if (!digitsOnly) return;

  if (digitsOnly.startsWith('380')) return digitsOnly;
  if (digitsOnly.startsWith('0')) return `38${digitsOnly}`;
  if (digitsOnly.startsWith('80')) return `3${digitsOnly}`;

  return digitsOnly;
};

const parseEmail = email => {
  const cleanedEmail = email.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(cleanedEmail)) return;
  const domain = cleanedEmail.split('@')[1];
  if (!domain || !domain.includes('.')) return;
  return cleanedEmail;
};

const parseTikTokLink = url => {
  const tiktokRegex = /tiktok\.com\/(?:.*\/)?@?([a-zA-Z0-9._-]+)/;
  const match = url.match(tiktokRegex);
  if (match && match[1]) return match[1];
  const tiktokVariationsRegex =
    /(?:^|[^A-Za-z0-9\u0400-\u04FF_])(тікток|tiktok|tt|тт)[:\s]+([A-Za-z0-9._-]*[A-Za-z][A-Za-z0-9._-]*)/i;
  const variationMatch = url.match(tiktokVariationsRegex);
  if (variationMatch && variationMatch[2]) return variationMatch[2];
  return null;
};

const normalizeVkValue = rawValue => {
  if (typeof rawValue !== 'string') return null;
  const trimmed = rawValue.trim();
  if (!trimmed) return null;

  const labelMatch = trimmed.match(/^(?:vk|вк)\s*[:=]?\s*(.+)$/i);
  const hasVkLabel = Boolean(labelMatch);
  const hasVkDomain = /(?:^|[\s:=/])vk\.com(?:\/|\b)/i.test(trimmed);
  const hasExplicitId = /\b(?:id|club|public)\d+\b/i.test(trimmed);
  const isExplicitIdOnly = /^(?:id|club|public)\d+$/i.test(trimmed);

  if (!hasVkLabel && !hasVkDomain && !hasExplicitId && !isExplicitIdOnly) {
    return null;
  }

  let value = hasVkLabel ? labelMatch[1].trim() : trimmed;

  value = value
    .replace(/^https?:\/\/(?:www\.)?(?:m\.)?vk\.com\//i, '')
    .replace(/^vk\.com\//i, '')
    .replace(/^m\.vk\.com\//i, '')
    .replace(/^www\.vk\.com\//i, '');

  value = value.replace(/^@/, '');
  value = value.split(/[?#]/)[0];
  value = value.split('/')[0];
  value = value.replace(/\s+/g, '');

  if (!value) return null;

  if (/^id\d+$/i.test(value)) {
    return `id${value.slice(2)}`;
  }

  if (/^\d+$/.test(value)) {
    return `id${value}`;
  }

  return value;
};

const parseVk = value => normalizeVkValue(value);

const parseUserId = input => {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  const pattern = /(?:\bId\s*[:\s]+)(\w+)/i;
  const match = trimmed.match(pattern);
  const candidate = (match ? match[1] : trimmed).trim();
  const normalized = candidate.replace(/[+\s()-]/g, '');
  if (/^(?:0|380)\d{9}$/.test(normalized)) return null;
  const patterns = [
    /^AA\d{4}$/i,
    /^AB\d{4}$/i,
    /^AC\d{5}$/i,
    /^VK\d{5}$/i,
    /^-[A-Za-z0-9_-]{4,}$/,
    /^[A-Za-z0-9_-]{28}$/,
  ];
  if (patterns.some(p => p.test(candidate))) return candidate;
  return null;
};

const parseSearchIdExact = input => {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  return trimmed || null;
};

const parseGroupedSearchValues = input => {
  if (typeof input !== 'string') return [];
  const trimmed = input.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return [];

  const inside = trimmed.slice(1, -1);
  const matches = inside.match(/"[^"]+"|[^\s,;]+/g) || [];

  return matches
    .map(value => value.replace(/^"|"$/g, '').trim())
    .filter(Boolean);
};

const parseTelegramId = input => {
  const urlPattern = /t\.me\/([^/?#]+)/;
  const urlMatch = input.match(urlPattern);
  if (urlMatch && urlMatch[1]) return urlMatch[1];
  const atPattern = /^@(\w+)/;
  const atMatch = input.match(atPattern);
  if (atMatch && atMatch[1]) return atMatch[1];
  const textPattern = /(?:телеграм|телега|teleg|t(?=\s|:)|т(?=\s|:))\s*:?\s([a-zA-Z0-9._]+)/i;
  const textMatch = input.match(textPattern);
  if (textMatch && textMatch[1]) return textMatch[1];
  return null;
};

const parseOtherContact = input => {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // "other" має спрацьовувати лише на явну мітку, а не на будь-який текст.
  const labeledValue = trimmed.match(
    /(?:^|\b)(?:other|інше|додатковий\s*контакт|other\s*contact)\s*[:=]\s*(.+)$/i,
  );

  if (!labeledValue?.[1]) return null;
  return labeledValue[1].trim() || null;
};

const OTHER_SEARCH_FALLBACK_KEYS = [
  'userId',
  'facebook',
  'instagram',
  'telegram',
  'email',
  'tiktok',
  'phone',
  'vk',
  'name',
  'surname',
  'other',
];

export const detectSearchParams = query => {
  const parsedUkTrigger = parseUkTriggerQuery(query);
  if (parsedUkTrigger?.searchPair?.telegram) {
    return { key: 'telegram', value: parsedUkTrigger.searchPair.telegram };
  }

  const trimmed = query.trim();
  const parsers = [
    ['facebook', parseFacebookId],
    ['instagram', parseInstagramId],
    ['telegram', parseTelegramId],
    ['userId', parseUserId],
    ['email', parseEmail],
    ['tiktok', parseTikTokLink],
    ['phone', parsePhoneNumber],
    ['vk', parseVk],
    ['other', parseOtherContact],
  ];
  for (const [key, parser] of parsers) {
    const val = parser(trimmed);
    if (val) return { key, value: val };
  }
  return { key: 'name', value: trimmed };
};

const SearchBar = ({
  searchFunc,
  setUsers,
  setState,
  setUserNotFound,
  onSearchKey,
  search: externalSearch,
  setSearch: externalSetSearch,
  onClear,
  onSearchExecuted,
  wrapperStyle = {},
  leftIcon = SearchIcon,
  storageKey = 'searchQuery',
  filters = {},
  filterForload,
  favoriteUsers = {},
  dislikeUsers = {},
  enabledSearchKeys,
  searchOptions,
}) => {
  const [internalSearch, setInternalSearch] = useState(
    () => localStorage.getItem(storageKey) || '',
  );

  const search = externalSearch !== undefined ? externalSearch : internalSearch;
  const setSearch =
    externalSetSearch !== undefined ? externalSetSearch : setInternalSearch;

  const textareaRef = useRef(null);
  useAutoResize(textareaRef, search);

  const [history, setHistory] = useState(
    () => loadHistoryCache('queries') || [],
  );
  const [showHistory, setShowHistory] = useState(false);

  const isSearchEnabled = key => {
    if (!enabledSearchKeys) return true;
    return Boolean(enabledSearchKeys[key]);
  };

  const loadCachedResult = (key, value) => {
    if (typeof value === 'string' && value.startsWith('[') && value.endsWith(']')) {
      const inside = value.slice(1, -1);
      // eslint-disable-next-line no-useless-escape
      const matches = inside.match(/"[^\"]+"|[^\s,;]+/g) || [];
      const values = matches
        .map(v => v.replace(/^"|"$/g, '').trim())
        .filter(Boolean);
      if (values.length > 0) {
        const term = values.map(v => v).sort().join(',');
        const cacheKey = getCacheKey('search', normalizeQueryKey(`names=${term}`));
        const ids = getIdsByQuery(cacheKey);
        if (ids.length > 0) {
          const results = {};
          ids.forEach(id => {
            const card = getCard(id);
            if (card) results[id] = card;
          });
          if (Object.keys(results).length > 0) {
            setUserNotFound && setUserNotFound(false);
            setUsers && setUsers(results);
            return true;
          }
        }
      }
    }
    const cacheKey = getCacheKey('search', normalizeQueryKey(`${key}=${value}`));
    const ids = getIdsByQuery(cacheKey);
    if (ids.length > 0) {
      const cards = ids.map(id => getCard(id)).filter(Boolean);
      if (cards.length > 0) {
        setUserNotFound && setUserNotFound(false);
        if (key === 'name' || key === 'names' || cards.length > 1) {
          setState && setState({});
          const map = {};
          cards.forEach(c => {
            map[c.userId] = c;
          });
          setUsers && setUsers(map);
        } else {
          setState && setState(cards[0]);
        }
        return true;
      }
    }
    return false;
  };

  const isCacheFresh = (key, value) => {
    let cacheKey;
    if (typeof value === 'string' && value.startsWith('[') && value.endsWith(']')) {
      const inside = value.slice(1, -1);
      // eslint-disable-next-line no-useless-escape
      const matches = inside.match(/"[^\"]+"|[^\s,;]+/g) || [];
      const values = matches
        .map(v => v.replace(/^"|"$/g, '').trim())
        .filter(Boolean);
      if (values.length > 0) {
        const term = values.map(v => v).sort().join(',');
        cacheKey = getCacheKey('search', normalizeQueryKey(`names=${term}`));
      }
    } else {
      cacheKey = getCacheKey('search', normalizeQueryKey(`${key}=${value}`));
    }
    if (!cacheKey) return false;
    const queries = loadQueries();
    const entry = queries[cacheKey];
    if (!entry) return false;
    const timestampSource =
      typeof entry.cachedAt === 'number' && Number.isFinite(entry.cachedAt)
        ? entry.cachedAt
        : Number(entry.cachedAt ?? entry.lastAction ?? 0);
    if (!Number.isFinite(timestampSource) || timestampSource <= 0) {
      return false;
    }
    return Date.now() - timestampSource < TTL_MS;
  };

  const addToHistory = value => {
    const trimmedVal = value.trim();
    if (!trimmedVal) return;
    setHistory(prev => {
      const newHistory = [
        trimmedVal,
        ...prev.filter(v => v !== trimmedVal),
      ].slice(0, 5);
      saveHistoryCache('queries', newHistory);
      return newHistory;
    });
  };

  const removeFromHistory = (val, e) => {
    e.stopPropagation();
    setHistory(prev => {
      const newHistory = prev.filter(v => v !== val);
      saveHistoryCache('queries', newHistory);
      return newHistory;
    });
  };

  useEffect(() => {
    if (search) {
      localStorage.setItem(storageKey, search);
    } else {
      localStorage.removeItem(storageKey);
    }
  }, [search, storageKey]);

  useEffect(() => {
    if (search) {
      const { key, value } = detectSearchParams(search);
      console.log('[SearchBar] Restored persisted search', {
        raw: search,
        detectedKey: key,
        detectedValue: value,
      });
      loadCachedResult(key, value);
      writeData(search);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emitSearchLabel = params => {
    console.log('[SearchBar] Search label applied', params);
    onSearchKey && onSearchKey(params);
  };

  const pickUserFromResult = result => {
    if (!result || typeof result !== 'object') return null;
    if (Array.isArray(result)) return result[0] || null;
    if ('userId' in result) return result;
    return Object.values(result)[0] || null;
  };

  const collectFieldValues = fieldValue => {
    if (fieldValue === undefined || fieldValue === null) return [];
    if (Array.isArray(fieldValue)) {
      return fieldValue
        .map(item => collectFieldValues(item))
        .flat();
    }
    if (typeof fieldValue === 'object') {
      return Object.values(fieldValue)
        .map(item => collectFieldValues(item))
        .flat();
    }
    return [String(fieldValue)];
  };

  const findMatchedKeyValue = (result, fallbackParams, preferredKeys = []) => {
    const [fallbackKey, fallbackValue] = Object.entries(fallbackParams || {})[0] || [];
    if (!fallbackKey || fallbackValue === undefined || fallbackValue === null) return null;

    const user = pickUserFromResult(result);
    const normalizedSearch = String(fallbackValue).trim().toLowerCase();

    if (!user || !normalizedSearch) {
      return { key: fallbackKey, value: fallbackValue };
    }

    const candidateKeys = [...new Set([...preferredKeys, fallbackKey])];

    for (const key of candidateKeys) {
      if (!(key in user)) continue;
      const values = collectFieldValues(user[key]);
      const matchedValue = values.find(value =>
        value.trim().toLowerCase().includes(normalizedSearch)
      );

      if (matchedValue) {
        return { key, value: matchedValue };
      }
    }

    return { key: fallbackKey, value: fallbackValue };
  };

  const notifySearchResult = (params, result, options = {}) => {
    const matched = findMatchedKeyValue(
      result,
      params,
      options.preferredKeys,
    );

    if (!matched) return;
    toast.success(`Результат знайдено за ключем ${matched.key}: ${matched.value}`);
  };

  const cachedSearch = async params => {
    const res = await searchFunc(params, {
      ...(searchOptions || {}),
      forceEqualToAllCards: isSearchEnabled('equalToAllCards'),
    });
    if (!res || Object.keys(res).length === 0) {
      return res;
    }

    const [key, value] = Object.entries(params)[0] || [];
    const arr = Array.isArray(res)
      ? res
      : 'userId' in res
        ? [res]
        : Object.values(res);
    const updatedArr = arr.map(u => updateCard(u.userId, u));

    if (key && value) {
      const cacheKey = getCacheKey(
        'search',
        normalizeQueryKey(`${key}=${value}`),
      );
      setIdsForQuery(cacheKey, updatedArr.map(u => u.userId));
    }

    if (Array.isArray(res)) return updatedArr;
    if ('userId' in res) return updatedArr[0];
    return updatedArr.reduce((acc, card) => {
      acc[card.userId] = card;
      return acc;
    }, {});
  };

  const processUserSearch = async (platform, parseFunction, inputData, options = {}) => {
    const trimmedInput = inputData.trim();
    const id = parseFunction(trimmedInput);
    const { allowFallback = true } = options;

    console.log('[SearchBar] Parser evaluation', {
      platform,
      raw: inputData,
      trimmed: trimmedInput,
      parsed: id,
    });

    if (id) {
      const hasCache = loadCachedResult(platform, id);
      const freshCache = hasCache && isCacheFresh(platform, id);
      const result = { [platform]: id };
      emitSearchLabel(result);
      if (freshCache) {
        notifySearchResult(result, null, { preferredKeys: [platform] });
        return true;
      }
      if (!hasCache) {
        setState && setState({});
        setUsers && setUsers({});
      }
      const res = await cachedSearch(result);
      if (!res || Object.keys(res).length === 0) {
        if (platform === 'other' && allowFallback) {
          for (const fallbackKey of OTHER_SEARCH_FALLBACK_KEYS) {
            if (fallbackKey === 'other') continue;
            const fallbackParams = { [fallbackKey]: id };
            const fallbackHasCache = loadCachedResult(fallbackKey, id);
            const fallbackFreshCache = fallbackHasCache && isCacheFresh(fallbackKey, id);

            if (fallbackFreshCache) {
              emitSearchLabel(fallbackParams);
              notifySearchResult(fallbackParams, null, {
                preferredKeys: [fallbackKey],
              });
              return true;
            }

            const fallbackRes = await cachedSearch(fallbackParams);
            if (!fallbackRes || Object.keys(fallbackRes).length === 0) {
              continue;
            }

            emitSearchLabel(fallbackParams);
            notifySearchResult(fallbackParams, fallbackRes, {
              preferredKeys: [fallbackKey],
            });
            setUserNotFound && setUserNotFound(false);
            if ('userId' in fallbackRes) {
              setState && setState(fallbackRes);
            } else {
              setUsers && setUsers(fallbackRes);
            }
            return true;
          }

          // Якщо нічого не знайдено — для add профілю лишаємо найпріоритетніший ключ userId.
          emitSearchLabel({ userId: id });
        }
        setUserNotFound && setUserNotFound(true);
      } else {
        setUserNotFound && setUserNotFound(false);
        notifySearchResult(result, res, { preferredKeys: [platform] });
        if ('userId' in res) {
          setState && setState(res);
        } else {
          setUsers && setUsers(res);
        }
      }
      return true;
    }
    return false;
  };

  const writeData = async (query = search) => {
    setUserNotFound && setUserNotFound(false);
    const rawQuery = typeof query === 'string' ? query : '';
    const trimmed = rawQuery.trim();

    if (onSearchExecuted) {
      onSearchExecuted(trimmed);
    }

    if (typeof query === 'string') {
      console.log('[SearchBar] Incoming query', { raw: rawQuery, trimmed });
    }
    if (trimmed && !trimmed.startsWith('!')) {
      addToHistory(trimmed);
    }
    if (trimmed && trimmed.startsWith('!')) {
      const term = trimmed.slice(1).trim();
      const filtersKey = normalizeQueryKey(
        `${filterForload || 'all'}:${serializeQueryFilters(filters)}`,
      );
      console.log('[SearchBar] Detected bulk command search', {
        raw: trimmed,
        command: term,
        filtersKey,
      });
      const cacheKey = `allUsers:${filtersKey}`;
      const queries = loadQueries();
      const entry = queries[cacheKey];
      let ids = [];
      const timestampSource =
        typeof entry?.cachedAt === 'number' && Number.isFinite(entry.cachedAt)
          ? entry.cachedAt
          : Number(entry?.cachedAt ?? entry?.lastAction ?? 0);
      if (entry && Number.isFinite(timestampSource) && timestampSource > 0 && Date.now() - timestampSource < TTL_MS) {
        ids = getIdsByQuery(cacheKey);
      } else {
        if (entry) {
          delete queries[cacheKey];
          saveQueries(queries);
        }
        const { cacheFilteredUsers } = await import('./config');
        await cacheFilteredUsers(
          filterForload,
          filters,
          favoriteUsers,
          cacheKey,
          {
            includeSpecialFutureDates: true,
            dislikedUsers: dislikeUsers,
          },
        );
        ids = getIdsByQuery(cacheKey);
      }
      const results = searchCachedCards(term, ids);
      if (Object.keys(results).length === 0) {
        setState && setState({});
        setUsers && setUsers({});
        setUserNotFound && setUserNotFound(true);
      } else {
        setState && setState({});
        setUsers && setUsers(results);
        const searchKey = getCacheKey(
          'search',
          normalizeQueryKey(`${term}:${filtersKey}`),
        );
        setIdsForQuery(searchKey, Object.keys(results));
      }
      return;
    }
    if (trimmed && trimmed.startsWith('[') && trimmed.endsWith(']')) {
      const hasCache = loadCachedResult('name', trimmed);
      const freshCache = hasCache && isCacheFresh('name', trimmed);
      if (freshCache) return;
      setState && setState({});
      setUsers && setUsers({});

      const values = parseGroupedSearchValues(trimmed);
      if (values.length > 0) {
        console.log('[SearchBar] Processing grouped search', {
          raw: trimmed,
          cleanedValues: values,
        });

        const groupedSearchStrategies = [
          ['searchId', parseSearchIdExact],
          ['userId', parseUserId],
          ['facebook', parseFacebookId],
          ['instagram', parseInstagramId],
          ['telegram', parseTelegramId],
          ['email', parseEmail],
          ['tiktok', parseTikTokLink],
          ['phone', parsePhoneNumber],
          ['vk', parseVk],
          ['other', parseOtherContact],
        ].filter(([key]) => isSearchEnabled(key));

        const groupedNameEnabled =
          isSearchEnabled('nameGrouped') ||
          isSearchEnabled('nameExact') ||
          isSearchEnabled('nameWithoutPrefix') ||
          isSearchEnabled('nameWithPrefix');

        const results = {};
        for (const val of values) {
          let res = null;

          for (const [key, parser] of groupedSearchStrategies) {
            const parsedValue = parser(val);
            if (!parsedValue) continue;

            const groupedResult = await cachedSearch({ [key]: parsedValue });
            if (groupedResult && Object.keys(groupedResult).length > 0) {
              res = groupedResult;
              break;
            }
          }

          if (!res && groupedNameEnabled) {
            res = await cachedSearch({ name: val });
          }

          if (!res || Object.keys(res).length === 0) {
            results[`new_${val}`] = { _notFound: true, searchVal: val };
          } else if ('userId' in res) {
            results[res.userId] = res;
          } else {
            Object.assign(results, res);
          }
        }
        setUsers && setUsers(results);
        const term = values.map(v => v).sort().join(',');
        const ids = Object.keys(results).filter(id => !results[id]._notFound);
        setIdsForQuery(
          getCacheKey('search', normalizeQueryKey(`names=${term}`)),
          ids,
        );
        return;
      }
    }

    const ukTrigger = parseUkTriggerQuery(rawQuery);
    if (isSearchEnabled('telegramUkTrigger') && ukTrigger?.searchPair?.telegram) {
      const normalizedTelegram = ukTrigger.searchPair.telegram;
      const searchCandidates = [normalizedTelegram];
      if (ukTrigger.handle) {
        searchCandidates.push(ukTrigger.handle);
      }

      for (const [index, candidate] of searchCandidates.entries()) {
        const telegramValue = candidate?.trim();
        if (!telegramValue) continue;

        const hasCache = loadCachedResult('telegram', telegramValue);
        const freshCache = hasCache && isCacheFresh('telegram', telegramValue);

        if (index === 0) {
          emitSearchLabel({ telegram: telegramValue });
        }

        if (freshCache) return;

        if (!hasCache) {
          setState && setState({});
          setUsers && setUsers({});
        }

        const res = await cachedSearch({ telegram: telegramValue });
        if (res && Object.keys(res).length > 0) {
          notifySearchResult(
            { telegram: telegramValue },
            res,
            { preferredKeys: ['telegram'] },
          );
          setUserNotFound && setUserNotFound(false);
          if ('userId' in res) {
            setState && setState(res);
          } else {
            setUsers && setUsers(res);
          }
          return;
        }
      }
    }

    if (
      isSearchEnabled('searchId') &&
      await processUserSearch('searchId', parseSearchIdExact, rawQuery)
    ) return;
    if (
      isSearchEnabled('userId') &&
      await processUserSearch('userId', parseUserId, rawQuery)
    ) return;
    if (
      isSearchEnabled('facebook') &&
      await processUserSearch('facebook', parseFacebookId, rawQuery)
    ) return;
    if (
      isSearchEnabled('instagram') &&
      await processUserSearch('instagram', parseInstagramId, rawQuery)
    ) return;
    if (
      isSearchEnabled('telegram') &&
      await processUserSearch('telegram', parseTelegramId, rawQuery)
    ) return;
    if (
      isSearchEnabled('email') &&
      await processUserSearch('email', parseEmail, rawQuery)
    ) return;
    if (
      isSearchEnabled('tiktok') &&
      await processUserSearch('tiktok', parseTikTokLink, rawQuery)
    ) return;
    if (
      isSearchEnabled('phone') &&
      await processUserSearch('phone', parsePhoneNumber, rawQuery)
    ) return;
    if (
      isSearchEnabled('vk') &&
      await processUserSearch('vk', parseVk, rawQuery)
    ) return;
    if (
      isSearchEnabled('other') &&
      await processUserSearch('other', parseOtherContact, rawQuery, {
        allowFallback: isSearchEnabled('otherFallback'),
      })
    ) return;

    const canSearchName =
      isSearchEnabled('nameExact') ||
      isSearchEnabled('nameWithoutPrefix') ||
      isSearchEnabled('nameWithPrefix');

    if (!canSearchName) {
      setUserNotFound && setUserNotFound(true);
      return;
    }

    const nameTrim = rawQuery.trim();
    console.log('[SearchBar] Defaulting to name search', {
      raw: rawQuery,
      cleaned: nameTrim,
    });

    let res = null;

    if (isSearchEnabled('nameExact')) {
      const hasCache = loadCachedResult('name', nameTrim);
      const freshCache = hasCache && isCacheFresh('name', nameTrim);
      emitSearchLabel({ name: nameTrim });
      if (freshCache) {
        notifySearchResult({ name: nameTrim }, null, { preferredKeys: ['name'] });
        return;
      }
      if (!hasCache) {
        setState && setState({});
        setUsers && setUsers({});
      }
      res = await cachedSearch({ name: nameTrim });
    }

    if (!res && isSearchEnabled('nameWithoutPrefix')) {
      const cleanedQuery = rawQuery.replace(/^ук\s*см\s*/i, '').trim();
      if (cleanedQuery && cleanedQuery !== nameTrim) {
        console.log('[SearchBar] Retrying name search without prefix', {
          raw: rawQuery,
          cleaned: cleanedQuery,
        });
        res = await cachedSearch({ name: cleanedQuery });
        emitSearchLabel({ name: cleanedQuery });
      }
    }

    if (!res && isSearchEnabled('nameWithPrefix')) {
      const withPrefix = /^ук\s*см/i.test(rawQuery) ? null : `УК СМ ${rawQuery.trim()}`;
      if (withPrefix) {
        console.log('[SearchBar] Retrying name search with enforced prefix', {
          raw: rawQuery,
          cleaned: withPrefix,
        });
        res = await cachedSearch({ name: withPrefix });
        emitSearchLabel({ name: withPrefix });
      }
    }
    if (!res || Object.keys(res).length === 0) {
      setUserNotFound && setUserNotFound(true);
    } else {
      setUserNotFound && setUserNotFound(false);
      const searchValueForNotification =
        (res && typeof res === 'object' && res.name) || nameTrim;
      notifySearchResult(
        { name: searchValueForNotification },
        res,
        { preferredKeys: ['name'] },
      );
      if ('userId' in res) {
        setState && setState(res);
      } else {
        setUsers && setUsers(res);
      }
    }
  };

  return (
    <InputDiv style={wrapperStyle}>
      {leftIcon && <span style={{ marginRight: '5px' }}>{leftIcon}</span>}
      <InputFieldContainer value={search}>
        <InputField
          ref={textareaRef}
          rows={1}
          value={search || ''}
          onChange={e => setSearch(e.target.value)}
          onFocus={() => setShowHistory(true)}
          onBlur={() => {
            setTimeout(() => setShowHistory(false), 100);
            writeData();
          }}
        />
        {search && (
          <ClearButton
            onClick={() => {
              setSearch('');
              setUserNotFound && setUserNotFound(false);
              onClear && onClear();
            }}
          >
            &times;
          </ClearButton>
        )}
      </InputFieldContainer>
      {showHistory && history.length > 0 && (
        <HistoryList>
          {history.map(item => (
            <HistoryItem
              key={item}
              onMouseDown={e => e.preventDefault()}
              onClick={() => {
                if (!item.startsWith('!')) setSearch(item);
                setShowHistory(false);
                writeData(item);
              }}
            >
              <span>{item}</span>
              <HistoryRemove onClick={e => removeFromHistory(item, e)}>
                &times;
              </HistoryRemove>
            </HistoryItem>
          ))}
        </HistoryList>
      )}
    </InputDiv>
  );
};

export default SearchBar;
