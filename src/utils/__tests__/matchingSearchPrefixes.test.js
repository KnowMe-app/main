import { MATCHING_SEARCH_ID_PREFIXES } from '../matchingSearchPrefixes';
import { buildSearchIdCandidateKeys, getSearchIdIndexedFields } from '../searchKeyUtils';
import { encodeKey } from '../searchIndexCandidates';

// Те, з чим SearchBar викликає індекс для режиму `searchId`: точний ключ, без
// варіантів і без сканування діапазону (див. `baseSearchIdOptions` у config.js).
const EXACT_SEARCH_ID_OPTIONS = {
  includeVariants: false,
  includePrefixMatches: false,
  includeAdaptedPhoneVariant: true,
};

const candidateKeysFor = (rawValue, prefixes = MATCHING_SEARCH_ID_PREFIXES) =>
  buildSearchIdCandidateKeys(
    encodeKey(rawValue).toLowerCase(),
    rawValue,
    prefixes,
    EXACT_SEARCH_ID_OPTIONS,
  );

describe('префікси пошуку matching', () => {
  it('пробує весь індекс searchId, а не одне поле', () => {
    expect([...MATCHING_SEARCH_ID_PREFIXES].sort()).toEqual(getSearchIdIndexedFields().sort());
  });

  it('ставить імʼя і прізвище попереду — саме перший префікс іде в підпис статусу', () => {
    expect(MATCHING_SEARCH_ID_PREFIXES.slice(0, 3)).toEqual(['name', 'surname', 'phone']);
  });

  it('будує ключі імені та прізвища для текстового запиту', () => {
    const keys = candidateKeysFor('Ольга');
    expect(keys).toContain('name_ольга');
    expect(keys).toContain('surname_ольга');
  });

  it('не лишає текстовий запит зовсім без кандидатів', () => {
    // Регресія: зі списком з самого лише `phone` запит з літерами не давав
    // жодного ключа — пошук не робив запиту й одразу звітував «не знайшов».
    expect(candidateKeysFor('Ольга', ['phone'])).toEqual([]);
    expect(candidateKeysFor('Ольга').length).toBeGreaterThan(0);
  });

  it('лишає телефон робочим', () => {
    expect(candidateKeysFor('+380671234567')).toContain('phone_380671234567');
  });

  it.each([
    ['пошта', 'olga@example.com', 'email_'],
    ['інстаграм', 'olga_ua', 'instagram_'],
    ['телеграм', 'olga_ua', 'telegram_'],
    ['фейсбук', 'olga_ua', 'facebook_'],
  ])('будує ключ для контакту: %s', (_label, value, keyPrefix) => {
    // Пошук на matching має знаходити анкету за будь-яким ключем індексу, а не
    // лише за телефоном та імʼям: контакт — найчастіше те єдине, що про людину
    // знають.
    expect(candidateKeysFor(value).some(key => key.startsWith(keyPrefix))).toBe(true);
  });
});
