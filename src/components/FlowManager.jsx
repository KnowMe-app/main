import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import styled from 'styled-components';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { InfoModal } from './InfoModal';
import { ProfileDotsMenu } from './ProfileDotsMenu';
import { FiCornerUpLeft, FiCornerUpRight, FiSearch, FiSettings } from 'react-icons/fi';
import { buildFlowImportText } from 'utils/flowImport';
import {
  buildInverseFlowPatch,
  pushFlowHistoryStep,
  readFlowHistory,
  writeFlowHistory,
} from 'utils/flowHistory';
import {
  DEFAULT_FLOW_CURRENCY_LABEL_MODE,
  FLOW_CURRENCY_LABEL_MODES,
  buildLegacyUndatedFlowPatch,
  compareFlowRowsNewestFirst,
  detectFlowIncomeGroup,
  formatFlowMoney,
  groupFlowRowsByMonth,
  listFlowLabelCurrencies,
  normalizeFlowCurrencyLabelMode,
  searchFlowRows,
  summarizeFlow,
  topLevelFlowGroup,
} from 'utils/flowView';
import {
  Backdrop,
  Card,
  Chip,
  ChipRow,
  ChipTools,
  ClearBtn,
  DangerBtn,
  Dialog,
  DialogActions,
  DialogText,
  EditActions,
  EditBox,
  EmptyNote,
  EntryCard,
  EntryField,
  EntryHint,
  EntryMeta,
  EntryRow,
  EntryTextarea,
  GhostBtn,
  GroupEditToggle,
  GroupHead,
  GroupItem,
  GroupList,
  GroupName,
  GroupPickerChip,
  GroupSum,
  GroupTitle,
  IconBtn,
  InlineRow,
  MiniBtn,
  MonthHead,
  OfflineNote,
  PrimaryBtn,
  RateOption,
  ResultsHead,
  RowAmount,
  RowBody,
  RowDate,
  RowGroupTag,
  RowList,
  RowMoreBtn,
  RowText,
  ScaledContent,
  SearchBox,
  Segmented,
  SegmentBtn,
  Select,
  Sheet,
  SheetGrip,
  SheetHead,
  SheetRow,
  SheetSection,
  SmallTextBtn,
  StatusNote,
  SummaryLine,
  SummaryNote,
  SummaryTotal,
  TextInput,
  TopBar,
  TopSpacer,
  Wrap,
} from './FlowManager.styled';
import Collapsible from './Collapsible';
import { ADMIN_UIDS, isAdminUid, readStoredAccessLevel, readStoredCanCreateProfiles, resolveAccess } from 'utils/accessLevel';
import { listFlowOwners } from './flowOwnersRemote';
import {
  deleteFlowEntry,
  deleteFlowCategory,
  renameFlowCategory,
  applyFlowRawPatch,
  clearFlowData,
  fetchFlowData,
  fetchMonobankUahExchangeRates,
  fetchNbuUahExchangeRatesByDate,
  resolveFlowExchangeRatesForMode,
  saveFlowEntry,
  updateFlowEntry,
  auth,
} from './config';
import { useAutoResize } from 'hooks/useAutoResize';
import { AutoGrowTextarea } from 'components/AutoGrowTextarea';
import { isFormulaFlowAmount, resolveFlowAmountInput } from 'utils/flowAmountFormula';
import { listPendingOutboxPatches, subscribeWriteOutbox } from 'utils/writeOutbox';
import {
  applyFlowPatch,
  clearFlowCache,
  countPendingFlowWrites,
  overlayPendingFlowWrites,
  readFlowCache,
  writeFlowCache,
} from 'utils/flowOfflineWrites';

// Масштаб тексту Flow (16.11, на прохання власниці продукту: «нічого не видно»).
// Шрифти тут задані пікселями в десятку компонентів, тож масштабується весь
// вміст під верхнім рядком через `zoom` — і текст, і поля, і мішені дотику
// разом, як масштаб браузера. Верхній рядок і шторки не масштабуються.
// 175 % прибрано (17.11): на телефоні в рядок уже не вміщалось нічого.
const FLOW_TEXT_SCALES = [0.9, 1, 1.15, 1.3, 1.5];
const flowTextScaleStorageKey = ownerId => `flow-text-scale:${ownerId || 'anon'}`;

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
  const formatted = value.toFixed(2).replace(/\.?0+$/, '');
  return formatted === '-0' ? '0' : formatted;
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

// Курс у кінці рядка буває доларовий або євровий: «курс 50.75 EUR», «курс 50.75€»,
// «€ 50.75», «1€=50.75». Без позначки валюти — долар, як і було. Євровий курс
// лягає лише на євро: долар рядка лишається за курсом джерела (чи глобальним).
const FLOW_RATE_NUMBER = '(\\d+(?:[.,]\\d+)?)';
const FLOW_RATE_CURRENCY = '(\\$|usd|дол(?:ар|арів)?|€|eur|євро|евро)';
const FLOW_RATE_UAH_SUFFIX = '(?:\\s*(?:грн|uah))?';
const FLOW_RATE_PATTERNS = [
  new RegExp(
    `(?:^|\\s)(?:курс|rate)\\s*${FLOW_RATE_CURRENCY}?\\s*[:=]?\\s*${FLOW_RATE_NUMBER}\\s*${FLOW_RATE_CURRENCY}?${FLOW_RATE_UAH_SUFFIX}\\s*$`,
    'iu'
  ),
  new RegExp(
    `(?:^|\\s)1?\\s*${FLOW_RATE_CURRENCY}\\s*[:=]?\\s*${FLOW_RATE_NUMBER}${FLOW_RATE_UAH_SUFFIX}\\s*$`,
    'iu'
  ),
  new RegExp(`(?:^|\\s)${FLOW_RATE_NUMBER}${FLOW_RATE_UAH_SUFFIX}\\s*\\/\\s*${FLOW_RATE_CURRENCY}\\s*$`, 'iu'),
];
const isEurRateToken = token => /^(?:€|eur|євро|евро)$/iu.test(String(token || '').trim());

const extractCustomRateFromText = value => {
  const rawText = String(value || '').trim();
  if (!rawText) return { text: '', customUsdRate: '', customEurRate: '' };

  for (const pattern of FLOW_RATE_PATTERNS) {
    const match = rawText.match(pattern);
    if (!match) continue;
    const groups = match.slice(1).filter(item => item !== undefined);
    const rateToken = groups.find(item => /^\d/.test(item));
    const formattedRate = formatCustomUsdRate(rateToken);
    if (!formattedRate) continue;
    const isEur = groups.some(isEurRateToken);
    return {
      text: rawText.slice(0, match.index).trim(),
      customUsdRate: isEur ? '' : formattedRate,
      customEurRate: isEur ? formattedRate : '',
    };
  }

  return { text: rawText, customUsdRate: '', customEurRate: '' };
};

// Валюта, в якій рядок показує еквівалент. Курс, вписаний у сам рядок («курс 50.75 €»,
// «курс 41 $»), — свідомий вибір валюти для цього рядка, і перемикач угорі його не перебиває;
// решта рядків іде у валюті перемикача.
export const FLOW_DISPLAY_CURRENCIES = ['usd', 'eur'];
const DEFAULT_FLOW_DISPLAY_CURRENCY = 'usd';
const getValidFlowDisplayCurrency = value =>
  FLOW_DISPLAY_CURRENCIES.includes(value) ? value : DEFAULT_FLOW_DISPLAY_CURRENCY;
export const getFlowRowDisplayCurrency = (row, defaultCurrency = DEFAULT_FLOW_DISPLAY_CURRENCY) => {
  if (normalizeCustomUsdRate(row?.customEurRate)) return 'eur';
  if (normalizeCustomUsdRate(row?.customUsdRate)) return 'usd';
  return getValidFlowDisplayCurrency(defaultCurrency);
};
const FLOW_CURRENCY_SIGNS = { usd: '$', eur: '€' };
// Які записи потрапляють в історію відміни і як вони звуться в тості.
const FLOW_HISTORY_LABELS = {
  'Запис Flow не збережено': 'новий запис',
  'Запис не оновлено': 'правка запису',
  'Запис не видалено': 'видалення запису',
  'Платіж не перенесено': 'перенесення запису',
  'Групу не видалено': 'видалення групи',
  'Групу не перейменовано': 'перейменування групи',
  'Flow не очищено': 'очищення Flow',
};
const FLOW_CURRENCY_LABEL_TITLES = { none: 'Без валюти', usd: '$', eur: '€', both: '$ і €' };

// Збережений курс рядка — четверта частина суми: «50.75» (долар) або «50.75EUR».
export const parseStoredFlowCustomRate = value => {
  const raw = String(value || '').trim();
  const eurMatch = raw.match(/^(\d+(?:[.,]\d+)?)\s*EUR$/i);
  if (eurMatch) return { customUsdRate: '', customEurRate: eurMatch[1] };
  return { customUsdRate: raw, customEurRate: '' };
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
  const normalizedCustomEurRate = normalizeCustomUsdRate(row.customEurRate);
  if (!normalizedCustomUsdRate && !normalizedCustomEurRate) return baseRates;

  return {
    ...(baseRates || {}),
    ...(normalizedCustomUsdRate ? { usd: normalizedCustomUsdRate, customUsdRate: normalizedCustomUsdRate } : {}),
    ...(normalizedCustomEurRate ? { eur: normalizedCustomEurRate, customEurRate: normalizedCustomEurRate } : {}),
  };
};

