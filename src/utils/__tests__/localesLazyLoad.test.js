import fs from 'fs';
import path from 'path';

import { APP_LANGUAGES, getExtraLocale, loadExtraLocale } from '../locales';

// Словники п'яти мов важили ~1,2 МБ головного файлу, і їх качав кожен
// відвідувач, хоча майже всі читають українською. Тепер модуль мови
// приїжджає лише тоді, коли цю мову обрали.
describe('словники мов вантажуються на вимогу', () => {
  it('реєстр не імпортує модулі мов статично', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'locales', 'index.js'), 'utf8');
    ['es', 'de', 'nl', 'ja', 'zh'].forEach(code => {
      expect(source).not.toMatch(new RegExp(`^import \\w+ from '\\./${code}';`, 'm'));
      expect(source).toContain(`import(/* webpackChunkName: "locale-${code}" */ './${code}')`);
    });
  });

  it('до вантаження мови немає, після — є, а метадані відомі одразу', async () => {
    expect(getExtraLocale('ja')).toBeNull();
    expect(APP_LANGUAGES.find(item => item.code === 'ja').nativeName).toBe('日本語');

    const [first, second] = await Promise.all([loadExtraLocale('ja'), loadExtraLocale('ja')]);
    expect(first.code).toBe('ja');
    expect(second).toBe(first);
    expect(getExtraLocale('ja')).toBe(first);
  });

  it('українській, англійській і невідомому коду вантажити нічого', async () => {
    await expect(loadExtraLocale('uk')).resolves.toBeNull();
    await expect(loadExtraLocale('en')).resolves.toBeNull();
    await expect(loadExtraLocale('constructor')).resolves.toBeNull();
    expect(getExtraLocale('constructor')).toBeNull();
  });

  it('метадані мов збігаються з самими модулями', async () => {
    const extra = APP_LANGUAGES.filter(item => !['uk', 'en'].includes(item.code));
    const modules = await Promise.all(extra.map(item => loadExtraLocale(item.code)));
    modules.forEach((module, index) => {
      expect({ code: module.code, nativeName: module.nativeName, locale: module.locale }).toEqual(extra[index]);
    });
  });
});
