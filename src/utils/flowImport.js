// Імпорт у Flow з файлу. Поле введення Flow приймає текстовий список
// («[Група]», далі «дд.мм.рррр сума опис»), тож будь-який файл тут зводиться
// до цього тексту, а зберігає його той самий `handleSave`, що й набране
// вручну: групи, курси, черга записів пристрою — одна дорога, а не друга.
//
// Файлів два роди:
// - текстовий список (.txt) — іде як є;
// - структурований JSON (`schemaVersion: 1`, `tables[].groupPath`,
//   `entries[] { date, amount, description, side }`) — так вивантажують
//   таблиці Excel. Запис без дати отримує технічну дату з `datePolicy`
//   (інакше — сьогодні) і приписку «(дата оплати не вказана)»: дата внесення
//   не є датою оплати, і без приписки їх би не розрізнити.

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

const toDisplayDate = ymd => {
  const match = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : '';
};

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
  const fallbackYmd = /^\d{4}-\d{2}-\d{2}$/.test(String(data?.datePolicy?.textImportFallbackDate || ''))
    ? data.datePolicy.textImportFallbackDate
    : today || todayYmd();
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
      const path = subgroup ? `${groupPath}/${subgroup}` : groupPath;
      const dated = toDisplayDate(entry?.date);
      const description = cleanDescription(entry?.description);
      const line = dated
        ? `${dated} ${amount}${description ? ` ${description}` : ''}`
        : `${toDisplayDate(fallbackYmd)} ${amount} ${description ? `${description} ` : ''}${FLOW_IMPORT_UNDATED_NOTE}`;
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