export const calculateFlowRowCurrencyAmount = ({
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
  return storedAmount;
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

// Підсумок групи в $ і € — баланс у гривнях, переведений за курсом режиму, а не
// сума еквівалентів рядків. Курс, вписаний у рядок («курс 50.75 €»), фіксує
// еквівалент *цього* рядка й гривневу суму його формули, але в підсумку
// лишав залишок: група «Мама» стояла на 0 грн і водночас на 2.48 €, бо один
// рядок рахувався за 50.75, а решта за 50.98. Глобальний курс «1 $ = … грн»
// стоїть за режим для всіх рядків, тож у підсумку він лишається.
export const sumFlowCategoryTotals = ({
  rows = [],
  exchangeRateMode,
  exchangeRates,
  historicalRatesByDate = {},
  customUsdRate,
  defaultCategory = 'general',
}) =>
  rows.reduce((acc, row) => {
    const group = normalizeCategoryPath(row.group) || defaultCategory;
    if (!acc[group]) {
      acc[group] = { uah: 0, usd: 0, eur: 0 };
    }
    const rateOptions = { exchangeRateMode, exchangeRates, historicalRatesByDate, customUsdRate };
    const amountUah = getFlowAmountNumberForTotals({ amount: row.amount, row, ...rateOptions });
    const totalsRow = {
      ...row,
      amount: formatCategorySum(amountUah),
      customUsdRate: '',
      customEurRate: '',
    };
    acc[group].uah += amountUah;
    acc[group].usd += calculateFlowRowCurrencyAmount({ row: totalsRow, currency: 'usd', ...rateOptions });
    acc[group].eur += calculateFlowRowCurrencyAmount({ row: totalsRow, currency: 'eur', ...rateOptions });
    return acc;
  }, {});

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
  const { text: descriptionWithoutCustomRate, customUsdRate, customEurRate } = extractCustomRateFromText(
    amountParts.description || ''
  );
  const parsedDescription = sanitizeEntryKeyChunk(descriptionWithoutCustomRate);

  if (!parsedDate || !parsedAmount) return null;
  return {
    date: parsedDate,
    amount: parsedAmount,
    description: parsedDescription,
    customUsdRate,
    customEurRate,
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
const flowDisplayCurrencyStorageKey = ownerId => `flow-display-currency:${ownerId || 'anon'}`;
// Відкрита група списку — одна на пристрій і власника (порожньо — усі згорнуті).
const flowOpenGroupStorageKey = ownerId => `flow-open-group:${ownerId || 'anon'}`;
const flowIncomeGroupStorageKey = ownerId => `flow-income-group:${ownerId || 'anon'}`;
const flowFilterStorageKey = ownerId => `flow-filter:${ownerId || 'anon'}`;
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
        ...parseStoredFlowCustomRate(customUsdRate),
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
      const storedRate = parseStoredFlowCustomRate(customUsdRateFromAmount);
      return {
        amount: amountUah,
        amountUsd: value.amountUsd ?? value.usd ?? amountUsdFromAmount,
        amountEur: value.amountEur ?? value.eur ?? amountEurFromAmount,
        customUsdRate: value.customUsdRate ?? value.usdRate ?? storedRate.customUsdRate,
        customEurRate: value.customEurRate ?? value.eurRate ?? storedRate.customEurRate,
        description: value.description ?? value.comment ?? value.note ?? '',
      };
    }

    return {
      amount: '',
      amountUsd: '',
      amountEur: '',
      customUsdRate: '',
      customEurRate: '',
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
              customEurRate: formatCustomUsdRate(parsed.customEurRate),
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

export const FlowManager = ({ ownerId, viewerId }) => {
  const navigate = useNavigate();
  const [flowData, setFlowData] = useState({});
  const [dateYmd, setDateYmd] = useState(todayYmd());
  const [entryInput, setEntryInput] = useState('');
  const [categoryInput, setCategoryInput] = useState('');
  const [subCategoryInput, setSubCategoryInput] = useState('');
  // Група запису читається з пристрою вже в першому рендері: з порожнім
  // стартом записувачі памʼяті встигали покласти туди «general» раніше, ніж
  // ефект відновлення її прочитав (у режимі розробки ефекти йдуть двічі), і
  // після перезавантаження над полем стояло «Група: general».
  const [initialCategory] = useState(() => {
    try {
      const saved = normalizeCategoryPath(localStorage.getItem(flowLastCategoryStorageKey(ownerId)));
      return saved ? splitCategoryPath(saved) : { group: '', subgroup: '' };
    } catch {
      return { group: '', subgroup: '' };
    }
  });
  const [selectedGroup, setSelectedGroup] = useState(initialCategory.group);
  const [selectedSubgroup, setSelectedSubgroup] = useState(initialCategory.subgroup);
  const [localCategories, setLocalCategories] = useState([DEFAULT_FLOW_CATEGORY]);
  const [loading, setLoading] = useState(false);
  const [loadedFromServer, setLoadedFromServer] = useState(false);
  const [editingKey, setEditingKey] = useState(null);
  const [editingDraft, setEditingDraft] = useState({ line: '' });
  const [confirmState, setConfirmState] = useState({ type: null, row: null, rowKey: null });
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [isCategoryEditMode, setIsCategoryEditMode] = useState(false);
  const [renamingCategory, setRenamingCategory] = useState({ source: '', draft: '' });
  const [exchangeRates, setExchangeRates] = useState(null);
  const [historicalRatesByDate, setHistoricalRatesByDate] = useState({});
  const [exchangeRateMode, setExchangeRateMode] = useState(DEFAULT_FLOW_EXCHANGE_RATE_MODE);
  const [isExchangeModalOpen, setIsExchangeModalOpen] = useState(false);
  const [currencyLabelMode, setCurrencyLabelMode] = useState(DEFAULT_FLOW_CURRENCY_LABEL_MODE);
  const [customUsdRate, setCustomUsdRate] = useState('');
  const [customUsdRateDraft, setCustomUsdRateDraft] = useState('');
  const [isCustomUsdRateFocused, setIsCustomUsdRateFocused] = useState(false);
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
      sumFlowCategoryTotals({
        rows: flowRows,
        exchangeRateMode,
        exchangeRates,
        historicalRatesByDate,
        customUsdRate,
        defaultCategory: DEFAULT_FLOW_CATEGORY,
      }),
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

  // Дані з бази завжди йдуть із накладеними недосланими записами черги
  // (`utils/flowOfflineWrites`): сервер їх ще не знає, і без накладки щойно
  // внесене зникало б з екрана до доставки.
  const reload = useCallback(async () => {
    if (!ownerId) return;
    // Памʼять пристрою — одразу: без звʼязку `get` висить, і Flow стояв би
    // порожнім, хоча останній стан лежить тут.
    const cached = readFlowCache(ownerId);
    if (cached) {
      setFlowData(overlayPendingFlowWrites(cached, ownerId, listPendingOutboxPatches()));
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    setLoading(true);
    try {
      const data = await fetchFlowData(ownerId);
      const merged = overlayPendingFlowWrites(data || {}, ownerId, listPendingOutboxPatches());
      setFlowData(merged);
      writeFlowCache(ownerId, merged);
      setLoadedFromServer(true);
    } catch (error) {
      console.error('Unable to load flow data', error);
      if (!cached) toast.error('Не вдалося завантажити Flow');
    } finally {
      setLoading(false);
    }
  }, [ownerId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const flowDataRef = useRef(flowData);
  flowDataRef.current = flowData;

  // Скільки записів Flow ще не прийняла база. Коли черга спорожніла —
  // перечитати з бази: записи могли змінитись і з іншого пристрою.
  const pendingFlowWrites = useSyncExternalStore(
    subscribeWriteOutbox,
    () => countPendingFlowWrites(ownerId, listPendingOutboxPatches())
  );
  const prevPendingFlowWritesRef = useRef(pendingFlowWrites);
  useEffect(() => {
    const prev = prevPendingFlowWritesRef.current;
    prevPendingFlowWritesRef.current = pendingFlowWrites;
    if (prev > 0 && pendingFlowWrites === 0) reload();
  }, [pendingFlowWrites, reload]);

  const [deviceOnline, setDeviceOnline] = useState(
    () => typeof navigator === 'undefined' || navigator.onLine !== false
  );
  useEffect(() => {
    const update = () => setDeviceOnline(navigator.onLine !== false);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  // Правка лягає на екран і в памʼять пристрою одразу, ще до бази: запис
  // уже в черзі пристрою й дошлеться сам, щойно буде звʼязок.
  const applyLocalFlowPatch = useCallback(
    patch => {
      if (!patch || !Object.keys(patch).length) return;
      setFlowData(prev => {
        const next = applyFlowPatch(prev, patch, ownerId);
        writeFlowCache(ownerId, next);
        return next;
      });
    },
    [ownerId]
  );

  // Відмова бази (правила) — остаточна: черга запис зняла, а на екрані він
  // ще стоїть. Кажемо про це й беремо правду з бази.
  const trackFlowDelivery = useCallback(
    (delivered, failureText) => {
      if (!delivered || typeof delivered.catch !== 'function') return;
      delivered.catch(error => {
        console.error('Flow write rejected', error);
        toast.error(`${failureText}: сервер відмовив`);
        clearFlowCache(ownerId);
        reload();
      });
    },
    [ownerId, reload]
  );

  // Відміна й повтор (`utils/flowHistory`): кожна дія людини кладе крок з
  // латкою й латкою навпаки, порахованою з даних до правки. Записи однієї дії
  // (кілька рядків, імпорт) приходять в одному такті й зливаються в крок.
  const [flowHistory, setFlowHistory] = useState({ undo: [], redo: [] });
  const flowHistoryRef = useRef(flowHistory);
  flowHistoryRef.current = flowHistory;
  useEffect(() => {
    setFlowHistory(readFlowHistory(ownerId));
  }, [ownerId]);
  const commitFlowHistory = useCallback(next => {
    const saved = writeFlowHistory(ownerId, next);
    flowHistoryRef.current = saved;
    setFlowHistory(saved);
  }, [ownerId]);
  const historyBatchRef = useRef(null);
  const restoreRenameSettingsRef = useRef(null);
  const recordFlowHistory = useCallback((patch, label, extra) => {
    if (!ownerId || !patch || !Object.keys(patch).length) return;
    if (!historyBatchRef.current) {
      historyBatchRef.current = `${Date.now()}-${Math.random()}`;
      queueMicrotask(() => {
        historyBatchRef.current = null;
      });
    }
    const inverse = buildInverseFlowPatch(flowDataRef.current, patch, ownerId);
    commitFlowHistory(pushFlowHistoryStep(flowHistoryRef.current, {
      patch,
      inverse,
      label,
      batch: historyBatchRef.current,
      ...(extra || {}),
    }));
  }, [commitFlowHistory, ownerId]);

  const applyFlowWrite = useCallback(
    (result, failureText, historyExtra) => {
      if (!result) return;
      // Службове (перенесення старих записів без дати) в історію не йде:
      // відмінити можна лише те, що людина зробила сама.
      if (FLOW_HISTORY_LABELS[failureText]) {
        recordFlowHistory(result.patch, FLOW_HISTORY_LABELS[failureText], historyExtra);
      }
      applyLocalFlowPatch(result.patch);
      trackFlowDelivery(result.delivered, failureText);
    },
    [applyLocalFlowPatch, recordFlowHistory, trackFlowDelivery]
  );

  const stepFlowHistory = useCallback(direction => {
    if (!ownerId) return;
    const history = flowHistoryRef.current;
    const from = direction === 'undo' ? history.undo : history.redo;
    const entry = from[from.length - 1];
    if (!entry) return;
    const patch = direction === 'undo' ? entry.inverse : entry.patch;
    const rest = from.slice(0, -1);
    commitFlowHistory(direction === 'undo'
      ? { undo: rest, redo: [...history.redo, entry] }
      : { undo: [...history.undo, entry], redo: rest });
    const result = applyFlowRawPatch(ownerId, patch);
    applyLocalFlowPatch(result.patch);
    // Перейменування несе й налаштування, що йшли за назвою групи (група
    // надходжень, фільтр): без них відмінене «Оренда» → «Rent» повертало
    // записи, а позначка надходжень лишалась на новій, уже порожній назві —
    // і надходження рахувались витратами.
    if (entry.rename) restoreRenameSettingsRef.current?.(entry.rename, direction);
    trackFlowDelivery(result.delivered, direction === 'undo' ? 'Не вдалося відмінити' : 'Не вдалося повторити');
    toast.success(`${direction === 'undo' ? 'Відмінено' : 'Повторено'}: ${entry.label || 'зміна'}`, {
      id: 'flow-history',
      // Знизу й коротко: угорі тост лягав на самі кнопки «Назад / Вперед», і
      // другий дотик підряд не влучав (перевірено наживо).
      position: 'bottom-center',
      duration: 1600,
      style: { marginBottom: 'var(--km-bottom-nav-h, 0px)' },
    });
  }, [applyLocalFlowPatch, commitFlowHistory, ownerId, trackFlowDelivery]);

  const offlineSuffix = () =>
    typeof navigator !== 'undefined' && navigator.onLine === false
      ? ' — на пристрої, надішлемо, щойно зʼявиться звʼязок'
      : '';

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
      const savedCurrency = localStorage.getItem(flowDisplayCurrencyStorageKey(ownerId));
      setCurrencyLabelMode(normalizeFlowCurrencyLabelMode(savedCurrency));
    } catch (error) {
      console.error('Unable to restore flow display currency from localStorage', error);
      setCurrencyLabelMode(DEFAULT_FLOW_CURRENCY_LABEL_MODE);
    }
  }, [ownerId]);

  const [textScale, setTextScale] = useState(1);
  useEffect(() => {
    if (!ownerId) return;
    try {
      const saved = Number(localStorage.getItem(flowTextScaleStorageKey(ownerId)));
      const max = FLOW_TEXT_SCALES[FLOW_TEXT_SCALES.length - 1];
      setTextScale(saved > max ? max : FLOW_TEXT_SCALES.includes(saved) ? saved : 1);
    } catch {
      setTextScale(1);
    }
  }, [ownerId]);
  const stepTextScale = direction => {
    const index = Math.max(0, FLOW_TEXT_SCALES.indexOf(textScale));
    const next = FLOW_TEXT_SCALES[Math.min(FLOW_TEXT_SCALES.length - 1, Math.max(0, index + direction))];
    setTextScale(next);
    if (!ownerId) return;
    try {
      localStorage.setItem(flowTextScaleStorageKey(ownerId), String(next));
    } catch (error) {
      console.error('Unable to persist flow text scale into localStorage', error);
    }
  };

  // Відкрита група — одна: друга, відкрита дотиком, згортає попередню.
  const [openGroup, setOpenGroup] = useState('');
  useEffect(() => {
    if (!ownerId) return;
    try {
      setOpenGroup(localStorage.getItem(flowOpenGroupStorageKey(ownerId)) || '');
    } catch {
      setOpenGroup('');
    }
  }, [ownerId]);
  const rememberOpenGroup = useCallback(group => {
    const next = group || '';
    setOpenGroup(next);
    if (!ownerId) return;
    try {
      localStorage.setItem(flowOpenGroupStorageKey(ownerId), next);
    } catch (error) {
      console.error('Unable to persist flow open group into localStorage', error);
    }
  }, [ownerId]);
  const toggleGroup = group => rememberOpenGroup(openGroup === group ? '' : group);
  // «Змінити групу» й «Видалити» біля кожного рядка зʼявляються лише після
  // олівця біля назви групи: інакше дві кнопки на кожному з сотень рядків
  // забирали ширину в тексту.
  const [rowActionsGroup, setRowActionsGroup] = useState('');
  const toggleRowActions = group => {
    const next = rowActionsGroup === group ? '' : group;
    setRowActionsGroup(next);
    if (next && openGroup !== group) rememberOpenGroup(group);
  };

  // Група надходжень і фільтр угорі (17.11, на прохання власниці продукту).
  // Чіп надходжень стоїть завжди, навіть коли записів у групі ще немає: з
  // ним угорі баланс — прибуток чи дефіцит; без нього — лише витрати.
  const [savedIncomeGroup, setSavedIncomeGroup] = useState('');
  const [filterGroup, setFilterGroup] = useState('');
  useEffect(() => {
    if (!ownerId) return;
    try {
      setSavedIncomeGroup(localStorage.getItem(flowIncomeGroupStorageKey(ownerId)) || '');
      setFilterGroup(localStorage.getItem(flowFilterStorageKey(ownerId)) || '');
    } catch {
      setSavedIncomeGroup('');
      setFilterGroup('');
    }
  }, [ownerId]);
  const topGroupsWithRows = useMemo(
    () => [...new Set(flowRows.map(row => topLevelFlowGroup(normalizeCategoryPath(row.group))))].filter(Boolean),
    [flowRows]
  );
  const incomeGroup = useMemo(
    () => detectFlowIncomeGroup(allGroups, savedIncomeGroup),
    [allGroups, savedIncomeGroup]
  );
  // Порожню службову групу «general» чіпом не показуємо: її заводить сам
  // екран, а не людина.
  const expenseChipGroups = useMemo(
    () => allGroups.filter(group =>
      group !== incomeGroup && (group !== DEFAULT_FLOW_CATEGORY || topGroupsWithRows.includes(group))),
    [allGroups, incomeGroup, topGroupsWithRows]
  );
  const activeFilter = filterGroup === incomeGroup || expenseChipGroups.includes(filterGroup) ? filterGroup : '';
  const persistSetting = (key, value) => {
    if (!ownerId) return;
    try {
      if (value) localStorage.setItem(key, value);
      else localStorage.removeItem(key);
    } catch (error) {
      console.error('Unable to persist flow setting', error);
    }
  };
  restoreRenameSettingsRef.current = (rename, direction) => {
    const target = direction === 'undo' ? rename.from : rename.to;
    const current = direction === 'undo' ? rename.to : rename.from;
    // Повертаємо лише те, що досі стоїть на назві з перейменування: групу
    // надходжень чи фільтр могли змінити пізніше в налаштуваннях, і відміна
    // мовчки перебила б новіший вибір (а надходження тієї групи пішли б у
    // витрати).
    if (rename.income && incomeGroup === current) selectIncomeGroup(target);
    if (rename.filter && filterGroup === current) {
      setFilterGroup(target);
      persistSetting(flowFilterStorageKey(ownerId), target);
    }
  };
  const selectIncomeGroup = group => {
    setSavedIncomeGroup(group);
    persistSetting(flowIncomeGroupStorageKey(ownerId), group);
  };
  const selectFilter = group => {
    const next = group || '';
    setFilterGroup(next);
    persistSetting(flowFilterStorageKey(ownerId), next);
    if (!next) return;
    // Обрана група стає й групою нового запису: людина, що дивиться на
    // надходження, найчастіше їх і вносить.
    if (!allGroups.includes(next)) {
      setLocalCategories(prev => (prev.includes(next) ? prev : [...prev, next]));
    }
    setSelectedGroup(next);
    setSelectedSubgroup('');
    const paths = Object.keys(groupedFlowRows).filter(path => topLevelFlowGroup(path) === next);
    if (paths.length === 1) rememberOpenGroup(paths[0]);
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Шторка груп: вибір групи нового запису (`entry`) або групи, куди
  // перенести рядок (`move`, з самим рядком).
  const [groupPicker, setGroupPicker] = useState(null);
  const [entryFocused, setEntryFocused] = useState(false);
  // Дії рядка («⋯» у режимі правки групи): шторка «Інша група» / «Видалити».
  const [rowMenu, setRowMenu] = useState(null);
  // Escape закриває верхню шторку: з клавіатури інакше вийти з меню рядка
  // можна було лише через «Перенести» чи «Видалити» — фон не фокусується.
  const closeTopSheetRef = useRef(null);
  closeTopSheetRef.current = () => {
    // Спершу те, що лежить зверху: підтвердження видалення відкривається
    // поверх шторки груп, і Escape закривав шторку під ним, лишаючи
    // незворотний діалог висіти, а «Скасувати» в ньому вело вже не до груп.
    if (confirmState.type) {
      closeConfirm();
      return true;
    }
    if (isExchangeModalOpen) {
      setIsExchangeModalOpen(false);
      return true;
    }
    if (rowMenu) {
      setRowMenu(null);
      return true;
    }
    if (groupPicker) {
      setGroupPicker(null);
      cancelCategoryRename();
      setIsCategoryEditMode(false);
      return true;
    }
    if (settingsOpen) {
      setSettingsOpen(false);
      return true;
    }
    return false;
  };
  useEffect(() => {
    const onKeyDown = event => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (closeTopSheetRef.current?.()) event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
  // Ctrl+Z / Ctrl+Y (і Ctrl+Shift+Z) — як у Word, але не в полі набору: там
  // вони лишаються відміною набраного тексту.
  const stepFlowHistoryRef = useRef(null);
  useEffect(() => {
    const onKeyDown = event => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const target = event.target;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      const key = String(event.key || '').toLowerCase();
      const direction = key === 'y' || (key === 'z' && event.shiftKey) ? 'redo' : key === 'z' ? 'undo' : '';
      if (!direction || !stepFlowHistoryRef.current) return;
      event.preventDefault();
      stepFlowHistoryRef.current(direction);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
  const entryCollapseTimerRef = useRef(0);
  useEffect(() => () => window.clearTimeout(entryCollapseTimerRef.current), []);

  // Записи старого імпорту з «(дата оплати не вказана)» — на 1 січня, без
  // приписки. Лише тому, хто може писати в цей Flow (власник чи повний адмін;
  // інспектор читає), і лише після відповіді бази: памʼять пристрою могла
  // нести рядок, якого в базі вже немає, і перенесення його воскресило б.
  const canWriteFlow = Boolean(ownerId) && (!viewerId || viewerId === ownerId || ADMIN_UIDS.includes(viewerId));
  stepFlowHistoryRef.current = canWriteFlow ? stepFlowHistory : null;
  const legacyUndatedMovedRef = useRef(false);
  useEffect(() => {
    if (!canWriteFlow || !loadedFromServer || legacyUndatedMovedRef.current) return;
    const { patch, count } = buildLegacyUndatedFlowPatch(flowData, ownerId);
    legacyUndatedMovedRef.current = true;
    if (!count) return;
    applyFlowWrite(applyFlowRawPatch(ownerId, patch), 'Записи без дати не перенесено');
    toast.success(`Записи без дати оплати перенесено на 1 січня: ${count}`);
  }, [applyFlowWrite, canWriteFlow, flowData, loadedFromServer, ownerId]);

  // Валюта міток: без валюти, одна ($ чи €) або дві. Ключ той самий, що й у
  // колишнього перемикача $/€ — збережений вибір лишається.
  const selectCurrencyLabelMode = mode => {
    const nextCurrency = normalizeFlowCurrencyLabelMode(mode);
    setCurrencyLabelMode(nextCurrency);
    if (!ownerId) return;
    try {
      localStorage.setItem(flowDisplayCurrencyStorageKey(ownerId), nextCurrency);
    } catch (error) {
      console.error('Unable to persist flow display currency into localStorage', error);
    }
  };

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
    // Поки груп з бази чи памʼяті ще немає, збережена група запису не
    // «зникла» — її просто ще не прочитали; інакше після перезавантаження
    // вона мовчки ставала «general».
    if (!categoriesFromDb.length && !loadedFromServer) return;
    if (
      allCategories.length > 0 &&
      (!selectedCategoryPath || !allCategories.includes(selectedCategoryPath))
    ) {
      // Службова «general» без жодного запису групою запису не стає: людина
      // бачила б «Група: general» над полем, хоча такої групи не заводила.
      const fallbackPath = splitCategoryPath(
        allCategories.find(category => category !== DEFAULT_FLOW_CATEGORY || categoriesFromDb.includes(category))
          || allCategories[0]
      );
      setSelectedGroup(fallbackPath.group);
      setSelectedSubgroup(fallbackPath.subgroup);
    }
  }, [allCategories, categoriesFromDb, loadedFromServer, selectedCategoryPath]);

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
        applyFlowWrite(
          await deleteFlowCategory({ ownerId, groupPath: normalized }),
          'Групу не видалено'
        );
      }
      setLocalCategories(prev =>
        prev.filter(item => item !== normalized && !item.startsWith(categoryPrefix))
      );
      if (selectedGroup === normalized) {
        setSelectedGroup('');
        setSelectedSubgroup('');
      }
      toast.success(`Групу "${normalized}" видалено${offlineSuffix()}`);
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
        const renamed = await renameFlowCategory({
          ownerId,
          fromGroupPath: normalizedSource,
          toGroupPath: normalizedTarget,
          sourceData: flowDataRef.current,
        });
        if (renamed?.reload) await reload();
        else {
          applyFlowWrite(renamed, 'Групу не перейменовано', {
            rename: {
              from: normalizedSource,
              to: normalizedTarget,
              income: normalizedSource === incomeGroup,
              filter: filterGroup === normalizedSource,
            },
          });
        }
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
      // Група надходжень і фільтр ідуть за перейменованою групою. Інакше
      // збережена назва вказувала б на порожню групу, а надходження з нової
      // назви рахувались би витратами — баланс угорі брехав би.
      if (normalizedSource === incomeGroup) selectIncomeGroup(normalizedTarget);
      if (filterGroup === normalizedSource) {
        setFilterGroup(normalizedTarget);
        persistSetting(flowFilterStorageKey(ownerId), normalizedTarget);
      }
      cancelCategoryRename();
      toast.success(
        (targetExists
          ? `Групи об’єднано в "${normalizedTarget}"`
          : `Групу перейменовано на "${normalizedTarget}"`) + offlineSuffix()
      );
    } catch (error) {
      console.error('Unable to rename flow category', error);
      toast.error('Не вдалося перейменувати групу');
    }
  };

  const handleSave = async ({ silentValidation = false, rawText, keepInput = false } = {}) => {
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
      const results = await Promise.all(
        parsedEntries.map(entry => {
          const rowCustomUsdRate = formatCustomUsdRate(entry.customUsdRate);
          const rowCustomEurRate = formatCustomUsdRate(entry.customEurRate);
          return saveFlowEntry({
            ownerId,
            ...entry,
            exchangeRates,
            exchangeRateMode,
            customUsdRate: rowCustomUsdRate || customUsdRate,
            rowCustomUsdRate,
            customEurRate: rowCustomEurRate,
          });
        })
      );
      results.forEach(result => applyFlowWrite(result, 'Запис Flow не збережено'));
      const lastEntry = parsedEntries[parsedEntries.length - 1];
      setDateYmd(lastEntry.date);
      // Щойно внесене має бути видно: відкривається група останнього запису.
      rememberOpenGroup(normalizeCategoryPath(lastEntry.groupPath) || normalizedCategory);
      const selectedPath = splitCategoryPath(lastEntry.groupPath || normalizedCategory);
      setSelectedGroup(selectedPath.group);
      setSelectedSubgroup(selectedPath.subgroup);
      if (!keepInput) setEntryInput('');
      toast.success(
        (parsedEntries.length === 1
          ? 'Flow збережено'
          : `Flow збережено: ${parsedEntries.length} записів`) + offlineSuffix()
      );
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
      applyFlowWrite(
        await clearFlowData(ownerId, { groups: Object.keys(flowDataRef.current || {}) }),
        'Flow не очищено'
      );
      toast.success(`Flow очищено${offlineSuffix()}`);
    } catch (error) {
      console.error('Unable to clear flow', error);
      toast.error('Не вдалося очистити Flow');
    }
  };

  const handleDeleteRow = async row => {
    if (!ownerId) return;
    try {
      const result = await deleteFlowEntry({
        ownerId,
        groupPath: row.group || 'general',
        date: row.date,
        amount: row.amount,
        description: row.description,
        entryId: row.entryId,
      });
      applyFlowWrite(result, 'Запис не видалено');
      toast.success(`Запис видалено${offlineSuffix()}`);
    } catch (error) {
      console.error('Unable to delete flow row', error);
      toast.error('Не вдалося видалити запис');
    }
  };

  const openClearConfirm = () => setConfirmState({ type: 'clear', row: null, rowKey: null });
  // Видалення групи знімає й усі її записи та підгрупи — одним дотиком «×»
  // поруч із назвою, тож без підтвердження пропадали сотні рядків.
  const openCategoryDeleteConfirm = category => {
    const normalized = normalizeCategoryPath(category);
    if (!normalized) return;
    const prefix = `${normalized}/`;
    const rows = flowRows.filter(row => {
      const group = normalizeCategoryPath(row.group);
      return group === normalized || group.startsWith(prefix);
    });
    const totalUah = rows.reduce((sum, row) => sum + getFlowAmountNumberForTotals({
      amount: row.amount, row, exchangeRateMode, exchangeRates, historicalRatesByDate, customUsdRate,
    }), 0);
    setConfirmState({ type: 'category', row: null, rowKey: null, category: normalized, count: rows.length, totalUah });
  };

  // Імпорт з файлу: файл стає тим самим текстом, що й у полі введення, і
  // зберігається тим самим `handleSave` — групи, курси за датою й черга
  // записів пристрою ті самі, що й для набраного вручну. Перед записом —
  // підтвердження з кількістю й групами: сотні рядків одним дотиком без
  // нього не відкотити інакше, ніж по одному.
  const importInputRef = useRef(null);
  const [importState, setImportState] = useState(null);
  const [isImporting, setIsImporting] = useState(false);

  const handleImportFile = async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const fileText = await file.text();
      const { text, undatedCount, skippedCount } = buildFlowImportText(fileText, { fileName: file.name });
      const entries = parseFlowEntriesByDatesAndGroups({
        rawText: text,
        fallbackDate: todayYmd(),
        defaultGroup: normalizeCategoryPath(selectedCategoryPath) || DEFAULT_FLOW_CATEGORY,
      });
      if (entries.length === 0) {
        toast.error('У файлі немає записів Flow: потрібні рядки «дата сума опис»');
        return;
      }
      const groups = entries.reduce((acc, entry) => {
        acc[entry.groupPath] = (acc[entry.groupPath] || 0) + 1;
        return acc;
      }, {});
      setImportState({ fileName: file.name, text, count: entries.length, groups, undatedCount, skippedCount });
      setConfirmState({ type: 'import', row: null, rowKey: null });
    } catch (error) {
      console.error('Unable to read flow import file', error);
      toast.error(error?.message || 'Не вдалося прочитати файл');
    }
  };
  const openDeleteConfirm = (row, rowKey) => setConfirmState({ type: 'row', row, rowKey });
  const closeConfirm = () => setConfirmState({ type: null, row: null, rowKey: null });


  const handleExit = async () => {
    // Усі Flow з памʼяті пристрою: адмін міг дивитись і чужі.
    clearFlowCache();
    await signOut(auth);
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('ownerId');
    navigate('/');
  };

  // Flow відкривають і не-адмінам (`screenAccess`), тож меню рахує права
  // читача, а не вважає кожного адміном: інакше людина з одним лише Flow
  // бачила б у «⋮» адмінські екрани, на які її однаково не пустить `App`.
  const dotsMenu = () => {
    const access = resolveAccess({
      uid: viewerId || ownerId,
      accessLevel: readStoredAccessLevel(),
      userRole: localStorage.getItem('userRole') || '',
      canCreateProfiles: readStoredCanCreateProfiles(),
    });
    return (
      <ProfileDotsMenu
        navigate={navigate}
        isAdmin={access.isAdmin}
        access={access}
        onExit={handleExit}
        onSelect={() => setShowInfoModal(false)}
      />
    );
  };

  const handleConfirm = async () => {
    if (confirmState.type === 'category') {
      const { category } = confirmState;
      closeConfirm();
      await handleDeleteCategory(category);
      return;
    }
    if (confirmState.type === 'import') {
      if (!importState || isImporting) return;
      setIsImporting(true);
      try {
        await handleSave({ rawText: importState.text, keepInput: true });
      } finally {
        setIsImporting(false);
        setImportState(null);
        closeConfirm();
      }
      return;
    }
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
    const formattedRowEurRate = formatCustomUsdRate(row.customEurRate);
    const baseLine = `${formatDisplayDate(row.date)} ${row.amount} ${row.description}`.trim();
    const rateSuffix = formattedRowEurRate
      ? ` курс ${formattedRowEurRate} €`
      : formattedRowRate
        ? ` курс ${formattedRowRate}`
        : '';
    setEditingDraft({ line: `${baseLine}${rateSuffix}` });
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
    const rowCustomEurRate = formatCustomUsdRate(parsedLine.customEurRate);
    const effectiveCustomUsdRate = rowCustomUsdRate || customUsdRate;

    try {
      const result = await updateFlowEntry({
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
          customEurRate: rowCustomEurRate,
        },
        exchangeRates,
        exchangeRateMode,
        customUsdRate: effectiveCustomUsdRate,
        rowCustomUsdRate,
      });
      applyFlowWrite(result, 'Запис не оновлено');
      toast.success(`Запис оновлено${offlineSuffix()}`);
      cancelEdit();
    } catch (error) {
      console.error('Unable to update flow row', error);
      toast.error('Не вдалося оновити запис');
    }
  };

  // Перенесення рядка в іншу групу — вибором у шторці груп (`groupPicker`
  // з `mode: 'move'`), а не `window.prompt`, де назву треба було набирати
  // руками й без одруківки.
  const moveRowToCategory = async (row, nextCategoryRaw) => {
    if (!ownerId) return;
    const nextCategory = normalizeCategoryPath(nextCategoryRaw);
    if (!nextCategory) {
      toast.error('Вкажіть валідну назву групи');
      return;
    }
    if (nextCategory === row.group) return;

    try {
      const result = await updateFlowEntry({
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
          customEurRate: row.customEurRate,
        },
        exchangeRates,
        exchangeRateMode,
        customUsdRate: row.customUsdRate || customUsdRate,
        rowCustomUsdRate: row.customUsdRate,
      });
      setLocalCategories(prev => (prev.includes(nextCategory) ? prev : [...prev, nextCategory]));
      applyFlowWrite(result, 'Платіж не перенесено');
      toast.success(`Платіж перенесено в групу "${nextCategory}"${offlineSuffix()}`);
    } catch (error) {
      console.error('Unable to change flow row category', error);
      toast.error('Не вдалося змінити групу платежу');
    }
  };

  // ── Показ ────────────────────────────────────────────────────────────
  const rateOptions = { exchangeRateMode, exchangeRates, historicalRatesByDate, customUsdRate };
  const labelCurrencies = listFlowLabelCurrencies(currencyLabelMode);
  const rowAmountNumber = row => getFlowAmountNumberForTotals({ amount: row.amount, row, ...rateOptions });
  const formatEquivalents = values =>
    values
      .filter(({ value }) => Number.isFinite(value) && value !== 0)
      .map(({ value, currency }) => `${formatFlowMoney(value)} ${FLOW_CURRENCY_SIGNS[currency]}`)
      .join(' · ');
  const rowEquivalentText = row => {
    if (!labelCurrencies.length) return '';
    const amount = resolveFlowDisplayAmount({ amount: row.amount, row, ...rateOptions });
    // Одна валюта: курс, вписаний у рядок («курс 50.75 €»), важить більше.
    const currencies = labelCurrencies.length === 1
      ? [getFlowRowDisplayCurrency(row, labelCurrencies[0])]
      : labelCurrencies;
    return formatEquivalents(currencies.map(currency => ({
      currency,
      value: calculateFlowRowCurrencyAmount({ row: { ...row, amount }, currency, ...rateOptions }),
    })));
  };
  const totalsEquivalentText = totals =>
    formatEquivalents(labelCurrencies.map(currency => ({ currency, value: totals?.[currency] || 0 })));
  const sumTotals = predicate =>
    Object.entries(categorySums).reduce((acc, [path, totals]) => {
      if (!predicate(path)) return acc;
      return { uah: acc.uah + totals.uah, usd: acc.usd + totals.usd, eur: acc.eur + totals.eur };
    }, { uah: 0, usd: 0, eur: 0 });
  const isIncomePath = path => topLevelFlowGroup(path) === incomeGroup;

  const summary = summarizeFlow({
    totalsByPath: Object.fromEntries(Object.entries(categorySums).map(([path, totals]) => [path, totals.uah])),
    incomeGroup,
    filter: activeFilter,
  });
  const incomeTotals = sumTotals(isIncomePath);
  const expenseTotals = sumTotals(path => !isIncomePath(path));
  const filteredTotals = sumTotals(path => topLevelFlowGroup(path) === activeFilter);
  const balanceTotals = {
    usd: incomeTotals.usd - expenseTotals.usd,
    eur: incomeTotals.eur - expenseTotals.eur,
  };

  const visibleGroups = Object.entries(groupedFlowRows).filter(([path]) =>
    activeFilter ? topLevelFlowGroup(path) === activeFilter : !isIncomePath(path));
  const searchActive = searchQuery.trim().length > 0;
  const searchResults = useMemo(
    () => (searchActive
      ? searchFlowRows(sortedFlowRows.map((row, idx) => ({ row, idx })), searchQuery)
        .sort((a, b) => compareFlowRowsNewestFirst(a.row, b.row))
      : []),
    [searchActive, searchQuery, sortedFlowRows]
  );
  const searchTotal = searchResults.reduce((sum, { row }) => sum + rowAmountNumber(row), 0);

  const formatShortDate = (ymd, withYear = false) => {
    const [year = '', month = '', day = ''] = String(ymd || '').split('-');
    if (!month || !day) return '';
    return withYear ? `${day}.${month}.${year.slice(2)}` : `${day}.${month}`;
  };

  // З 130 % тексту колонки лишали опису смужку: рядок стає двоповерховим.
  const stackedRows = textScale >= 1.3;
  const renderRow = ({ row, idx }, { inSearch = false, actions = false } = {}) => {
    const rowKey = getRowKey(row, idx);
    if (editingKey === rowKey) {
      return (
        <EntryRow key={rowKey} $editing>
          <EditBox
            onBlur={e => {
              if (e.currentTarget.contains(e.relatedTarget)) return;
              saveEditedRow(row, idx);
            }}
          >
            <AutoGrowTextarea
              autoFocus
              value={editingDraft.line}
              aria-label="Правка запису"
              onChange={e => setEditingDraft(prev => ({ ...prev, line: e.target.value }))}
              onEnter={() => saveEditedRow(row, idx)}
              onKeyDown={e => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  cancelEdit();
                }
              }}
            />
            <EditActions>
              <GhostBtn type="button" onMouseDown={e => e.preventDefault()} onClick={cancelEdit}>
                Скасувати
              </GhostBtn>
              <PrimaryBtn type="button" onMouseDown={e => e.preventDefault()} onClick={() => saveEditedRow(row, idx)}>
                Зберегти
              </PrimaryBtn>
            </EditActions>
          </EditBox>
        </EntryRow>
      );
    }
    const amountNumber = rowAmountNumber(row);
    const equivalents = rowEquivalentText(row);
    return (
      <EntryRow
        key={rowKey}
        $clickable
        $stacked={stackedRows}
        $withMore={actions}
        $highlighted={confirmState.type === 'row' && confirmState.rowKey === rowKey}
        onClick={() => beginEdit(row, idx)}
        data-testid="flow-row"
      >
        <RowDate>{formatShortDate(row.date, inSearch)}</RowDate>
        <RowBody>
          <RowText>{row.description || '—'}</RowText>
          {inSearch && (
            <RowGroupTag $income={isIncomePath(row.group)}>{formatGroupTitle(row.group)}</RowGroupTag>
          )}
        </RowBody>
        <RowAmount $negative={amountNumber < 0} $stacked={stackedRows}>
          {formatFlowMoney(amountNumber)}
          {equivalents && <small>{equivalents}</small>}
        </RowAmount>
        {actions && (
          <RowMoreBtn
            type="button"
            aria-label="Дії з рядком"
            title="Перенести чи видалити"
            onClick={e => {
              e.stopPropagation();
              setRowMenu({ row, rowKey });
            }}
            data-testid="flow-row-more"
          >
            ⋯
          </RowMoreBtn>
        )}
      </EntryRow>
    );
  };

  const summaryNote = totals => {
    const text = totalsEquivalentText(totals);
    return text ? <SummaryNote>≈ {text}</SummaryNote> : null;
  };

  return (
    <Wrap>
      <TopBar>
        <IconBtn
          type="button"
          onMouseDown={e => e.preventDefault()}
          onClick={() => stepTextScale(-1)}
          disabled={textScale <= FLOW_TEXT_SCALES[0]}
          aria-label="Зменшити текст"
          title="Зменшити текст"
          data-testid="flow-text-smaller"
        >
          A−
        </IconBtn>
        <IconBtn
          type="button"
          onMouseDown={e => e.preventDefault()}
          onClick={() => stepTextScale(1)}
          disabled={textScale >= FLOW_TEXT_SCALES[FLOW_TEXT_SCALES.length - 1]}
          aria-label="Збільшити текст"
          title="Збільшити текст"
          data-testid="flow-text-larger"
        >
          A+
        </IconBtn>
        <TopSpacer />
        {canWriteFlow && (
          <>
            <IconBtn
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => stepFlowHistory('undo')}
              disabled={!flowHistory.undo.length}
              aria-label="Відмінити"
              title={flowHistory.undo.length
                ? `Відмінити: ${flowHistory.undo[flowHistory.undo.length - 1].label} (Ctrl+Z)`
                : 'Нічого відміняти'}
              data-testid="flow-undo"
            >
              <FiCornerUpLeft />
            </IconBtn>
            <IconBtn
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => stepFlowHistory('redo')}
              disabled={!flowHistory.redo.length}
              aria-label="Повторити"
              title={flowHistory.redo.length
                ? `Повторити: ${flowHistory.redo[flowHistory.redo.length - 1].label} (Ctrl+Y)`
                : 'Нічого повторювати'}
              data-testid="flow-redo"
            >
              <FiCornerUpRight />
            </IconBtn>
          </>
        )}
        <IconBtn
          type="button"
          onClick={() => setSettingsOpen(true)}
          aria-label="Налаштування Flow"
          title="Налаштування Flow"
          data-testid="flow-settings"
        >
          <FiSettings />
        </IconBtn>
        <IconBtn
          type="button"
          aria-label="Відкрити меню профілю"
          title="Відкрити меню профілю"
          onClick={() => setShowInfoModal('dotsMenu')}
        >
          ⋮
        </IconBtn>
        <input
          ref={importInputRef}
          type="file"
          accept=".json,.txt,application/json,text/plain"
          onChange={handleImportFile}
          style={{ display: 'none' }}
          data-testid="flow-import-input"
        />
      </TopBar>

      <ScaledContent style={{ zoom: textScale }} data-testid="flow-scaled-content">
        <Card aria-live="polite" data-testid="flow-summary">
          {summary.mode === 'balance' ? (
            <>
              <SummaryLine>
                <span>Надходження</span>
                <b>{formatFlowMoney(summary.income)} грн</b>
              </SummaryLine>
              <SummaryLine $tone="danger">
                <span>Витрати</span>
                <b>{formatFlowMoney(-summary.expenses)} грн</b>
              </SummaryLine>
              <SummaryTotal $divided $tone={summary.profit ? 'success' : 'danger'}>
                <span>{summary.profit ? 'Прибуток' : 'Дефіцит'}</span>
                <b key={`balance-${summary.balance}`}>{formatFlowMoney(summary.balance)} грн</b>
              </SummaryTotal>
              {summaryNote(balanceTotals)}
            </>
          ) : (
            <>
              <SummaryTotal>
                <span>{summary.mode === 'group' ? activeFilter : 'Витрати'}</span>
                <b key={`expenses-${summary.expenses}`}>{formatFlowMoney(summary.expenses)} грн</b>
              </SummaryTotal>
              {summaryNote(summary.mode === 'group' ? filteredTotals : expenseTotals)}
            </>
          )}
        </Card>

        <ChipRow role="radiogroup" aria-label="Які групи показати">
          <Chip
            type="button"
            role="radio"
            aria-checked={!activeFilter}
            $selected={!activeFilter}
            onClick={() => selectFilter('')}
          >
            Усі витрати
          </Chip>
          {expenseChipGroups.map(group => (
            <Chip
              key={group}
              type="button"
              role="radio"
              aria-checked={activeFilter === group}
              $selected={activeFilter === group}
              onClick={() => selectFilter(group)}
            >
              {group}
            </Chip>
          ))}
          <Chip
            type="button"
            role="radio"
            aria-checked={activeFilter === incomeGroup}
            $selected={activeFilter === incomeGroup}
            $income
            onClick={() => selectFilter(incomeGroup)}
            data-testid="flow-income-chip"
          >
            {incomeGroup}
          </Chip>
        </ChipRow>

        <EntryCard
          as="div"
          ref={entryRowRef}
          $focused={entryFocused}
          onFocus={() => {
            window.clearTimeout(entryCollapseTimerRef.current);
            setEntryFocused(true);
          }}
          onBlur={e => {
            if (e.currentTarget.contains(e.relatedTarget)) return;
            // Згортання — після дотику, а не посеред нього: поле стискається
            // на ~60 px, і кнопка, яку людина тисне нижче, зʼїжджала б з-під
            // пальця між натисканням і відпусканням.
            window.clearTimeout(entryCollapseTimerRef.current);
            entryCollapseTimerRef.current = window.setTimeout(() => setEntryFocused(false), 220);
          }}
        >
          <EntryMeta>
            <GroupPickerChip
              type="button"
              $income={isIncomePath(selectedCategoryPath)}
              onMouseDown={e => e.preventDefault()}
              onClick={() => setGroupPicker({ mode: 'entry' })}
              data-testid="flow-entry-group"
            >
              Група: {formatGroupTitle(selectedCategoryPath)} ▾
            </GroupPickerChip>
            <span>{formatDisplayDate(dateYmd)}</span>
          </EntryMeta>
          <EntryField>
            <EntryTextarea
              ref={entryInputRef}
              rows={1}
              $expanded={entryFocused}
              value={entryInput}
              aria-label="Новий запис Flow"
              data-testid="flow-entry-input"
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
                }
              }}
              onBlur={e => {
                if (entryRowRef.current?.contains(e.relatedTarget)) return;
                handleSave({ silentValidation: true });
              }}
              placeholder="Напр. 1200 оренда"
            />
            {entryInput && (
              <ClearBtn
                type="button"
                aria-label="Очистити поле вводу Flow"
                title="Очистити"
                onMouseDown={e => e.preventDefault()}
                onClick={() => {
                  setEntryInput('');
                  entryInputRef.current?.focus();
                }}
              >
                ×
              </ClearBtn>
            )}
          </EntryField>
          {entryFocused && (
            <InlineRow>
              <EntryHint style={{ flex: 1 }}>
                «дд.мм сума опис», формула «=100+25*2»; кожен рядок — окремий запис
              </EntryHint>
              <PrimaryBtn
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => handleSave({ rawText: entryInput })}
                disabled={!entryInput.trim()}
              >
                Зберегти
              </PrimaryBtn>
            </InlineRow>
          )}
        </EntryCard>

        <SearchBox>
          <FiSearch aria-hidden="true" />
          <input
            type="text"
            enterKeyHint="search"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Пошук у витратах і надходженнях"
            aria-label="Пошук у записах Flow"
            data-testid="flow-search"
          />
          {searchActive && (
            <SmallTextBtn type="button" onClick={() => setSearchQuery('')}>
              Скинути
            </SmallTextBtn>
          )}
        </SearchBox>

        {searchActive ? (
          <Card data-testid="flow-search-results">
            <ResultsHead>
              <span>{searchResults.length ? `Знайдено: ${searchResults.length}` : 'Нічого не знайдено'}</span>
              {searchResults.length > 0 && <span>{formatFlowMoney(searchTotal)} грн</span>}
            </ResultsHead>
            <RowList>
              {searchResults.slice(0, 300).map(item => renderRow(item, { inSearch: true }))}
            </RowList>
            {searchResults.length > 300 && (
              <EmptyNote>Показано перші 300 — уточніть запит.</EmptyNote>
            )}
          </Card>
        ) : (
          <GroupList>
            {visibleGroups.map(([group, entries], groupIndex) => {
              const open = openGroup === group;
              const totals = categorySums[group] || { uah: 0, usd: 0, eur: 0 };
              const equivalents = totalsEquivalentText(totals);
              const editingRows = rowActionsGroup === group;
              return (
                <GroupItem key={group} $open={open} $index={groupIndex}>
                  <GroupHead>
                    <GroupTitle
                      type="button"
                      aria-expanded={open}
                      onClick={() => toggleGroup(group)}
                      data-testid="flow-group-toggle"
                    >
                      <GroupName>{formatGroupTitle(group)}</GroupName>
                      <GroupSum>
                        {formatFlowMoney(totals.uah)} грн
                        {equivalents && <small>{equivalents}</small>}
                      </GroupSum>
                    </GroupTitle>
                    {open && (
                      <GroupEditToggle
                        type="button"
                        $active={editingRows}
                        aria-pressed={editingRows}
                        aria-label={`Правка рядків групи ${formatGroupTitle(group)}`}
                        title="Перенести чи видалити рядки"
                        onClick={() => toggleRowActions(group)}
                        data-testid="flow-group-row-actions"
                      >
                        {editingRows ? 'Готово' : '✏'}
                      </GroupEditToggle>
                    )}
                  </GroupHead>
                  <Collapsible open={open}>
                    {groupFlowRowsByMonth(entries, rowAmountNumber).map(month => (
                      <React.Fragment key={month.key}>
                        <MonthHead>
                          <span>{month.label} · {month.items.length}</span>
                          <span>{formatFlowMoney(month.total)}</span>
                        </MonthHead>
                        <RowList>
                          {month.items.map(item => renderRow(item, { actions: editingRows }))}
                        </RowList>
                      </React.Fragment>
                    ))}
                  </Collapsible>
                </GroupItem>
              );
            })}
            {!visibleGroups.length && !loading && (
              <EmptyNote>
                {activeFilter === incomeGroup
                  ? `Надходжень ще немає. Внесіть перше — група «${incomeGroup}» вже обрана в полі запису.`
                  : 'Записів ще немає. Внесіть суму й опис у поле вище.'}
              </EmptyNote>
            )}
          </GroupList>
        )}

        {loading && !flowRows.length && <StatusNote>Завантаження…</StatusNote>}
      </ScaledContent>
      {pendingFlowWrites > 0 && (
        <OfflineNote data-testid="flow-outbox-pending" role="status">
          {deviceOnline
            ? `Надсилаємо записів: ${pendingFlowWrites}`
            : `Немає звʼязку — ще не надіслано: ${pendingFlowWrites}. Записи збережено на пристрої й надішлемо, щойно звʼязок повернеться.`}
        </OfflineNote>
      )}

      {showInfoModal && (
        <InfoModal
          onClose={() => setShowInfoModal(false)}
          text={showInfoModal}
          Context={dotsMenu}
        />
      )}

      {settingsOpen && (
        <Backdrop onClick={() => setSettingsOpen(false)}>
          <Sheet role="dialog" aria-label="Налаштування Flow" onClick={e => e.stopPropagation()} data-testid="flow-settings-sheet">
            <SheetGrip />
            <SheetHead>
              <h2>Налаштування</h2>
              <SmallTextBtn type="button" onClick={() => setSettingsOpen(false)}>Готово</SmallTextBtn>
            </SheetHead>
            <SheetSection>
              <span>Валюта поруч із сумами</span>
              <Segmented $count={FLOW_CURRENCY_LABEL_MODES.length} role="radiogroup" aria-label="Валюта поруч із сумами">
                {FLOW_CURRENCY_LABEL_MODES.map(mode => (
                  <SegmentBtn
                    key={mode}
                    type="button"
                    role="radio"
                    aria-checked={currencyLabelMode === mode}
                    $selected={currencyLabelMode === mode}
                    onClick={() => selectCurrencyLabelMode(mode)}
                    data-testid={`flow-currency-${mode}`}
                  >
                    {FLOW_CURRENCY_LABEL_TITLES[mode]}
                  </SegmentBtn>
                ))}
              </Segmented>
            </SheetSection>
            <SheetSection>
              <span>Група надходжень — з нею угорі прибуток чи дефіцит</span>
              <Select
                value={incomeGroup}
                onChange={e => selectIncomeGroup(e.target.value)}
                aria-label="Група надходжень"
              >
                {[...new Set([incomeGroup, ...allGroups.filter(group => group !== DEFAULT_FLOW_CATEGORY)])].map(group => (
                  <option key={group} value={group}>{group}</option>
                ))}
              </Select>
            </SheetSection>
            <SheetSection>
              <SheetRow
                type="button"
                onClick={() => {
                  setSettingsOpen(false);
                  setIsExchangeModalOpen(true);
                }}
              >
                Курс валют
                <small>{getFlowExchangeRateModeLabel(exchangeRateMode)}{customUsdRate ? ` · 1 $ = ${customUsdRate}` : ''}</small>
              </SheetRow>
              <SheetRow
                type="button"
                onClick={() => {
                  setSettingsOpen(false);
                  handleCopyToClipboard();
                }}
              >
                Копіювати Flow текстом
              </SheetRow>
              <SheetRow
                type="button"
                onClick={() => {
                  setSettingsOpen(false);
                  importInputRef.current?.click();
                }}
                data-testid="flow-import"
              >
                Імпорт з файлу
                <small>.json або .txt</small>
              </SheetRow>
              <SheetRow
                type="button"
                $danger
                onClick={() => {
                  setSettingsOpen(false);
                  openClearConfirm();
                }}
              >
                Видалити весь Flow
              </SheetRow>
            </SheetSection>
          </Sheet>
        </Backdrop>
      )}

      {rowMenu && (
        <Backdrop onClick={() => setRowMenu(null)}>
          <Sheet role="dialog" aria-label="Дії з рядком" onClick={e => e.stopPropagation()} data-testid="flow-row-menu">
            <SheetGrip />
            <SheetHead>
              <h2>Запис</h2>
              <SmallTextBtn type="button" autoFocus onClick={() => setRowMenu(null)} data-testid="flow-row-menu-close">
                Скасувати
              </SmallTextBtn>
            </SheetHead>
            <DialogText>
              <span>
                {formatShortDate(rowMenu.row.date, true)} · {formatFlowMoney(rowAmountNumber(rowMenu.row))} грн · {rowMenu.row.description}
              </span>
            </DialogText>
            <SheetSection>
              <SheetRow
                type="button"
                onClick={() => {
                  const { row } = rowMenu;
                  setRowMenu(null);
                  setGroupPicker({ mode: 'move', row });
                }}
              >
                Перенести в іншу групу
              </SheetRow>
              <SheetRow
                type="button"
                $danger
                onClick={() => {
                  const { row, rowKey } = rowMenu;
                  setRowMenu(null);
                  openDeleteConfirm(row, rowKey);
                }}
              >
                Видалити запис
              </SheetRow>
            </SheetSection>
          </Sheet>
        </Backdrop>
      )}

      {groupPicker && (
        <Backdrop
          onClick={() => {
            setGroupPicker(null);
            cancelCategoryRename();
            setIsCategoryEditMode(false);
          }}
        >
          <Sheet role="dialog" aria-label="Вибір групи" onClick={e => e.stopPropagation()} data-testid="flow-group-picker">
            <SheetGrip />
            <SheetHead>
              <h2>{groupPicker.mode === 'move' ? 'Перенести в групу' : 'Група запису'}</h2>
              <InlineRow>
                {groupPicker.mode === 'entry' && (
                  <SmallTextBtn
                    type="button"
                    onClick={() => {
                      setIsCategoryEditMode(prev => !prev);
                      cancelCategoryRename();
                    }}
                  >
                    {isCategoryEditMode ? 'Не правити' : 'Керувати'}
                  </SmallTextBtn>
                )}
                <SmallTextBtn
                  type="button"
                  onClick={() => {
                    setGroupPicker(null);
                    cancelCategoryRename();
                    setIsCategoryEditMode(false);
                  }}
                >
                  Готово
                </SmallTextBtn>
              </InlineRow>
            </SheetHead>
            {groupPicker.mode === 'move' && (
              <DialogText>
                <span>{formatShortDate(groupPicker.row.date, true)} · {formatFlowMoney(rowAmountNumber(groupPicker.row))} · {groupPicker.row.description}</span>
              </DialogText>
            )}
            <SheetSection>
              <span>{groupPicker.mode === 'move' ? 'Оберіть групу' : 'Групи'}</span>
              <ChipRow>
                {(groupPicker.mode === 'move' ? allCategories : allGroups)
                  .filter(group => group !== DEFAULT_FLOW_CATEGORY || topGroupsWithRows.includes(group))
                  .map(category => {
                    const selected = groupPicker.mode === 'move'
                      ? normalizeCategoryPath(groupPicker.row.group) === category
                      : selectedGroup === category;
                    if (renamingCategory.source === category) {
                      return (
                        <TextInput
                          key={category}
                          autoFocus
                          style={{ width: 'auto', flex: '1 1 160px' }}
                          value={renamingCategory.draft}
                          list="flow-rename-category-options"
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
                      );
                    }
                    return (
                      <InlineRow key={category}>
                        <Chip
                          type="button"
                          $selected={selected}
                          $income={isIncomePath(category)}
                          onClick={() => {
                            if (groupPicker.mode === 'move') {
                              const { row } = groupPicker;
                              setGroupPicker(null);
                              moveRowToCategory(row, category);
                              return;
                            }
                            setSelectedGroup(normalizeCategoryPath(category));
                            setSelectedSubgroup('');
                          }}
                        >
                          {formatGroupTitle(category)}
                        </Chip>
                        {groupPicker.mode === 'entry' && isCategoryEditMode && (
                          <ChipTools>
                            <MiniBtn
                              type="button"
                              aria-label={`Перейменувати групу ${category}`}
                              title="Перейменувати"
                              onClick={() => startCategoryRename(category)}
                            >
                              ✎
                            </MiniBtn>
                            <MiniBtn
                              type="button"
                              $danger
                              aria-label={`Видалити групу ${category}`}
                              title="Видалити"
                              onClick={() => openCategoryDeleteConfirm(category)}
                            >
                              ×
                            </MiniBtn>
                          </ChipTools>
                        )}
                      </InlineRow>
                    );
                  })}
              </ChipRow>
              <datalist id="flow-rename-category-options">
                {renameCategorySuggestions.map(category => (
                  <option key={category} value={category} />
                ))}
              </datalist>
            </SheetSection>
            {groupPicker.mode === 'entry' && (
              <SheetSection>
                <span>Підгрупа в «{selectedGroup}»</span>
                <ChipRow>
                  <Chip type="button" $selected={!selectedSubgroup} onClick={() => setSelectedSubgroup('')}>
                    Без підгрупи
                  </Chip>
                  {subgroupsForSelectedGroup.map(subgroup => (
                    <InlineRow key={`${selectedGroup}/${subgroup}`}>
                      <Chip
                        type="button"
                        $selected={selectedSubgroup === subgroup}
                        onClick={() => setSelectedSubgroup(normalizeCategoryPath(subgroup))}
                      >
                        {subgroup}
                      </Chip>
                      {isCategoryEditMode && (
                        <MiniBtn
                          type="button"
                          $danger
                          aria-label={`Видалити підгрупу ${subgroup}`}
                          title="Видалити"
                          onClick={() => openCategoryDeleteConfirm(buildCategoryPath(selectedGroup, subgroup))}
                        >
                          ×
                        </MiniBtn>
                      )}
                    </InlineRow>
                  ))}
                </ChipRow>
              </SheetSection>
            )}
            <SheetSection>
              <span>{groupPicker.mode === 'move' ? 'Або нова група' : 'Нова група чи підгрупа'}</span>
              <InlineRow>
                <TextInput
                  ref={categoryInputRef}
                  style={{ flex: '1 1 160px', width: 'auto' }}
                  value={categoryInput}
                  onChange={e => setCategoryInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (groupPicker.mode === 'move') {
                        const target = normalizeCategoryPath(categoryInput);
                        if (!target) return;
                        const { row } = groupPicker;
                        setGroupPicker(null);
                        setCategoryInput('');
                        moveRowToCategory(row, target);
                        return;
                      }
                      addCategory();
                    }
                  }}
                  placeholder="Назва нової групи"
                />
                <GhostBtn
                  type="button"
                  disabled={!categoryInput.trim()}
                  onClick={() => {
                    if (groupPicker.mode === 'move') {
                      const target = normalizeCategoryPath(categoryInput);
                      if (!target) return;
                      const { row } = groupPicker;
                      setGroupPicker(null);
                      setCategoryInput('');
                      moveRowToCategory(row, target);
                      return;
                    }
                    addCategory();
                  }}
                >
                  {groupPicker.mode === 'move' ? 'Перенести' : 'Додати'}
                </GhostBtn>
              </InlineRow>
              {groupPicker.mode === 'entry' && (
                <InlineRow>
                  <TextInput
                    ref={subCategoryInputRef}
                    style={{ flex: '1 1 160px', width: 'auto' }}
                    value={subCategoryInput}
                    onChange={e => setSubCategoryInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addSubcategory();
                      }
                    }}
                    placeholder={`Нова підгрупа в «${selectedGroup}»`}
                  />
                  <GhostBtn type="button" disabled={!subCategoryInput.trim()} onClick={addSubcategory}>
                    Додати
                  </GhostBtn>
                </InlineRow>
              )}
            </SheetSection>
          </Sheet>
        </Backdrop>
      )}

      {isExchangeModalOpen && (
        <Backdrop $center onClick={() => setIsExchangeModalOpen(false)}>
          <Dialog role="dialog" aria-label="Курс для розрахунків Flow" onClick={e => e.stopPropagation()}>
            <h2>Курс для розрахунків</h2>
            {FLOW_EXCHANGE_RATE_OPTIONS.map(option => (
              <RateOption key={option.value} $selected={exchangeRateMode === option.value}>
                <input
                  type="radio"
                  name="flow-exchange-rate-mode"
                  value={option.value}
                  checked={exchangeRateMode === option.value}
                  onChange={e => setExchangeRateMode(getValidFlowExchangeRateMode(e.target.value))}
                />
                <span>
                  <b>{option.label}</b>
                  <small>{option.description}</small>
                </span>
              </RateOption>
            ))}
            <SheetSection>
              <span>Власний курс USD/UAH</span>
              <TextInput
                type="text"
                inputMode="decimal"
                value={isCustomUsdRateFocused ? customUsdRateDraft : formatCustomUsdRateDisplay(customUsdRate)}
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
              <EntryHint>
                Збережений власний курс рахує долар у всіх сумах; порожнє поле — обраний вище курс.
              </EntryHint>
            </SheetSection>
            <DialogActions>
              <PrimaryBtn type="button" onClick={() => setIsExchangeModalOpen(false)}>Готово</PrimaryBtn>
            </DialogActions>
          </Dialog>
        </Backdrop>
      )}

      {confirmState.type && (
        <Backdrop $center onClick={closeConfirm}>
          <Dialog role="dialog" onClick={e => e.stopPropagation()}>
            <h2>
              {confirmState.type === 'category'
                ? `Видалити групу «${confirmState.category}»?`
                : confirmState.type === 'import'
                  ? `Імпортувати ${importState?.count || 0} записів?`
                  : confirmState.type === 'clear'
                    ? 'Видалити весь Flow?'
                    : 'Видалити запис?'}
            </h2>
            {confirmState.type === 'category' && (
              <DialogText data-testid="flow-category-delete-summary">
                {confirmState.count > 0
                  ? `Разом із нею зникнуть ${confirmState.count} записів на ${formatFlowMoney(confirmState.totalUah)} грн, зокрема в її підгрупах. Відновити їх не можна.`
                  : 'Записів у групі немає.'}
              </DialogText>
            )}
            {confirmState.type === 'clear' && (
              <DialogText>Усі групи й записи зникнуть. Відновити їх не можна.</DialogText>
            )}
            {confirmState.type === 'import' && importState && (
              <DialogText data-testid="flow-import-summary">
                <span>Файл «{importState.fileName}»</span>
                {Object.entries(importState.groups).map(([group, count]) => (
                  <span key={group}>{formatGroupTitle(group)}: {count}</span>
                ))}
                {importState.undatedCount > 0 && (
                  <span>Без дати: {importState.undatedCount} — стануть на 1 січня</span>
                )}
                {importState.skippedCount > 0 && <span>Пропущено без суми: {importState.skippedCount}</span>}
                <span>Записи додаються до наявних, а не замінюють їх.</span>
              </DialogText>
            )}
            {confirmState.type === 'row' && confirmState.row && (
              <DialogText>
                {formatDisplayDate(confirmState.row.date)} · {formatFlowMoney(rowAmountNumber(confirmState.row))} грн · {confirmState.row.description}
              </DialogText>
            )}
            <DialogActions>
              <GhostBtn type="button" onClick={closeConfirm}>Скасувати</GhostBtn>
              {confirmState.type === 'import' ? (
                <PrimaryBtn type="button" onClick={handleConfirm} disabled={isImporting} data-testid="flow-import-confirm">
                  {isImporting ? 'Імпортую…' : 'Імпортувати'}
                </PrimaryBtn>
              ) : (
                <DangerBtn type="button" onClick={handleConfirm}>Видалити</DangerBtn>
              )}
            </DialogActions>
          </Dialog>
        </Backdrop>
      )}
    </Wrap>
  );
};

