// Як Flow показує записи: гроші, місяці, пошук, надходження й баланс,
// валюта міток. Чисті функції — екран (`FlowManager`) лише малює.
//
// 17.11, на прохання власниці продукту (макет на справжньому Flow учасника):
// - угорі лише підсумок витрат; баланс (прибуток чи дефіцит) — коли обрано
//   групу надходжень, а вона завжди є серед чіпів, навіть порожня;
// - валюта міток — одна, дві чи жодної (налаштування ⚙): на телефоні
//   еквівалент під кожною сумою забирав пів ширини;
// - пошук по описах — миттєво, по всіх групах;
// - записи імпорту без дати стоять на 1 січня, без приписки.

import { FLOW_IMPORT_UNDATED_NOTE } from './flowImport';

export const FLOW_CURRENCY_LABEL_MODES = ['none', 'usd', 'eur', 'both'];
export const DEFAULT_FLOW_CURRENCY_LABEL_MODE = 'usd';

export const normalizeFlowCurrencyLabelMode = value =>
  FLOW_CURRENCY_LABEL_MODES.includes(value) ? value : DEFAULT_FLOW_CURRENCY_LABEL_MODE;

// Валюти, які показують мітки: порожньо — без міток.
export const listFlowLabelCurrencies = mode => {
  const normalized = normalizeFlowCurrencyLabelMode(mode);
  if (normalized === 'none') return [];
  if (normalized === 'both') return ['usd', 'eur'];
  return [normalized];
};

// Група надходжень. Окремої позначки в базі немає (дані Flow — лише групи й
// записи), тож без вибору в налаштуваннях її впізнає назва.
export const FLOW_DEFAULT_INCOME_GROUP = 'Надходження';
const INCOME_NAME_PATTERN = /надходж|дохід|доход|прибут|зарплат|income|salary/iu;

export const detectFlowIncomeGroup = (groups = [], saved = '') => {
  const list = groups.filter(Boolean);
  if (saved && list.includes(saved)) return saved;
  return list.find(group => INCOME_NAME_PATTERN.test(group)) || saved || FLOW_DEFAULT_INCOME_GROUP;
};

export const topLevelFlowGroup = groupPath => String(groupPath || '').split('/')[0] || '';

const NBSP = ' ';
const MINUS = '−';

// «60 962,22» — розряди нерозривним пробілом, кома, два знаки, коли є копійки.
export const formatFlowMoney = (value, { signed = false } = {}) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0';
  const rounded = Math.round(number * 100) / 100;
  const negative = rounded < 0;
  const abs = Math.abs(rounded);
  const [intPart, fraction = ''] = abs.toFixed(2).split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  const text = fraction === '00' ? grouped : `${grouped},${fraction}`;
  if (negative) return `${MINUS}${text}`;
  return signed && rounded > 0 ? `+${text}` : text;
};

