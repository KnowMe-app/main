/*
 * Розділи «Мого профілю», які залежать від ролі, і що в них обовʼязкове.
 *
 * Тут чиста логіка без React: «Мій профіль» складає з неї форму, а тести
 * перевіряють, що саме тримає публікацію, не монтуючи сам екран.
 */

const EMPTY_SET = new Set();

/**
 * Обовʼязкові поля розділу — ті, без яких анкету не опублікують.
 *
 * `optional` — спільно необовʼязкові для цього читача (соцмережі, сайт…).
 * Розділ може оголосити ще й власні (`optionalFields`): спільного переліку тут
 * не вистачає, бо те саме поле в різних анкетах важить по-різному — «Про
 * себе» донорки обовʼязкове, а «Про нас» батьків ні; програма агенції
 * обовʼязкова, а програма батьків ні.
 */
export const listRequiredSectionFields = (section, { optional = EMPTY_SET } = {}) => (section?.fields || [])
  .filter(name => !optional.has(name) && !(section.optionalFields || []).includes(name));

/**
 * Розділи анкети біологічних батьків.
 *
 * Програма однакова для всіх і несе суму, вимоги, покриття й місце, тож
 * «Кого шукаєте» питає лише те, чого вона не вміє: кого шукають, як шукають,
 * побажання до зовнішності донорки (`ParentProfileFields`) і «Про нас».
 * Обовʼязкове тут одне — кого шукають: решта робить картку повнішою, але
 * публікацію не тримає. «Де програма» форма більше не питає — нове місце
 * задається в програмі, — а записане видно, доки його не стерли
 * (`showProgramLocation`).
 *
 * «Про нас» (`moreInfo_main`) стоїть тут же, а не окремим розділом: поки воно
 * жило в «Способі життя», батьки бачили «Кого шукаєте» двічі. Коли в людини є
 * ще й власна анкета (донорки, СМ, агенції), поле лишається там, де його читає
 * та роль.
 *
 * Програми батьків — той самий редактор, що в агенції, але необовʼязковий.
 * Коли поруч є агенція чи клініка, програми вже стоять у її анкеті
 * (`ownsPrograms` хибне).
 */
export const buildParentRoleSections = ({ parentOnly = false, ownsPrograms = false, showProgramLocation = false } = {}) => {
  const search = {
    key: 'search',
    title: '🔎 Кого шукаєте',
    fields: [
      'seeking',
      'parentVia',
      ...(showProgramLocation ? ['programLocation'] : []),
      ...(parentOnly ? ['moreInfo_main'] : []),
    ],
    optionalFields: ['parentVia', 'programLocation', 'moreInfo_main'],
    custom: 'parents',
    extraFields: parentOnly ? ['moreInfo_main'] : [],
  };
  if (!ownsPrograms) return [search];
  return [search, { key: 'programs', title: '💶 Програми', fields: ['programs'], custom: 'programs', optionalFields: ['programs'] }];
};
