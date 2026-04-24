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
  const rawInput = String(phone || '');
  const trimmed = rawInput.trim();
  if (!trimmed) return;

  const hasPhoneLabel = /(?:^|\b)(?:phone|телефон|тел|номер|моб)\b/i.test(trimmed);
  const hasLetters = /[A-Za-zА-Яа-яІіЇїЄєҐґ]/.test(trimmed);

  // Якщо в запиті є літери без явної мітки телефону,
  // не класифікуємо його як телефон (наприклад, "AA614").
  if (hasLetters && !hasPhoneLabel) return;

  const digitsOnly = trimmed.replace(/\D/g, '');
  if (!digitsOnly) return;
  if (digitsOnly.length < 4) return;

  // Для коротких фрагментів зберігаємо введене значення,
  // щоб підтримати пошук за частиною номера.
  if (digitsOnly.length < 10) return digitsOnly;

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
  if (!trimmed) return null;
  if (trimmed.includes('@')) return null;
  const pattern = /(?:\bId\s*[:\s]+)(\w+)/i;
  const match = trimmed.match(pattern);
  const candidate = (match ? match[1] : trimmed).trim();
  const normalized = candidate.replace(/[+\s()-]/g, '');
  if (/^(?:0|380)\d{9}$/.test(normalized)) return null;

  const partialIdPatterns = [
    /^AA\d{1,4}$/i,
    /^AB\d{1,4}$/i,
    /^AC\d{1,5}$/i,
    /^VK\d{1,5}$/i,
    /^-[A-Za-z0-9_-]{2,}$/,
  ];

  const exactIdPatterns = [
    /^AA\d{4}$/i,
    /^AB\d{4}$/i,
    /^AC\d{5}$/i,
    /^VK\d{5}$/i,
    /^-[A-Za-z0-9_-]{4,}$/,
    /^[A-Za-z0-9_-]{28}$/,
  ];

  const patterns = [...exactIdPatterns, ...partialIdPatterns];
  if (patterns.some(p => p.test(candidate))) return candidate;

  const genericUserIdPattern = /^[A-Za-z0-9_-]{4,40}$/;
  if (genericUserIdPattern.test(candidate)) {
    const hasLetters = /[A-Za-z]/.test(candidate);
    const hasDigits = /\d/.test(candidate);
    const hasMixedCase = /[a-z]/.test(candidate) && /[A-Z]/.test(candidate);

    if (hasLetters && (hasDigits || hasMixedCase)) {
      return candidate;
    }
  }

  return null;
};

const detectHttpSocialSearch = input => {
  if (typeof input !== 'string') return null;

  const trimmed = input.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;

  const socialParsers = [
    { platform: 'instagram', hostPattern: /(?:^|\.)instagram\.com$/i, parser: parseInstagramId },
    { platform: 'facebook', hostPattern: /(?:^|\.)facebook\.com$/i, parser: parseFacebookId },
    { platform: 'telegram', hostPattern: /(?:^|\.)t\.me$/i, parser: parseTelegramId },
    { platform: 'telegram', hostPattern: /(?:^|\.)telegram\.me$/i, parser: parseTelegramId },
    { platform: 'tiktok', hostPattern: /(?:^|\.)tiktok\.com$/i, parser: parseTikTokLink },
    { platform: 'vk', hostPattern: /(?:^|\.)vk\.com$/i, parser: parseVk },
    { platform: 'vk', hostPattern: /(?:^|\.)vkontakte\.ru$/i, parser: parseVk },
  ];

  let hostname = '';
  try {
    hostname = new URL(trimmed).hostname.toLowerCase();
  } catch (error) {
    return null;
  }

  for (const { platform, hostPattern, parser } of socialParsers) {
    if (!hostPattern.test(hostname)) continue;
    const parsedValue = parser(trimmed);
    if (parsedValue) {
      return { platform, value: parsedValue };
    }
  }

  return null;
};

