'use strict';

/**
 * Відправка через Resend (https://resend.com/docs/api-reference/emails/send-email).
 *
 * Без SDK: один POST, а `fetch` є в Node з коробки. Домен відправника
 * (`knowme.pp.ua`) мусить бути підтверджений у Resend записами DNS, інакше API
 * відповідає 403 — і функція віддає помилку, а застосунок шле стандартний лист
 * Firebase (`src/utils/emailVerification.js`).
 */
const RESEND_ENDPOINT = 'https://api.resend.com/emails';

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
    const body = await response.text().catch(() => '');
    const error = new Error(`Resend responded ${response.status}: ${body.slice(0, 300)}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
};

module.exports = { RESEND_ENDPOINT, sendWithResend };
