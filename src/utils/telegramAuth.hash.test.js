import { readTelegramHashParams, readTelegramCodeFromHash } from './telegramAuth';

// Кнопка бота несе код і ключ спроби у фрагменті; з ключем вхід завершує
// будь-який браузер (вбудований браузер Telegram на Android), а фрагмент
// знімається з адреси, щоб код не лишився в історії.
describe('readTelegramHashParams', () => {
  const KEY = 'a'.repeat(64);

  afterEach(() => {
    window.history.replaceState(null, '', '/login');
  });

  it('читає код і ключ і знімає фрагмент', () => {
    window.history.replaceState(null, '', `/login#tgcode=123456&tgk=${KEY}`);
    expect(readTelegramHashParams()).toEqual({ code: '123456', key: KEY });
    expect(window.location.hash).toBe('');
  });

  it('старе посилання без ключа — лише код', () => {
    window.history.replaceState(null, '', '/login#tgcode=123456');
    expect(readTelegramCodeFromHash()).toBe('123456');
  });

  it('невалідний ключ відкидається, а без коду немає нічого', () => {
    window.history.replaceState(null, '', '/login#tgcode=123456&tgk=nothex');
    expect(readTelegramHashParams()).toEqual({ code: '123456', key: '' });
    window.history.replaceState(null, '', `/login#tgk=${KEY}`);
    expect(readTelegramHashParams()).toEqual({ code: '', key: '' });
  });
});