const OwnerBar = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  max-width: 720px;
  margin: 0 auto;
  padding: 10px 12px 0;
  box-sizing: border-box;
`;

const OwnerSelect = styled.select`
  width: 100%;
  min-height: 38px;
  padding: 6px 10px;
  border: 1px solid var(--km-border, #d7d7d7);
  border-radius: 10px;
  background: var(--km-card, #fff);
  color: var(--km-text, #222);
  font: inherit;
  font-size: 14px;
`;

const OwnerBanner = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 10px;
  background: var(--km-accent-light, #fdf0e4);
  color: var(--km-text, #222);
  font-size: 13px;
  font-weight: 600;
`;

const OwnerBackBtn = styled.button`
  flex: 0 0 auto;
  border: 1px solid var(--km-accent, #c9600f);
  border-radius: 8px;
  background: transparent;
  color: var(--km-accent, #c9600f);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  padding: 4px 8px;
  cursor: pointer;
`;

/*
 * Flow адміна з вибором учасника (16.11, на прохання власниці продукту): адмін
 * обирає того, у кого заповнений Flow, і бачить та править саме його. Поки
 * обрано учасника, власний Flow адміна не показується й не пишеться зовсім —
 * `FlowManager` монтується наново з ключем власника, тож жоден стан (поле
 * вводу, відкрита група, рядок у правці) не переходить з одного Flow в інший.
 * Право на чужий `multiData/flow/{uid}` дають правила лише двом повним адмінам
 * (інспектор читає, але не пише). Вибір не памʼятається між перезавантаженнями:
 * відкриття Flow завжди починається з власного, щоб не правити клієнта, думаючи,
 * що це своє.
 */
const FlowScreen = ({ ownerId: viewerId }) => {
  const isAdmin = isAdminUid(viewerId);
  const [owners, setOwners] = useState([]);
  const [ownersError, setOwnersError] = useState('');
  const [selectedOwnerId, setSelectedOwnerId] = useState('');

  useEffect(() => {
    if (!isAdmin || !viewerId) return undefined;
    let cancelled = false;
    listFlowOwners({ excludeUid: viewerId })
      .then(list => {
        if (!cancelled) setOwners(list);
      })
      .catch(error => {
        console.error('Unable to list flow owners', error);
        if (!cancelled) setOwnersError('Не вдалося прочитати, у кого є Flow');
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin, viewerId]);

  const shownOwnerId = isAdmin && selectedOwnerId ? selectedOwnerId : viewerId;
  const selectedOwner = owners.find(owner => owner.uid === selectedOwnerId);

  return (
    <>
      {isAdmin && (
        <OwnerBar>
          <OwnerSelect
            aria-label="Чий Flow показати"
            value={selectedOwnerId}
            onChange={e => setSelectedOwnerId(e.target.value)}
            data-testid="flow-owner-select"
          >
            <option value="">Мій Flow</option>
            {owners.map(owner => (
              <option key={owner.uid} value={owner.uid}>
                {owner.name || owner.uid}
              </option>
            ))}
          </OwnerSelect>
          {ownersError && <small>{ownersError}</small>}
          {selectedOwnerId && (
            <OwnerBanner data-testid="flow-owner-banner">
              <span>Ви правите Flow учасника: {selectedOwner?.name || selectedOwnerId}</span>
              <OwnerBackBtn type="button" onClick={() => setSelectedOwnerId('')}>
                До свого
              </OwnerBackBtn>
            </OwnerBanner>
          )}
        </OwnerBar>
      )}
      <FlowManager key={shownOwnerId || 'none'} ownerId={shownOwnerId} viewerId={viewerId} />
    </>
  );
};

export default FlowScreen;
