import { getSearchIdIndexedFields } from './searchKeyUtils';

/**
 * Поля індексу `searchId`, які пробує пошук на сторінці matching.
 *
 * Пошук тут не сканує колекцію — він читає `searchId/{поле}_{значення}`
 * точковим `get`. Один префікс — один дешевий запит по ключу, тож увімкнути
 * весь індекс коштує стільки ж, скільки коштувало б відкласти половину полів.
 *
 * Довго тут стояв самий `phone`, і це мовчки вимикало текстовий пошук:
 * `buildSearchIdCandidateKeys` відкидає префікс `phone` для запиту з літерами,
 * тож на «Ольга» кандидатів не лишалось узагалі — жодного запиту до індексу і
 * одразу «Не знайшов».
 *
 * Порядок має значення двічі: `resolveExecutionPlan` зберігає його як порядок
 * спроб, а перший префікс потрапляє в підпис статусу пошуку. Тому імʼя і
 * прізвище стоять попереду — для тексту, у якому не розпізнано контакт, це
 * найчастіша інтенція; розпізнаний контакт (телефон, лінк) SearchBar і так
 * підніме на початок сам.
 */
const LEADING_MATCHING_SEARCH_ID_PREFIXES = ['name', 'surname', 'phone'];

export const MATCHING_SEARCH_ID_PREFIXES = [
  ...LEADING_MATCHING_SEARCH_ID_PREFIXES,
  ...getSearchIdIndexedFields().filter(field => !LEADING_MATCHING_SEARCH_ID_PREFIXES.includes(field)),
];
