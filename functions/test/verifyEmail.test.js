'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeEmailLanguage,
  normalizeEmailRole,
  renderVerifyEmail,
} = require('../emails/verifyEmail');
const { buildVerifyEmailActionLink, extractOobCode } = require('../emails/actionLink');
const {
  GLOBAL_MAX_PER_DAY,
  MAX_PER_DAY,
  MIN_INTERVAL_MS,
  decideGlobalSend,
  decideVerificationSend,
  emailQuotaKey,
} = require('../verificationQuota');
const { sendWithResend } = require('../mail/resend');

const LINK = 'https://knowme.pp.ua/auth/action?mode=verifyEmail&oobCode=abc123&lang=uk';

test('лист українською несе адресу, кнопку й те саме посилання в тексті', () => {
  const message = renderVerifyEmail({ email: 'oksana@example.com', link: LINK, language: 'uk', role: 'ed' });

  assert.equal(message.subject, 'Підтвердіть пошту для KnowMe');
  assert.match(message.html, /<html lang="uk"/);
  assert.match(message.html, /Підтвердити пошту<\/a>/);
  assert.match(message.html, /Анкета донора ооцитів/);
  // `&` в адресі мусить бути екранований у HTML — інакше частина клієнтів
  // обрізає посилання на першому параметрі.
  assert.ok(message.html.includes('href="https://knowme.pp.ua/auth/action?mode=verifyEmail&amp;oobCode=abc123&amp;lang=uk"'));
  assert.ok(message.text.includes(LINK));
  assert.ok(message.text.includes('oksana@example.com'));
});

test('будь-яка мова, крім української, отримує англійський лист', () => {
  for (const language of ['en', 'de', 'ja', 'zh', '', undefined]) {
    assert.equal(normalizeEmailLanguage(language), 'en', String(language));
  }
  assert.equal(normalizeEmailLanguage('uk'), 'uk');
  assert.equal(normalizeEmailLanguage('uk-UA'), 'uk');

  const message = renderVerifyEmail({ email: 'a@example.com', link: LINK, language: 'de', role: 'ag' });
  assert.equal(message.subject, 'Confirm your email for KnowMe');
  assert.match(message.html, /Agency account/);
});

test('поточна роль — остання відома, невідома дає загальний лист без плашки', () => {
  assert.equal(normalizeEmailRole(['ag', 'ed']), 'ed');
  assert.equal(normalizeEmailRole('ed,ag'), 'ag');
  assert.equal(normalizeEmailRole(' IP '), 'ip');
  assert.equal(normalizeEmailRole('pp'), '');
  assert.equal(normalizeEmailRole(null), '');

  const message = renderVerifyEmail({ email: 'a@example.com', link: LINK, language: 'uk', role: 'unknown' });
  assert.equal(message.role, '');
  assert.doesNotMatch(message.html, /class="km-chip"/);
  assert.match(message.html, /Заповніть анкету/);
});

test('адреса з HTML-символами не ламає розмітку', () => {
  const message = renderVerifyEmail({ email: '"><img src=x>@example.com', link: LINK, language: 'en' });
  assert.doesNotMatch(message.html, /<img src=x>/);
  assert.match(message.html, /&quot;&gt;&lt;img src=x&gt;@example.com/);
});