const inferSearchIdPrefix = input => {
  const socialSearch = detectHttpSocialSearch(input);
  if (socialSearch?.platform) {
    return socialSearch.platform;
  }

  const prefixedParsers = [
    ['instagram', parseInstagramId],
    ['facebook', parseFacebookId],
    ['telegram', parseTelegramId],
    ['tiktok', parseTikTokLink],
    ['vk', parseVk],
    ['email', parseEmail],
    ['phone', parsePhoneNumber],
    ['other', parseOtherContact],
  ];

  for (const [prefix, parser] of prefixedParsers) {
    if (parser(input)) {
      return prefix;
    }
  }

  return null;
};

const SEARCH_ID_PREFIX_KEYS = [
  'instagram',
  'facebook',
  'email',
  'phone',
  'telegram',
  'tiktok',
  'other',
  'vk',
  'name',
  'surname',
  'lastAction',
  'getInTouch',
];

const SEARCH_ID_SCOPED_PLATFORMS = new Set([
  'instagram',
  'facebook',
  'email',
  'phone',
  'telegram',
  'tiktok',
  'other',
  'vk',
  'name',
  'surname',
  'lastAction',
  'getInTouch',
]);

const resolveSearchIdPrefixStrategy = (input, searchOptions = {}) => {
  const configuredPrefixes = Array.isArray(searchOptions?.searchIdPrefixes)
    ? [...new Set(
      searchOptions.searchIdPrefixes
        .map(prefix => (typeof prefix === 'string' ? prefix.trim() : ''))
        .filter(prefix => SEARCH_ID_PREFIX_KEYS.includes(prefix)),
    )]
    : [];

  const executionPlan = resolveExecutionPlan({
    allKeys: SEARCH_ID_PREFIX_KEYS,
    selectedKeys: configuredPrefixes,
    detectedKey: inferSearchIdPrefix(input),
    rawQuery: input,
  });

  return {
    primaryPrefixes: executionPlan.primaryKeys,
    fallbackPrefixes: executionPlan.fallbackKeys,
    shouldRetryWithFallbackPrefixes: executionPlan.fallbackKeys.length > 0,
  };
};

const parseSearchIdExact = input => {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  const urlParsers = [
    parseInstagramId,
    parseFacebookId,
    parseTelegramId,
    parseTikTokLink,
    parseVk,
  ];

  for (const parser of urlParsers) {
    const parsed = parser(trimmed);
    if (parsed) {
      return parsed;
    }
  }

  return trimmed;
};

const getParserForSearchKey = key => {
  return SEARCH_KEY_PARSERS[key] || (value => value?.trim());
};

const getParsedCandidatesForKey = (key, rawQuery) => {
  const parser = getParserForSearchKey(key);
  const parsedValue = parser(rawQuery);
  if (!parsedValue) return [];

  if (key === 'phone') {
    const normalizedPhone = parsePhoneNumber(rawQuery);
    return [...new Set([normalizedPhone, parsedValue].filter(Boolean))];
  }

  return [parsedValue];
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

const EQUAL_TO_SEARCH_PARSERS = {
  userId: parseUserId,
  facebook: parseFacebookId,
  instagram: parseInstagramId,
  telegram: parseTelegramId,
  email: parseEmail,
  tiktok: parseTikTokLink,
  phone: parsePhoneNumber,
  vk: parseVk,
  other: parseOtherContact,
  name: value => value?.trim(),
  surname: value => value?.trim(),
  getInTouch: value => value?.trim(),
  myComment: value => value?.trim(),
  lastAction: value => value?.trim(),
  lastLogin2: value => value?.trim(),
  createdAt: value => value?.trim(),
  cycleStatus: value => value?.trim(),
  lastCycle: value => value?.trim(),
  lastLogin: value => value?.trim(),
};

const SEARCH_KEY_PARSERS = {
  ...EQUAL_TO_SEARCH_PARSERS,
  searchId: parseSearchIdExact,
};

const DATE_LIKE_EQUAL_TO_KEYS = new Set([
  'getInTouch',
  'lastAction',
  'lastLogin2',
  'createdAt',
  'lastCycle',
  'lastLogin',
]);

const looksLikeDateQuery = value => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) return false;

  return [
    /^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/,
    /^\d{4}[./-]\d{1,2}[./-]\d{1,2}$/,
    /^\d{1,2}\s+[а-яіїєґa-z]+\s+\d{2,4}$/i,
  ].some(pattern => pattern.test(trimmed));
};

