'use strict';

/**
 * Скільки листів підтвердження можна надіслати одному акаунту.
 *
 * Стандартний лист Firebase стримує сам Firebase. Свій лист стримувати нікому,
 * крім нас: без межі будь-хто, хто увійшов, кликав би функцію в циклі — і
 * засипав листами власну скриньку, а якщо реєструвався на чужу адресу, то й
 * чужу. Платимо за це не лише лімітом поштового сервісу, а репутацією домену
 * `knowme.pp.ua`: листи з нього почали б падати в спам усім.
 *
 * Межі: не частіше разу на хвилину й не більше пʼяти на добу (UTC). Меню
 * «Підтвердити email» саме вимикає кнопку на три хвилини, тож людина цих меж
 * не помітить.
 *
 * Стан лежить у RTDB `emailVerificationSends/{uid}` = `{ lastAt, day, count }`.
 * Пише його лише функція (Admin SDK минає правила); клієнтам вузол закритий —
 * у `database.rules.json` його немає, а корінь заборонений за замовчуванням.
 */
const MIN_INTERVAL_MS = 60 * 1000;
const MAX_PER_DAY = 5;

const utcDay = now => new Date(now).toISOString().slice(0, 10);

/**
 * Рішення за попереднім станом. Чиста функція — її викликає транзакція.
 * @returns {{ allowed: boolean, next: object|null, reason: string }}
 */
const decideVerificationSend = (previous, now) => {
  const day = utcDay(now);
  const lastAt = Number(previous && previous.lastAt) || 0;
  const count = previous && previous.day === day ? Number(previous.count) || 0 : 0;

  if (lastAt && now - lastAt < MIN_INTERVAL_MS) {
    return { allowed: false, next: null, reason: 'too-soon' };
  }
  if (count >= MAX_PER_DAY) {
    return { allowed: false, next: null, reason: 'daily-limit' };
  }
  return { allowed: true, next: { lastAt: now, day, count: count + 1 }, reason: '' };
};

module.exports = { MAX_PER_DAY, MIN_INTERVAL_MS, decideVerificationSend };
