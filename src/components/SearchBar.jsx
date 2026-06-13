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
import { SEARCH_ID_INDEXED_FIELDS, normalizeSearchIdInput } from '../utils/searchKeyUtils';

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


const parseAmebloId = input => {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  const amebloRegex = /ameblo\.jp\/([^/?#]+)/i;
  const amebloMatch = trimmed.match(amebloRegex);
  if (amebloMatch?.[1]) return amebloMatch[1];

  const labeledRegex = /(?:^|[^A-Za-z0-9Ѐ-ӿ_])(ameblo|амебло)(?:\s*:\s*|\s+)([A-Za-z0-9][A-Za-z0-9._-]*)/i;
  const labeledMatch = trimmed.match(labeledRegex);
  if (labeledMatch?.[2]) return labeledMatch[2];

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

const parseLinkedInId = input => {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (!/(?:linkedin|linked\s*in|лінкедін|линкедин)/i.test(trimmed)) return null;
  return normalizeSearchIdInput('linkedin', trimmed) || null;
};

const parseYoutubeId = input => {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (!/(?:youtube|youtu\.?be|yt|ютуб)/i.test(trimmed)) return null;
  return normalizeSearchIdInput('youtube', trimmed) || null;
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
  if (match) return candidate;

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

  // Невизначені буквено-цифрові значення не вважаємо userId:
  // fallback у detectSearchParamsByQueryContent збереже їх у key "name".
  return null;
};

export const parsePartialUserIdPrefix = input => {
  const parsedUserId = parseUserId(input);
  if (parsedUserId) return parsedUserId;

  if (typeof input !== 'string') return null;
  const candidate = input.trim();
  if (!candidate) return null;

  // RTDB keys cannot contain these characters, and the partial userId mode
  // searches by the beginning of the users/newUsers catalog key exactly as typed.
  if (/[.#$[\]/\s]/.test(candidate)) return null;

  const normalizedPhone = candidate.replace(/[+\s()-]/g, '');
  if (/^(?:0|380)\d{9}$/.test(normalizedPhone)) return null;

  if (/^[A-Za-z0-9_-]{3,}$/.test(candidate)) return candidate;

  return null;
};

const detectHttpSocialSearch = input => {
  if (typeof input !== 'string') return null;

  const trimmed = input.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;

  const socialParsers = [
    { platform: 'instagram', hostPattern: /(?:^|\.)instagram\.com$/i, parser: parseInstagramId },
    { platform: 'ameblo', hostPattern: /(?:^|\.)ameblo\.jp$/i, parser: parseAmebloId },
    { platform: 'facebook', hostPattern: /(?:^|\.)facebook\.com$/i, parser: parseFacebookId },
    { platform: 'telegram', hostPattern: /(?:^|\.)t\.me$/i, parser: parseTelegramId },
    { platform: 'telegram', hostPattern: /(?:^|\.)telegram\.me$/i, parser: parseTelegramId },
    { platform: 'tiktok', hostPattern: /(?:^|\.)tiktok\.com$/i, parser: parseTikTokLink },
    { platform: 'linkedin', hostPattern: /(?:^|\.)linkedin\.com$/i, parser: parseLinkedInId },
    { platform: 'youtube', hostPattern: /(?:^|\.)youtube\.com$/i, parser: parseYoutubeId },
    { platform: 'youtube', hostPattern: /(?:^|\.)youtu\.be$/i, parser: parseYoutubeId },
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
    ['ameblo', parseAmebloId],
    ['facebook', parseFacebookId],
    ['telegram', parseTelegramId],
    ['tiktok', parseTikTokLink],
    ['linkedin', parseLinkedInId],
    ['youtube', parseYoutubeId],
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

const SEARCH_ID_PREFIX_KEYS = [...SEARCH_ID_INDEXED_FIELDS];

const SEARCH_ID_SCOPED_PLATFORMS = new Set(SEARCH_ID_PREFIX_KEYS);

const CONTACT_SEARCH_LABEL_KEYS = new Set([
  'instagram',
  'ameblo',
  'facebook',
  'telegram',
  'email',
  'tiktok',
  'linkedin',
  'youtube',
  'twitter',
  'line',
  'otherLink',
  'phone',
  'vk',
  'other',
]);

const WEAK_FALLBACK_SEARCH_LABEL_KEYS = new Set(['name', 'surname']);

const getFirstSearchParamKey = params => {
  if (!params || typeof params !== 'object') return null;
  return Object.keys(params).find(key => {
    const value = params[key];
    if (Array.isArray(value)) return value.length > 0;
    return value !== undefined && value !== null && String(value).trim() !== '';
  }) || null;
};

const resolveSearchParamValue = (params, key) => {
  if (!params || !key) return '';
  const value = params[key];
  return Array.isArray(value) ? String(value[0] || '').trim() : String(value || '').trim();
};

const resolveSearchLabelKey = label => label?.key || getFirstSearchParamKey(label?.params);

const resolveDetectedContactParams = rawSearch => {
  const trimmed = String(rawSearch || '').trim();
  if (!trimmed) return null;

  const detectedParams = detectSearchParams(trimmed);
  return CONTACT_SEARCH_LABEL_KEYS.has(detectedParams?.key) ? detectedParams : null;
};

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
    parseLinkedInId,
    parseYoutubeId,
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

export const parseExplicitSearchKeyCandidate = (key, rawQuery) => {
  const parser = getParserForSearchKey(key);
  const parsedValue = parser(rawQuery);
  if (parsedValue) return parsedValue;

  if (!SEARCH_ID_INDEXED_FIELDS.has(key)) return null;
  return normalizeSearchIdInput(key, rawQuery) || null;
};

const getParsedCandidatesForKey = (key, rawQuery) => {
  const parsedValue = parseExplicitSearchKeyCandidate(key, rawQuery);
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

export const parseTelegramSearchValue = input => {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  const urlPattern = /t\.me\/([^/?#]+)/;
  const urlMatch = trimmed.match(urlPattern);
  if (urlMatch && urlMatch[1]) return urlMatch[1];
  const atPattern = /^@(\w+)/;
  const atMatch = trimmed.match(atPattern);
  if (atMatch && atMatch[1]) return atMatch[1];
  const textPattern = /(?:telegram|tg|телеграм|телега|teleg|t(?=\s|:)|т(?=\s|:))\s*:?\s@?([a-zA-Z0-9._]+)/i;
  const textMatch = trimmed.match(textPattern);
  if (textMatch && textMatch[1]) return textMatch[1];
  return null;
};

const parseTelegramId = parseTelegramSearchValue;

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

const normalizeGenericUrl = input => {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  const hasScheme = /^https?:\/\//i.test(trimmed);
  const candidate = hasScheme ? trimmed : `https://${trimmed}`;

  let parsed;
  try {
    parsed = new URL(candidate);
  } catch (error) {
    return null;
  }

  if (!parsed.hostname || !parsed.hostname.includes('.')) return null;
  const normalizedHost = parsed.hostname.toLowerCase().replace(/^www\./, '');
  const normalizedPath = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/+$/, '');
  const normalized = `https://${normalizedHost}${normalizedPath}${parsed.search || ''}${parsed.hash || ''}`;
  return normalized;
};

const parseTwitterId = input => {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/(?:twitter\.com|x\.com)\/@?([A-Za-z0-9_]{1,15})/i);
  if (match?.[1]) return match[1].toLowerCase();
  const labelMatch = trimmed.match(/(?:twitter|x)\s*:?\s*@?([A-Za-z0-9_]{1,15})/i);
  return labelMatch?.[1]?.toLowerCase() || null;
};

const parseLineId = input => {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/line\.me\/(?:ti\/p\/)?@?([A-Za-z0-9._-]+)/i);
  if (match?.[1]) return match[1];
  const labelMatch = trimmed.match(/(?:^|\b)(?:line|лайн)\s*:?\s*@?([A-Za-z0-9._-]+)/i);
  return labelMatch?.[1] || null;
};

const OTHER_SEARCH_FALLBACK_KEYS = [
  'userId',
  'facebook',
  'instagram',
  'telegram',
  'email',
  'tiktok',
  'twitter',
  'line',
  'otherLink',
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
  ameblo: parseAmebloId,
  telegram: parseTelegramId,
  email: parseEmail,
  tiktok: parseTikTokLink,
  linkedin: value => normalizeSearchIdInput('linkedin', value),
  youtube: value => normalizeSearchIdInput('youtube', value),
  twitter: parseTwitterId,
  line: parseLineId,
  otherLink: normalizeGenericUrl,
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

const SEARCH_KEY_BUCKET_SEARCH_PARSERS = {
  lastAction: value => value?.trim(),
  getInTouch: value => value?.trim(),
};

const SEARCH_KEY_PARSERS = {
  ...EQUAL_TO_SEARCH_PARSERS,
  ...SEARCH_KEY_BUCKET_SEARCH_PARSERS,
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

export const resolveExecutionPlan = ({ allKeys, selectedKeys, detectedKey, rawQuery, dateLikeKeys }) => {
  const normalizedSelectedKeys = Array.isArray(selectedKeys) ? selectedKeys : [];
  const hasSelectedKeys = normalizedSelectedKeys.length > 0;
  const baseKeys = hasSelectedKeys ? normalizedSelectedKeys : allKeys;

  const hasDateScopedKeys = dateLikeKeys instanceof Set;
  const queryLooksLikeDate = hasDateScopedKeys ? looksLikeDateQuery(rawQuery) : false;
  const shouldApplyDateScope = hasDateScopedKeys && !hasSelectedKeys;
  const filteredBaseKeys = shouldApplyDateScope
    ? baseKeys.filter(key =>
      queryLooksLikeDate ? dateLikeKeys.has(key) : !dateLikeKeys.has(key)
    )
    : baseKeys;
  const effectiveBaseKeys = filteredBaseKeys.length > 0 ? filteredBaseKeys : baseKeys;

  return {
    primaryKeys: prioritizeEqualToKeys(effectiveBaseKeys, detectedKey),
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


export const detectSearchParamsByQueryContent = query => {
  const trimmed = query.trim();
  const parsers = [
    ['facebook', parseFacebookId],
    ['instagram', parseInstagramId],
    ['ameblo', parseAmebloId],
    ['telegram', parseTelegramId],
    ['userId', parseUserId],
    ['email', parseEmail],
    ['tiktok', parseTikTokLink],
    ['phone', parsePhoneNumber],
    ['vk', parseVk],
    ['twitter', parseTwitterId],
    ['line', parseLineId],
    ['otherLink', normalizeGenericUrl],
    ['other', parseOtherContact],
  ];
  for (const [key, parser] of parsers) {
    const val = parser(trimmed);
    if (val) return { key, value: val };
  }
  return { key: 'name', value: trimmed };
};

export const detectSearchParams = query => detectSearchParamsByQueryContent(query);



const normalizeComparableSearchValue = (key, value) => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (SEARCH_ID_INDEXED_FIELDS.has(key)) {
    return normalizeSearchIdInput(key, raw).toLowerCase();
  }
  return raw.replace(/\s+/g, ' ').toLowerCase();
};

const EXACT_SEARCH_ID_VALIDATION_FIELDS = new Set(
  [...SEARCH_ID_INDEXED_FIELDS].filter(key => key !== 'name' && key !== 'surname' && key !== 'phone'),
);

const normalizeDateComparableValue = value => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';

  const numericDate = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (numericDate) {
    const [, day, month, year] = numericDate;
    const fullYear = year.length === 2 ? `20${year}` : year;
    return `${fullYear.padStart(4, '0')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  const isoDate = raw.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
  if (isoDate) {
    const [, year, month, day] = isoDate;
    return `${year.padStart(4, '0')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  const timestamp = Number(raw);
  if (Number.isFinite(timestamp) && timestamp > 0) {
    const millis = timestamp < 10000000000 ? timestamp * 1000 : timestamp;
    const date = new Date(millis);
    if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  }

  const date = new Date(raw);
  if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);

  return raw.replace(/\s+/g, ' ').toLowerCase();
};

const isDateSearchValidationKey = key =>
  DATE_LIKE_EQUAL_TO_KEYS.has(key) || SEARCH_KEY_BUCKET_SEARCH_PARSERS[key];

const shouldUseExactFieldValidation = (key, expected, options = {}) => {
  if (options.forceEqualToAllCards) return true;
  if (isDateSearchValidationKey(key)) return true;
  if (key === 'phone') return String(expected || '').replace(/\D/g, '').length >= 10;
  return EXACT_SEARCH_ID_VALIDATION_FIELDS.has(key);
};

const getCardFieldValues = (card, key) => {
  if (!card || !key) return [];
  if (key === 'searchId') return [];
  const value = key === 'userId' ? card.userId : card[key];
  if (Array.isArray(value)) return value.filter(item => item !== undefined && item !== null);
  if (value === undefined || value === null) return [];
  return [value];
};

const normalizeResultToCards = result => {
  if (!result || Object.keys(result).length === 0) return [];
  if (Array.isArray(result)) return result.filter(Boolean);
  if ('userId' in result) return [result];
  return Object.values(result).filter(Boolean);
};

const cardsToResultShape = (cards, originalResult) => {
  if (Array.isArray(originalResult)) return cards;
  if ('userId' in (originalResult || {})) return cards[0] || {};
  return cards.reduce((acc, card) => {
    if (card?.userId) acc[card.userId] = card;
    return acc;
  }, {});
};

export const doesCardMatchSearchParams = (card, params = {}, options = {}) => {
  const [[key, value]] = Object.entries(params || {});
  if (!key || value === undefined || value === null || String(value).trim() === '') return true;

  if (key === 'searchId') {
    const prefixes = Array.isArray(options.searchIdPrefixes) && options.searchIdPrefixes.length > 0
      ? options.searchIdPrefixes
      : [inferSearchIdPrefix(value)].filter(Boolean);
    if (prefixes.length === 0) return true;
    return prefixes.some(prefix => doesCardMatchSearchParams(card, { [prefix]: value }, options));
  }

  if (key === 'userId') {
    const cardUserId = String(card?.userId || '').trim();
    const expectedUserId = String(value || '').trim();
    return options.forcePartialUserIdSearch ? cardUserId.startsWith(expectedUserId) : cardUserId === expectedUserId;
  }

  const expected = normalizeComparableSearchValue(key, value);
  if (!expected) return true;
  const fieldValues = getCardFieldValues(card, key);
  if (fieldValues.length === 0) return false;

  return fieldValues.some(fieldValue => {
    if (isDateSearchValidationKey(key)) {
      const normalizedDateFieldValue = normalizeDateComparableValue(fieldValue);
      const normalizedDateExpected = normalizeDateComparableValue(value);
      return Boolean(normalizedDateFieldValue && normalizedDateExpected && normalizedDateFieldValue === normalizedDateExpected);
    }

    const normalizedFieldValue = normalizeComparableSearchValue(key, fieldValue);
    if (!normalizedFieldValue) return false;
    if (key === 'telegram' && options.allowTelegramPrefixMatches) {
      return normalizedFieldValue.startsWith(expected);
    }
    if (shouldUseExactFieldValidation(key, expected, options)) return normalizedFieldValue === expected;
    return normalizedFieldValue.includes(expected);
  });
};

export const filterSearchResultByParams = (result, params = {}, options = {}) => {
  const cards = normalizeResultToCards(result);
  if (cards.length === 0) return result;
  const filteredCards = cards.filter(card => doesCardMatchSearchParams(card, params, options));
  if (filteredCards.length === cards.length) return result;
  return cardsToResultShape(filteredCards, result);
};

export const getSelectedAdvancedSearchModes = (searchOptions = {}, isSearchEnabled = () => true) => {
  const enabledKeys = searchOptions?.enabledSearchKeys;
  const isExplicitlyEnabled = key =>
    enabledKeys && typeof enabledKeys === 'object' && Boolean(enabledKeys[key]);

  return [
    (searchOptions?.enablePartialUserIdSearch || isExplicitlyEnabled('partialUserId')) ? 'partialUserId' : null,
    (isExplicitlyEnabled('searchId') || (Array.isArray(searchOptions?.searchIdPrefixes) && searchOptions.searchIdPrefixes.length > 0)) ? 'searchId' : null,
    (isExplicitlyEnabled('searchKey') || (Array.isArray(searchOptions?.searchKeyFields) && searchOptions.searchKeyFields.length > 0)) ? 'searchKey' : null,
    (isExplicitlyEnabled('equalToAllCards') || (Array.isArray(searchOptions?.equalToKeys) && searchOptions.equalToKeys.length > 0)) ? 'equalToAllCards' : null,
  ].filter(key => key && isSearchEnabled(key));
};

const isSearchPerfDebugEnabled = () => {
  if (typeof window === 'undefined') return false;

  try {
    return window.localStorage.getItem('searchPerfDebug') === '1';
  } catch (error) {
    return false;
  }
};


const SEARCH_CACHE_SCOPE_OPTION_KEYS = [
  'searchIdPrefixes',
  'searchKeyFields',
  'equalToKeys',
  'forceEqualToAllCards',
  'forceSearchKeyBucket',
  'forcePartialUserIdSearch',
  'allowTelegramPrefixMatches',
];

const normalizeSearchCacheScopeValue = value => {
  if (Array.isArray(value)) {
    return value.map(normalizeSearchCacheScopeValue).sort();
  }
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((acc, scopeKey) => {
      const normalizedValue = normalizeSearchCacheScopeValue(value[scopeKey]);
      if (normalizedValue !== undefined) acc[scopeKey] = normalizedValue;
      return acc;
    }, {});
  }
  if (value === undefined || value === null || value === false) return undefined;
  return value;
};

const buildSearchCacheScope = options => {
  if (!options || typeof options !== 'object') return null;

  const scope = SEARCH_CACHE_SCOPE_OPTION_KEYS.reduce((acc, scopeKey) => {
    const normalizedValue = normalizeSearchCacheScopeValue(options[scopeKey]);
    if (normalizedValue !== undefined) acc[scopeKey] = normalizedValue;
    return acc;
  }, {});

  return Object.keys(scope).length > 0 ? scope : null;
};

export const getSearchCacheKeyForParams = (key, value, options = {}) => {
  const baseQueryKey = `${key}=${value}`;
  const scope = buildSearchCacheScope(options);
  const scopedQueryKey = scope
    ? `${baseQueryKey}|scope=${JSON.stringify(scope)}`
    : baseQueryKey;
  return getCacheKey('search', normalizeQueryKey(scopedQueryKey));
};

export const getFreshCachedSearchResult = (key, value, options = {}) => {
  if (!key || value === undefined || value === null || String(value).trim() === '') {
    return { hit: false, cards: [], map: {} };
  }

  const cacheKey = getSearchCacheKeyForParams(key, value, options);
  const queries = loadQueries();
  const entry = queries[cacheKey];
  if (!entry) return { hit: false, cards: [], map: {} };

  const timestampSource =
    typeof entry.cachedAt === 'number' && Number.isFinite(entry.cachedAt)
      ? entry.cachedAt
      : Number(entry.cachedAt ?? entry.lastAction ?? 0);
  if (!Number.isFinite(timestampSource) || timestampSource <= 0) {
    return { hit: false, cards: [], map: {} };
  }
  if (Date.now() - timestampSource >= TTL_MS) {
    return { hit: false, cards: [], map: {} };
  }

  const ids = getIdsByQuery(cacheKey);
  if (ids.length === 0) return { hit: false, cards: [], map: {} };

  const cards = ids.map(id => getCard(id)).filter(Boolean);
  if (cards.length === 0 || cards.length !== ids.length) {
    return { hit: false, cards: [], map: {} };
  }

  const map = cards.reduce((acc, card) => {
    if (card?.userId) acc[card.userId] = card;
    return acc;
  }, {});

  return {
    hit: Object.keys(map).length > 0,
    cards,
    map,
    cacheKey,
    ids,
  };
};

const formatCachedSearchResult = cachedResult => {
  if (!cachedResult?.hit) return null;
  if (cachedResult.cards.length === 1) return cachedResult.cards[0];
  return { ...cachedResult.map };
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
  suppressInitialSearchExecution = false,
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
  const perfDebugEnabledRef = useRef(isSearchPerfDebugEnabled());

  useEffect(() => {
    perfDebugEnabledRef.current = isSearchPerfDebugEnabled();
  }, [searchOptions, enabledSearchKeys]);


  const repeatedSearchCollectorRef = useRef(null);
  const lastEmittedSearchLabelRef = useRef(null);

  useEffect(() => {
    lastEmittedSearchLabelRef.current = null;
  }, [search]);

  const collectSearchOutput = (output, requestId = null) => {
    const collector = repeatedSearchCollectorRef.current;
    if (
      !collector ||
      collector.requestId !== requestId ||
      !output ||
      Object.keys(output).length === 0
    ) return;

    const targetResults = collector.currentResults || collector.results;
    mergeSearchResultMap(targetResults, output);
  };

  const applyUsers = (nextUsers, requestId = null) => {
    if (requestId !== null && activeSearchRequestRef.current !== requestId) return;

    const collector = repeatedSearchCollectorRef.current;
    if (collector && collector.requestId === requestId) {
      collector.lastUsers = nextUsers;
      collector.users = nextUsers;
      collectSearchOutput(nextUsers, requestId);
      return;
    }
    setUsers && setUsers(nextUsers);
  };

  const applyState = (nextState, requestId = null) => {
    if (requestId !== null && activeSearchRequestRef.current !== requestId) return;

    const collector = repeatedSearchCollectorRef.current;
    if (collector && collector.requestId === requestId) {
      collector.lastState = nextState;
      collector.states = nextState;
      collectSearchOutput(nextState, requestId);
      return;
    }
    setState && setState(nextState);
  };

  const applyUserNotFound = (nextValue, requestId = null) => {
    if (requestId !== null && activeSearchRequestRef.current !== requestId) return;

    const collector = repeatedSearchCollectorRef.current;
    if (collector && collector.requestId === requestId) {
      collector.lastUserNotFound = nextValue;
      return;
    }
    setUserNotFound && setUserNotFound(nextValue);
  };

  const isSearchEnabled = key => {
    const effectiveEnabledSearchKeys =
      enabledSearchKeys && typeof enabledSearchKeys === 'object'
        ? enabledSearchKeys
        : searchOptions?.enabledSearchKeys;

    if (!effectiveEnabledSearchKeys) return true;
    return Boolean(effectiveEnabledSearchKeys[key]);
  };

  const loadCachedResult = (key, value, requestId = null, options = {}) => {
    const cachedResult = getFreshCachedSearchResult(key, value, options);
    if (!cachedResult.hit) return false;

    const filteredMap = filterSearchResultByParams(cachedResult.map, { [key]: value }, options);
    const filteredCards = Object.values(filteredMap || {});
    if (filteredCards.length === 0) return false;

    if (filteredCards.length !== cachedResult.cards.length && cachedResult.cacheKey) {
      setIdsForQuery(cachedResult.cacheKey, filteredCards.map(card => card.userId).filter(Boolean));
    }

    applyUserNotFound(false, requestId);
    if (key === 'name' || key === 'names' || filteredCards.length > 1) {
      applyState({}, requestId);
      applyUsers({ ...filteredMap }, requestId);
    } else {
      applyState(filteredCards[0], requestId);
    }
    return true;
  };

  const isCacheFresh = (key, value, options = {}) => {
    const cachedResult = getFreshCachedSearchResult(key, value, options);
    if (!cachedResult.hit) return false;
    const filteredMap = filterSearchResultByParams(cachedResult.map, { [key]: value }, options);
    return Object.keys(filteredMap || {}).length > 0;
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
      loadCachedResult(key, value);
      if (!suppressInitialSearchExecution) {
        writeData(search);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emitSearchLabel = (params, meta = {}) => {
    // Repeated [] search keeps a per-value create context for not-found
    // placeholders, so fallback labels (for example the final name search)
    // must not replace the parent add payload.
    if (repeatedSearchCollectorRef.current) return;

    const nextKey = getFirstSearchParamKey(params);
    const detectedContactParams = resolveDetectedContactParams(search);
    const previousKey = resolveSearchLabelKey(lastEmittedSearchLabelRef.current);
    const nextValue = resolveSearchParamValue(params, nextKey);
    const rawSearch = String(search || '').trim();
    const isWeakFallbackForContact =
      WEAK_FALLBACK_SEARCH_LABEL_KEYS.has(nextKey) &&
      CONTACT_SEARCH_LABEL_KEYS.has(detectedContactParams?.key) &&
      (
        nextValue === rawSearch ||
        previousKey === 'searchId' ||
        previousKey === detectedContactParams.key
      );

    if (isWeakFallbackForContact) return;

    lastEmittedSearchLabelRef.current = { params, key: nextKey };
    onSearchKey && onSearchKey(params);
  };

  const notifySearchResult = () => {};

  const isSearchDebugEnabled = () => {
    try {
      return window.localStorage.getItem('searchDebug') === '1';
    } catch (error) {
      return false;
    }
  };

  const attachSearchDebugMeta = (card, meta) => {
    if (!card || !meta || !isSearchDebugEnabled()) return card;
    return {
      ...card,
      __searchDebug: meta,
    };
  };

  const mergeSearchResultMap = (acc, res, meta = null) => {
    if (!res || Object.keys(res).length === 0) return;
    if (Array.isArray(res)) {
      res.forEach(card => {
        if (card?.userId) {
          acc[card.userId] = attachSearchDebugMeta(card, meta);
        }
      });
      return;
    }
    if ('userId' in res) {
      acc[res.userId] = attachSearchDebugMeta(res, meta);
      return;
    }
    Object.entries(res).forEach(([userId, card]) => {
      acc[userId] = attachSearchDebugMeta(card, meta);
    });
  };

  const buildRepeatedSearchContext = value => {
    const rawValue = typeof value === 'string' ? value : '';
    const trimmedValue = rawValue.trim();
    if (!trimmedValue) return null;

    if (isSearchEnabled('searchId')) {
      const parsedSearchIdValue = parseSearchIdExact(trimmedValue);
      if (parsedSearchIdValue) {
        const searchIdPrefixStrategy = resolveSearchIdPrefixStrategy(trimmedValue, searchOptions);
        const [primarySearchKey] = searchIdPrefixStrategy.primaryPrefixes || [];

        if (primarySearchKey) {
          return {
            searchMode: 'searchId',
            searchKey: primarySearchKey,
            searchValue: parsedSearchIdValue,
            rawSearchValue: rawValue,
          };
        }
      }
    }

    if (isSearchEnabled('searchKey')) {
      const [primarySearchKeyField] = Object.keys(SEARCH_KEY_BUCKET_SEARCH_PARSERS);
      const [primarySearchKeyValue] = getParsedCandidatesForKey(primarySearchKeyField, trimmedValue);
      if (primarySearchKeyField && primarySearchKeyValue) {
        return {
          searchMode: 'searchKey',
          searchKey: primarySearchKeyField,
          searchValue: primarySearchKeyValue,
          rawSearchValue: rawValue,
        };
      }
    }

    if (isSearchEnabled('equalToAllCards')) {
      const allEqualToKeys = Object.keys(EQUAL_TO_SEARCH_PARSERS);
      const selectedEqualToKeys = Array.isArray(searchOptions?.equalToKeys)
        ? searchOptions.equalToKeys.filter(key => allEqualToKeys.includes(key))
        : [];
      const equalToExecutionPlan = resolveEqualToExecutionKeys({
        allKeys: allEqualToKeys,
        selectedKeys: selectedEqualToKeys,
        rawQuery: trimmedValue,
      });
      const [primaryEqualToKey] = equalToExecutionPlan.primaryKeys || [];
      const [primaryEqualToValue] = primaryEqualToKey
        ? getParsedCandidatesForKey(primaryEqualToKey, trimmedValue)
        : [];

      if (primaryEqualToKey && primaryEqualToValue) {
        return {
          searchMode: 'equalToAllCards',
          searchKey: primaryEqualToKey,
          searchValue: primaryEqualToValue,
          rawSearchValue: rawValue,
        };
      }
    }

    const detectedParams = detectSearchParams(trimmedValue);
    return {
      searchMode: detectedParams?.key === 'name' ? 'name' : 'detected',
      searchKey: detectedParams?.key || 'name',
      searchValue: detectedParams?.value || trimmedValue,
      rawSearchValue: rawValue,
    };
  };

  const buildRepeatedNotFoundItem = (value, searchContext = null) => ({
    _notFound: true,
    searchVal: value,
    ...(searchContext || {}),
  });

  const addRepeatedSearchItem = (collector, key, item) => {
    const orderedKey = collector.orderedItems.some(entry => entry.key === key)
      ? `${key}_${collector.orderedItems.length}`
      : key;
    collector.orderedItems.push({ key: orderedKey, item });
  };

  const flushRepeatedSearchValue = (collector, value, index) => {
    const currentResults = collector.currentResults || {};
    const resultEntries = Object.entries(currentResults);

    if (resultEntries.length > 0) {
      resultEntries.forEach(([key, item]) => {
        addRepeatedSearchItem(collector, key, item);
      });
      mergeSearchResultMap(collector.results, currentResults);
      return;
    }

    addRepeatedSearchItem(
      collector,
      `new_${index}_${value}`,
      buildRepeatedNotFoundItem(value, collector.searchContexts?.[index]),
    );
  };

  const runEqualToAllCardsSearch = async (
    rawQuery,
    isStaleRequest,
    resultMap = {},
    forcedEqualToKeys = null,
  ) => {
    const allEqualToKeys = Object.keys(EQUAL_TO_SEARCH_PARSERS);
    const selectedEqualToKeys = Array.isArray(forcedEqualToKeys)
      ? forcedEqualToKeys.filter(key => allEqualToKeys.includes(key))
      : Array.isArray(searchOptions?.equalToKeys)
        ? searchOptions.equalToKeys.filter(key => allEqualToKeys.includes(key))
        : [];
    const equalToExecutionPlan = resolveEqualToExecutionKeys({
      allKeys: allEqualToKeys,
      selectedKeys: selectedEqualToKeys,
      rawQuery,
    });
    const keysToTry = equalToExecutionPlan.primaryKeys || [];

    let found = false;
    for (const equalToKey of keysToTry) {
      const candidates = getParsedCandidatesForKey(equalToKey, rawQuery);
      for (const parsedValue of candidates) {
        const res = await cachedSearch(
          { [equalToKey]: parsedValue },
          { forceEqualToAllCards: true, equalToKeys: [equalToKey] },
        );
        if (isStaleRequest()) return { found, results: resultMap };
        if (!res || Object.keys(res).length === 0) continue;
        found = true;
        mergeSearchResultMap(resultMap, res, { mode: 'equalToAllCards', key: equalToKey, value: parsedValue });
      }
    }

    return { found, results: resultMap };
  };


  const runSearchKeyBucketSearch = async (rawQuery, isStaleRequest, resultMap = {}) => {
    const allSearchKeyFields = Object.keys(SEARCH_KEY_BUCKET_SEARCH_PARSERS);
    const selectedSearchKeyFields = Array.isArray(searchOptions?.searchKeyFields)
      ? searchOptions.searchKeyFields.filter(key => allSearchKeyFields.includes(key))
      : [];
    const executionPlan = resolveExecutionPlan({
      allKeys: allSearchKeyFields,
      selectedKeys: selectedSearchKeyFields,
      detectedKey: null,
      rawQuery,
      dateLikeKeys: new Set(allSearchKeyFields),
    });
    const keysToTry = executionPlan.primaryKeys || [];

    let found = false;
    for (const searchKeyField of keysToTry) {
      const candidates = getParsedCandidatesForKey(searchKeyField, rawQuery);
      for (const parsedValue of candidates) {
        const res = await cachedSearch(
          { [searchKeyField]: parsedValue },
          { forceSearchKeyBucket: true, searchKeyFields: [searchKeyField] },
        );
        if (isStaleRequest()) return { found, results: resultMap };
        if (!res || Object.keys(res).length === 0) continue;
        found = true;
        mergeSearchResultMap(resultMap, res, { mode: 'searchKey', key: searchKeyField, value: parsedValue });
      }
    }

    return { found, results: resultMap };
  };

  const runPartialUserIdSearch = async (rawQuery, isStaleRequest, resultMap = {}) => {
    const userIdPrefix = parsePartialUserIdPrefix(rawQuery);
    if (!userIdPrefix) return { found: false, results: resultMap };

    const partialResult = await cachedSearch(
      { userId: userIdPrefix },
      { forcePartialUserIdSearch: true },
    );
    if (isStaleRequest()) return { found: false, results: resultMap };
    if (!partialResult || Object.keys(partialResult).length === 0) {
      return { found: false, results: resultMap };
    }

    mergeSearchResultMap(resultMap, partialResult, { mode: 'partialUserId', key: 'userId', value: userIdPrefix });
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

    if (isSearchEnabled('searchId') && searchIdInput) {
      const searchIdPrefixStrategy = resolveSearchIdPrefixStrategy(searchIdInput, searchOptions);
      const prefixesToIterate =
        searchIdPrefixStrategy.primaryPrefixes?.length > 0
          ? searchIdPrefixStrategy.primaryPrefixes
          : searchIdPrefixStrategy.fallbackPrefixes || [];
      const [primarySearchIdPrefix] = prefixesToIterate;
      emitSearchLabel(
        primarySearchIdPrefix ? { [primarySearchIdPrefix]: searchIdInput } : { searchId: searchIdInput },
        { mode: 'searchId', stage: 'combined' },
      );

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

      searchIdResults.forEach((searchIdResult, index) => {
        if (!searchIdResult || Object.keys(searchIdResult).length === 0) return;
        foundCombinedResults = true;
        mergeSearchResultMap(resultMap, searchIdResult, { mode: 'searchId', key: prefixesToIterate[index], value: searchIdInput });
      });
    }

    if (isSearchEnabled('searchKey')) {
      const searchKeyResult = await runSearchKeyBucketSearch(rawQuery, isStaleRequest, resultMap);
      if (isStaleRequest()) return { found: false, results: resultMap };
      if (searchKeyResult.found) {
        foundCombinedResults = true;
      }
    }

    if (isSearchEnabled('equalToAllCards')) {
      const equalToResult = await runEqualToAllCardsSearch(rawQuery, isStaleRequest, resultMap);
      if (isStaleRequest()) return { found: false, results: resultMap };
      if (equalToResult.found) {
        foundCombinedResults = true;
      }
    }

    return { found: foundCombinedResults, results: resultMap };
  };

  const cachedSearch = async (params, extraOptions = {}) => {
    const [key, value] = Object.entries(params)[0] || [];
    const cachedResult = getFreshCachedSearchResult(key, value, extraOptions);
    if (cachedResult.hit) {
      if (perfDebugEnabledRef.current) {
        console.debug('[SearchPerf][cache-hit]', { params, options: extraOptions, ids: cachedResult.ids });
      }
      const filteredCachedMap = filterSearchResultByParams(cachedResult.map, params, extraOptions);
      if (Object.keys(filteredCachedMap || {}).length === 0) {
        if (cachedResult.cacheKey) setIdsForQuery(cachedResult.cacheKey, []);
      } else {
        const filteredCards = Object.values(filteredCachedMap);
        if (filteredCards.length !== cachedResult.cards.length && cachedResult.cacheKey) {
          setIdsForQuery(cachedResult.cacheKey, filteredCards.map(card => card.userId).filter(Boolean));
        }
        return formatCachedSearchResult({ ...cachedResult, cards: filteredCards, map: filteredCachedMap });
      }
    }

    const perfLabel = `[SearchPerf][searchFunc] ${JSON.stringify(params)}`;
    if (perfDebugEnabledRef.current) console.time(perfLabel);
    const res = await searchFunc(params, {
      ...(searchOptions || {}),
      forceEqualToAllCards: false,
      ...extraOptions,
    });
    if (perfDebugEnabledRef.current) console.timeEnd(perfLabel);
    if (!res || Object.keys(res).length === 0) {
      return res;
    }

    const filteredRes = filterSearchResultByParams(res, params, extraOptions);
    if (!filteredRes || Object.keys(filteredRes).length === 0) {
      return Array.isArray(res) ? [] : {};
    }

    const arr = Array.isArray(filteredRes)
      ? filteredRes
      : 'userId' in filteredRes
        ? [filteredRes]
        : Object.values(filteredRes);
    const updatedArr = arr.map(u => updateCard(u.userId, u));

    if (key && value) {
      const cacheKey = getSearchCacheKeyForParams(key, value, extraOptions);
      setIdsForQuery(cacheKey, updatedArr.map(u => u.userId));
    }

    if (Array.isArray(filteredRes)) return updatedArr;
    if ('userId' in filteredRes) return updatedArr[0];
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
      deferNotFoundOnMiss = false,
      requestId = null,
    } = options;

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

          const cacheOptions = { allowTelegramPrefixMatches: true };
          const hasCache = loadCachedResult('telegram', telegramValue, requestId, cacheOptions);
          const freshCache = hasCache && isCacheFresh('telegram', telegramValue, cacheOptions);

          if (index === 0) {
            emitSearchLabel({ telegram: telegramValue }, {
              mode: 'telegram',
              stage: 'uk-trigger',
              candidateIndex: index,
            });
          }

          if (freshCache) return true;

          if (!hasCache) {
            applyState({}, requestId);
            applyUsers({}, requestId);
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
            applyUserNotFound(false, requestId);
            if ('userId' in res) {
              applyState(res, requestId);
            } else {
              applyUsers(res, requestId);
            }
            return true;
          }
        }

        applyUserNotFound(true, requestId);
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
          applyUserNotFound(false, requestId);
          emitSearchLabel({ userId: id }, {
            mode: platform,
            stage: 'local-card-cache',
          });
          notifySearchResult({ userId: id }, cachedCardByUserId, {
            preferredKeys: ['userId'],
          });
          applyState(cachedCardByUserId, requestId);
          return true;
        }
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
      const scopedCacheOptions = scopedSearchIdPrefixes ? { searchIdPrefixes: scopedSearchIdPrefixes } : {};
      const hasCache = loadCachedResult(platform, id, requestId, scopedCacheOptions);
      const freshCache = hasCache && isCacheFresh(platform, id, scopedCacheOptions);
      const result = { [platform]: id };
      emitSearchLabel(result, { mode: platform, stage: 'initial' });
      if (freshCache) {
        notifySearchResult(result, null, { preferredKeys: [platform] });
        return true;
      }
      if (!hasCache) {
        applyState({}, requestId);
        applyUsers({}, requestId);
      }
      const mergeSearchResult = (acc, res, meta = null) => {
        mergeSearchResultMap(acc, res, meta);
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

        prefixResults.forEach((partialRes, index) => {
          mergeSearchResult(aggregatedResults, partialRes, { mode: 'searchId', key: prefixesToIterate[index], value: id });
        });

        if (Object.keys(aggregatedResults).length > 0) {
          applyUserNotFound(false, requestId);
          applyState({}, requestId);
          applyUsers({ ...aggregatedResults }, requestId);
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
            const fallbackHasCache = loadCachedResult(fallbackKey, id, requestId);
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
            applyUserNotFound(false, requestId);
            if ('userId' in fallbackRes) {
              applyState(fallbackRes, requestId);
            } else {
              applyUsers(fallbackRes, requestId);
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
        if (!deferNotFoundOnMiss) {
          applyUserNotFound(true, requestId);
        }
        return !continueOnMiss;
      } else {
        applyUserNotFound(false, requestId);
        notifySearchResult(result, finalRes, { preferredKeys: [platform] });
        if ('userId' in finalRes) {
          applyState(finalRes, requestId);
        } else {
          applyUsers(finalRes, requestId);
        }
        return true;
      }
    }
    return false;
  };

  const writeData = async (query = search, options = {}) => {
    const {
      requestId: inheritedRequestId = null,
      suppressHistory = false,
      suppressSearchExecuted = false,
    } = options;
    const requestId = inheritedRequestId ?? ++activeSearchRequestRef.current;
    const isStaleRequest = () => activeSearchRequestRef.current !== requestId;

    if (inheritedRequestId === null && repeatedSearchCollectorRef.current?.requestId !== requestId) {
      repeatedSearchCollectorRef.current = null;
    }

    applyUserNotFound(false, requestId);
    const rawQuery = typeof query === 'string' ? query : '';
    const trimmed = rawQuery.trim();

    if (onSearchExecuted && !suppressSearchExecuted) {
      onSearchExecuted(trimmed);
    }

    if (trimmed && !trimmed.startsWith('!') && !suppressHistory) {
      addToHistory(trimmed);
    }
    if (trimmed && trimmed.startsWith('!')) {
      const term = trimmed.slice(1).trim();
      const filtersKey = normalizeQueryKey(
        `${filterForload || 'all'}:${serializeQueryFilters(filters)}`,
      );
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
        applyState({}, requestId);
        applyUsers({}, requestId);
        applyUserNotFound(true, requestId);
      } else {
        applyState({}, requestId);
        applyUsers(results, requestId);
        const searchKey = getCacheKey(
          'search',
          normalizeQueryKey(`${term}:${filtersKey}`),
        );
        setIdsForQuery(searchKey, Object.keys(results));
      }
      return;
    }
    const selectedAdvancedSearchModes = getSelectedAdvancedSearchModes(searchOptions, isSearchEnabled);
    const shouldUseSelectedAdvancedSearchModes = selectedAdvancedSearchModes.length > 0;

    const repeatedValues = parseGroupedSearchValues(trimmed);
    if (repeatedValues.length > 0) {
      const repeatedPerfLabel = `[SearchPerf][repeat][total] ${trimmed}`;
      if (perfDebugEnabledRef.current) console.time(repeatedPerfLabel);
      const collector = {
        requestId,
        results: {},
        orderedItems: [],
        currentResults: {},
        currentValue: null,
        states: {},
        users: {},
        lastState: undefined,
        lastUsers: undefined,
        lastUserNotFound: false,
        searchContexts: {},
      };
      repeatedSearchCollectorRef.current = collector;

      try {
        for (const [index, value] of repeatedValues.entries()) {
          collector.currentValue = value;
          collector.currentResults = {};
          collector.searchContexts[index] = buildRepeatedSearchContext(value);
          collector.lastState = undefined;
          collector.lastUsers = undefined;
          collector.lastUserNotFound = false;

          await writeData(value, {
            requestId,
            suppressHistory: true,
            suppressSearchExecuted: true,
          });
          if (isStaleRequest()) return;

          flushRepeatedSearchValue(collector, value, index);
        }
      } finally {
        if (repeatedSearchCollectorRef.current?.requestId === requestId) {
          repeatedSearchCollectorRef.current = null;
        }
        if (perfDebugEnabledRef.current) console.timeEnd(repeatedPerfLabel);
      }

      if (isStaleRequest()) return;

      const orderedResults = collector.orderedItems.reduce((acc, { key, item }) => {
        acc[key] = item;
        return acc;
      }, {});

      setUserNotFound && setUserNotFound(false);
      setState && setState({});
      setUsers && setUsers(orderedResults);
      return;
    }

    if (shouldUseSelectedAdvancedSearchModes) {
      const combinedResults = {};
      const combinedResult = await runCombinedSearchForQuery(rawQuery, isStaleRequest, combinedResults);
      if (isStaleRequest()) return;

      if (combinedResult.found) {
        applyUserNotFound(false, requestId);
        applyState({}, requestId);
        applyUsers({ ...combinedResults }, requestId);
      } else {
        applyState({}, requestId);
        applyUsers({}, requestId);
        applyUserNotFound(true, requestId);
      }
      return;
    }

    const looksLikeExactUserId = Boolean(parseUserId(rawQuery));
    if (
      looksLikeExactUserId &&
      isSearchEnabled('userId') &&
      await processUserSearch('userId', parseUserId, rawQuery, {
        continueOnMiss: true,
        requestId,
      })
    ) return;

    if (
      !looksLikeExactUserId &&
      isSearchEnabled('userId') &&
      await processUserSearch('userId', parseUserId, rawQuery, { requestId })
    ) return;
    if (
      isSearchEnabled('facebook') &&
      await processUserSearch('facebook', parseFacebookId, rawQuery, { requestId })
    ) return;
    if (
      isSearchEnabled('instagram') &&
      await processUserSearch('instagram', parseInstagramId, rawQuery, { requestId })
    ) return;
    if (
      isSearchEnabled('ameblo') &&
      await processUserSearch('ameblo', parseAmebloId, rawQuery, { requestId })
    ) return;
    if (
      isSearchEnabled('telegram') &&
      await processUserSearch('telegram', parseTelegramId, rawQuery, {
        allowUkTrigger: true,
        requestId,
      })
    ) return;
    if (
      isSearchEnabled('email') &&
      await processUserSearch('email', parseEmail, rawQuery, { requestId })
    ) return;
    if (
      isSearchEnabled('tiktok') &&
      await processUserSearch('tiktok', parseTikTokLink, rawQuery, { requestId })
    ) return;
    if (
      isSearchEnabled('phone') &&
      await processUserSearch('phone', parsePhoneNumber, rawQuery, { requestId })
    ) return;
    if (
      isSearchEnabled('vk') &&
      await processUserSearch('vk', parseVk, rawQuery, { requestId })
    ) return;
    if (
      isSearchEnabled('other') &&
      await processUserSearch('other', parseOtherContact, rawQuery, {
        allowFallback: Boolean(searchOptions?.autoOtherFallback),
        requestId,
      })
    ) return;

    if (!isSearchEnabled('name')) {
      applyUserNotFound(true, requestId);
      applyState({}, requestId);
      applyUsers({}, requestId);
      return;
    }

    const nameTrim = rawQuery.trim();
    const hasCache = loadCachedResult('name', nameTrim, requestId);
    const freshCache = hasCache && isCacheFresh('name', nameTrim);
    emitSearchLabel({ name: nameTrim }, { mode: 'name', stage: 'default' });
    if (freshCache) {
      notifySearchResult({ name: nameTrim }, null, { preferredKeys: ['name'] });
      return;
    }
    if (!hasCache) {
      applyState({}, requestId);
      applyUsers({}, requestId);
    }

    const res = await cachedSearch({ name: nameTrim });
    if (isStaleRequest()) return;
    if (!res || Object.keys(res).length === 0) {
      applyUserNotFound(true, requestId);
    } else {
      applyUserNotFound(false, requestId);
      const searchValueForNotification =
        (res && typeof res === 'object' && res.name) || nameTrim;
      notifySearchResult(
        { name: searchValueForNotification },
        res,
        { preferredKeys: ['name'] },
      );
      if ('userId' in res) {
        applyState(res, requestId);
      } else {
        applyUsers(res, requestId);
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
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              writeData(search);
            }
          }}
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
              applyUserNotFound(false);
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
