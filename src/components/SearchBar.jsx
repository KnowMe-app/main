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
} from '../utils/cardIndex';
import { saveCard } from '../utils/cardsStorage';

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
  const cleanedPhone = phone.replace(/[\s()\-+]/g, '');
  const digitCount = (cleanedPhone.match(/\d/g) || []).length;
  if (digitCount < 10) return;
  if (cleanedPhone.startsWith('0')) return '380' + cleanedPhone.slice(1);
  if (cleanedPhone.startsWith('(')) {
    const numberAfterCleaning = cleanedPhone.slice(1);
    const cleanedAfterParenthesis = numberAfterCleaning.replace(/[\s()\-+]/g, '');
    if (/^\d{10}$/.test(cleanedAfterParenthesis)) {
      return '38' + cleanedAfterParenthesis.slice(1);
    }
  }
  if (cleanedPhone.startsWith('38')) return cleanedPhone;
  return;
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

const parseUserId = input => {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  const pattern = /(?:\bId\s*[:\s]+)(\w+)/i;
  const match = trimmed.match(pattern);
  const candidate = (match ? match[1] : trimmed).trim();
  const normalized = candidate.replace(/[+\s()-]/g, '');
  if (/^(?:0|380)\d{9}$/.test(normalized)) return null;
  if (/^-?[a-zA-Z0-9]{4,}$/.test(candidate)) return candidate;
  return null;
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

const parseOtherContact = input => input;

export const detectSearchParams = query => {
  const trimmed = query.trim();
  const parsers = [
    ['facebook', parseFacebookId],
    ['instagram', parseInstagramId],
    ['telegram', parseTelegramId],
    ['userId', parseUserId],
    ['email', parseEmail],
    ['tiktok', parseTikTokLink],
    ['phone', parsePhoneNumber],
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
  wrapperStyle = {},
  leftIcon = SearchIcon,
  storageKey = 'searchQuery',
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
      loadCachedResult(key, value);
      writeData(search);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cachedSearch = async params => {
    const res = await searchFunc(params);
    if (res && Object.keys(res).length > 0) {
      const [key, value] = Object.entries(params)[0] || [];
      if (key && value) {
        const cacheKey = getCacheKey('search', normalizeQueryKey(`${key}=${value}`));
        const arr = Array.isArray(res) ? res : Object.values(res);
        arr.forEach(u => saveCard({ ...u, id: u.userId }));
        setIdsForQuery(cacheKey, arr.map(u => u.userId));
      }
    }
    return res;
  };

  const processUserSearch = async (platform, parseFunction, inputData) => {
    const id = parseFunction(inputData.trim());

    if (id) {
      const hasCache = loadCachedResult(platform, id);
      if (!hasCache) {
        setState && setState({});
        setUsers && setUsers({});
      }
      const result = { [platform]: id };
      onSearchKey && onSearchKey(result);
      const res = await cachedSearch(result);
      if (!res || Object.keys(res).length === 0) {
        setUserNotFound && setUserNotFound(true);
      } else {
        setUserNotFound && setUserNotFound(false);
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
    const trimmed = query?.trim();
    if (trimmed) {
      addToHistory(trimmed);
    }
    if (trimmed && trimmed.startsWith('[') && trimmed.endsWith(']')) {
      const hasCache = loadCachedResult('name', trimmed);
      if (hasCache) return;
      setState && setState({});
      setUsers && setUsers({});
      const inside = trimmed.slice(1, -1);
      const matches = inside.match(/"[^"]+"|[^\s,;]+/g) || [];
      const values = matches
        .map(v => v.replace(/^"|"$/g, '').trim())
        .filter(Boolean);
      if (values.length > 0) {
        const results = {};
        for (const val of values) {
          const res = await cachedSearch({ name: val });
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

    if (await processUserSearch('facebook', parseFacebookId, query)) return;
    if (await processUserSearch('instagram', parseInstagramId, query)) return;
    if (await processUserSearch('telegram', parseTelegramId, query)) return;
    if (await processUserSearch('userId', parseUserId, query)) return;
    if (await processUserSearch('email', parseEmail, query)) return;
    if (await processUserSearch('tiktok', parseTikTokLink, query)) return;
    if (await processUserSearch('phone', parsePhoneNumber, query)) return;
    if (await processUserSearch('other', parseOtherContact, query)) return;

    const nameTrim = query.trim();
    const hasCache = loadCachedResult('name', nameTrim);
    if (!hasCache) {
      setState && setState({});
      setUsers && setUsers({});
    }
    let res = await cachedSearch({ name: nameTrim });
    onSearchKey && onSearchKey({ name: nameTrim });
    if (!res || Object.keys(res).length === 0) {
      const cleanedQuery = query.replace(/^ук\s*см\s*/i, '').trim();
      if (cleanedQuery && cleanedQuery !== nameTrim) {
          res = await cachedSearch({ name: cleanedQuery });
        onSearchKey && onSearchKey({ name: cleanedQuery });
      }
    }
    if (!res || Object.keys(res).length === 0) {
      const withPrefix = /^ук\s*см/i.test(query) ? null : `УК СМ ${query.trim()}`;
      if (withPrefix) {
          res = await cachedSearch({ name: withPrefix });
        onSearchKey && onSearchKey({ name: withPrefix });
      }
    }
    if (!res || Object.keys(res).length === 0) {
      setUserNotFound && setUserNotFound(true);
    } else {
      setUserNotFound && setUserNotFound(false);
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
                setSearch(item);
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
