// Імпорт у Flow з файлу. Поле введення Flow приймає текстовий список
// («[Група]», далі «дд.мм.рррр сума опис»), тож будь-який файл тут зводиться
// до цього тексту, а зберігає його той самий `handleSave`, що й набране
// вручну: групи, курси, черга записів пристрою — одна дорога, а не друга.
//
// Файлів два роди:
// - текстовий список (.txt) — іде як є;
// - структурований JSON (`schemaVersion: 1`, `tables[].groupPath`,
//   `entries[] { date, amount, description, side }`) — так вивантажують
//   таблиці Excel. Запис без дати (і з неіснуючою датою, як 29.02.2025)
//   стає на 1 січня року імпорту (рік `datePolicy`, інакше — поточний),
//   без жодної приписки (17.11, на прохання власниці продукту: приписка
//   «дата оплати не вказана» на двохстах рядках лише займала місце, а
//   описи після імпорту правлять руками). Доти такий запис лягав на дату
//   імпорту й змішувався з платежами поточного місяця.

// Приписка, яку ставив імпорт до 17.11. Нових записів з нею немає; Flow
// знімає її зі старих (`listLegacyUndatedFlowRows` у FlowManager).
export const FLOW_IMPORT_UNDATED_NOTE = '(дата оплати не вказана)';

// Витрата й переказ в одній групі склались би в суму, яка нічого не означає
// (двері 18 679 + переказ 18 679 = 37 358). Таблиця з обома сторонами
// розкладається на підгрупи.
const SIDE_SUBGROUPS = {
  expense: 'Витрати',
  receipt_or_transfer: 'Перекази',
  income: 'Надходження',
};

const pad2 = value => String(value).padStart(2, '0');

const todayYmd = (now = new Date()) =>
  `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;

// Дата, якої в календарі немає (2025-02-29), — як дата відсутня: поле Flow
// таку відкинуло б, і весь рядок платежу розібрався б як заголовок групи, а
// наступні платежі таблиці лягли б у групу з його назвою.
const isCalendarYmd = ymd => {
  const match = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

const toDisplayDate = ymd => {
  if (!isCalendarYmd(ymd)) return '';
  const match = String(ymd).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return `${match[3]}.${match[2]}.${match[1]}`;
};

export const FLOW_IMPORT_UNDATED_MONTH_DAY = '01.01';

const formatAmount = value => {
  const number = Number(value);
  if (!Number.isFinite(number) || number === 0) return '';
  return String(Math.round(number * 100) / 100);
};

// Квадратні дужки й переноси в назві групи зламали б розбір тексту.
const cleanGroupPath = value =>
  String(value || '')
    .replace(/[[\]\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const cleanDescription = value => String(value || '').replace(/\s+/g, ' ').trim();

const isStructuredFlowImport = data =>
  Boolean(data) && typeof data === 'object' && Array.isArray(data.tables);

const buildTextFromStructured = (data, { today } = {}) => {
  const fallbackYmd = isCalendarYmd(data?.datePolicy?.textImportFallbackDate)
    ? data.datePolicy.textImportFallbackDate
    : today || todayYmd();
  const undatedDisplay = `${FLOW_IMPORT_UNDATED_MONTH_DAY}.${fallbackYmd.slice(0, 4)}`;
  const lines = [];
  let entryCount = 0;
  let undatedCount = 0;
  let skippedCount = 0;

  data.tables.forEach((table, tableIndex) => {
    const groupPath = cleanGroupPath(table?.groupPath) || `Імпорт ${tableIndex + 1}`;
    const entries = Array.isArray(table?.entries) ? table.entries : [];
    const sides = new Set(entries.map(entry => entry?.side).filter(Boolean));
    const splitBySide = sides.size > 1;
    const byPath = new Map();

    entries.forEach(entry => {
      const amount = formatAmount(entry?.amount);
      if (!amount) {
        skippedCount += 1;
        return;
      }
      const subgroup = splitBySide ? SIDE_SUBGROUPS[entry.side] || cleanGroupPath(entry.side) : '';
      // Flow знає два рівні («група/підгрупа»): таблиця, що вже має підгрупу
      // («Дім/Двері»), дописує сторону до її назви, а не третім рівнем —
      // третій Flow відкинув би, і витрати з переказами злились би знову.
      const path = !subgroup
        ? groupPath
        : groupPath.includes('/')
          ? `${groupPath} · ${subgroup}`
          : `${groupPath}/${subgroup}`;
      const dated = toDisplayDate(entry?.date);
      const description = cleanDescription(entry?.description);
      const line = `${dated || undatedDisplay} ${amount}${description ? ` ${description}` : ''}`;
      if (!dated) undatedCount += 1;
      entryCount += 1;
      if (!byPath.has(path)) byPath.set(path, []);
      byPath.get(path).push(line);
    });

    byPath.forEach((pathLines, path) => {
      lines.push(`[${path}]`, ...pathLines, '');
    });
  });

  return {
    text: lines.join('\n').trim(),
    entryCount,
    undatedCount,
    skippedCount,
    format: 'json',
  };
};

/**
 * Текст файлу → текст для поля Flow. JSON без `tables` — помилка, а не
 * мовчазний порожній імпорт: людина мусить знати, що файл не той.
 */
export const buildFlowImportText = (fileText, { fileName = '', today } = {}) => {
  const raw = String(fileText || '').replace(/^﻿/, '');
  // Текстовий список сам починається з «[Група]», тож «[» на початку ще не
  // JSON: вирішує розширення, а без нього — лише «{».
  const looksLikeJson = /\.json$/i.test(fileName)
    || (!/\.txt$/i.test(fileName) && /^\s*\{/.test(raw));
  if (looksLikeJson) {
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error('Файл не читається як JSON');
    }
    if (!isStructuredFlowImport(data)) {
      throw new Error('У JSON немає таблиць (tables) для Flow');
    }
    return buildTextFromStructured(data, { today });
  }
  const text = raw.trim();
  return { text, entryCount: null, undatedCount: 0, skippedCount: 0, format: 'text' };
};
