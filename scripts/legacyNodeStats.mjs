#!/usr/bin/env node
/**
 * Зведення по вивантаженому legacy-вузлу RTDB (`users`, `newUsers`, `adminRecent`)
 * без жодного особистого поля: кількість записів, форма ключів і найсвіжіші дати.
 *
 * Навіщо: на питання «чи в `newUsers` досі хтось пише» відповідає не код (у
 * репозиторії писача немає з 29.08, а правила проду не пускають туди жоден
 * клієнт), а самі дані — найсвіжіша дата в записах. Вивід іде в журнал
 * GitHub Actions, а журнал публічного репозиторію читає будь-хто, тож тут
 * лише лічильники й дати, і жодного імені, номера чи ключа запису.
 *
 * Запуск: node scripts/legacyNodeStats.mjs <файл.json> [назва вузла]
 */
import fs from 'node:fs';

const DATE_FIELDS = ['createdAt', 'registrationDate', 'lastLogin', 'lastLogin2', 'lastAction', 'updatedAt'];
const RECENT_DAYS = 30;
// Firebase Auth UID — 28 символів латиниці й цифр; решта — id карток, заведених
// редактором (push-id, `AB…`, `TG0001`), тобто не акаунти.
const AUTH_UID_RE = /^[A-Za-z0-9]{28}$/;

const lastScalar = value => {
  if (Array.isArray(value)) {
    for (let i = value.length - 1; i >= 0; i -= 1) {
      if (value[i] !== null && value[i] !== undefined && value[i] !== '') return value[i];
    }
    return null;
  }
  return value;
};

// Дати в legacy-записах лежать трьома способами: мілісекунди, `РРРР-ММ-ДД…` і
// `дд.мм.рррр`. Нерозпізнане не рахується — краще недорахувати, ніж показати
// вигадану «свіжу» дату.
export const toIsoDate = raw => {
  const value = lastScalar(raw);
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value < 1e12 ? value * 1000 : value;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
  }
  if (typeof value !== 'string') return null;
  const text = value.trim();
  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  match = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (match) return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  return null;
};

export const summarizeLegacyNode = (data, { today = new Date() } = {}) => {
  const entries = data && typeof data === 'object' ? Object.entries(data) : [];
  const recentFrom = new Date(today.getTime() - RECENT_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const todayIso = today.toISOString().slice(0, 10);
  const fields = Object.fromEntries(DATE_FIELDS.map(field => [field, { present: 0, latest: null, recent: 0 }]));
  let authUidKeys = 0;

  entries.forEach(([key, record]) => {
    if (AUTH_UID_RE.test(key)) authUidKeys += 1;
    if (!record || typeof record !== 'object') return;
    DATE_FIELDS.forEach(field => {
      const iso = toIsoDate(record[field]);
      if (!iso || iso > todayIso) return;
      const stat = fields[field];
      stat.present += 1;
      if (!stat.latest || iso > stat.latest) stat.latest = iso;
      if (iso >= recentFrom) stat.recent += 1;
    });
  });

  return { count: entries.length, authUidKeys, otherKeys: entries.length - authUidKeys, recentDays: RECENT_DAYS, fields };
};

const formatMarkdown = (name, summary) => {
  const lines = [
    `#### \`${name}\``,
    '',
    `Записів: **${summary.count}** (акаунтів за формою ключа: ${summary.authUidKeys}, інших карток: ${summary.otherKeys})`,
    '',
    `| Поле | Є в записах | Найсвіжіша дата | За ${summary.recentDays} днів |`,
    '|---|---|---|---|',
  ];
  Object.entries(summary.fields).forEach(([field, stat]) => {
    if (!stat.present) return;
    lines.push(`| \`${field}\` | ${stat.present} | ${stat.latest} | ${stat.recent} |`);
  });
  return `${lines.join('\n')}\n`;
};

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const [file, name = file] = process.argv.slice(2);
  if (!file) {
    console.error('Usage: node scripts/legacyNodeStats.mjs <file.json> [node name]');
    process.exit(2);
  }
  const raw = fs.readFileSync(file, 'utf8').trim();
  const data = raw ? JSON.parse(raw) : null;
  process.stdout.write(formatMarkdown(name, summarizeLegacyNode(data)));
}