const MONTH_FORMAT = (() => {
  try {
    return new Intl.DateTimeFormat('uk-UA', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  } catch {
    return null;
  }
})();

export const formatFlowMonthLabel = monthKey => {
  const match = String(monthKey || '').match(/^(\d{4})-(\d{2})$/);
  if (!match) return 'Без дати';
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  const label = MONTH_FORMAT ? MONTH_FORMAT.format(date).replace(/\s*р\.?$/u, '') : `${match[2]}.${match[1]}`;
  return label.charAt(0).toUpperCase() + label.slice(1);
};

// Найновіше — першим: у людей сотні рядків, і свіжий платіж мусить бути
// одразу під заголовком групи, а не за десяток екранів.
export const compareFlowRowsNewestFirst = (a, b) => {
  const byDate = String(b.date || '').localeCompare(String(a.date || ''));
  if (byDate) return byDate;
  return String(b.entryId || '').localeCompare(String(a.entryId || ''));
};

export const groupFlowRowsByMonth = (rows = [], amountOf = () => 0) => {
  const months = new Map();
  [...rows].sort((a, b) => compareFlowRowsNewestFirst(a.row || a, b.row || b)).forEach(item => {
    const row = item.row || item;
    const key = String(row.date || '').slice(0, 7);
    if (!months.has(key)) months.set(key, { key, label: formatFlowMonthLabel(key), items: [], total: 0 });
    const month = months.get(key);
    month.items.push(item);
    month.total += Number(amountOf(row)) || 0;
  });
  return [...months.values()];
};

const normalizeSearchText = value =>
  String(value || '')
    .toLocaleLowerCase('uk')
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .trim();

// Пошук — по описах і назвах груп, кожне слово запиту окремо («плитка
// ванна» знаходить «Робота плитка ванна, підрізка…»). Число шукається й у
// сумі: «18679» знаходить двері.
export const searchFlowRows = (rows = [], query = '') => {
  const words = normalizeSearchText(query).split(' ').filter(Boolean);
  if (!words.length) return [];
  return rows.filter(item => {
    const row = item.row || item;
    const haystack = normalizeSearchText(`${row.description || ''} ${row.group || ''} ${row.amount || ''}`);
    return words.every(word => haystack.includes(word));
  });
};

// Підсумок угорі. Витрати — усе, крім надходжень (або обрана група);
// баланс — лише коли обрано надходження.
export const summarizeFlow = ({ totalsByPath = {}, incomeGroup = '', filter = '' }) => {
  let income = 0;
  let expenses = 0;
  let selected = 0;
  Object.entries(totalsByPath).forEach(([path, value]) => {
    const amount = Number(value) || 0;
    const top = topLevelFlowGroup(path);
    if (top === incomeGroup) income += amount;
    else expenses += amount;
    if (filter && top === filter) selected += amount;
  });
  if (filter && filter === incomeGroup) {
    const balance = income - expenses;
    return { mode: 'balance', income, expenses, balance, profit: balance >= 0 };
  }
  if (filter) return { mode: 'group', expenses: selected };
  return { mode: 'expenses', expenses };
};

// Записи старого імпорту з припискою «(дата оплати не вказана)» стояли на
// даті імпорту. Тепер такі — на 1 січня того ж року й без приписки. Латка
// черги: старий шлях знімається, новий — з тим самим значенням без приписки.
const stripUndatedNote = value =>
  String(value || '')
    .replace(` ${FLOW_IMPORT_UNDATED_NOTE}`, '')
    .replace(FLOW_IMPORT_UNDATED_NOTE, '')
    .trimEnd();

const isDateKey = key => /^\d{4}-\d{2}-\d{2}$/.test(key);

export const buildLegacyUndatedFlowPatch = (data, ownerId) => {
  const patch = {};
  let count = 0;
  if (!ownerId || !data || typeof data !== 'object') return { patch, count };
  const root = `multiData/flow/${ownerId}`;
  const walk = (node, path) => {
    Object.entries(node || {}).forEach(([key, value]) => {
      if (!value || typeof value !== 'object') return;
      if (!isDateKey(key)) {
        walk(value, [...path, key]);
        return;
      }
      const targetDate = `${key.slice(0, 4)}-01-01`;
      Object.entries(value).forEach(([entryId, entry]) => {
        const description = typeof entry === 'string' ? entry : entry?.description;
        if (!String(description || '').includes(FLOW_IMPORT_UNDATED_NOTE)) return;
        const nextValue = typeof entry === 'string'
          ? stripUndatedNote(entry)
          : { ...entry, description: stripUndatedNote(entry.description) };
        const groupPath = path.join('/');
        if (targetDate !== key) patch[`${root}/${groupPath}/${key}/${entryId}`] = null;
        patch[`${root}/${groupPath}/${targetDate}/${entryId}`] = nextValue;
        count += 1;
      });
    });
  };
  walk(data, []);
  return { patch, count };
};