test('темна палітра стоїть у медіазапиті, а forceDark вмикає її для прев’ю', () => {
  const regular = renderVerifyEmail({ email: 'a@example.com', link: LINK, language: 'uk', role: 'sm' });
  assert.match(regular.html, /@media \(prefers-color-scheme:dark\)\{\.km-bg\{background:#14100C!important\}/);
  const dark = renderVerifyEmail({ email: 'a@example.com', link: LINK, language: 'uk', role: 'sm', forceDark: true });
  assert.ok(dark.html.length > regular.html.length);
});

test('без адреси чи посилання лист не складається', () => {
  assert.throws(() => renderVerifyEmail({ link: LINK }), /email is required/);
  assert.throws(() => renderVerifyEmail({ email: 'a@example.com' }), /link is required/);
});

test('код береться з посилання Firebase, а кнопка веде на knowme.pp.ua', () => {
  const generated = 'https://webringitapp.firebaseapp.com/__/auth/action?mode=verifyEmail&oobCode=XyZ-42&apiKey=AIza&lang=en';
  assert.equal(extractOobCode(generated), 'XyZ-42');
  assert.equal(extractOobCode('https://example.page.link/?link=' + encodeURIComponent(generated)), 'XyZ-42');
  assert.equal(extractOobCode('not a url'), '');
  assert.equal(extractOobCode('https://knowme.pp.ua/auth/action?mode=verifyEmail'), '');

  const link = buildVerifyEmailActionLink({ oobCode: 'XyZ-42', language: 'uk' });
  assert.equal(link, 'https://knowme.pp.ua/auth/action?mode=verifyEmail&oobCode=XyZ-42&lang=uk');
  assert.doesNotMatch(link, /apiKey/);
});

test('межа відправок: раз на хвилину й п’ять на добу', () => {
  const start = Date.UTC(2026, 10, 1, 10, 0, 0);

  const first = decideVerificationSend(null, start);
  assert.equal(first.allowed, true);
  assert.deepEqual(first.next, { lastAt: start, day: '2026-11-01', count: 1 });

  const tooSoon = decideVerificationSend(first.next, start + MIN_INTERVAL_MS - 1);
  assert.equal(tooSoon.allowed, false);
  assert.equal(tooSoon.reason, 'too-soon');

  let state = first.next;
  let now = start;
  for (let sent = 1; sent < MAX_PER_DAY; sent += 1) {
    now += MIN_INTERVAL_MS;
    const decision = decideVerificationSend(state, now);
    assert.equal(decision.allowed, true);
    state = decision.next;
  }
  const overLimit = decideVerificationSend(state, now + MIN_INTERVAL_MS);
  assert.equal(overLimit.allowed, false);
  assert.equal(overLimit.reason, 'daily-limit');

  // Нова доба (UTC) — лічильник з нуля.
  const nextDay = decideVerificationSend(state, Date.UTC(2026, 10, 2, 0, 0, 1));
  assert.equal(nextDay.allowed, true);
  assert.equal(nextDay.next.count, 1);
});

test('Resend: запит з ключем, відмова сервісу — помилка зі статусом', async () => {
  const calls = [];
  const okFetch = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, json: async () => ({ id: 'email_1' }) };
  };
  const result = await sendWithResend({
    apiKey: 'test-key',
    from: 'KnowMe <hello@knowme.pp.ua>',
    to: 'a@example.com',
    subject: 'S',
    html: '<p>h</p>',
    text: 't',
    idempotencyKey: 'verify-1',
    fetchImpl: okFetch,
  });
  assert.deepEqual(result, { id: 'email_1' });
  assert.equal(calls[0].url, 'https://api.resend.com/emails');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer test-key');
  assert.equal(calls[0].init.headers['Idempotency-Key'], 'verify-1');
  assert.deepEqual(JSON.parse(calls[0].init.body).to, ['a@example.com']);

  // Resend повторює у відмові поля запиту, зокрема адресу. У повідомлення
  // помилки (а з ним — у журнал функції) вона не мусить потрапити.
  const failingFetch = async () => ({
    ok: false,
    status: 422,
    json: async () => ({ name: 'validation_error', message: 'Invalid `to` field: victim@example.com' }),
  });
  await assert.rejects(
    sendWithResend({ apiKey: 'k', from: 'f', to: 'victim@example.com', subject: 's', html: 'h', text: 't', fetchImpl: failingFetch }),
    error => error.status === 422
      && error.message === 'Resend responded 422 (validation_error)'
      && !error.message.includes('victim@example.com'),
  );
  const unreadableFetch = async () => ({ ok: false, status: 500, json: async () => { throw new Error('not json'); } });
  await assert.rejects(
    sendWithResend({ apiKey: 'k', from: 'f', to: 't', subject: 's', html: 'h', text: 't', fetchImpl: unreadableFetch }),
    error => error.message === 'Resend responded 500',
  );
  await assert.rejects(sendWithResend({ from: 'f', to: 't' }), /RESEND_API_KEY/);
});

test('стеля на всіх: лічильник за добу, нова доба — з нуля', () => {
  const now = Date.UTC(2026, 10, 1, 12, 0, 0);
  const full = { lastAt: now - 1000, day: '2026-11-01', count: GLOBAL_MAX_PER_DAY };
  const refused = decideGlobalSend(full, now);
  assert.equal(refused.allowed, false);
  assert.equal(refused.reason, 'global-limit');
  // Інтервалу тут немає: різні люди можуть отримати лист у ту саму мить.
  const almost = { lastAt: now, day: '2026-11-01', count: GLOBAL_MAX_PER_DAY - 1 };
  assert.equal(decideGlobalSend(almost, now).allowed, true);
  assert.equal(decideGlobalSend(full, Date.UTC(2026, 10, 2, 0, 0, 1)).next.count, 1);
});

test('ключ адреси — хеш без самої адреси, регістр і пробіли не важать', () => {
  const key = emailQuotaKey(' Victim@Example.com ');
  assert.equal(key, emailQuotaKey('victim@example.com'));
  assert.match(key, /^[0-9a-f]{64}$/);
  assert.ok(!key.includes('victim'));
  assert.notEqual(key, emailQuotaKey('other@example.com'));
});
