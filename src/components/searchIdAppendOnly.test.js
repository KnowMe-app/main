import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(path.join(__dirname, 'config.js'), 'utf8');

const slice = (from, to) => {
  const start = source.indexOf(from);
  const end = source.indexOf(to, start + 1);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
};

describe('searchId доповнюється, а не переписується', () => {
  // Змінена пошта — не зникла пошта: анкету шукають ще й ті, хто знає лише
  // старий контакт. Юзер бачить у себе тільки нову адресу, адмін бачить обидві
  // й сам вирішує, чи стару зносити.

  it('писач анкети більше не знімає значення, яке замінили', () => {
    const replacementBranch = slice(
      'const newValues = normalizeIndexedValues(uploadedInfo[key]);',
      '// Додаємо нові значення, яких не було в старому масиві',
    );
    expect(replacementBranch).not.toContain('updateSearchId');
  });

  it('але стерте навмисно поле й далі знімає свої ключі', () => {
    // Порожнє чи `null` значення — це не заміна, а видалення: тут зняти ключ
    // саме те, чого юзер попросив.
    const deletionBranch = slice(
      'const shouldRemoveKey = uploadedInfo[key] === \'\'',
      'if (uploadedInfo[key] !== undefined) {',
    );
    expect(deletionBranch).toContain("await updateSearchId(key, String(cleanedValue).toLowerCase(), userId, 'remove');");
  });

  it('syncUserSearchIdIndex знімає ключ лише для полів із deletedKeys', () => {
    const body = slice(
      'export const syncUserSearchIdIndex = async',
      'const normalizeBloodIndexValue',
    );
    expect(body).toContain('const explicitlyDeletedKeys = new Set(getExplicitlyDeletedKeys(deletedKeys));');
    expect(body).toContain('for (const candidate of explicitlyDeletedKeys.has(key) ? prevCandidates : []) {');
  });

  it('додавання нових значень лишається безумовним', () => {
    // Уся суть індексу: нове значення мусить стати знаходжуваним одразу.
    const body = slice(
      'export const syncUserSearchIdIndex = async',
      'const normalizeBloodIndexValue',
    );
    expect(body).toContain("await updateSearchId(key, candidate, userId, 'add');");
  });
});

describe('перелік навмисно стертих полів', () => {
  const helper = fs.readFileSync(path.join(__dirname, '../utils/searchIndexSync.js'), 'utf8');

  it('доступний писачам індексу', () => {
    expect(helper).toContain('export const getExplicitlyDeletedKeys');
  });
});
