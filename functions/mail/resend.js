'use strict';

/**
 * Відправка через Resend (https://resend.com/docs/api-reference/emails/send-email).
 *
 * Без SDK: один POST, а `fetch` є в Node з коробки. Домен відправника
 * (`knowme.pp.ua`) мусить бути підтверджений у Resend записами DNS, інакше API
 * відповідає 403 — і функція віддає помилку, а застосунок шле стандартний лист
 * Firebase (`src/utils/emailVerification.js`).
 *
 * Тіло відмови в повідомлення помилки не потрапляє: Resend повторює в ньому
 * поля запиту, зокрема адресу отримувача («Invalid `to` field: …»), а
 * повідомлення помилки йде в журнал функції. Лишаються статус і назва
 * помилки сервісу (`validation_error`, `invalid_api_key`…) — їх досить, щоб
 * зрозуміти, що полагодити.
 */
const RESEND_ENDPOINT = 'https://api.resend.com/emails';

const readErrorName = async response => {
  try {
    const body = await response.json();
    const name = body && typeof body.name === 'string' ? body.name : '';
    return /^[a-z_]{1,64}$/.test(name) ? name : '';
  } catch (error) {
    return '';
  }
};

const sendWithResend = async ({ apiKey, from, to, subject, html, text, replyTo, tags = [], idempotencyKey, fetchImpl = fetch }) => {
  if (!apiKey) throw new Error('RESEND_API_KEY is not configured');

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  const response = await fetchImpl(RESEND_ENDPOINT, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html,
      text,
      ...(replyTo ? { reply_to: replyTo } : {}),
      tags,
    }),
  });

  if (!response.ok) {
    const name = await readErrorName(response);
    const error = new Error(`Resend responded ${response.status}${name ? ` (${name})` : ''}`);
    error.status = response.status;
    error.resendName = name;
    throw error;
  }
  return response.json();
};

module.exports = { RESEND_ENDPOINT, sendWithResend };
