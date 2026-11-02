'use strict';

const crypto = require('crypto');

/**
 * Скільки листів підтвердження можна надіслати.
 *
 * Стандартний лист Firebase стримує сам Firebase. Свій лист стримувати нікому,
 * крім нас: без межі будь-хто, хто увійшов, кликав би функцію в циклі — і
 * засипав листами власну скриньку, а якщо реєструвався на чужу адресу, то й
 * чужу. Платимо за це не лише лімітом поштового сервісу, а репутацією домену
 * `knowme.pp.ua`: листи з нього почали б падати в спам усім.
 *
 * Меж три, і кожна закриває свою дірку:
 *
 * - **акаунт** (`byUid/{uid}`): раз на хвилину, п'ять на добу (UTC). Меню
 *   «Підтвердити email» саме вимикає кнопку на три хвилини, тож людина цих меж
 *   не помітить;
 * - **адреса** (`byEmail/{sha256}`): ті самі числа. Самої межі акаунта мало:
 *   акаунт на чужу адресу можна видалити й завести знову — з новим uid і
 *   новою квотою, а скринька та сама. Адреса лежить хешем: вузлу не треба
 *   знати, кому писали;
 * - **усі разом** (`total`): стеля на добу під тариф поштового сервісу. Вона
 *   стримує масову реєстрацію на чужі адреси. Коли її досягнуто, лист не
 *   зникає: функція відповідає `unavailable`, і застосунок шле стандартний
 *   лист Firebase — той має власні межі.
 *
 * Стан лежить у RTDB `emailVerificationSends/...`. Пише його лише функція
 * (Admin SDK минає правила); клієнтам вузол закритий — у `database.rules.json`
 * його немає, а корінь заборонений за замовчуванням.
 */
const MIN_INTERVAL_MS = 60 * 1000;
const MAX_PER_DAY = 5;
// Під денну межу тарифу поштового сервісу (Brevo free — 300 на добу, із
// запасом на ручні листи); більший тариф — більше число.
const GLOBAL_MAX_PER_DAY = 250;

const utcDay = now => new Date(now).toISOString().slice(0, 10);

/**
 * Рішення для однієї людини (акаунт чи адреса) за попереднім станом. Чиста
 * функція — її викликає транзакція.
 * @returns {{ allowed: boolean, next: object|null, reason: string }}
 */
const decidePersonalSend = (previous, now, { minIntervalMs = MIN_INTERVAL_MS, maxPerDay = MAX_PER_DAY } = {}) => {
  const day = utcDay(now);
  const lastAt = Number(previous && previous.lastAt) || 0;
  const count = previous && previous.day === day ? Number(previous.count) || 0 : 0;

  if (lastAt && now - lastAt < minIntervalMs) {
    return { allowed: false, next: null, reason: 'too-soon' };
  }
  if (count >= maxPerDay) {
    return { allowed: false, next: null, reason: 'daily-limit' };
  }
  return { allowed: true, next: { lastAt: now, day, count: count + 1 }, reason: '' };
};

const decideVerificationSend = (previous, now) => decidePersonalSend(previous, now);

/**
 * Межа на одну IP-адресу для листа зміни пароля. Той лист просять без входу,
 * тож межі акаунта в нього немає: без цієї межі один скрипт обходив би межу
 * адреси, перебираючи чужі скриньки, і за добу спалив би всю стелю на всіх.
 * Число щедре — за одним IP мобільного оператора сидять сотні людей.
 */
const IP_MIN_INTERVAL_MS = 10 * 1000;
const IP_MAX_PER_DAY = 30;
const decideIpSend = (previous, now) =>
  decidePersonalSend(previous, now, { minIntervalMs: IP_MIN_INTERVAL_MS, maxPerDay: IP_MAX_PER_DAY });

/** Рішення для стелі на всіх: лише лічильник за добу. */
const decideGlobalSend = (previous, now) => {
  const day = utcDay(now);
  const count = previous && previous.day === day ? Number(previous.count) || 0 : 0;
  if (count >= GLOBAL_MAX_PER_DAY) {
    return { allowed: false, next: null, reason: 'global-limit' };
  }
  return { allowed: true, next: { lastAt: now, day, count: count + 1 }, reason: '' };
};

/** Ключ адреси: регістр і пробіли не роблять із неї іншу скриньку. */
const emailQuotaKey = email =>
  crypto.createHash('sha256').update(String(email || '').trim().toLowerCase()).digest('hex');

/** Ключ IP: адреса лежить хешем, як і пошта. */
const ipQuotaKey = ip => crypto.createHash('sha256').update(`ip|${String(ip || '').trim()}`).digest('hex');

module.exports = {
  GLOBAL_MAX_PER_DAY,
  IP_MAX_PER_DAY,
  MAX_PER_DAY,
  MIN_INTERVAL_MS,
  decideGlobalSend,
  decideIpSend,
  decideVerificationSend,
  emailQuotaKey,
  ipQuotaKey,
};
