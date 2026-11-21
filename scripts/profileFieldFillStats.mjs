#!/usr/bin/env node
/**
 * Статистика заповнення полів анкети: скільки карток має **поточне** значення
 * кожного поля — усього й окремо за роллю картки.
 *
 * Навіщо: форма картки адміна (`ProfileForm`) показує полями лише ті поля, що
 * в картці є, а решту — чіпами «Додати поле», і першими стоять поля, які в базі
 * заповнюють найчастіше (на прохання власниці продукту, 21.11). Форма читає
 * результат з вузла `profileFieldStats` (`profileFieldStatsRemote`).
 *
 * Вхід — тека з вивантаженнями вузлів (`matchingCards.json`, `profileDetails.json`,
 * `profileContacts.json`, `profileWorkflow.json`, `profileTechnical.json`), які
 * робить workflow `profile-field-stats.yml` сервісним акаунтом; вихід — JSON
 * для `database:set /profileFieldStats`. Туди йдуть самі лічильники за назвою
 * поля: жодного значення чи id картки, а ключ — лише `[A-Za-z_][A-Za-z0-9_]*`,
 * що трапився щонайменше `MIN_COUNT` разів. У stdout — лише кількості.
 *
 * Запуск: node scripts/profileFieldFillStats.mjs <тека вивантажень> <вихід.json>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NODES = ['matchingCards', 'profileDetails', 'profileContacts', 'profileWorkflow', 'profileTechnical'];
const ROLE_KEYS = ['ed', 'sm', 'ag', 'cl', 'ip'];
const MIN_COUNT = 5;
const FIELD_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]{0,48}$/;
// Похідні картки стрічки й службові мітки — не поля, які адмін заповнює руками.
const SKIP_FIELDS = new Set(['surnameShort', 'rh', 'bloodGroup', 'avatar', 'rev', 'programsAt', 'reviewsAt', 'hasPublicReview', 'feedDate', 'audience']);

const isHole = value => value === undefined || value === null;
const isFilledScalar = value => !isHole(value) && typeof value !== 'object' && String(value).trim() !== '';

// Те саме правило, що `getCurrentValue`: поточна — остання наявна версія, і
// порожня остання означає «стерто», а не «візьми попередню».
const hasCurrentValue = value => {
  if (isHole(value)) return false;
  if (Array.isArray(value) || (typeof value === 'object' && Object.keys(value).every(key => /^\d+$/.test(key)))) {
    const versions = Array.isArray(value)
      ? value
      : Object.keys(value).sort((a, b) => Number(a) - Number(b)).map(key => value[key]);
    for (let index = versions.length - 1; index >= 0; index -= 1) {
      if (isHole(versions[index])) continue;
      return hasCurrentValue(versions[index]);
    }
    return false;
  }
  if (typeof value === 'object') return Object.values(value).some(hasCurrentValue);
  return isFilledScalar(value);
};

const roleValues = value => {
  if (Array.isArray(value)) return value.flatMap(roleValues);
  if (value && typeof value === 'object') return Object.values(value).flatMap(roleValues);
  const text = String(value ?? '').trim().toLowerCase();
  return text ? text.split(/[,\s/|]+/).filter(Boolean) : [];
};

const ROLE_ALIASES = { pp: 'ip', 'до': 'ed', 'см': 'sm', 'агент': 'ag' };
const cardRoles = card => [
  ...new Set([...roleValues(card?.role), ...roleValues(card?.userRole)].map(role => ROLE_ALIASES[role] || role)),
].filter(role => ROLE_KEYS.includes(role));

const readNodeFile = (dir, node) => {
  const file = path.join(dir, `${node}.json`);
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, 'utf8')) || {};
};

export const buildProfileFieldStats = (data, generatedAt = new Date().toISOString().slice(0, 10)) => {
  const cards = data.matchingCards || {};
  const ids = new Set(NODES.flatMap(node => Object.keys(data[node] || {})));
  const totals = { all: 0 };
  const counts = new Map();
  const bump = (field, bucket) => {
    if (!counts.has(field)) counts.set(field, {});
    const entry = counts.get(field);
    entry[bucket] = (entry[bucket] || 0) + 1;
  };

  ids.forEach(id => {
    const buckets = ['all', ...cardRoles(cards[id])];
    buckets.forEach(bucket => { totals[bucket] = (totals[bucket] || 0) + 1; });
    const filled = new Set();
    NODES.forEach(node => {
      const record = data[node]?.[id];
      if (!record || typeof record !== 'object') return;
      Object.entries(record).forEach(([field, value]) => {
        if (!FIELD_KEY_RE.test(field) || SKIP_FIELDS.has(field)) return;
        if (hasCurrentValue(value)) filled.add(field);
      });
    });
    filled.forEach(field => buckets.forEach(bucket => bump(field, bucket)));
  });

  const fields = Object.fromEntries(
    [...counts.entries()]
      .filter(([, entry]) => (entry.all || 0) >= MIN_COUNT)
      .map(([field, entry]) => [field, Object.fromEntries(
        ['all', ...ROLE_KEYS].filter(bucket => entry[bucket]).map(bucket => [bucket, entry[bucket]]),
      )]),
  );

  return { generatedAt, totals, fields };
};

const main = () => {
  const [dir, output] = process.argv.slice(2);
  if (!dir || !output) {
    console.error('usage: node scripts/profileFieldFillStats.mjs <dump dir> <stats.json>');
    process.exit(2);
  }
  const data = Object.fromEntries(NODES.map(node => [node, readNodeFile(dir, node)]));
  NODES.forEach(node => console.log(`${node}: ${Object.keys(data[node]).length} записів`));
  const stats = buildProfileFieldStats(data);
  fs.writeFileSync(output, JSON.stringify(stats));
  console.log(`полів у статистиці: ${Object.keys(stats.fields).length}`);
  console.log(`карток: ${JSON.stringify(stats.totals)}`);
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