const prioritizeEqualToKeys = (keys, priorityKey) => {
  if (!Array.isArray(keys) || keys.length === 0) return [];
  if (!priorityKey || !keys.includes(priorityKey)) return [...keys];
  return [priorityKey, ...keys.filter(key => key !== priorityKey)];
};

const resolveExecutionPlan = ({ allKeys, selectedKeys, detectedKey, rawQuery, dateLikeKeys }) => {
  const normalizedSelectedKeys = Array.isArray(selectedKeys) ? selectedKeys : [];
  const isAllEnabled = normalizedSelectedKeys.length === allKeys.length;
  const isAllDisabled = normalizedSelectedKeys.length === 0;
  const baseKeys = isAllEnabled || isAllDisabled ? allKeys : normalizedSelectedKeys;

  const hasDateScopedKeys = dateLikeKeys instanceof Set;
  const queryLooksLikeDate = hasDateScopedKeys ? looksLikeDateQuery(rawQuery) : false;
  const filteredBaseKeys = hasDateScopedKeys
    ? baseKeys.filter(key =>
      queryLooksLikeDate ? dateLikeKeys.has(key) : !dateLikeKeys.has(key)
    )
    : baseKeys;
  const effectiveBaseKeys = filteredBaseKeys.length > 0 ? filteredBaseKeys : baseKeys;

  if (detectedKey && effectiveBaseKeys.includes(detectedKey)) {
    const prioritizedKeys = prioritizeEqualToKeys(effectiveBaseKeys, detectedKey);
    const shouldRunDetectedOnlyFirst = isAllEnabled || isAllDisabled;

    if (shouldRunDetectedOnlyFirst) {
      return {
        primaryKeys: [detectedKey],
        fallbackKeys: prioritizedKeys.filter(key => key !== detectedKey),
      };
    }

    return {
      primaryKeys: prioritizedKeys,
      fallbackKeys: [],
    };
  }

  return {
    primaryKeys: [...effectiveBaseKeys],
    fallbackKeys: [],
  };
};

