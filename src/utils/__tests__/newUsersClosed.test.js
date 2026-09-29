import fs from 'fs';
import path from 'path';

/**
 * `newUsers` — застаріла колекція, і в неї не пише ніхто.
 *
 * Анкета живе у вузлах (`matchingCards`, `profileDetails`, …), а legacy-дзеркало
 * лишилось одне — `/users`, і то лише для анкет акаунтів. `newUsers` читає
 * сам екран міграції, і то з **локального файла**, а не з бази.
 *
 * Тож на питання «хто знову пише в `newUsers`» відповідь мусить бути видна з
 * репозиторію одразу: не веб. Правила закривають корінь, а гілки `newUsers` у
 * них немає — з такими правилами клієнт туди не запише, хай яка версія
 * застосунку в нього відкрита. Якщо записи в консолі все ж з’являються, шукати
 * треба поза вебом: правила в проді не ті, що в репозиторії (їх викочують
 * руками), імпорт JSON у консолі чи серверний скрипт з Admin SDK.
 */
const srcRoot = path.join(__dirname, '..', '..');

const listSourceFiles = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const full = path.join(dir, entry.name);
  if (entry.isDirectory()) return entry.name === '__tests__' ? [] : listSourceFiles(full);
  if (!/\.(js|jsx)$/.test(entry.name) || /\.test\.(js|jsx)$/.test(entry.name)) return [];
  return [full];
});

describe('newUsers закрита для запису', () => {
  it('правила бази не відкривають newUsers і не відкривають корінь', () => {
    const rules = JSON.parse(fs.readFileSync(path.join(srcRoot, '..', 'database.rules.json'), 'utf8')).rules;
    expect(rules['.write']).toBe(false);
    expect(rules.newUsers).toBeUndefined();
  });

  it('жоден модуль вебу не будує шлях у newUsers', () => {
    const offenders = listSourceFiles(srcRoot).filter(file => {
      const source = fs.readFileSync(file, 'utf8');
      return /(['"`])newUsers\/|ref2?\([^)]*['"`]newUsers['"`]/.test(source);
    });
    expect(offenders.map(file => path.relative(srcRoot, file))).toEqual([]);
  });
});
