import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { ReactComponent as ClipboardIcon } from 'assets/icons/clipboard.svg';
import {
  deleteFlowEntry,
  deleteFlowCategory,
  renameFlowCategory,
  clearFlowData,
  fetchFlowData,
  fetchMonobankUahExchangeRates,
  fetchNbuUahExchangeRatesByDate,
  resolveFlowExchangeRatesForMode,
  saveFlowEntry,
  updateFlowEntry,
} from './config';
import { useAutoResize } from 'hooks/useAutoResize';
import { color } from './styles';
import { isFormulaFlowAmount, resolveFlowAmountInput } from 'utils/flowAmountFormula';

const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 10px;
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  overflow-x: hidden;
`;

const TopControls = styled.div`
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
  min-width: 0;
`;

const MenuWrap = styled.div`
  position: relative;
`;

const TopActionBtn = styled.button`
  border: 1px solid #d7d7d7;
  border-radius: 6px;
  width: 34px;
  height: 34px;
  font-size: 16px;
  font-weight: 700;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  background: ${({ $bg }) => $bg || '#6c757d'};
  border-color: ${({ $bg }) => $bg || '#6c757d'};
  cursor: pointer;

  &:hover {
    filter: brightness(0.92);
  }
`;

const CopyBtn = styled(TopActionBtn)`
  svg {
    width: 17px;
    height: 17px;
  }
`;

const DangerBtn = styled(TopActionBtn)``;

const MenuBtn = styled(TopActionBtn)``;

const MenuPanel = styled.div`
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  min-width: 180px;
  background: linear-gradient(180deg, ${color.oppositeAccent} 0%, #fffaf2 100%);
  border: 1px solid ${color.paleAccent5};
  border-radius: 10px;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.12);
  z-index: 2;
  padding: 6px;
`;

const MenuItem = styled.button`
  width: 100%;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  text-align: left;
  color: ${color.black};
  font-size: 15px;
  font-weight: 500;
  padding: 10px 12px;
  cursor: pointer;
  margin-bottom: 4px;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease;

  &:last-child {
    margin-bottom: 0;
  }

  &:hover {
    background: ${color.paleAccent2};
    border-color: ${color.paleAccent5};
  }
`;

const Row = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: flex-end;
  min-width: 0;
`;

const Label = styled.label`
  font-size: 13px;
  color: #444;
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 0;
`;

const Input = styled.input`
  width: 100%;
  border: 1px solid #d7d7d7;
  border-radius: 6px;
  padding: 8px;
  font-size: 14px;
  box-sizing: border-box;
`;

const EntryInput = styled.textarea`
  width: 100%;
  min-height: 38px;
  border: 1px solid #d7d7d7;
  border-radius: 6px;
  padding: 8px;
  font-size: 14px;
  line-height: 1.4;
  resize: none;
  overflow: hidden;
  box-sizing: border-box;
`;

const EntryInputWrap = styled.div`
  position: relative;
  width: 100%;
`;

const ClearEntryBtn = styled.button`
  position: absolute;
  top: 50%;
  right: 8px;
  transform: translateY(-50%);
  border: 1px solid #d7d7d7;
  border-radius: 999px;
  width: 20px;
  height: 20px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  font-size: 12px;
  background: #fff;
  color: #666;
  cursor: pointer;

  &:hover {
    background: #f5f5f5;
    color: #333;
  }
`;

const ActionBtn = styled.button`
  border: 1px solid #d7d7d7;
  border-radius: 6px;
  padding: 8px 10px;
  background: #fafafa;
  color: #222;
  cursor: pointer;

  &:hover {
    background: #f0f0f0;
  }
`;

const ConfirmDangerBtn = styled(ActionBtn)`
  border-color: #dc3545;
  background: #dc3545;
  color: #fff;

  &:hover {
    background: #c82333;
  }
`;

const RadioGroup = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  min-width: 0;
`;

const CategoryRowHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
`;

const CategoryEditBtn = styled(ActionBtn)`
  padding: 3px 8px;
  font-size: 13px;
`;

const RadioLabel = styled.label`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #444;
  cursor: pointer;
  min-width: 0;
  max-width: 100%;
  overflow-wrap: anywhere;
`;

const CategoryTitle = styled.span`
  display: inline-block;
  min-width: 0;
  overflow-wrap: anywhere;
`;

const CategorySum = styled.span`
  color: #6b7280;
  font-size: 12px;
  white-space: nowrap;
`;

const CategoryDeleteBtn = styled.button`
  border: 1px solid #d7d7d7;
  border-radius: 999px;
  width: 18px;
  height: 18px;
  line-height: 1;
  font-size: 12px;
  cursor: pointer;
  color: #a00;
  background: #fff;
  padding: 0;

  &:hover {
    background: #ffecec;
  }
`;

const CategoryRenameInput = styled(Input)`
  min-width: 100px;
  max-width: 180px;
  font-size: 12px;
  padding: 4px 6px;
`;

const CategorySmallBtn = styled.button`
  border: 1px solid #d7d7d7;
  border-radius: 6px;
  min-width: 20px;
  height: 20px;
  line-height: 1;
  font-size: 11px;
  cursor: pointer;
  color: #444;
  background: #fff;
  padding: 0 4px;

  &:hover {
    background: #f4f4f4;
  }
`;

const Divider = styled.hr`
  border: none;
  border-top: 1px solid #ececec;
  margin: 4px 0;
`;

const EventsList = styled.ul`
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
  font-size: 12px;
  color: #666;
  line-height: 1.4;
  text-align: left;
`;

const GroupBlock = styled.li`
  list-style: none;
  margin-bottom: 10px;
`;

const GroupTitle = styled.div`
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  font-size: 12px;
  font-weight: 700;
  color: #333;
  margin-bottom: 4px;
  overflow-wrap: anywhere;
  word-break: break-word;
`;

const GroupRows = styled.ul`
  margin: 0;
  padding: 0;
  list-style: none;
  border-left: 2px solid #e5e5e5;
  padding-left: 8px;
  min-width: 0;
`;

const EventRow = styled.li`
  margin-bottom: 5px;
  cursor: ${({ $clickable }) => ($clickable ? 'pointer' : 'default')};
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
  border: 1px solid ${({ $highlighted }) => ($highlighted ? '#ff6b6b' : 'transparent')};
  border-radius: 6px;
  padding: 2px 4px;
  background: ${({ $highlighted }) => ($highlighted ? '#fff5f5' : 'transparent')};
`;

const EventText = styled.span`
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
  word-break: break-word;
`;

const DeleteRowBtn = styled.button`
  border: 1px solid #d7d7d7;
  border-radius: 4px;
  font-size: 11px;
  line-height: 1;
  width: 18px;
  height: 18px;
  cursor: pointer;
  color: #a00;
  background: #fff;

  &:hover {
    background: #ffecec;
  }
`;

const ChangeCategoryBtn = styled(DeleteRowBtn)`
  color: #3155b7;

  &:hover {
    background: #edf2ff;
  }
`;

const TinyBtn = styled.button`
  font-size: 11px;
  padding: 1px 6px;
  border: 1px solid #d7d7d7;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
`;

const EditInline = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-width: 0;
`;

const ConfirmBackdrop = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
`;

const ConfirmCard = styled.div`
  width: min(360px, calc(100vw - 24px));
  background: #fff;
  border-radius: 8px;
  padding: 14px;
  color: #222;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
`;

const ConfirmActions = styled.div`
  margin-top: 12px;
  display: flex;
  justify-content: center;
  gap: 8px;

  button {
    flex: 1;
    min-width: 120px;
    justify-content: center;
    display: inline-flex;
  }
`;

const ConfirmRowPreview = styled.div`
  margin-top: 10px;
  border: 1px solid #ff6b6b;
  border-radius: 6px;
  padding: 6px 8px;
  background: #fff5f5;
  font-size: 13px;
  overflow-wrap: anywhere;
  word-break: break-word;
`;

const ExchangeModalTitle = styled.div`
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 10px;
`;

const ExchangeOptions = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const ExchangeOption = styled.label`
  display: flex;
  align-items: flex-start;
  gap: 8px;
  border: 1px solid ${({ $selected }) => ($selected ? '#2f7bff' : '#e5e5e5')};
  border-radius: 8px;
  padding: 8px;
  cursor: pointer;
  background: ${({ $selected }) => ($selected ? '#edf4ff' : '#fff')};
`;

const ExchangeOptionText = styled.span`
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
`;

