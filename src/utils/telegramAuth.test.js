import {
  buildTelegramLoginLink,
  buildTelegramProfileData,
  clearTelegramLoginAttempt,
  createTelegramLoginNonce,
  isTelegramLoginAvailable,
  readTelegramLoginAttempt,
  saveTelegramLoginAttempt,
  TELEGRAM_LOGIN_TTL_MS,
} from './telegramAuth';

// jsdom зі старого CRA не має `crypto` — беремо Web Crypto з Node.
if (!window.crypto) {
  Object.defineProperty(window, 'crypto', { value: require('crypto').webcrypto });
}

describe('вхід через Telegram — клієнт', () => {
  it('nonce — 22 знаки base64url, які Telegram пускає в start', () => {
    const nonce = createTelegramLoginNonce();
    expect(nonce).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(createTelegramLoginNonce()).not.toBe(nonce);
  });

  it('без імені бота кнопки немає', () => {
    expect(isTelegramLoginAvailable('')).toBe(false);
    expect(isTelegramLoginAvailable('KnowMeLoginBot')).toBe(true);
  });

  it('посилання веде на бота з nonce', () => {
    expect(buildTelegramLoginLink('abc', 'KnowMeLoginBot')).toBe('https://t.me/KnowMeLoginBot?start=abc');
  });

  it('спроба переживає перезавантаження, але не довше за строк', () => {
    const attempt = { nonce: 'n'.repeat(22), startedAt: 1000, role: 'ed' };
    saveTelegramLoginAttempt(attempt);
    expect(readTelegramLoginAttempt(2000)).toEqual(attempt);
    expect(readTelegramLoginAttempt(1000 + TELEGRAM_LOGIN_TTL_MS + 1)).toBeNull();
    saveTelegramLoginAttempt(attempt);
    clearTelegramLoginAttempt();
    expect(readTelegramLoginAttempt(2000)).toBeNull();
  });

  it('анкета з Telegram — номер цифрами, нік без @, порожнього не пише', () => {
    expect(buildTelegramProfileData({ phone: '+380 50 123', username: '@oksana', firstName: 'Оксана', lastName: '' }))
      .toEqual({ phone: '38050123', telegram: 'oksana', name: 'Оксана' });
  });
});
