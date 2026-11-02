'use strict';

/**
 * Відправка через Brevo, транзакційний API
 * (https://developers.brevo.com/reference/sendtransacemail).
 *
 * Без SDK: один POST, а `fetch` є в Node з коробки. Відправник мусить бути
 * підтверджений у Brevo — доменом (`knowme.pp.ua`, записи DNS) або самою
 * адресою, — інакше API відмовляє, функція віддає помилку, а застосунок шле
 * стандартний лист Firebase (`src/utils/emailVerification.js`).
 *
 * Спершу тут був Resend, але його форма додавання домену не прийняла
 * `knowme.pp.ua` (схоже, через зону `pp.ua`). Решта функції від сервісу не
 * залежить: новий сервіс — це новий файл тут і рядок в `index.js`.
 *
 * Тіло відмови в повідомлення помилки не потрапляє: сервіс повторює в ньому
 * поля запиту, зокрема адресу отримувача, а повідомлення помилки йде в журнал
 * функції. Лишаються статус і код помилки Brevo (`unauthorized`,
 * `invalid_parameter`…) — їх досить, щоб зрозуміти, що полагодити.
 */
const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

const readErrorCode = async response => {
  try {
    const body = await response.json();
    const code = body && typeof body.code === 'string' ? body.code : '';
    return /^[a-z_]{1,64}$/.test(code) ? code : '';
  } catch (error) {
    return '';
  }
};

const sendWithBrevo = async ({ apiKey, sender, to, subject, html, text, replyTo, tags = [], fetchImpl = fetch }) => {
  if (!apiKey) throw new Error('BREVO_API_KEY is not configured');

  const response = await fetchImpl(BREVO_ENDPOINT, {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      sender,
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text,
      ...(replyTo ? { replyTo: { email: replyTo } } : {}),
      ...(tags.length ? { tags } : {}),
    }),
  });

  if (!response.ok) {
    const code = await readErrorCode(response);
    const error = new Error(`Brevo responded ${response.status}${code ? ` (${code})` : ''}`);
    error.status = response.status;
    error.providerCode = code;
    throw error;
  }
  return response.json();
};

module.exports = { BREVO_ENDPOINT, sendWithBrevo };
