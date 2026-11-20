// Чисті функції Flow (20.11, винесено з `components/FlowManager.jsx`): розбір
// набраного рядка, суми й курси, ключі памʼяті пристрою, розкладка вузла бази
// в рядки. Компонент лише малює й пише; тут немає ні React, ні бази, тож усе
// це перевіряється тестами без рендера.
import { isFormulaFlowAmount, resolveFlowAmountInput } from 'utils/flowAmountFormula';
import { resolveFlowExchangeRatesForMode } from 'components/config';

// Масштаб тексту Flow (16.11, на прохання власниці продукту: «нічого не видно»).
// Шрифти тут задані пікселями в десятку компонентів, тож масштабується весь
// вміст під верхнім рядком через `zoom` — і текст, і поля, і мішені дотику
// разом, як масштаб браузера. Верхній рядок і шторки не масштабуються.
// 175 % прибрано (17.11): на телефоні в рядок уже не вміщалось нічого.
export const FLOW_TEXT_SCALES = [0.9, 1, 1.15, 1.3, 1.5];
export const flowTextScaleStorageKey = ownerId => `flow-text-scale:${ownerId || 'anon'}`;

export const normalizeCategoryPath = value =>
  String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[\\]+/g, '')
    .replace(/\/+/g, '/')
    .replace(/^\/+|\/+$/g, '');

export const splitCategoryPath = value => {
  const normalized = normalizeCategoryPath(value);
  const [group = '', subgroup = ''] = normalized.split('/');
  return {
    group: group || 'general',
    subgroup: subgroup || '',
  };
};

export const buildCategoryPath = (group, subgroup = '') => {
  const normalizedGroup = normalizeCategoryPath(group) || 'general';
  const normalizedSubgroup = normalizeCategoryPath(subgroup);
  return normalizedSubgroup ? `${normalizedGroup}/${normalizedSubgroup}` : normalizedGroup;
};

export const formatDisplayDate = yyyyMmDd => {
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

export const todayYmd = () => {
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

export const normalizeFlowAmount = value => {
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
export const FLOW_DATE_YMD_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const toAmountNumber = value => {
  const normalized = String(value || '').trim().replace(/,/g, '.');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const hasStoredFlowAmount = value => {
  const normalized = String(value ?? '').trim().replace(/,/g, '.');
  if (!normalized) return false;
  return Number.isFinite(Number(normalized));
};

export const formatFlowAmountForClipboard = value => {
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

export const formatCustomUsdRate = value => {
  const normalizedRate = normalizeCustomUsdRate(value);
  return normalizedRate ? formatCurrencyValue(normalizedRate) : '';
};

export const formatCustomUsdRateDisplay = value => {
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
export const FLOW_CURRENCY_SIGNS = { usd: '$', eur: '€' };
// Які записи потрапляють в історію відміни і як вони звуться в тості.
export const FLOW_HISTORY_LABELS = {
  'Запис Flow не збережено': 'новий запис',
  'Запис не оновлено': 'правка запису',
  'Запис не видалено': 'видалення запису',
  'Платіж не перенесено': 'перенесення запису',
  'Групу не видалено': 'видалення групи',
  'Групу не перейменовано': 'перейменування групи',
  'Flow не очищено': 'очищення Flow',
};
export const FLOW_CURRENCY_LABEL_TITLES = { none: 'Без валюти', usd: '$', eur: '€', both: '$ і €' };

// Збережений курс рядка — четверта частина суми: «50.75» (долар) або «50.75EUR».
export const parseStoredFlowCustomRate = value => {
  const raw = String(value || '').trim();
  const eurMatch = raw.match(/^(\d+(?:[.,]\d+)?)\s*EUR$/i);
  if (eurMatch) return { customUsdRate: '', customEurRate: eurMatch[1] };
  return { customUsdRate: raw, customEurRate: '' };
};

export const formatGroupTitle = groupPath => {
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

export const resolveFlowDisplayAmount = ({
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

export const getFlowAmountNumberForTotals = options => toAmountNumber(resolveFlowDisplayAmount(options));

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

export const resolveFlowFallbackDate = (rawText, fallbackDate = '') => {
  const normalizedFallbackDate = /^\d{4}-\d{2}-\d{2}$/.test(String(fallbackDate || ''))
    ? fallbackDate
    : '';
  if (FLOW_DATE_TOKEN_PATTERN.test(String(rawText || ''))) {
    return normalizedFallbackDate || todayYmd();
  }
  return todayYmd();
};

export const parseFlowEntriesByDatesAndGroups = ({
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

export const sanitizeEntryKeyChunk = value =>
  String(value || '')
    .trim()
    .replace(/[.#$[\]/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const DEFAULT_FLOW_CATEGORY = 'general';
export const DEFAULT_FLOW_EXCHANGE_RATE_MODE = 'current';
export const FLOW_EXCHANGE_RATE_OPTIONS = [
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
export const getValidFlowExchangeRateMode = value =>
  FLOW_EXCHANGE_RATE_MODE_VALUES.includes(value) ? value : DEFAULT_FLOW_EXCHANGE_RATE_MODE;
export const getFlowExchangeRateModeLabel = value =>
  FLOW_EXCHANGE_RATE_OPTIONS.find(option => option.value === value)?.label || 'Поточний';
export const flowDraftStorageKey = ownerId => `flow-draft:${ownerId || 'anon'}`;
export const flowLastCategoryStorageKey = ownerId => `flow-last-category:${ownerId || 'anon'}`;
export const flowExchangeRateModeStorageKey = ownerId => `flow-exchange-rate-mode:${ownerId || 'anon'}`;
export const flowDisplayCurrencyStorageKey = ownerId => `flow-display-currency:${ownerId || 'anon'}`;
// Відкрита група списку — одна на пристрій і власника (порожньо — усі згорнуті).
export const flowOpenGroupStorageKey = ownerId => `flow-open-group:${ownerId || 'anon'}`;
export const flowOpenSectionStorageKey = ownerId => `flow-open-section:${ownerId || 'anon'}`;
export const flowIncomeGroupStorageKey = ownerId => `flow-income-group:${ownerId || 'anon'}`;
export const flowFilterStorageKey = ownerId => `flow-filter:${ownerId || 'anon'}`;
export const flowCustomUsdRateStorageKey = ownerId => `flow-custom-usd-rate:${ownerId || 'anon'}`;

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

export const sortRowsByDate = rows =>
  [...rows].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));

export const sortRowsByGroupAndDate = rows =>
  [...rows].sort((a, b) => {
    const groupCompare = String(a.group || '').localeCompare(String(b.group || ''));
    if (groupCompare !== 0) return groupCompare;
    return String(a.date || '').localeCompare(String(b.date || ''));
  });

// «1 запис», «2 записи», «5 записів», «21 запис» — для підтверджень.
export const formatFlowEntryCount = count => {
  const n = Math.abs(Number(count) || 0);
  const lastTwo = n % 100;
  const last = n % 10;
  const word = lastTwo >= 11 && lastTwo <= 14
    ? 'записів'
    : last === 1
      ? 'запис'
      : last >= 2 && last <= 4
        ? 'записи'
        : 'записів';
  return `${count} ${word}`;
};