const ExchangeOptionTitle = styled.span`
  font-size: 13px;
  font-weight: 700;
  color: #222;
`;

const ExchangeOptionDescription = styled.span`
  font-size: 12px;
  color: #666;
  line-height: 1.35;
`;

const CustomRateBlock = styled.div`
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const CustomRateHint = styled.span`
  font-size: 12px;
  color: #666;
  line-height: 1.35;
`;

const normalizeCategoryPath = value =>
  String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[\\]+/g, '')
    .replace(/\/+/g, '/')
    .replace(/^\/+|\/+$/g, '');

const splitCategoryPath = value => {
  const normalized = normalizeCategoryPath(value);
  const [group = '', subgroup = ''] = normalized.split('/');
  return {
    group: group || 'general',
    subgroup: subgroup || '',
  };
};

const buildCategoryPath = (group, subgroup = '') => {
  const normalizedGroup = normalizeCategoryPath(group) || 'general';
  const normalizedSubgroup = normalizeCategoryPath(subgroup);
  return normalizedSubgroup ? `${normalizedGroup}/${normalizedSubgroup}` : normalizedGroup;
};

const formatDisplayDate = yyyyMmDd => {
  const [year, month, day] = String(yyyyMmDd || '').split('-');
  if (!year || !month || !day) return '';
  return `${day.padStart(2, '0')}.${month.padStart(2, '0')}.${year}`;
};

const parseDisplayDate = (display, fallbackYear = new Date().getFullYear()) => {
  const match = String(display || '')
    .trim()
    .match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?$/);
  if (!match) return '';
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3] || fallbackYear);
  if (day < 1 || day > 31 || month < 1 || month > 12) return '';
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() !== month - 1 ||
    dt.getUTCDate() !== day
  ) {
    return '';
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const todayYmd = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const sanitizeAmountChunk = value =>
  String(value || '')
    .trim()
    .replace(/[#$[/\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeFlowAmount = value => {
  const normalized = String(value || '').replace(/,/g, '.');
  if (isFormulaFlowAmount(normalized)) {
    return normalized
      .trim()
      .replace(/[#[\]]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  return sanitizeAmountChunk(normalized);
};
const FLOW_DATE_YMD_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const toAmountNumber = value => {
  const normalized = String(value || '').trim().replace(/,/g, '.');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const hasStoredFlowAmount = value => {
  const normalized = String(value ?? '').trim().replace(/,/g, '.');
  if (!normalized) return false;
  return Number.isFinite(Number(normalized));
};

const formatFlowAmountForClipboard = value => {
  const normalized = String(value || '').trim().replace(/,/g, '.');
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed)) return String(value || '').replace('.', ',');
  return parsed.toFixed(2).replace('.', ',');
};

const formatCategorySum = value => {
  if (!Number.isFinite(value)) return '0';
  const rounded = Math.round(value * 100) / 100;
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(2).replace(/\.?0+$/, '');
};

const formatCurrencyValue = value => {
  if (!Number.isFinite(value)) return '0';
  return value.toFixed(2).replace(/\.?0+$/, '');
};

const normalizeCustomUsdRate = value => {
  const parsed = Number(String(value || '').trim().replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const formatCustomUsdRate = value => {
  const normalizedRate = normalizeCustomUsdRate(value);
  return normalizedRate ? formatCurrencyValue(normalizedRate) : '';
};

const formatCustomUsdRateDisplay = value => {
  const formattedRate = formatCustomUsdRate(value);
  return formattedRate ? `1 $ = ${formattedRate} грн` : '';
};

const extractCustomUsdRateFromText = value => {
  const rawText = String(value || '').trim();
  if (!rawText) return { text: '', customUsdRate: '' };

  const patterns = [
    /(?:^|\s)(?:курс|rate|usd|дол(?:ар|арів)?|\$)\s*[:=]?\s*(\d+(?:[.,]\d+)?)(?:\s*(?:грн|uah))?\s*$/iu,
    /(?:^|\s)1?\s*\$\s*=?\s*(\d+(?:[.,]\d+)?)(?:\s*(?:грн|uah))?\s*$/iu,
    /(?:^|\s)(\d+(?:[.,]\d+)?)\s*(?:грн|uah)?\s*\/\s*\$\s*$/iu,
  ];

  for (const pattern of patterns) {
    const match = rawText.match(pattern);
    const formattedRate = formatCustomUsdRate(match?.[1]);
    if (formattedRate) {
      return {
        text: rawText.slice(0, match.index).trim(),
        customUsdRate: formattedRate,
      };
    }
  }

  return { text: rawText, customUsdRate: '' };
};

const formatGroupTitle = groupPath => {
  const { group, subgroup } = splitCategoryPath(groupPath);
  return subgroup ? `${group}, ${subgroup}` : group;
};

const getFlowRatesForRow = ({
  row,
  exchangeRateMode,
  exchangeRates,
  historicalRatesByDate,
  customUsdRate,
}) => {
  const baseRates =
    exchangeRateMode === 'nbu'
      ? historicalRatesByDate[row.date] || null
      : resolveFlowExchangeRatesForMode(exchangeRates, exchangeRateMode);
  const normalizedCustomUsdRate = normalizeCustomUsdRate(row.customUsdRate) || normalizeCustomUsdRate(customUsdRate);
  if (!normalizedCustomUsdRate) return baseRates;

  return {
    ...(baseRates || {}),
    usd: normalizedCustomUsdRate,
    customUsdRate: normalizedCustomUsdRate,
  };
};

const calculateFlowRowCurrencyAmount = ({
  row,
  currency = 'usd',
  exchangeRateMode,
  exchangeRates,
  historicalRatesByDate,
  customUsdRate,
}) => {
  const amountUah = toAmountNumber(row.amount);
  const rates = getFlowRatesForRow({
    row,
    exchangeRateMode,
    exchangeRates,
    historicalRatesByDate,
    customUsdRate,
  });
  const rate = Number(rates?.[currency]);
  if (Number.isFinite(amountUah) && Number.isFinite(rate) && rate > 0) {
    return amountUah / rate;
  }

  const storedAmount = toAmountNumber(currency === 'eur' ? row.amountEur : row.amountUsd);
  return storedAmount > 0 ? storedAmount : 0;
};

const makeFlowCurrencyFormulaResolver = rates => name => {
  const normalizedName = String(name || '').trim().toUpperCase();
  if (normalizedName === 'USD') return Number(rates?.usd);
  if (normalizedName === 'EUR') return Number(rates?.eur);
  return undefined;
};

const resolveFlowDisplayAmount = ({
  amount,
  row,
  exchangeRateMode,
  exchangeRates,
  historicalRatesByDate,
  customUsdRate,
}) => {
  const rawAmount = normalizeFlowAmount(amount);
  if (!isFormulaFlowAmount(rawAmount)) return rawAmount;

  const rates = getFlowRatesForRow({
    row: row || {},
    exchangeRateMode,
    exchangeRates,
    historicalRatesByDate,
    customUsdRate,
  });

  try {
    return normalizeFlowAmount(resolveFlowAmountInput(rawAmount, makeFlowCurrencyFormulaResolver(rates)));
  } catch {
    return rawAmount;
  }
};

const getFlowAmountNumberForTotals = options => toAmountNumber(resolveFlowDisplayAmount(options));

const FLOW_FORMULA_TOKEN_REGEX = /[0-9.,+\-*/%()\s×xXхХ÷:−–—$]/;
const FLOW_FORMULA_OPERATOR_END_REGEX = /[+\-*/%(×xXхХ÷:−–—]$/;
const FLOW_AMOUNT_START_REGEX = /^(?:[+-]?\d+(?:[.,]\d+)?|=)/;
const normalizeFlowCurrencyFormulaAmount = amount =>
  String(amount || '').startsWith('=') ? String(amount || '').replace(/\$/g, 'USD') : amount;

const splitFlowAmountAndDescription = value => {
  const raw = String(value || '').trim();
  if (!raw) return null;

  if (raw.startsWith('=')) {
    let index = 1;
    const canConsumeFormulaValue = () => {
      const prefix = raw.slice(1, index).trimEnd();
      if (!prefix) return true;
      return FLOW_FORMULA_OPERATOR_END_REGEX.test(prefix);
    };

    while (index < raw.length) {
      const tail = raw.slice(index);
      const identifierMatch = tail.match(/^(?:USD|EUR)\b/i);
      if (identifierMatch) {
        if (!canConsumeFormulaValue()) break;
        index += identifierMatch[0].length;
        continue;
      }
      if (raw[index] === '$') {
        if (!canConsumeFormulaValue()) break;
        index += 1;
        continue;
      }
      if (FLOW_FORMULA_TOKEN_REGEX.test(raw[index])) {
        index += 1;
        continue;
      }
      break;
    }
    const amountRaw = raw.slice(0, index).trim();
    const description = raw.slice(index).trim();
    if (!/(?:\d|\$|\b(?:USD|EUR)\b)/i.test(amountRaw)) return null;
    return { amountRaw, description };
  }

  const numberMatch = raw.match(/^([+-]?\d+(?:[.,]\d+)?)\s*(.*)$/);
  if (!numberMatch) return null;
  return {
    amountRaw: numberMatch[1],
    description: numberMatch[2] || '',
  };
};

export const parseFlowEntryLine = (line, fallbackDate = '') => {
  const trimmedLine = String(line || '').trim();
  if (!trimmedLine) return null;

  const leadingDateOnlyMatch = trimmedLine.match(/^(\d{1,2}\.\d{1,2}\.\d{4})(?:\s+(.*))?$/);
  if (leadingDateOnlyMatch) {
    const rest = String(leadingDateOnlyMatch[2] || '').trim();
    if (rest && !FLOW_AMOUNT_START_REGEX.test(rest)) {
      return null;
    }
  }

  const lineMatch = trimmedLine.match(/^(?:(\d{1,2}\.\d{1,2}(?:\.\d{4})?)\s+)?(.+)$/);
  if (!lineMatch) return null;

  const amountParts = splitFlowAmountAndDescription(lineMatch[2]);
  if (!amountParts) return null;

  const fallbackYear = Number(String(fallbackDate).split('-')[0]) || new Date().getFullYear();
  const parsedDate = lineMatch[1] ? parseDisplayDate(lineMatch[1], fallbackYear) : fallbackDate;
  const parsedAmount = normalizeFlowCurrencyFormulaAmount(normalizeFlowAmount(amountParts.amountRaw || ''));
  const { text: descriptionWithoutCustomRate, customUsdRate } = extractCustomUsdRateFromText(
    amountParts.description || ''
  );
  const parsedDescription = sanitizeEntryKeyChunk(descriptionWithoutCustomRate);

  if (!parsedDate || !parsedAmount) return null;
  return {
    date: parsedDate,
    amount: parsedAmount,
    description: parsedDescription,
    customUsdRate,
  };
};

const FLOW_DATE_TOKEN_PATTERN = /\b\d{1,2}\.\d{1,2}(?:\.\d{4})?\b/;

const resolveFlowFallbackDate = (rawText, fallbackDate = '') => {
  const normalizedFallbackDate = /^\d{4}-\d{2}-\d{2}$/.test(String(fallbackDate || ''))
    ? fallbackDate
    : '';
  if (FLOW_DATE_TOKEN_PATTERN.test(String(rawText || ''))) {
    return normalizedFallbackDate || todayYmd();
  }
  return todayYmd();
};

const parseFlowEntriesByDatesAndGroups = ({
  rawText,
  fallbackDate = '',
  defaultGroup = DEFAULT_FLOW_CATEGORY,
}) => {
  const normalizedFallbackDate = /^\d{4}-\d{2}-\d{2}$/.test(String(fallbackDate || ''))
    ? fallbackDate
    : todayYmd();
  const lines = String(rawText || '')
    .split(/\r?\n/)
    .map(line => String(line || '').trim())
    .filter(Boolean);
  const fallbackYear =
    Number(String(normalizedFallbackDate).split('-')[0]) || new Date().getFullYear();
  let currentGroup = normalizeCategoryPath(defaultGroup) || DEFAULT_FLOW_CATEGORY;
  let currentDate = normalizedFallbackDate;
  const entries = [];

  lines.forEach(line => {
    const groupMatch = line.match(/^\[(.+)]$/);
    if (groupMatch) {
      currentGroup = normalizeCategoryPath(groupMatch[1]) || currentGroup || DEFAULT_FLOW_CATEGORY;
      return;
    }

    const parsedLine = parseFlowEntryLine(line, currentDate || normalizedFallbackDate);
    if (parsedLine) {
      currentDate = parsedLine.date;
      entries.push({
        groupPath: currentGroup || DEFAULT_FLOW_CATEGORY,
        ...parsedLine,
      });
      return;
    }

    const parsedDate = parseDisplayDate(line, fallbackYear);
    if (parsedDate) {
      currentDate = parsedDate;
      return;
    }

    const parsedCategory = normalizeCategoryPath(line);
    if (parsedCategory) {
      currentGroup = parsedCategory;
    }
  });

  return entries;
};

const sanitizeEntryKeyChunk = value =>
  String(value || '')
    .trim()
    .replace(/[.#$[\]/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const DEFAULT_FLOW_CATEGORY = 'general';
const DEFAULT_FLOW_EXCHANGE_RATE_MODE = 'current';
const FLOW_EXCHANGE_RATE_OPTIONS = [
  {
    value: 'current',
    label: 'Поточний',
    description: 'Поточний доступний курс Monobank (за замовчуванням).',
  },
  {
    value: 'nbu',
    label: 'НБУ',
    description: 'Офіційний курс НБУ для дати кожного рядка.',
  },
  {
    value: 'sell',
    label: 'Продаж',
    description: 'Курс продажу валюти, якщо він доступний у джерелі.',
  },
  {
    value: 'buy',
    label: 'Купівля',
    description: 'Курс купівлі валюти, якщо він доступний у джерелі.',
  },
  {
    value: 'average',
    label: 'Середній',
    description: 'Середній між курсом купівлі та продажу або крос-курс.',
  },
  {
    value: 'interbank',
    label: 'Міжбанк',
    description: 'Крос/середній курс як найближчий доступний еквівалент міжбанку.',
  },
  {
    value: 'highest',
    label: 'Найвищий',
    description: 'Найвищий із доступних поточних курсів.',
  },
  {
    value: 'lowest',
    label: 'Найнижчий',
    description: 'Найнижчий із доступних поточних курсів.',
  },
];
const FLOW_EXCHANGE_RATE_MODE_VALUES = FLOW_EXCHANGE_RATE_OPTIONS.map(option => option.value);
const getValidFlowExchangeRateMode = value =>
  FLOW_EXCHANGE_RATE_MODE_VALUES.includes(value) ? value : DEFAULT_FLOW_EXCHANGE_RATE_MODE;
const getFlowExchangeRateModeLabel = value =>
  FLOW_EXCHANGE_RATE_OPTIONS.find(option => option.value === value)?.label || 'Поточний';
const flowDraftStorageKey = ownerId => `flow-draft:${ownerId || 'anon'}`;
const flowLastCategoryStorageKey = ownerId => `flow-last-category:${ownerId || 'anon'}`;
const flowExchangeRateModeStorageKey = ownerId => `flow-exchange-rate-mode:${ownerId || 'anon'}`;
const flowCustomUsdRateStorageKey = ownerId => `flow-custom-usd-rate:${ownerId || 'anon'}`;

export const flattenFlowEntriesFromBackend = flowNode => {
  if (!flowNode || typeof flowNode !== 'object') return [];

  const isDateKey = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
  const parseAmountTriplet = rawAmount => {
    const normalizedRawAmount = String(rawAmount || '').trim();
    if (!normalizedRawAmount) {
      return { amountUah: '', amountUsd: '', amountEur: '', customUsdRate: '' };
    }

    if (isFormulaFlowAmount(normalizedRawAmount)) {
      return { amountUah: normalizedRawAmount, amountUsd: '', amountEur: '', customUsdRate: '' };
    }

    const slashSeparated = normalizedRawAmount
      .split('/')
      .map(item => String(item || '').trim());

    if (slashSeparated.length >= 2) {
      const [amountUah = '', amountUsd = '', amountEur = '', customUsdRate = ''] = slashSeparated;
      return { amountUah, amountUsd, amountEur, customUsdRate };
    }

    const spaceSeparated = normalizedRawAmount
      .split(/\s+/)
      .map(item => String(item || '').trim())
      .filter(Boolean);

    if (spaceSeparated.length >= 3) {
      const [amountUah = '', amountUsd = '', amountEur = '', customUsdRate = ''] = spaceSeparated;
      return { amountUah, amountUsd, amountEur, customUsdRate };
    }

    return { amountUah: normalizedRawAmount, amountUsd: '', amountEur: '', customUsdRate: '' };
  };

  const parseEntryValue = value => {
    if (typeof value === 'string') {
      const [amount = '', ...rest] = String(value || '').split('_');
      const { amountUah, amountUsd, amountEur, customUsdRate } = parseAmountTriplet(amount);
      return {
        amount: amountUah,
        amountUsd,
        amountEur,
        customUsdRate,
        description: rest.join('_'),
      };
    }

    if (value && typeof value === 'object') {
      const rawAmount = value.amount ?? value.sum ?? value.value ?? '';
      const {
        amountUah,
        amountUsd: amountUsdFromAmount,
        amountEur: amountEurFromAmount,
        customUsdRate: customUsdRateFromAmount,
      } = parseAmountTriplet(rawAmount);
      return {
        amount: amountUah,
        amountUsd: value.amountUsd ?? value.usd ?? amountUsdFromAmount,
        amountEur: value.amountEur ?? value.eur ?? amountEurFromAmount,
        customUsdRate: value.customUsdRate ?? value.usdRate ?? customUsdRateFromAmount,
        description: value.description ?? value.comment ?? value.note ?? '',
      };
    }

    return {
      amount: '',
      amountUsd: '',
      amountEur: '',
      customUsdRate: '',
      description: '',
    };
  };

  const collectEntries = (node, groupPath = DEFAULT_FLOW_CATEGORY) => {
    if (!node || typeof node !== 'object') return [];

    return Object.entries(node).flatMap(([key, value]) => {
      if (!value || typeof value !== 'object') return [];

      if (isDateKey(key)) {
        return Object.entries(value)
          .map(([entryId, entryValue]) => {
            const parsed = parseEntryValue(entryValue);
            const normalizedAmount = normalizeFlowAmount(parsed.amount);
            if (!normalizedAmount) return null;

            return {
              entryId,
              group: normalizeCategoryPath(groupPath) || DEFAULT_FLOW_CATEGORY,
              date: key,
              amount: normalizedAmount,
              amountUsd: normalizeFlowAmount(parsed.amountUsd),
              amountEur: normalizeFlowAmount(parsed.amountEur),
              customUsdRate: formatCustomUsdRate(parsed.customUsdRate),
              description: sanitizeEntryKeyChunk(parsed.description),
            };
          })
          .filter(Boolean);
      }

      const nestedGroupPath = buildCategoryPath(groupPath, key);
      return collectEntries(value, nestedGroupPath);
    });
  };

  return Object.entries(flowNode).flatMap(([groupPath, groupNode]) => {
    const normalizedGroupPath = normalizeCategoryPath(groupPath) || DEFAULT_FLOW_CATEGORY;
    return collectEntries(groupNode, normalizedGroupPath);
  });
};

const sortRowsByDate = rows =>
  [...rows].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));

const sortRowsByGroupAndDate = rows =>
  [...rows].sort((a, b) => {
    const groupCompare = String(a.group || '').localeCompare(String(b.group || ''));
    if (groupCompare !== 0) return groupCompare;
    return String(a.date || '').localeCompare(String(b.date || ''));
  });

export const FlowManager = ({ ownerId }) => {
  const navigate = useNavigate();
  const [flowData, setFlowData] = useState({});
  const [dateYmd, setDateYmd] = useState(todayYmd());
  const [entryInput, setEntryInput] = useState('');
  const [categoryInput, setCategoryInput] = useState('');
  const [subCategoryInput, setSubCategoryInput] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('');
  const [selectedSubgroup, setSelectedSubgroup] = useState('');
  const [localCategories, setLocalCategories] = useState([DEFAULT_FLOW_CATEGORY]);
  const [loading, setLoading] = useState(false);
  const [editingKey, setEditingKey] = useState(null);
  const [editingDraft, setEditingDraft] = useState({ line: '' });
  const [confirmState, setConfirmState] = useState({ type: null, row: null, rowKey: null });
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isCategoryEditMode, setIsCategoryEditMode] = useState(false);
  const [renamingCategory, setRenamingCategory] = useState({ source: '', draft: '' });
  const [exchangeRates, setExchangeRates] = useState(null);
  const [historicalRatesByDate, setHistoricalRatesByDate] = useState({});
  const [exchangeRateMode, setExchangeRateMode] = useState(DEFAULT_FLOW_EXCHANGE_RATE_MODE);
  const [isExchangeModalOpen, setIsExchangeModalOpen] = useState(false);
  const [customUsdRate, setCustomUsdRate] = useState('');
  const [customUsdRateDraft, setCustomUsdRateDraft] = useState('');
  const [isCustomUsdRateFocused, setIsCustomUsdRateFocused] = useState(false);
  const menuRef = useRef(null);
  const entryInputRef = useRef(null);
  const categoryInputRef = useRef(null);
  const subCategoryInputRef = useRef(null);
  const entryRowRef = useRef(null);
  useAutoResize(entryInputRef, entryInput);

  const flowRows = useMemo(() => flattenFlowEntriesFromBackend(flowData), [flowData]);
  const categoriesFromDb = useMemo(
    () => [...new Set(flowRows.map(row => normalizeCategoryPath(row.group)).filter(Boolean))],
    [flowRows]
  );

  const allCategories = useMemo(() => {
    const merged = [...localCategories, ...categoriesFromDb]
      .map(normalizeCategoryPath)
      .filter(Boolean);
    const unique = [...new Set(merged)];
    return unique.sort((a, b) => {
      if (a === DEFAULT_FLOW_CATEGORY) return -1;
      if (b === DEFAULT_FLOW_CATEGORY) return 1;
      return a.localeCompare(b);
    });
  }, [categoriesFromDb, localCategories]);
  const groupedCategories = useMemo(
    () =>
      allCategories.reduce((acc, categoryPath) => {
        const { group, subgroup } = splitCategoryPath(categoryPath);
        if (!acc[group]) acc[group] = [];
        if (subgroup && !acc[group].includes(subgroup)) {
          acc[group].push(subgroup);
        }
        return acc;
      }, {}),
    [allCategories]
  );
  const allGroups = useMemo(() => Object.keys(groupedCategories), [groupedCategories]);
  const subgroupsForSelectedGroup = useMemo(
    () => groupedCategories[selectedGroup] || [],
    [groupedCategories, selectedGroup]
  );
  const selectedCategoryPath = useMemo(
    () => buildCategoryPath(selectedGroup, selectedSubgroup),
    [selectedGroup, selectedSubgroup]
  );
  const renameCategorySuggestions = useMemo(() => {
    const sourceCategory = normalizeCategoryPath(renamingCategory.source);
    return allGroups.filter(category => category !== sourceCategory);
  }, [allGroups, renamingCategory.source]);

  const categorySums = useMemo(
    () =>
      flowRows.reduce((acc, row) => {
        const group = normalizeCategoryPath(row.group) || DEFAULT_FLOW_CATEGORY;
        if (!acc[group]) {
          acc[group] = { uah: 0, usd: 0, eur: 0 };
        }
        const amountUah = getFlowAmountNumberForTotals({
          amount: row.amount,
          row,
          exchangeRateMode,
          exchangeRates,
          historicalRatesByDate,
          customUsdRate,
        });
        const displayAmountRow = { ...row, amount: formatCategorySum(amountUah) };
        const amountUsdDerived = calculateFlowRowCurrencyAmount({
          row: displayAmountRow,
          currency: 'usd',
          exchangeRateMode,
          exchangeRates,
          historicalRatesByDate,
          customUsdRate,
        });
        const amountEurDerived = calculateFlowRowCurrencyAmount({
          row: displayAmountRow,
          currency: 'eur',
          exchangeRateMode,
          exchangeRates,
          historicalRatesByDate,
          customUsdRate,
        });
        acc[group].uah += amountUah;
        acc[group].usd += amountUsdDerived;
        acc[group].eur += amountEurDerived;
        return acc;
      }, {}),
    [customUsdRate, exchangeRateMode, exchangeRates, flowRows, historicalRatesByDate]
  );
  const sortedFlowRows = useMemo(() => sortRowsByGroupAndDate(flowRows), [flowRows]);
  const groupedFlowRows = useMemo(
    () =>
      sortedFlowRows.reduce((acc, row, idx) => {
        const group = row.group || 'general';
        if (!acc[group]) acc[group] = [];
        acc[group].push({ row, idx });
        return acc;
      }, {}),
    [sortedFlowRows]
  );

  const reload = useCallback(async () => {
    if (!ownerId) return;
    setLoading(true);
    try {
      const data = await fetchFlowData(ownerId);
      setFlowData(data || {});
    } catch (error) {
      console.error('Unable to load flow data', error);
      toast.error('Не вдалося завантажити Flow');
    } finally {
      setLoading(false);
    }
  }, [ownerId]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    let isMounted = true;

    const loadExchangeRates = async () => {
      try {
        const rates = await fetchMonobankUahExchangeRates();
        if (isMounted) {
          setExchangeRates(rates);
        }
      } catch (error) {
        console.error('Unable to load Monobank exchange rates', error);
      }
    };

    loadExchangeRates();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!ownerId) return;
    try {
      const savedMode = localStorage.getItem(flowExchangeRateModeStorageKey(ownerId));
      setExchangeRateMode(getValidFlowExchangeRateMode(savedMode));
    } catch (error) {
      console.error('Unable to restore flow exchange rate mode from localStorage', error);
      setExchangeRateMode(DEFAULT_FLOW_EXCHANGE_RATE_MODE);
    }
  }, [ownerId]);

  useEffect(() => {
    if (!ownerId) return;
    try {
      localStorage.setItem(flowExchangeRateModeStorageKey(ownerId), exchangeRateMode);
    } catch (error) {
      console.error('Unable to persist flow exchange rate mode into localStorage', error);
    }
  }, [exchangeRateMode, ownerId]);

  useEffect(() => {
    if (!ownerId) return;
    try {
      const savedRate = localStorage.getItem(flowCustomUsdRateStorageKey(ownerId));
      const formattedRate = formatCustomUsdRate(savedRate);
      setCustomUsdRate(formattedRate);
      setCustomUsdRateDraft(formattedRate);
    } catch (error) {
      console.error('Unable to restore custom Flow USD rate from localStorage', error);
      setCustomUsdRate('');
      setCustomUsdRateDraft('');
    }
  }, [ownerId]);

  useEffect(() => {
    if (!ownerId) return;
    try {
      const formattedRate = formatCustomUsdRate(customUsdRate);
      if (formattedRate) {
        localStorage.setItem(flowCustomUsdRateStorageKey(ownerId), formattedRate);
      } else {
        localStorage.removeItem(flowCustomUsdRateStorageKey(ownerId));
      }
    } catch (error) {
      console.error('Unable to persist custom Flow USD rate into localStorage', error);
    }
  }, [customUsdRate, ownerId]);

  useEffect(() => {
    if (!ownerId) return;
    try {
      const lastCategoryRaw = localStorage.getItem(flowLastCategoryStorageKey(ownerId));
      const lastCategory = normalizeCategoryPath(lastCategoryRaw);
      if (lastCategory) {
        const { group, subgroup } = splitCategoryPath(lastCategory);
        setSelectedGroup(group);
        setSelectedSubgroup(subgroup);
      }

      const raw = localStorage.getItem(flowDraftStorageKey(ownerId));
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        if (parsed.dateYmd) setDateYmd(parsed.dateYmd);
        if (typeof parsed.entryInput === 'string') {
          setEntryInput(parsed.entryInput);
        }
        if (typeof parsed.entryInput !== 'string') {
          const restoredDate = parsed.dateYmd ? formatDisplayDate(parsed.dateYmd) : formatDisplayDate(todayYmd());
          const restoredAmount = typeof parsed.amount === 'string' ? parsed.amount : '';
          const restoredDescription = typeof parsed.description === 'string' ? parsed.description : '';
          setEntryInput(`${restoredDate} ${restoredAmount} ${restoredDescription}`.trim());
        }
        if (parsed.selectedCategory) {
          const parsedPath = splitCategoryPath(parsed.selectedCategory);
          setSelectedGroup(parsedPath.group);
          setSelectedSubgroup(parsedPath.subgroup);
        }
        if (Array.isArray(parsed.localCategories)) {
          setLocalCategories(prev => {
            const merged = [...prev, ...parsed.localCategories.map(normalizeCategoryPath).filter(Boolean)];
            return [...new Set(merged)];
          });
        }
      }
    } catch (error) {
      console.error('Unable to restore flow draft from localStorage', error);
    }
  }, [ownerId]);

  useEffect(() => {
    const datesMissingRates = [...new Set(
      flowRows
        .filter(row => {
          if (!FLOW_DATE_YMD_REGEX.test(String(row.date || ''))) return false;
          const hasStoredFx = hasStoredFlowAmount(row.amountUsd) || hasStoredFlowAmount(row.amountEur);
          return exchangeRateMode === 'nbu' || !hasStoredFx;
        })
        .map(row => row.date)
        .filter(date => !historicalRatesByDate[date])
    )];

    if (datesMissingRates.length === 0) return;

    let cancelled = false;
    (async () => {
      const resolvedRates = await Promise.all(
        datesMissingRates.map(async date => {
          try {
            const rates = await fetchNbuUahExchangeRatesByDate(date);
            return [date, rates];
          } catch (error) {
            console.error(`Unable to load fallback historical FX rates for ${date}`, error);
            return [date, null];
          }
        })
      );
      if (cancelled) return;
      setHistoricalRatesByDate(prev => {
        let didChange = false;
        const next = { ...prev };
        resolvedRates.forEach(([date, rates]) => {
          const nextRates = rates?.usd || rates?.eur ? rates : { unavailable: true };
          if (JSON.stringify(prev[date]) !== JSON.stringify(nextRates)) {
            next[date] = nextRates;
            didChange = true;
          }
        });
        return didChange ? next : prev;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [exchangeRateMode, flowRows, historicalRatesByDate]);

  useEffect(() => {
    if (!ownerId) return;
    try {
      localStorage.setItem(
        flowDraftStorageKey(ownerId),
        JSON.stringify({
          dateYmd,
          entryInput,
          selectedCategory: selectedCategoryPath,
          localCategories,
        })
      );
    } catch (error) {
      console.error('Unable to persist flow draft into localStorage', error);
    }
  }, [dateYmd, entryInput, localCategories, ownerId, selectedCategoryPath]);

  useEffect(() => {
    if (!ownerId) return;
    const normalizedCategory = normalizeCategoryPath(selectedCategoryPath);
    if (!normalizedCategory) return;
    try {
      localStorage.setItem(flowLastCategoryStorageKey(ownerId), normalizedCategory);
    } catch (error) {
      console.error('Unable to persist last flow category into localStorage', error);
    }
  }, [ownerId, selectedCategoryPath]);

  useEffect(() => {
    if (!isMenuOpen) return undefined;
    const handleOutsideClick = event => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isMenuOpen]);

  useEffect(() => {
    if (
      allCategories.length > 0 &&
      (!selectedCategoryPath || !allCategories.includes(selectedCategoryPath))
    ) {
      const fallbackPath = splitCategoryPath(allCategories[0]);
      setSelectedGroup(fallbackPath.group);
      setSelectedSubgroup(fallbackPath.subgroup);
    }
  }, [allCategories, selectedCategoryPath]);

  useEffect(() => {
    if (!selectedGroup) return;
    if (subgroupsForSelectedGroup.includes(selectedSubgroup)) return;
    setSelectedSubgroup('');
  }, [selectedGroup, selectedSubgroup, subgroupsForSelectedGroup]);

  const addCategory = () => {
    const normalized = normalizeCategoryPath(categoryInput);
    if (!normalized) return;
    setLocalCategories(prev => (prev.includes(normalized) ? prev : [...prev, normalized]));
    setSelectedGroup(normalized);
    setSelectedSubgroup('');
    setCategoryInput('');
  };

  const addSubcategory = () => {
    const normalizedGroup = normalizeCategoryPath(selectedGroup) || DEFAULT_FLOW_CATEGORY;
    const normalizedSubgroup = normalizeCategoryPath(subCategoryInput);
    if (!normalizedSubgroup) return;
    const nextPath = buildCategoryPath(normalizedGroup, normalizedSubgroup);
    setLocalCategories(prev => (prev.includes(nextPath) ? prev : [...prev, nextPath]));
    setSelectedGroup(normalizedGroup);
    setSelectedSubgroup(normalizedSubgroup);
    setSubCategoryInput('');
  };

  const handleDeleteCategory = async category => {
    const normalized = normalizeCategoryPath(category);
    if (!ownerId || !normalized) return;
    const categoryPrefix = `${normalized}/`;

    try {
      if (
        categoriesFromDb.some(
          item => item === normalized || item.startsWith(categoryPrefix)
        )
      ) {
        await deleteFlowCategory({ ownerId, groupPath: normalized });
      }
      setLocalCategories(prev =>
        prev.filter(item => item !== normalized && !item.startsWith(categoryPrefix))
      );
      if (selectedGroup === normalized) {
        setSelectedGroup('');
        setSelectedSubgroup('');
      }
      toast.success(`Групу "${normalized}" видалено`);
      await reload();
    } catch (error) {
      console.error('Unable to delete flow category', error);
      toast.error('Не вдалося видалити групу');
    }
  };

  const startCategoryRename = category => {
    setRenamingCategory({ source: category, draft: category });
  };

  const cancelCategoryRename = () => {
    setRenamingCategory({ source: '', draft: '' });
  };

  const submitCategoryRename = async category => {
    const normalizedSource = normalizeCategoryPath(category);
    const normalizedTarget = normalizeCategoryPath(renamingCategory.draft);
    const sourcePrefix = `${normalizedSource}/`;

    if (!normalizedSource || !normalizedTarget) {
      toast.error('Вкажіть валідну назву групи');
      return;
    }

    if (normalizedSource === normalizedTarget) {
      cancelCategoryRename();
      return;
    }

    const targetExists = allGroups.includes(normalizedTarget);
    if (targetExists) {
      const shouldMerge = window.confirm(
        `Група "${normalizedTarget}" вже існує. Об’єднати "${normalizedSource}" в "${normalizedTarget}"?`
      );
      if (!shouldMerge) return;
    }

    try {
      if (
        categoriesFromDb.some(
          item => item === normalizedSource || item.startsWith(sourcePrefix)
        )
      ) {
        await renameFlowCategory({
          ownerId,
          fromGroupPath: normalizedSource,
          toGroupPath: normalizedTarget,
        });
      }

      setLocalCategories(prev => {
        const renamed = prev.map(item => {
          if (item === normalizedSource) return normalizedTarget;
          if (item.startsWith(sourcePrefix)) return `${normalizedTarget}/${item.slice(sourcePrefix.length)}`;
          return item;
        });
        return [...new Set(renamed)];
      });
      if (selectedGroup === normalizedSource) {
        const normalizedTargetPath = splitCategoryPath(buildCategoryPath(normalizedTarget, selectedSubgroup));
        setSelectedGroup(normalizedTargetPath.group);
        setSelectedSubgroup(normalizedTargetPath.subgroup);
      }
      cancelCategoryRename();
      toast.success(
        targetExists
          ? `Групи об’єднано в "${normalizedTarget}"`
          : `Групу перейменовано на "${normalizedTarget}"`
      );
      await reload();
    } catch (error) {
      console.error('Unable to rename flow category', error);
      toast.error('Не вдалося перейменувати групу');
    }
  };

  const handleSave = async ({ silentValidation = false, rawText } = {}) => {
    const normalizedCategory = normalizeCategoryPath(selectedCategoryPath) || DEFAULT_FLOW_CATEGORY;
    const saveText = rawText ?? entryInput;
    const effectiveFallbackDate = resolveFlowFallbackDate(saveText, dateYmd);
    const parsedEntries = parseFlowEntriesByDatesAndGroups({
      rawText: saveText,
      fallbackDate: effectiveFallbackDate,
      defaultGroup: normalizedCategory,
    });

    if (!ownerId || parsedEntries.length === 0) {
      if (!silentValidation) {
        toast.error('Заповніть валідні дані: дата + сума + опис (з групами за потреби)');
      }
      return;
    }

    try {
      await Promise.all(
        parsedEntries.map(entry => {
          const rowCustomUsdRate = formatCustomUsdRate(entry.customUsdRate);
          return saveFlowEntry({
            ownerId,
            ...entry,
            exchangeRates,
            exchangeRateMode,
            customUsdRate: rowCustomUsdRate || customUsdRate,
            rowCustomUsdRate,
          });
        })
      );
      const lastEntry = parsedEntries[parsedEntries.length - 1];
      setDateYmd(lastEntry.date);
      const selectedPath = splitCategoryPath(lastEntry.groupPath || normalizedCategory);
      setSelectedGroup(selectedPath.group);
      setSelectedSubgroup(selectedPath.subgroup);
      setEntryInput('');
      toast.success(
        parsedEntries.length === 1
          ? 'Flow збережено'
          : `Flow збережено: ${parsedEntries.length} записів`
      );
      await reload();
    } catch (error) {
      console.error('Unable to save flow entry', error);
      toast.error('Не вдалося зберегти Flow');
    }
  };

  const handleCopyToClipboard = async () => {
    if (flowRows.length === 0) {
      toast.error('Немає даних для копіювання');
      return;
    }

    const grouped = flowRows.reduce((acc, row) => {
      const key = row.group || 'general';
      if (!acc[key]) acc[key] = [];
      acc[key].push(row);
      return acc;
    }, {});

    const tableText = Object.entries(grouped)
      .map(([groupPath, rows]) => {
        const { group, subgroup } = splitCategoryPath(groupPath);
        const title = subgroup ? `${group}, ${subgroup}` : group;
        const lines = sortRowsByDate(rows).map(row => {
          const displayDate = formatDisplayDate(row.date);
          const formattedAmount = formatFlowAmountForClipboard(resolveFlowDisplayAmount({ amount: row.amount, row, exchangeRateMode, exchangeRates, historicalRatesByDate, customUsdRate }));
          return `${displayDate}\t${formattedAmount}\t\t${row.description || ''}`.trimEnd();
        });
        return [title, ...lines].join('\n');
      })
      .join('\n\n');

    try {
      await navigator.clipboard.writeText(tableText);
      toast.success('Скопійовано в буфер обміну');
    } catch (error) {
      console.error('Unable to copy flow data to clipboard', error);
      toast.error('Не вдалося скопіювати дані');
    }
  };

  const handleClear = async () => {
    if (!ownerId) return;
    try {
      await clearFlowData(ownerId);
      setFlowData({});
      toast.success('Flow очищено');
    } catch (error) {
      console.error('Unable to clear flow', error);
      toast.error('Не вдалося очистити Flow');
    }
  };

  const handleDeleteRow = async row => {
    if (!ownerId) return;
    try {
      await deleteFlowEntry({
        ownerId,
        groupPath: row.group || 'general',
        date: row.date,
        amount: row.amount,
        description: row.description,
        entryId: row.entryId,
      });
      toast.success('Запис видалено');
      await reload();
    } catch (error) {
      console.error('Unable to delete flow row', error);
      toast.error('Не вдалося видалити запис');
    }
  };

  const openClearConfirm = () => setConfirmState({ type: 'clear', row: null, rowKey: null });
  const openDeleteConfirm = (row, rowKey) => setConfirmState({ type: 'row', row, rowKey });
  const closeConfirm = () => setConfirmState({ type: null, row: null, rowKey: null });

  const handleConfirm = async () => {
    if (confirmState.type === 'clear') {
      await handleClear();
      closeConfirm();
      return;
    }
    if (confirmState.type === 'row' && confirmState.row) {
      await handleDeleteRow(confirmState.row);
      closeConfirm();
    }
  };

  const getRowKey = (row, idx) =>
    `${row.group || 'general'}|${row.date}|${row.entryId || `${row.amount}|${row.description}|${idx}`}`;

  const beginEdit = (row, idx) => {
    const key = getRowKey(row, idx);
    setEditingKey(key);
    const formattedRowRate = formatCustomUsdRate(row.customUsdRate);
    const baseLine = `${formatDisplayDate(row.date)} ${row.amount} ${row.description}`.trim();
    setEditingDraft({
      line: formattedRowRate ? `${baseLine} курс ${formattedRowRate}` : baseLine,
    });
  };

  const cancelEdit = () => {
    setEditingKey(null);
    setEditingDraft({ line: '' });
  };

  const saveEditedRow = async (row, idx) => {
    if (!ownerId) return;
    const rowKey = getRowKey(row, idx);
    if (editingKey !== rowKey) return;

    const parsedLine = parseFlowEntryLine(editingDraft.line, row.date);
    if (!parsedLine) {
      toast.error('Формат редагування: дд.мм або дд.мм.рррр 100 опис курс 40.5');
      return;
    }
    const parsedDate = parsedLine.date;
    const nextAmount = normalizeFlowAmount(parsedLine.amount || '');
    const nextDescription = sanitizeEntryKeyChunk(parsedLine.description || '');
    if (!parsedDate || !nextAmount) {
      toast.error('Для редагування потрібні валідні дата і сума');
      return;
    }

    const rowCustomUsdRate = formatCustomUsdRate(parsedLine.customUsdRate);
    const effectiveCustomUsdRate = rowCustomUsdRate || customUsdRate;

    try {
      await updateFlowEntry({
        ownerId,
        groupPath: row.group || 'general',
        prevEntry: {
          entryId: row.entryId,
          date: row.date,
          amount: row.amount,
          description: row.description,
        },
        nextEntry: {
          date: parsedDate,
          amount: nextAmount,
          description: nextDescription,
          customUsdRate: rowCustomUsdRate,
        },
        exchangeRates,
        exchangeRateMode,
        customUsdRate: effectiveCustomUsdRate,
        rowCustomUsdRate,
      });
      toast.success('Запис оновлено');
      cancelEdit();
      await reload();
    } catch (error) {
      console.error('Unable to update flow row', error);
      toast.error('Не вдалося оновити запис');
    }
  };

  const handleChangeRowCategory = async row => {
    if (!ownerId) return;
    const nextCategoryRaw = window.prompt(
      'Вкажіть нову групу для платежу',
      row.group || DEFAULT_FLOW_CATEGORY,
    );
    if (nextCategoryRaw === null) return;

    const nextCategory = normalizeCategoryPath(nextCategoryRaw);
    if (!nextCategory) {
      toast.error('Вкажіть валідну назву групи');
      return;
    }
    if (nextCategory === row.group) return;

    try {
      await updateFlowEntry({
        ownerId,
        groupPath: row.group || DEFAULT_FLOW_CATEGORY,
        nextGroupPath: nextCategory,
        prevEntry: {
          entryId: row.entryId,
          date: row.date,
          amount: row.amount,
          description: row.description,
        },
        nextEntry: {
          date: row.date,
          amount: row.amount,
          description: row.description,
          customUsdRate: row.customUsdRate,
        },
        exchangeRates,
        exchangeRateMode,
        customUsdRate: row.customUsdRate || customUsdRate,
        rowCustomUsdRate: row.customUsdRate,
      });
      setLocalCategories(prev => (prev.includes(nextCategory) ? prev : [...prev, nextCategory]));
      toast.success(`Платіж перенесено в групу "${nextCategory}"`);
      await reload();
    } catch (error) {
      console.error('Unable to change flow row category', error);
      toast.error('Не вдалося змінити групу платежу');
    }
  };

  return (
    <Wrap>
      <TopControls>
        <TopActionBtn
          type="button"
          onMouseDown={e => e.preventDefault()}
          onClick={() => setIsExchangeModalOpen(true)}
          aria-label="Обрати курс Flow"
          title={`Курс Flow: ${getFlowExchangeRateModeLabel(exchangeRateMode)}`}
          $bg="#198754"
        >
          $
        </TopActionBtn>
        <CopyBtn
          type="button"
          onClick={handleCopyToClipboard}
          aria-label="Копіювати Flow у буфер обміну"
          title="Копіювати Flow у буфер обміну"
          $bg="#2f7bff"
        >
          <ClipboardIcon />
        </CopyBtn>
        <DangerBtn type="button" onClick={openClearConfirm} $bg="#dc3545">del</DangerBtn>
        <MenuWrap ref={menuRef}>
          <MenuBtn
            type="button"
            aria-label="Відкрити меню навігації"
            onClick={() => setIsMenuOpen(prev => !prev)}
            $bg="#6f42c1"
          >
            ⋮
          </MenuBtn>
          {isMenuOpen && (
            <MenuPanel>
              <MenuItem
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  navigate('/my-profile');
                }}
              >
                Перейти в профіль
              </MenuItem>
              <MenuItem
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  navigate('/add');
                }}
              >
                перейти на add
              </MenuItem>
              <MenuItem
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  navigate('/matching');
                }}
              >
                перейти на matching
              </MenuItem>
            </MenuPanel>
          )}
        </MenuWrap>
      </TopControls>

      <Row>
        <Label>
          Нова група
          <Input
            ref={categoryInputRef}
            value={categoryInput}
            onChange={e => {
              setCategoryInput(e.target.value);
            }}
            onBlur={addCategory}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addCategory();
              }
            }}
            placeholder="напр. Тест1"
          />
        </Label>
      </Row>

      <Row>
        <Label>
          Нова підгрупа
          <Input
            ref={subCategoryInputRef}
            value={subCategoryInput}
            onChange={e => {
              setSubCategoryInput(e.target.value);
            }}
            onBlur={addSubcategory}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addSubcategory();
              }
            }}
            placeholder="напр. Транспорт"
          />
        </Label>
      </Row>

      <Label as="div">
        <CategoryRowHead>
          <span>Група витрат</span>
          <CategoryEditBtn
            type="button"
            onClick={() => {
              setIsCategoryEditMode(prev => !prev);
              cancelCategoryRename();
            }}
            title={isCategoryEditMode ? 'Сховати видалення груп' : 'Редагувати групи'}
            aria-label={isCategoryEditMode ? 'Сховати видалення груп' : 'Редагувати групи'}
          >
            ✏
          </CategoryEditBtn>
        </CategoryRowHead>
        <RadioGroup>
          {allGroups.map(category => (
            <RadioLabel key={category}>
              <input
                type="radio"
                name="flow-group"
                value={category}
                checked={selectedGroup === category}
                onChange={e => setSelectedGroup(normalizeCategoryPath(e.target.value))}
              />
              {renamingCategory.source === category ? (
                <CategoryRenameInput
                  autoFocus
                  value={renamingCategory.draft}
                  list="flow-rename-category-options"
                  onMouseDown={e => e.preventDefault()}
                  onClick={e => e.stopPropagation()}
                  onChange={e => setRenamingCategory(prev => ({ ...prev, draft: e.target.value }))}
                  onBlur={() => submitCategoryRename(category)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      submitCategoryRename(category);
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      cancelCategoryRename();
                    }
                  }}
                />
              ) : <CategoryTitle>{category}</CategoryTitle>}
              {isCategoryEditMode && (
                <>
                  {renamingCategory.source !== category && (
                    <CategorySmallBtn
                      type="button"
                      aria-label={`Перейменувати групу ${category}`}
                      title={`Перейменувати групу ${category}`}
                      onMouseDown={e => e.preventDefault()}
                      onClick={e => {
                        e.preventDefault();
                        e.stopPropagation();
                        startCategoryRename(category);
                      }}
                    >
                      ✎
                    </CategorySmallBtn>
                  )}
                  <CategoryDeleteBtn
                    type="button"
                    aria-label={`Видалити групу ${category}`}
                    title={`Видалити групу ${category}`}
                    onMouseDown={e => e.preventDefault()}
                    onClick={e => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleDeleteCategory(category);
                    }}
                  >
                    ×
                  </CategoryDeleteBtn>
                </>
              )}
            </RadioLabel>
          ))}
        </RadioGroup>
        <datalist id="flow-rename-category-options">
          {renameCategorySuggestions.map(category => (
            <option key={category} value={category} />
          ))}
        </datalist>
      </Label>

      <Label as="div">
        <CategoryRowHead>
          <span>Підгрупа витрат</span>
        </CategoryRowHead>
        <RadioGroup>
          <RadioLabel key={`${selectedGroup}-base`}>
            <input
              type="radio"
              name="flow-subcategory"
              value=""
              checked={!selectedSubgroup}
              onChange={() => setSelectedSubgroup('')}
            />
            <CategoryTitle>Без підгрупи</CategoryTitle>
          </RadioLabel>
          {subgroupsForSelectedGroup.map(subgroup => (
            <RadioLabel key={`${selectedGroup}/${subgroup}`}>
              <input
                type="radio"
                name="flow-subcategory"
                value={subgroup}
                checked={selectedSubgroup === subgroup}
                onChange={e => setSelectedSubgroup(normalizeCategoryPath(e.target.value))}
              />
              <CategoryTitle>{subgroup}</CategoryTitle>
              {isCategoryEditMode && (
                <CategoryDeleteBtn
                  type="button"
                  aria-label={`Видалити підгрупу ${subgroup}`}
                  title={`Видалити підгрупу ${subgroup}`}
                  onMouseDown={e => e.preventDefault()}
                  onClick={e => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleDeleteCategory(buildCategoryPath(selectedGroup, subgroup));
                  }}
                >
                  ×
                </CategoryDeleteBtn>
              )}
            </RadioLabel>
          ))}
        </RadioGroup>
      </Label>

      <Divider />

      <Row ref={entryRowRef}>
        <Label>
          Дата + сума + опис (підтримка груп і дат у кілька рядків)
          <EntryInputWrap>
            <EntryInput
              ref={entryInputRef}
              rows={1}
              value={entryInput}
              onChange={e => {
                const nextValue = e.target.value;
                setEntryInput(nextValue);
                const effectiveFallbackDate = resolveFlowFallbackDate(nextValue, dateYmd);
                const parsed = parseFlowEntriesByDatesAndGroups({
                  rawText: nextValue,
                  fallbackDate: effectiveFallbackDate,
                  defaultGroup: selectedCategoryPath,
                })?.[0];
                if (parsed?.date) setDateYmd(parsed.date);
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleSave({ rawText: entryInput });
                  categoryInputRef.current?.focus();
                }
              }}
              onBlur={e => {
                if (entryRowRef.current?.contains(e.relatedTarget)) return;
                handleSave({ silentValidation: true });
              }}
              placeholder={'Заголовок\n20.01.2026 =100+25*2 кава'}
              style={{ paddingRight: entryInput ? 34 : 8 }}
            />
            {entryInput && (
              <ClearEntryBtn
                type="button"
                aria-label="Очистити поле вводу Flow"
                title="Очистити"
                onClick={() => {
                  setEntryInput('');
                  entryInputRef.current?.focus();
                }}
              >
                ×
              </ClearEntryBtn>
            )}
          </EntryInputWrap>
        </Label>
      </Row>

      <EventsList>
        {Object.entries(groupedFlowRows).map(([group, entries]) => (
          <GroupBlock key={group}>
            <GroupTitle>
              <span>{formatGroupTitle(group)}</span>
              <CategorySum>
                {(() => {
                  const categoryTotals = categorySums[group] || { uah: 0, usd: 0, eur: 0 };
                  const amountUah = categoryTotals.uah || 0;
                  const amountUahText = `${formatCategorySum(amountUah)} грн`;
                  if (categoryTotals.usd !== 0 || categoryTotals.eur !== 0) {
                    return `${amountUahText} / ${formatCurrencyValue(categoryTotals.usd)} $ / ${formatCurrencyValue(categoryTotals.eur)} €`;
                  }

                  return amountUahText;
                })()}
              </CategorySum>
            </GroupTitle>
            <GroupRows>
              {entries.map(({ row, idx }) => {
                const rowKey = getRowKey(row, idx);
                const isEditing = editingKey === rowKey;
                return (
                  <EventRow
                    key={rowKey}
                    $clickable={!isEditing}
                    $highlighted={confirmState.type === 'row' && confirmState.rowKey === rowKey}
                    onClick={!isEditing ? () => beginEdit(row, idx) : undefined}
                  >
                    {isEditing ? (
                      <EditInline>
                        <Input
                          autoFocus
                          style={{ width: '100%', minWidth: 0, fontSize: 12, padding: 4 }}
                          value={editingDraft.line}
                          onChange={e => setEditingDraft(prev => ({ ...prev, line: e.target.value }))}
                          onBlur={e => {
                            if (e.currentTarget.parentElement?.contains(e.relatedTarget)) return;
                            saveEditedRow(row, idx);
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              saveEditedRow(row, idx);
                            }
                            if (e.key === 'Escape') {
                              e.preventDefault();
                              cancelEdit();
                            }
                          }}
                        />
                        <TinyBtn type="button" onMouseDown={e => e.preventDefault()} onClick={cancelEdit}>
                          cancel
                        </TinyBtn>
                      </EditInline>
                    ) : (
                      <>
                        <EventText>
                          {formatDisplayDate(row.date)} {resolveFlowDisplayAmount({ amount: row.amount, row, exchangeRateMode, exchangeRates, historicalRatesByDate, customUsdRate })} {row.description}
                          {(() => {
                            const displayAmount = resolveFlowDisplayAmount({ amount: row.amount, row, exchangeRateMode, exchangeRates, historicalRatesByDate, customUsdRate });
                            const amountUsd = calculateFlowRowCurrencyAmount({
                              row: { ...row, amount: displayAmount },
                              currency: 'usd',
                              exchangeRateMode,
                              exchangeRates,
                              historicalRatesByDate,
                              customUsdRate,
                            });
                            return amountUsd > 0 ? ` / ${formatCurrencyValue(amountUsd)} $` : '';
                          })()}
                        </EventText>
                        <ChangeCategoryBtn
                          type="button"
                          aria-label="change-row-category"
                          title="Змінити групу платежу"
                          onClick={e => {
                            e.stopPropagation();
                            handleChangeRowCategory(row);
                          }}
                        >
                          ✏
                        </ChangeCategoryBtn>
                        <DeleteRowBtn
                          type="button"
                          aria-label="delete-row"
                          title="Видалити рядок"
                          onClick={e => {
                            e.stopPropagation();
                            openDeleteConfirm(row, rowKey);
                          }}
                        >
                          ×
                        </DeleteRowBtn>
                      </>
                    )}
                  </EventRow>
                );
              })}
            </GroupRows>
          </GroupBlock>
        ))}
      </EventsList>

      {loading && <small>Завантаження...</small>}

      {isExchangeModalOpen && (
        <ConfirmBackdrop onClick={() => setIsExchangeModalOpen(false)}>
          <ConfirmCard onClick={e => e.stopPropagation()}>
            <ExchangeModalTitle>Курс для розрахунків Flow</ExchangeModalTitle>
            <ExchangeOptions>
              {FLOW_EXCHANGE_RATE_OPTIONS.map(option => (
                <ExchangeOption key={option.value} $selected={exchangeRateMode === option.value}>
                  <input
                    type="radio"
                    name="flow-exchange-rate-mode"
                    value={option.value}
                    checked={exchangeRateMode === option.value}
                    onChange={e => setExchangeRateMode(getValidFlowExchangeRateMode(e.target.value))}
                  />
                  <ExchangeOptionText>
                    <ExchangeOptionTitle>{option.label}</ExchangeOptionTitle>
                    <ExchangeOptionDescription>{option.description}</ExchangeOptionDescription>
                  </ExchangeOptionText>
                </ExchangeOption>
              ))}
            </ExchangeOptions>
            <CustomRateBlock>
              <Label>
                Власний курс USD/UAH
                <Input
                  type="text"
                  inputMode="decimal"
                  value={
                    isCustomUsdRateFocused
                      ? customUsdRateDraft
                      : formatCustomUsdRateDisplay(customUsdRate)
                  }
                  onFocus={() => {
                    setIsCustomUsdRateFocused(true);
                    setCustomUsdRateDraft(formatCustomUsdRate(customUsdRate));
                  }}
                  onChange={e => setCustomUsdRateDraft(e.target.value)}
                  onBlur={() => {
                    const formattedRate = formatCustomUsdRate(customUsdRateDraft);
                    setCustomUsdRate(formattedRate);
                    setCustomUsdRateDraft(formattedRate);
                    setIsCustomUsdRateFocused(false);
                  }}
                  placeholder="напр. 40.5"
                />
              </Label>
              <CustomRateHint>
                Якщо власний курс збережений, розрахунки в нижній таблиці використовують саме його для долара.
                Якщо поле порожнє — використовується обраний загальний курс.
              </CustomRateHint>
            </CustomRateBlock>
            <ConfirmActions>
              <ActionBtn type="button" onClick={() => setIsExchangeModalOpen(false)}>Закрити</ActionBtn>
            </ConfirmActions>
          </ConfirmCard>
        </ConfirmBackdrop>
      )}

      {confirmState.type && (
        <ConfirmBackdrop onClick={closeConfirm}>
          <ConfirmCard onClick={e => e.stopPropagation()}>
            <div>
              {confirmState.type === 'clear'
                ? 'Підтвердьте очищення всього Flow'
                : 'Підтвердьте видалення цього рядка'}
            </div>
            {confirmState.type === 'row' && confirmState.row && (
              <ConfirmRowPreview>
                {formatDisplayDate(confirmState.row.date)} {confirmState.row.amount} {confirmState.row.description}
              </ConfirmRowPreview>
            )}
            <ConfirmActions>
              <ActionBtn type="button" onClick={closeConfirm}>Скасувати</ActionBtn>
              <ConfirmDangerBtn type="button" onClick={handleConfirm}>Підтвердити</ConfirmDangerBtn>
            </ConfirmActions>
          </ConfirmCard>
        </ConfirmBackdrop>
      )}
    </Wrap>
  );
};

export default FlowManager;
