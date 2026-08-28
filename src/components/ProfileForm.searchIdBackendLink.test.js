import fs from 'fs';
import path from 'path';

import { SEARCH_ID_INDEXED_FIELDS, buildSearchIdRecordKey } from 'utils/searchKeyUtils';

const rules = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../../database.rules.json'), 'utf8'),
).rules;

const source = fs.readFileSync(path.join(__dirname, 'ProfileForm.jsx'), 'utf8');

/**
 * Стрілка біля контакту відкриває його запис у `searchId`.
 *
 * Раніше вона шукала запис скануванням вузла (`orderByKey` + `startAt`), а
 * права на це не має ніхто: читання дане на `searchId/$key`, не на `searchId`.
 * Тож кнопка завжди закінчувалась «Permission denied». Ключ будувати не треба —
 * він детермінований, і його вже будує індексація анкети.
 */
describe('стрілка «відкрити запис searchId»', () => {
  it('правила дають читання лише по конкретному ключу, а не по вузлу', () => {
    // Це і є причина, чому сканування не працювало й не запрацює.
    expect(rules.searchId.$key['.read']).toBe('auth != null');
    expect(rules.searchId['.read']).toBeUndefined();
    expect(rules['.read']).toBe(false);
  });

  it('читає рівно один ключ і не сканує вузол searchId', () => {
    expect(source).toContain('refDb(database, `searchId/${searchIdRecordKey}`)');
    expect(source).not.toContain("refDb(database, 'searchId')");
    expect(source).not.toContain('orderByKey');
  });

  it('будує ключ тим самим хелпером, що й індексація анкети', () => {
    expect(source).toContain('buildSearchIdRecordKey({ [fieldName]: value })');

    const mutations = fs.readFileSync(
      path.join(__dirname, '../utils/profileMutations.js'),
      'utf8',
    );
    expect(mutations).toContain('buildSearchIdRecordKey({ [field]: value })');
    expect(mutations).toContain('ref(database, `searchId/${key}`)');
  });

  it('ключ збігається з тим, під яким значення реально лежить у базі', () => {
    // Телефон нормалізується до індексного вигляду, а `@` в ключі екранується:
    // саме так значення й потрапило у вузол при збереженні анкети.
    expect(buildSearchIdRecordKey({ phone: '+38 050 327 74 13' }))
      .toBe(buildSearchIdRecordKey({ phone: '+380503277413' }));
    expect(buildSearchIdRecordKey({ instagram: '@viktoriyail4enko' }))
      .toBe('instagram__at_viktoriyail4enko');
    expect(buildSearchIdRecordKey({ instagram: 'https://instagram.com/viktoriyail4enko' }))
      .toBe('instagram_https:_slash__slash_instagram_dot_com_slash_viktoriyail4enko');
  });

  it('мовчить, коли ключ із поля не будується', () => {
    expect(buildSearchIdRecordKey({ instagram: '   ' })).toBeNull();
    expect(source).toContain('Не вдалося побудувати ключ searchId для');
  });

  it('пропонує стрілку рівно для полів, які потрапляють в індекс', () => {
    // Локальна копія списку встигла розійтися з індексом і губила `ameblo`.
    expect(source).toContain("import { SEARCH_ID_INDEXED_FIELDS, buildSearchIdRecordKey } from 'utils/searchKeyUtils';");
    expect(source).not.toMatch(/const SEARCH_ID_INDEXED_FIELDS = new Set\(/);
    expect(SEARCH_ID_INDEXED_FIELDS.has('ameblo')).toBe(true);
  });
});
