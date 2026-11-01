'use strict';

/**
 * Налаштування відправки, які міняються разом із кодом, а не з оточенням.
 *
 * `REGION` мусить збігатися з `VERIFICATION_FUNCTION_REGION` у
 * `src/utils/emailVerification.js` — інакше застосунок кличе функцію там, де її
 * немає, і щоразу падає на стандартний лист Firebase.
 *
 * Адреса відправника — на домені застосунку: його треба підтвердити в
 * поштовому сервісі (записи DNS у реєстратора `knowme.pp.ua`). Ключ сервісу —
 * секрет Firebase `RESEND_API_KEY`, у коді його немає.
 */
module.exports = Object.freeze({
  REGION: 'europe-west1',
  MAIL_FROM: 'KnowMe <hello@knowme.pp.ua>',
  ALLOWED_ORIGINS: [
    'https://knowme.pp.ua',
    'https://www.knowme.pp.ua',
    /^http:\/\/localhost(:\d+)?$/,
  ],
});
