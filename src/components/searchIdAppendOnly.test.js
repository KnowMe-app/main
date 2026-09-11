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
      '// Індексуємо всі подані значення, а не лише нові для анкети.',
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

describe('стерте значення йде з індексу', () => {
  const addNewProfile = fs.readFileSync(path.join(__dirname, 'AddNewProfile.jsx'), 'utf8');
  const editProfile = fs.readFileSync(path.join(__dirname, 'EditProfile.jsx'), 'utf8');

  it('картка передає deletedKeys індексатору', () => {
    // Без четвертого аргументу `syncUserSearchIdIndex` не знімає нічого: у неї
    // це єдине джерело «стерли навмисно». Для анкети акаунта (довгий id) це
    // був і єдиний шанс узагалі — `updateDataInRealtimeDB` індексу не чіпає.
    expect(addNewProfile).toContain(
      'syncUserSearchIdIndex(syncedState.userId, existingData || {}, syncedState, deletedKeys)',
    );
    expect(addNewProfile).not.toContain(
      'syncUserSearchIdIndex(syncedState.userId, existingData || {}, syncedState),',
    );
  });

  it('писач анкети акаунта й далі не має власної роботи з searchId', () => {
    // Якщо колись зʼявиться — цей тест нагадає, що знімання стало у двох
    // місцях, і їх треба звіряти.
    const legacyWriter = slice(
      'export const updateDataInRealtimeDB = async',
      'export const updateProfileNodesInRTDB = async',
    );
    expect(legacyWriter).not.toContain('updateSearchId');
  });

  it('прибрана версія масиву знімається з індексу, не зносячи поля', () => {
    const body = slice(
      'export const pruneSearchIdValues = async',
      'const normalizeBloodIndexValue',
    );
    expect(body).toContain("await updateSearchId(key, candidate, userId, 'remove');");
    // Знімається лише те, чого в новій анкеті вже немає: те саме значення
    // могло лишитись в іншій версії поля.
    expect(body).toContain('.filter(candidate => !survivingCandidates.has(candidate))');
  });

  it('обидва редактори доносять прибрану версію до індексу', () => {
    expect(addNewProfile).toContain('removedIndexValues = { [fieldName]: [removedValue] };');
    expect(addNewProfile).toContain(
      'await pruneSearchIdValues(syncedState.userId, removedIndexValues, syncedState);',
    );
    expect(editProfile).toContain('const capturedRemovedIndexValues = capturedDelCondition');
    expect(editProfile).toContain(
      'await pruneSearchIdValues(updatedState.userId, removedIndexValues, updatedState);',
    );
  });

  it('знімання стоїть після запису анкети, а не до нього', () => {
    // Писачі дописують у `searchId` усе, що є в payload: зняти прибране до
    // запису означало б зняти й повернути назад.
    const start = addNewProfile.indexOf('async function remoteUpdate({');
    const end = addNewProfile.indexOf('// Chains every write onto the same promise', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const cardBody = addNewProfile.slice(start, end);

    expect(cardBody.indexOf('await pruneSearchIdValues')).toBeGreaterThan(
      cardBody.lastIndexOf('await updateProfileNodesInRTDB'),
    );
  });
});

describe('позначка стирання — не видалення з індексу', () => {
  // Не-адмін узагалі не видаляє значень: «стерти» для нього означає дописати
  // порожній рядок останнім елементом історії, і пише він овнерлей, а не
  // анкету. Тож порожній рядок не має знімати з індексу нічого.
  const { buildSearchIndexCandidates } = require('../utils/searchIndexCandidates');
  const { buildSearchIdValueKey } = require('../utils/searchKeyUtils');

  it('порожній рядок не дає жодного кандидата', () => {
    expect(buildSearchIndexCandidates('phone', '')).toEqual([]);
    expect(buildSearchIndexCandidates('phone', null)).toEqual([]);
    expect(buildSearchIndexCandidates('phone', undefined)).toEqual([]);
  });

  it('а порожнє за змістом значення не дає ключа індексу', () => {
    // Кандидат із самих пробілів дожити до запису може, ключ із нього — ні:
    // `updateSearchId` мовчки виходить на порожньому ключі.
    expect(buildSearchIdValueKey('surname', '   ')).toBe('');
    expect(buildSearchIdValueKey('phone', '')).toBe('');
  });

  it('історія зі стертим хвостом лишає чинне значення в кандидатах', () => {
    // `['380671112233', '']` — це «поле стерли», але сам номер з індексу не
    // зникає: знімає його лише явне видалення адміном.
    const candidates = ['380671112233', ''].flatMap(value =>
      buildSearchIndexCandidates('phone', value),
    );
    expect(candidates).toContain('380671112233');
    expect(candidates).not.toContain('');
  });
});
