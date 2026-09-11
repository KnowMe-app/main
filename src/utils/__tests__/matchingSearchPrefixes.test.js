import { MATCHING_SEARCH_ID_PREFIXES } from '../matchingSearchPrefixes';
import { buildSearchIdCandidateKeys, getSearchIdIndexedFields, normalizeSearchIdInput } from '../searchKeyUtils';
import { encodeKey } from '../searchIndexCandidates';

// Те, з чим SearchBar викликає індекс для режиму `searchId`: точний ключ, без
// варіантів і без сканування діапазону (див. `baseSearchIdOptions` у config.js).
const EXACT_SEARCH_ID_OPTIONS = {
  includeVariants: false,
  includePrefixMatches: false,
  includeAdaptedPhoneVariant: true,
};

const candidateKeysFor = (rawValue, detectedField) =>
  buildSearchIdCandidateKeys(
    encodeKey(detectedField ? normalizeSearchIdInput(detectedField, rawValue) : rawValue).toLowerCase(),
    rawValue,
    EXACT_SEARCH_ID_OPTIONS,
  );

describe('поля пошуку matching', () => {
  it('пробує весь індекс searchId, а не одне поле', () => {
    expect([...MATCHING_SEARCH_ID_PREFIXES].sort()).toEqual(getSearchIdIndexedFields().sort());
  });

  it('ставить імʼя і прізвище попереду — саме перше поле йде в підпис статусу', () => {
    expect(MATCHING_SEARCH_ID_PREFIXES.slice(0, 3)).toEqual(['name', 'surname', 'phone']);
  });

  it('на запит будується один ключ, а не ключ на кожне поле', () => {
    // Ціна перебору полів і була причиною переїзду: ключ — саме значення, а
    // поле лежить у ньому, тож чотирнадцять читань згорнулись в одне.
    expect(candidateKeysFor('Ольга')).toEqual(['ольга']);
  });

  it('перелік полів більше не вирішує, чи буде кандидат', () => {
    // Регресія: зі списком з самого лише `phone` запит з літерами не давав
    // жодного ключа — пошук не робив запиту й одразу звітував «не знайшов».
    // Тепер поля відсіюють уже прочитане, а не саме читання.
    expect(candidateKeysFor('Ольга').length).toBeGreaterThan(0);
  });

  it('лишає телефон робочим', () => {
    expect(candidateKeysFor('+380671234567', 'phone')).toContain('380671234567');
  });

  it.each([
    ['пошта', 'olga@example.com', 'email'],
    ['інстаграм', 'olga_ua', 'instagram'],
    ['телеграм', 'olga_ua', 'telegram'],
    ['фейсбук', 'olga_ua', 'facebook'],
  ])('будує ключ для контакту: %s', (_label, value, detectedField) => {
    // Пошук на matching має знаходити анкету за будь-яким ключем індексу, а не
    // лише за телефоном та імʼям: контакт — найчастіше те єдине, що про людину
    // знають. Ключ при цьому один — поле вибирається вже в записі.
    const expectedKey = encodeKey(normalizeSearchIdInput(detectedField, value)).toLowerCase();
    expect(candidateKeysFor(value, detectedField)).toContain(expectedKey);
  });
});
