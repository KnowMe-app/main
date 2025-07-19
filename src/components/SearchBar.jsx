import React, { useEffect, useState, useRef } from 'react';
import { useAutoResize } from '../hooks/useAutoResize';
import styled from 'styled-components';

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
  padding: 4px 10px;
  background-color: #fff;
  border: 1px solid #ccc;
  border-radius: 5px;
  box-sizing: border-box;
  flex: 1 1 auto;
  min-width: 0;
  height: auto;
`;

const InputFieldContainer = styled.div`
  display: flex;
  align-items: flex-start;
  position: relative;
  height: auto;
  flex: 1 1 auto;
  min-width: 0;
`;

const InputField = styled.textarea`
  border: none;
  outline: none;
  flex: 1;
  padding-left: 10px;
  max-width: 100%;
  min-width: 0;
  pointer-events: auto;
  resize: none;
  overflow: hidden;
  line-height: 1.2;
  min-height: 24px;
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
}) => {
  const [internalSearch, setInternalSearch] = useState(
    () => localStorage.getItem('searchQuery') || '',
  );

  const search = externalSearch !== undefined ? externalSearch : internalSearch;
  const setSearch =
    externalSetSearch !== undefined ? externalSetSearch : setInternalSearch;

  const textareaRef = useRef(null);
  useAutoResize(textareaRef, search);

  useEffect(() => {
    if (search) {
      localStorage.setItem('searchQuery', search);
    } else {
      localStorage.removeItem('searchQuery');
    }
  }, [search]);

  useEffect(() => {
    if (search) {
      writeData(search);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const processUserSearch = async (platform, parseFunction, inputData) => {
    setUsers && setUsers({});
    const id = parseFunction(inputData.trim());

    if (id) {
      const result = { [platform]: id };
      onSearchKey && onSearchKey(result);
      const res = await searchFunc(result);
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
    setState && setState({});
    const trimmed = query?.trim();
    if (trimmed && trimmed.startsWith('[') && trimmed.endsWith(']')) {
      const inside = trimmed.slice(1, -1);
      const matches = inside.match(/"[^"]+"|[^\s,;]+/g) || [];
      const values = matches
        .map(v => v.replace(/^"|"$/g, '').trim())
        .filter(Boolean);
      if (values.length > 0) {
        const results = {};
        for (const val of values) {
          const res = await searchFunc({ name: val });
          if (!res || Object.keys(res).length === 0) {
            results[`new_${val}`] = { _notFound: true, searchVal: val };
          } else if ('userId' in res) {
            results[res.userId] = res;
          } else {
            Object.assign(results, res);
          }
        }
        setUsers && setUsers(results);
        return;
      }
    }

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
      if (typeof input === 'string' && input.length === 20 && input.startsWith('-')) return input;
      const alphanumericPattern = /^[a-zA-Z0-9]{28}$/;
      if (alphanumericPattern.test(input)) return input;
      const pattern = /(?:\bId\s*[:\s]+\s*)(\w+)/i;
      const match = input.match(pattern);
      if (match && match[1]) return match[1];
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

    if (await processUserSearch('facebook', parseFacebookId, query)) return;
    if (await processUserSearch('instagram', parseInstagramId, query)) return;
    if (await processUserSearch('telegram', parseTelegramId, query)) return;
    if (await processUserSearch('userId', parseUserId, query)) return;
    if (await processUserSearch('email', parseEmail, query)) return;
    if (await processUserSearch('tiktok', parseTikTokLink, query)) return;
    if (await processUserSearch('phone', parsePhoneNumber, query)) return;
    if (await processUserSearch('other', parseOtherContact, query)) return;

    let res = await searchFunc({ name: query.trim() });
    onSearchKey && onSearchKey({ name: query.trim() });
    if (!res || Object.keys(res).length === 0) {
      const cleanedQuery = query.replace(/^ук\s*см\s*/i, '').trim();
      if (cleanedQuery && cleanedQuery !== query.trim()) {
        res = await searchFunc({ name: cleanedQuery });
        onSearchKey && onSearchKey({ name: cleanedQuery });
      }
    }
    if (!res || Object.keys(res).length === 0) {
      const withPrefix = /^ук\s*см/i.test(query) ? null : `УК СМ ${query.trim()}`;
      if (withPrefix) {
        res = await searchFunc({ name: withPrefix });
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
          onBlur={() => writeData()}
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
    </InputDiv>
  );
};

export default SearchBar;
