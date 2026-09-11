#!/usr/bin/env node
/**
 * Перевести експорт `searchId` зі старої форми ключа в нову.
 *
 *   було:  { "phone_380671112233": "AA0001", "name_олена": ["AA0001", "AA0002"] }
 *   стало: { "380671112233": { "phone": "AA0001" },
 *            "олена":        { "name": ["AA0001", "AA0002"] } }
 *
 * Скрипт існує, щоб не перекачувати базу заради зміни форми: індекс на 79 тисяч
 * ключів уже лежить файлом, і переставити в ньому поле з ключа у значення можна
 * офлайн. Повна перебудова з анкет — це кнопка «Локальна індексація» на
 * `AddNewProfile`; вона потрібна тоді, коли індекс розійшовся з анкетами, а не
 * коли змінилась форма.
 *
 *   node scripts/convertSearchIdIndex.js searchId-export.json [searchId-new.json]
 *
 * Ключі, у яких перед першим `_` не стоїть жодне з індексованих полів, у новий
 * файл не потрапляють — вони й у старому нічого не означали (пошук питав тільки
 * `{поле}_{значення}`). Скрипт називає їх поіменно: мовчазний пропуск тут
 * означав би дірку в пошуку, яку помітять уже по відсутній анкеті.
 */
/* eslint-disable no-console */
require('@babel/register')({
  presets: [['@babel/preset-env', { targets: { node: 'current' } }]],
  extensions: ['.js'],
  ignore: [/node_modules/],
});

const fs = require('fs');
const path = require('path');

const { SEARCH_ID_INDEXED_FIELDS } = require('../src/utils/searchKeyUtils');

const flattenIds = value => {
  if (Array.isArray(value)) return value.flatMap(flattenIds);
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  if (typeof value === 'number') return [String(value)];
  return [];
};

const splitLegacyKey = key => {
  const separatorIndex = String(key).indexOf('_');
  if (separatorIndex <= 0) return null;
  const field = key.slice(0, separatorIndex);
  const valueKey = key.slice(separatorIndex + 1);
  if (!SEARCH_ID_INDEXED_FIELDS.has(field) || !valueKey) return null;
  return { field, valueKey };
};

const convertSearchIdIndex = (legacyIndex = {}) => {
  const payload = {};
  const report = {
    legacyKeys: 0,
    convertedKeys: 0,
    valueKeys: 0,
    mergedValueKeys: 0,
    repairedNestedLists: 0,
    skippedKeys: [],
    emptyKeys: [],
  };

  Object.entries(legacyIndex || {}).forEach(([legacyKey, legacyValue]) => {
    report.legacyKeys += 1;

    const parsed = splitLegacyKey(legacyKey);
    if (!parsed) {
      report.skippedKeys.push(legacyKey);
      return;
    }

    const ids = flattenIds(legacyValue);
    if (!ids.length) {
      report.emptyKeys.push(legacyKey);
      return;
    }
    // Масив усередині масиву — слід зіпсованого запису; читач розгортав його
    // лише на один рівень, тож такий ключ мовчки не знаходив анкету.
    if (Array.isArray(legacyValue) && legacyValue.some(Array.isArray)) {
      report.repairedNestedLists += 1;
    }

    if (!payload[parsed.valueKey]) {
      payload[parsed.valueKey] = {};
      report.valueKeys += 1;
    } else if (!payload[parsed.valueKey][parsed.field]) {
      // Це значення вже прийшло з іншого поля — рівно той випадок, заради якого
      // поле й переїхало у значення: два записи лягають поруч, а не поверх.
      report.mergedValueKeys += 1;
    }

    const existingIds = flattenIds(payload[parsed.valueKey][parsed.field]);
    const nextIds = [...new Set([...existingIds, ...ids])];
    payload[parsed.valueKey][parsed.field] = nextIds.length === 1 ? nextIds[0] : nextIds;
    report.convertedKeys += 1;
  });

  return { payload, report };
};

module.exports = { convertSearchIdIndex, splitLegacyKey };

if (require.main === module) {
  const [inputPath, outputPathArg] = process.argv.slice(2);

  if (!inputPath) {
    console.error('Вкажіть файл експорту: node scripts/convertSearchIdIndex.js searchId-export.json');
    process.exit(1);
  }

  const legacyIndex = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const { payload, report } = convertSearchIdIndex(legacyIndex);

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const outputPath = outputPathArg
    || path.join(path.dirname(inputPath), `searchId-index-${stamp}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2));

  console.log(`Ключів у старому файлі: ${report.legacyKeys}`);
  console.log(`Перенесено: ${report.convertedKeys} → значень у новому файлі: ${report.valueKeys}`);
  console.log(`Значень, що зійшлись із кількох полів: ${report.mergedValueKeys}`);
  if (report.repairedNestedLists) {
    console.log(`Полагоджено вкладених списків: ${report.repairedNestedLists}`);
  }
  if (report.emptyKeys.length) {
    console.log(`Порожні ключі (пропущено): ${report.emptyKeys.length}`);
  }
  if (report.skippedKeys.length) {
    console.log(`Пропущено ключів без відомого поля: ${report.skippedKeys.length}`);
    report.skippedKeys.slice(0, 20).forEach(key => console.log(`  - ${key}`));
    if (report.skippedKeys.length > 20) console.log(`  … і ще ${report.skippedKeys.length - 20}`);
  }
  console.log(`\nЗаписано: ${outputPath}`);
  console.log('Заливати в Firebase Console → Realtime Database → searchId (імпорт замінює вузол).');
}