const resolveEqualToExecutionKeys = ({ allKeys, selectedKeys, rawQuery }) => {
  const detectedParams = detectSearchParams(rawQuery);
  return resolveExecutionPlan({
    allKeys,
    selectedKeys,
    detectedKey: detectedParams?.key,
    rawQuery,
    dateLikeKeys: DATE_LIKE_EQUAL_TO_KEYS,
  });
};


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
  searchHistoryLimit = 5,
}) => {
  const activeSearchRequestRef = useRef(0);
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
    const effectiveEnabledSearchKeys =
      enabledSearchKeys && typeof enabledSearchKeys === 'object'
        ? enabledSearchKeys
        : searchOptions?.enabledSearchKeys;

    if (!effectiveEnabledSearchKeys) return true;
    return Boolean(effectiveEnabledSearchKeys[key]);
  };

  const resolveGroupedStrictKeySet = () => {
    const effectiveEnabledSearchKeys =
      enabledSearchKeys && typeof enabledSearchKeys === 'object'
        ? enabledSearchKeys
        : searchOptions?.enabledSearchKeys;

    if (!effectiveEnabledSearchKeys || typeof effectiveEnabledSearchKeys !== 'object') {
      return null;
    }

    const strictKeys = [
      'userId',
      'facebook',
      'instagram',
      'telegram',
      'email',
      'tiktok',
      'phone',
      'vk',
      'other',
    ].filter(key => Boolean(effectiveEnabledSearchKeys[key]));

    return strictKeys.length > 0 ? new Set(strictKeys) : null;
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
      ].slice(0, searchHistoryLimit);
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

  const emitSearchLabel = (params, meta = {}) => {
    console.log('[SearchBar] Search label applied', {
      ...meta,
      params,
    });
    onSearchKey && onSearchKey(params);
  };

  const notifySearchResult = () => {};

  const mergeSearchResultMap = (acc, res) => {
    if (!res || Object.keys(res).length === 0) return;
    if (Array.isArray(res)) {
      res.forEach(card => {
        if (card?.userId) {
          acc[card.userId] = card;
        }
      });
      return;
    }
    if ('userId' in res) {
      acc[res.userId] = res;
      return;
    }
    Object.assign(acc, res);
  };

  const runEqualToAllCardsSearch = async (rawQuery, isStaleRequest, resultMap = {}) => {
    const allEqualToKeys = Object.keys(EQUAL_TO_SEARCH_PARSERS);
    const selectedEqualToKeys = Array.isArray(searchOptions?.equalToKeys)
      ? searchOptions.equalToKeys.filter(key => allEqualToKeys.includes(key))
      : [];
    const equalToExecutionPlan = resolveEqualToExecutionKeys({
      allKeys: allEqualToKeys,
      selectedKeys: selectedEqualToKeys,
      rawQuery,
    });
    const keysToTry = [
      ...(equalToExecutionPlan.primaryKeys || []),
      ...(equalToExecutionPlan.fallbackKeys || []),
    ];

    let found = false;
    for (const equalToKey of keysToTry) {
      const candidates = getParsedCandidatesForKey(equalToKey, rawQuery);
      for (const parsedValue of candidates) {
        const res = await cachedSearch(
          { [equalToKey]: parsedValue },
          { forceEqualToAllCards: true },
        );
        if (isStaleRequest()) return { found, results: resultMap };
        if (!res || Object.keys(res).length === 0) continue;
        found = true;
        mergeSearchResultMap(resultMap, res);
      }
    }

    return { found, results: resultMap };
  };

  const runPartialUserIdSearch = async (rawQuery, isStaleRequest, resultMap = {}) => {
    const parsedUserId = parseUserId(rawQuery);
    if (!parsedUserId) return { found: false, results: resultMap };

    const partialResult = await cachedSearch(
      { userId: parsedUserId },
      { forcePartialUserIdSearch: true },
    );
    if (isStaleRequest()) return { found: false, results: resultMap };
    if (!partialResult || Object.keys(partialResult).length === 0) {
      return { found: false, results: resultMap };
    }

    mergeSearchResultMap(resultMap, partialResult);
    return { found: true, results: resultMap };
  };

  const runCombinedSearchForQuery = async (rawQuery, isStaleRequest, resultMap = {}) => {
    let foundCombinedResults = false;

    if (isSearchEnabled('partialUserId')) {
      const partialUserIdResult = await runPartialUserIdSearch(rawQuery, isStaleRequest, resultMap);
      if (isStaleRequest()) return { found: false, results: resultMap };
      if (partialUserIdResult.found) {
        foundCombinedResults = true;
      }
    }

    const searchIdInput = parseSearchIdExact(rawQuery);

    if (searchIdInput) {
      const searchIdPrefixStrategy = resolveSearchIdPrefixStrategy(searchIdInput, searchOptions);
      const prefixesToIterate =
        searchIdPrefixStrategy.primaryPrefixes?.length > 0
          ? searchIdPrefixStrategy.primaryPrefixes
          : searchIdPrefixStrategy.fallbackPrefixes || [];

      const searchIdResults = await Promise.all(
        prefixesToIterate.map(prefix =>
          cachedSearch(
            { searchId: searchIdInput },
            {
              forceEqualToAllCards: false,
              searchIdPrefixes: [prefix],
            },
          )
        )
      );
      if (isStaleRequest()) return { found: false, results: resultMap };

      searchIdResults.forEach(searchIdResult => {
        if (!searchIdResult || Object.keys(searchIdResult).length === 0) return;
        foundCombinedResults = true;
        mergeSearchResultMap(resultMap, searchIdResult);
      });
    }

    const equalToResult = await runEqualToAllCardsSearch(rawQuery, isStaleRequest, resultMap);
    if (isStaleRequest()) return { found: false, results: resultMap };
    if (equalToResult.found) {
      foundCombinedResults = true;
    }

    return { found: foundCombinedResults, results: resultMap };
  };

  const cachedSearch = async (params, extraOptions = {}) => {
    const res = await searchFunc(params, {
      ...(searchOptions || {}),
      forceEqualToAllCards: false,
      ...extraOptions,
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
    const {
      allowFallback = true,
      allowUkTrigger = false,
      continueOnMiss = false,
    } = options;

    console.log('[SearchBar] Parser evaluation', {
      platform,
      raw: inputData,
      trimmed: trimmedInput,
      parsed: id,
    });

    if (!id && platform === 'telegram' && allowUkTrigger) {
      const ukTrigger = parseUkTriggerQuery(trimmedInput);
      if (ukTrigger?.searchPair?.telegram) {
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
            emitSearchLabel({ telegram: telegramValue }, {
              mode: 'telegram',
              stage: 'uk-trigger',
              candidateIndex: index,
            });
          }

          if (freshCache) return true;

          if (!hasCache) {
            setState && setState({});
            setUsers && setUsers({});
          }

          const res = await cachedSearch(
            { telegram: telegramValue },
            { allowTelegramPrefixMatches: true },
          );
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
            return true;
          }
        }

        setUserNotFound && setUserNotFound(true);
        return true;
      }
    }

    if (id) {
      if (platform === 'userId') {
        const cachedCardByUserId = getCard(id);
        if (cachedCardByUserId) {
          const userIdCacheKey = getCacheKey(
            'search',
            normalizeQueryKey(`userId=${id}`),
          );
          setIdsForQuery(userIdCacheKey, [id]);
          setUserNotFound && setUserNotFound(false);
          emitSearchLabel({ userId: id }, {
            mode: platform,
            stage: 'local-card-cache',
          });
          notifySearchResult({ userId: id }, cachedCardByUserId, {
            preferredKeys: ['userId'],
          });
          setState && setState(cachedCardByUserId);
          return true;
        }
      }

      const hasCache = loadCachedResult(platform, id);
      const freshCache = hasCache && isCacheFresh(platform, id);
      const result = { [platform]: id };
      emitSearchLabel(result, { mode: platform, stage: 'initial' });
      if (freshCache) {
        notifySearchResult(result, null, { preferredKeys: [platform] });
        return true;
      }
      if (!hasCache) {
        setState && setState({});
        setUsers && setUsers({});
      }
      const searchIdPrefixStrategy =
        platform === 'searchId'
          ? resolveSearchIdPrefixStrategy(trimmedInput, searchOptions)
          : null;
      const primarySearchIdPrefixes = searchIdPrefixStrategy?.primaryPrefixes;
      const fallbackSearchIdPrefixes = searchIdPrefixStrategy?.fallbackPrefixes || [];
      const scopedSearchIdPrefixes =
        platform !== 'searchId' && SEARCH_ID_SCOPED_PLATFORMS.has(platform)
          ? [platform]
          : undefined;
      const mergeSearchResult = (acc, res) => {
        if (!res || Object.keys(res).length === 0) return;
        if (Array.isArray(res)) {
          res.forEach(card => {
            if (card?.userId) {
              acc[card.userId] = card;
            }
          });
          return;
        }
        if ('userId' in res) {
          acc[res.userId] = res;
          return;
        }
        Object.assign(acc, res);
      };

      let finalRes = null;
      if (platform === 'searchId') {
        const prefixesToIterate = primarySearchIdPrefixes || fallbackSearchIdPrefixes;
        const aggregatedResults = {};

        const prefixResults = await Promise.all(
          prefixesToIterate.map(prefix =>
            cachedSearch(result, {
              forceEqualToAllCards: false,
              searchIdPrefixes: [prefix],
            })
          )
        );

        prefixResults.forEach(partialRes => {
          mergeSearchResult(aggregatedResults, partialRes);
        });

        if (Object.keys(aggregatedResults).length > 0) {
          setUserNotFound && setUserNotFound(false);
          setState && setState({});
          setUsers && setUsers({ ...aggregatedResults });
        }

        finalRes = Object.keys(aggregatedResults).length > 0 ? aggregatedResults : null;
      } else {
        finalRes = await cachedSearch(result, {
          ...(scopedSearchIdPrefixes ? { searchIdPrefixes: scopedSearchIdPrefixes } : {}),
          forceEqualToAllCards: false,
        });
      }

      if (!finalRes || Object.keys(finalRes).length === 0) {
        if (platform === 'other' && allowFallback) {
          for (const fallbackKey of OTHER_SEARCH_FALLBACK_KEYS) {
            if (fallbackKey === 'other') continue;
            const fallbackParams = { [fallbackKey]: id };
            const fallbackHasCache = loadCachedResult(fallbackKey, id);
            const fallbackFreshCache = fallbackHasCache && isCacheFresh(fallbackKey, id);

            if (fallbackFreshCache) {
              emitSearchLabel(fallbackParams, {
                mode: platform,
                stage: 'fallback',
                fallbackKey,
                source: 'other-fallback',
              });
              notifySearchResult(fallbackParams, null, {
                preferredKeys: [fallbackKey],
              });
              return true;
            }

            const fallbackRes = await cachedSearch(fallbackParams);
            if (!fallbackRes || Object.keys(fallbackRes).length === 0) {
              continue;
            }

            emitSearchLabel(fallbackParams, {
              mode: platform,
              stage: 'fallback',
              fallbackKey,
              source: 'other-fallback',
            });
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
          emitSearchLabel({ userId: id }, {
            mode: platform,
            stage: 'fallback',
            source: 'other-fallback-default',
          });
        }
        setUserNotFound && setUserNotFound(true);
        return !continueOnMiss;
      } else {
        setUserNotFound && setUserNotFound(false);
        notifySearchResult(result, finalRes, { preferredKeys: [platform] });
        if ('userId' in finalRes) {
          setState && setState(finalRes);
        } else {
          setUsers && setUsers(finalRes);
        }
        return true;
      }
    }
    return false;
  };

  const writeData = async (query = search) => {
    const requestId = ++activeSearchRequestRef.current;
    const isStaleRequest = () => activeSearchRequestRef.current !== requestId;

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
        if (isStaleRequest()) return;
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
    const groupedStrictKeySet = resolveGroupedStrictKeySet();
    const isCombinedSearchMode =
      !groupedStrictKeySet &&
      isSearchEnabled('searchId') &&
      isSearchEnabled('equalToAllCards');

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

        if (isCombinedSearchMode) {
          const combinedGroupedResults = {};
          let foundCombinedGroupedResults = false;

          for (const val of values) {
            const combinedResult = await runCombinedSearchForQuery(
              val,
              isStaleRequest,
              combinedGroupedResults,
            );
            if (isStaleRequest()) return;
            if (combinedResult.found) {
              foundCombinedGroupedResults = true;
            }
          }

          if (foundCombinedGroupedResults && Object.keys(combinedGroupedResults).length > 0) {
            setUserNotFound && setUserNotFound(false);
            setState && setState({});
            setUsers && setUsers({ ...combinedGroupedResults });
          } else {
            setState && setState({});
            setUsers && setUsers({});
            setUserNotFound && setUserNotFound(true);
          }

          const term = values.map(v => v).sort().join(',');
          const ids = Object.keys(combinedGroupedResults);
          setIdsForQuery(
            getCacheKey('search', normalizeQueryKey(`names=${term}`)),
            ids,
          );
          return;
        }

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
        ].filter(([key]) => {
          if (groupedStrictKeySet) return groupedStrictKeySet.has(key);
          return isSearchEnabled(key);
        });

        const results = {};
        for (const val of values) {
          let res = null;
          const combinedPerValueResults = {};
          let foundCombinedPerValue = false;
          if (!isCombinedSearchMode && isSearchEnabled('partialUserId')) {
            const partialPerValueResult = await runPartialUserIdSearch(
              val,
              isStaleRequest,
            );
            if (isStaleRequest()) return;
            if (partialPerValueResult.found) {
              res = partialPerValueResult.results;
            }
          }

          for (const [key, parser] of groupedSearchStrategies) {
            if (res && Object.keys(res).length > 0) {
              break;
            }
            const parsedValue = parser(val);
            if (!parsedValue) continue;

            const groupedResult = await cachedSearch({ [key]: parsedValue });
            if (isStaleRequest()) return;
            if (groupedResult && Object.keys(groupedResult).length > 0) {
              if (isCombinedSearchMode) {
                foundCombinedPerValue = true;
                mergeSearchResultMap(combinedPerValueResults, groupedResult);
                continue;
              }

              res = groupedResult;
              break;
            }
          }

          if (isCombinedSearchMode) {
            const equalToCombinedResult = await runEqualToAllCardsSearch(
              val,
              isStaleRequest,
              combinedPerValueResults,
            );
            if (isStaleRequest()) return;
            if (equalToCombinedResult.found) {
              foundCombinedPerValue = true;
            }

            if (foundCombinedPerValue && Object.keys(combinedPerValueResults).length > 0) {
              res = combinedPerValueResults;
            }
          }

          if (!res) {
            res = await cachedSearch({ name: val });
            if (isStaleRequest()) return;
          }

          if (!res || Object.keys(res).length === 0) {
            const fallbackSearchVal = isSearchEnabled('phone')
              ? parsePhoneNumber(val) || val
              : val;
            results[`new_${fallbackSearchVal}`] = {
              _notFound: true,
              searchVal: fallbackSearchVal,
            };
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

    if (isCombinedSearchMode) {
      const combinedResults = {};
      const combinedResult = await runCombinedSearchForQuery(rawQuery, isStaleRequest, combinedResults);
      if (isStaleRequest()) return;

      if (combinedResult.found) {
        setUserNotFound && setUserNotFound(false);
        setState && setState({});
        setUsers && setUsers({ ...combinedResults });
      } else {
        setUserNotFound && setUserNotFound(true);
      }
      return;
    }

    if (isSearchEnabled('partialUserId')) {
      const partialUserIdResult = await runPartialUserIdSearch(rawQuery, isStaleRequest);
      if (isStaleRequest()) return;
      if (partialUserIdResult.found) {
        setUserNotFound && setUserNotFound(false);
        setState && setState({});
        setUsers && setUsers({ ...partialUserIdResult.results });
        return;
      }
    }

    const looksLikeExactUserId = Boolean(parseUserId(rawQuery));
    if (
      looksLikeExactUserId &&
      isSearchEnabled('userId') &&
      await processUserSearch('userId', parseUserId, rawQuery, {
        continueOnMiss: true,
      })
    ) return;

    if (
      isSearchEnabled('searchId') &&
      await processUserSearch('searchId', parseSearchIdExact, rawQuery)
    ) return;

    if (isSearchEnabled('equalToAllCards')) {
      const allEqualToKeys = Object.keys(EQUAL_TO_SEARCH_PARSERS);
      const selectedEqualToKeys = Array.isArray(searchOptions?.equalToKeys)
        ? searchOptions.equalToKeys.filter(key => allEqualToKeys.includes(key))
        : [];
      const equalToExecutionPlan = resolveEqualToExecutionKeys({
        allKeys: allEqualToKeys,
        selectedKeys: selectedEqualToKeys,
        rawQuery,
      });
      const primaryEqualToKeys = equalToExecutionPlan.primaryKeys || [];
      const fallbackEqualToKeys = equalToExecutionPlan.fallbackKeys || [];
      const aggregatedResults = {};
      let foundEqualToResults = false;
      let emittedProgressiveResults = false;
      let usedFreshEqualToCache = false;

      for (const equalToKey of primaryEqualToKeys) {
        const candidates = getParsedCandidatesForKey(equalToKey, rawQuery);
        for (const parsedValue of candidates) {
          const queryParams = { [equalToKey]: parsedValue };
          emitSearchLabel(queryParams, {
            mode: 'equalToAllCards',
            stage: 'primary',
            key: equalToKey,
            selectedKeysCount: selectedEqualToKeys.length,
          });
          const hasCache = loadCachedResult(equalToKey, parsedValue);
          const freshCache = hasCache && isCacheFresh(equalToKey, parsedValue);
          if (freshCache) {
            usedFreshEqualToCache = true;
            foundEqualToResults = true;
            continue;
          }

          const res = await cachedSearch(queryParams, {
            forceEqualToAllCards: true,
          });
          if (isStaleRequest()) return;
          if (!res || Object.keys(res).length === 0) {
            continue;
          }

          foundEqualToResults = true;

          if (Array.isArray(res)) {
            res.forEach(card => {
              if (card?.userId) {
                aggregatedResults[card.userId] = card;
              }
            });
          } else if ('userId' in res) {
            aggregatedResults[res.userId] = res;
          } else {
            Object.assign(aggregatedResults, res);
          }

          if (Object.keys(aggregatedResults).length > 0) {
            setUserNotFound && setUserNotFound(false);
            if (!emittedProgressiveResults) {
              setState && setState({});
              emittedProgressiveResults = true;
            }
            setUsers && setUsers({ ...aggregatedResults });
          }
        }
      }

      if (fallbackEqualToKeys.length > 0) {
        for (const equalToKey of fallbackEqualToKeys) {
          const candidates = getParsedCandidatesForKey(equalToKey, rawQuery);
          for (const parsedValue of candidates) {
            const queryParams = { [equalToKey]: parsedValue };
            emitSearchLabel(queryParams, {
              mode: 'equalToAllCards',
              stage: 'fallback',
              key: equalToKey,
              selectedKeysCount: selectedEqualToKeys.length,
            });
            const hasCache = loadCachedResult(equalToKey, parsedValue);
            const freshCache = hasCache && isCacheFresh(equalToKey, parsedValue);
            if (freshCache) {
              usedFreshEqualToCache = true;
              foundEqualToResults = true;
              continue;
            }

            const res = await cachedSearch(queryParams, {
              forceEqualToAllCards: true,
            });
            if (isStaleRequest()) return;
            if (!res || Object.keys(res).length === 0) {
              continue;
            }

            foundEqualToResults = true;

            if (Array.isArray(res)) {
              res.forEach(card => {
                if (card?.userId) {
                  aggregatedResults[card.userId] = card;
                }
              });
            } else if ('userId' in res) {
              aggregatedResults[res.userId] = res;
            } else {
              Object.assign(aggregatedResults, res);
            }

            if (Object.keys(aggregatedResults).length > 0) {
              setUserNotFound && setUserNotFound(false);
              if (!emittedProgressiveResults) {
                setState && setState({});
                emittedProgressiveResults = true;
              }
              setUsers && setUsers({ ...aggregatedResults });
            }
          }
        }
      }

      if (foundEqualToResults) {
        if (usedFreshEqualToCache && Object.keys(aggregatedResults).length === 0) {
          setUserNotFound && setUserNotFound(false);
          return;
        }

        setUserNotFound && setUserNotFound(false);
        setState && setState({});
        setUsers && setUsers(aggregatedResults);

        const [firstMatchedKey] = Object.keys(aggregatedResults);
        if (firstMatchedKey) {
          const sampleCard = aggregatedResults[firstMatchedKey];
          const sampleParams = [...primaryEqualToKeys, ...fallbackEqualToKeys].reduce((acc, key) => {
            const parser = EQUAL_TO_SEARCH_PARSERS[key] || (value => value?.trim());
            const parsedValue = parser(rawQuery);
            if (parsedValue) {
              acc[key] = parsedValue;
            }
            return acc;
          }, {});
          notifySearchResult(sampleParams, sampleCard, {
            preferredKeys: [...primaryEqualToKeys, ...fallbackEqualToKeys],
          });
        }

        return;
      }
    }


    if (
      !looksLikeExactUserId &&
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
      await processUserSearch('telegram', parseTelegramId, rawQuery, {
        allowUkTrigger: true,
      })
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
        allowFallback: Boolean(searchOptions?.autoOtherFallback),
      })
    ) return;

    const nameTrim = rawQuery.trim();
    console.log('[SearchBar] Defaulting to name search', {
      raw: rawQuery,
      cleaned: nameTrim,
    });

    const hasCache = loadCachedResult('name', nameTrim);
    const freshCache = hasCache && isCacheFresh('name', nameTrim);
    emitSearchLabel({ name: nameTrim }, { mode: 'name', stage: 'default' });
    if (freshCache) {
      notifySearchResult({ name: nameTrim }, null, { preferredKeys: ['name'] });
      return;
    }
    if (!hasCache) {
      setState && setState({});
      setUsers && setUsers({});
    }

    const res = await cachedSearch({ name: nameTrim });
    if (isStaleRequest()) return;
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
