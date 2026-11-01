'use strict';

const { APP_URL } = require('./verifyEmail');

/**
 * Посилання з листа веде на сторінку застосунку `/auth/action`, а не на сіру
 * сторінку Firebase (`{project}.firebaseapp.com/__/auth/action`).
 *
 * Admin SDK віддає посилання на свою сторінку; з нього береться лише
 * одноразовий код (`oobCode`) — решту складаємо самі. Ключа API в адресі тоді
 * немає: сторінка застосунку підтверджує код тим самим `auth`, яким людина
 * входить. Звідки б не прийшло посилання — зі стандартної сторінки чи з
 * власної адреси обробника, заданої в консолі, — код у ньому той самий.
 */
const extractOobCode = generatedLink => {
  let url;
  try {
    url = new URL(String(generatedLink || ''));
  } catch (error) {
    return '';
  }
  const direct = url.searchParams.get('oobCode');
  if (direct) return direct;
  // Динамічні посилання ховають справжню адресу в параметрі `link`.
  const nested = url.searchParams.get('link');
  return nested ? extractOobCode(nested) : '';
};

const buildVerifyEmailActionLink = ({ oobCode, language }) => {
  if (!oobCode) throw new Error('buildVerifyEmailActionLink: oobCode is required');
  const url = new URL('/auth/action', APP_URL);
  url.searchParams.set('mode', 'verifyEmail');
  url.searchParams.set('oobCode', oobCode);
  if (language) url.searchParams.set('lang', language);
  return url.toString();
};

module.exports = { buildVerifyEmailActionLink, extractOobCode };
