/**
 * Чи набраний у пошуку текст — це не людина, а **категорія анкет**.
 *
 * 14.11 нова користувачка набрала в пошуку стрічки «Сурогатна мати», пошук
 * прочитав це як імʼя (`detectSearchParamsByQueryContent` падає в `name`),
 * `searchId` не знайшов нікого на імʼя «Сурогатна мати» — і людина побачила
 * «Немає доступних профілів» та видалила акаунт. Анкети СМ у стрічці при
 * цьому були: питання було про тип профілю, а не про імʼя.
 *
 * Тому перед пошуком за імʼям запит звіряється зі словником назв ролей. Збіг —
 * лише вся фраза (або фраза з одним-двома загальними словами довкола:
 * «шукаю сурогатну маму», «потрібна донорка»). Знахідний відмінок, яким
 * людина й пише після «шукаю», — окремі фрази словника. Усе, що схоже на
 * контакт (цифри, `@`,
 * посилання) чи на імʼя з прізвищем («Олена Сурогатна»), лишається старому
 * пошуку: людину на прізвище Сурогатна знайти так само мусимо.
 *
 * Словник — масив фраз, а не регулярний вираз: дописати нову назву — рядок у
 * переліку, і тест (`searchRoleIntent.test.js`) проходить усі фрази словника.
 */

export const SEARCH_ROLE_INTENT_ROLES = Object.freeze(['sm', 'ed', 'ag', 'ip', 'cl']);

export const SEARCH_ROLE_INTENT_DICTIONARY = Object.freeze({
  sm: Object.freeze([
    'сурогатна мати',
    'сурогатна мама',
    'сурогатні матері',
    'сурогатну маму',
    'сурогатну матір',
    'сурмама',
    'сур мама',
    'сур мами',
    'сурмами',
    'сурогатне материнство',
    'сурогатна',
    'сурогатка',
    'см',
    'surrogate',
    'surrogate mother',
    'surrogate mom',
    'surrogacy',
    'суррогатная мать',
    'суррогатная мама',
    'суррогатное материнство',
    'суррогатная',
  ]),
  ed: Object.freeze([
    'донор ооцитів',
    'донорка',
    'донорки',
    'донорку',
    'донор яйцеклітин',
    'донорка яйцеклітин',
    'донорка ооцитів',
    'донор',
    'донори',
    'egg donor',
    'egg donors',
    'донор яйцеклеток',
    'донор ооцитов',
    'донор яйцеклетки',
  ]),
  ag: Object.freeze([
    'агенція',
    'агенції',
    'агентство',
    'агентства',
    'агенство',
    'agency',
    'agencies',
  ]),
  ip: Object.freeze([
    'біологічні батьки',
    'батьки',
    'intended parents',
    'генетичні батьки',
    'генетические родители',
    'биологические родители',
  ]),
  cl: Object.freeze([
    'клініка',
    'клініки',
    'клініка репродукції',
    'клініки репродукції',
    'clinic',
    'clinics',
    'клиника',
  ]),
});

/**
 * Загальні слова, якими людина обгортає назву категорії. Довкола фрази їх
 * дозволено не більше двох слів разом: «шукаю донорку для нас» — це вже три,
 * і така фраза лишається пошуку за імʼям (там, найімовірніше, контекст, а не
 * категорія).
 */
export const SEARCH_ROLE_INTENT_FILLERS = Object.freeze([
  'шукаю',
  'шукаємо',
  'потрібна',
  'потрібен',
  'потрібні',
  'потрібно',
  'пошук',
  'для нас',
  'послуги',
  'ищу',
  'ищем',
  'нужна',
  'нужен',
  'looking for',
  'need',
  'find',
]);

const MAX_FILLER_WORDS = 2;

/**
 * Нижній регістр, лапки геть, апостроф один, пробіли схлопнуті.
 * `ё/є/ї/і` лишаються як є: «сурогатна» й «суррогатная» — різні фрази
 * словника, і зводити мови одна до одної тут нема потреби.
 */
export const normalizeSearchRoleIntentText = value => String(value ?? '')
  .toLowerCase()
  .replace(/[’ʼ`ʻ′]/g, "'")
  .replace(/[«»"„“”‟❝❞〝〞]/g, ' ')
  .replace(/[.,!?;:()[\]{}…]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const tokenize = value => (value ? value.split(' ') : []);

const DICTIONARY_ENTRIES = Object.freeze(
  SEARCH_ROLE_INTENT_ROLES.flatMap(role => SEARCH_ROLE_INTENT_DICTIONARY[role]
    .map(phrase => [normalizeSearchRoleIntentText(phrase), role])),
);
const PHRASE_TO_ROLE = new Map(DICTIONARY_ENTRIES);

const FILLER_TOKEN_LISTS = Object.freeze(
  SEARCH_ROLE_INTENT_FILLERS.map(phrase => tokenize(normalizeSearchRoleIntentText(phrase))),
);

const startsWithTokens = (tokens, prefix) => prefix.length <= tokens.length
  && prefix.every((token, index) => tokens[index] === token);

const endsWithTokens = (tokens, suffix) => suffix.length <= tokens.length
  && suffix.every((token, index) => tokens[tokens.length - suffix.length + index] === token);

/**
 * Контакт чи ID — це вже точно не категорія: цифри (телефон, `AB1234`),
 * `@` (пошта, нік), посилання й домени.
 */
const looksLikeContact = text => /\d/.test(text)
  || /@/.test(text)
  || /[/\\]/.test(text)
  || /\b(?:www|http|https)\b/.test(text)
  || /\.(?:com|ua|net|org|me|ru|io)\b/.test(text);

/**
 * Перебір обгорток: зняти з початку й кінця загальні слова (не більше двох
 * разом) і спитати словник про те, що лишилось. Варіантів мало, тож перебір —
 * простіше й надійніше за граматику.
 */
const resolveCore = (tokens, wordsLeft) => {
  const direct = PHRASE_TO_ROLE.get(tokens.join(' '));
  if (direct) return direct;
  if (wordsLeft <= 0) return null;
  for (const filler of FILLER_TOKEN_LISTS) {
    if (filler.length > wordsLeft || filler.length >= tokens.length) continue;
    if (startsWithTokens(tokens, filler)) {
      const role = resolveCore(tokens.slice(filler.length), wordsLeft - filler.length);
      if (role) return role;
    }
    if (endsWithTokens(tokens, filler)) {
      const role = resolveCore(tokens.slice(0, tokens.length - filler.length), wordsLeft - filler.length);
      if (role) return role;
    }
  }
  return null;
};

/**
 * @param {string} query набране в рядку пошуку
 * @returns {'sm'|'ed'|'ag'|'ip'|'cl'|null}
 */
export const detectSearchRoleIntent = query => {
  const raw = String(query ?? '');
  if (!raw.trim()) return null;
  // Контакт перевіряємо до нормалізації: вона знімає крапки й дужки, а
  // `instagram.com/...` мусить лишитись посиланням.
  if (looksLikeContact(raw.toLowerCase())) return null;
  const text = normalizeSearchRoleIntentText(raw);
  if (!text) return null;
  return resolveCore(tokenize(text), MAX_FILLER_WORDS);
};

/**
 * Ключ чіпа «Тип профілю», яким стрічка звужується під намір. Окремого чіпа
 * клінік немає: клініки лежать під «Інші» (`toRoleCategory`), разом з
 * анкетами без ролі.
 */
export const SEARCH_ROLE_INTENT_FILTER_KEYS = Object.freeze({
  sm: 'sm',
  ed: 'ed',
  ag: 'ag',
  ip: 'ip',
  cl: 'other',
});

export const roleIntentFilterKey = role => SEARCH_ROLE_INTENT_FILTER_KEYS[role] || null;

/**
 * Що робити з наміром для цього читача.
 *
 * - `'filter'` — одразу стрічка з чіпом ролі. Так для батьків, агенції,
 *   клініки й адміна: вони шукають анкети, а не стають кимось.
 * - `'choice'` — картка «Що ви шукаєте?». Так для нового акаунта без ролі,
 *   донорки й СМ, коли намір — СМ чи донорка: «Сурогатна мати» в їхньому
 *   пошуку однаково означає «шукаю», «хочу стати» або імʼя людини, і
 *   вгадувати тут дорожче, ніж спитати.
 */
const ORGANISATION_OR_PARENT_VIEWER_ROLES = new Set(['ip', 'pp', 'ag', 'cl']);
const CHOICE_INTENT_ROLES = new Set(['sm', 'ed']);

const listRoleValues = viewerRole => (Array.isArray(viewerRole) ? viewerRole : [viewerRole])
  .flatMap(value => String(value ?? '').split(','))
  .map(value => value.trim().toLowerCase())
  .filter(Boolean);

export const resolveRoleIntentFlow = ({ intent, viewerRole, isAdmin = false } = {}) => {
  if (!intent) return null;
  if (isAdmin) return 'filter';
  if (!CHOICE_INTENT_ROLES.has(intent)) return 'filter';
  const roles = listRoleValues(viewerRole);
  if (roles.some(role => ORGANISATION_OR_PARENT_VIEWER_ROLES.has(role))) return 'filter';
  return 'choice';
};

/**
 * «Тип профілю» рівно з однією увімкненою роллю — тією, яку назвав намір.
 * Ключі, які вже лежать у групі, лишаються (вимкненими), щоб чіп рейки й
 * збережений фільтр мали ту саму форму, що й після ручного вибору.
 */
export const buildRoleIntentRoleFilter = (currentRoleFilter, role, allKeys = []) => {
  const filterKey = roleIntentFilterKey(role);
  if (!filterKey) return currentRoleFilter;
  const keys = new Set([
    ...allKeys,
    ...Object.keys(currentRoleFilter && typeof currentRoleFilter === 'object' ? currentRoleFilter : {}),
    filterKey,
  ]);
  return [...keys].reduce((acc, key) => ({ ...acc, [key]: key === filterKey }), {});
};

/** Чи «Тип профілю» зараз звужений рівно до ролі наміру (серед показаних читачеві опцій). */
export const isRoleFilterNarrowedToIntent = (roleFilter, role, offeredKeys = []) => {
  const filterKey = roleIntentFilterKey(role);
  if (!filterKey || !roleFilter || typeof roleFilter !== 'object') return false;
  if (!roleFilter[filterKey]) return false;
  const keys = offeredKeys.length ? offeredKeys : Object.keys(roleFilter);
  return keys.every(key => key === filterKey || !roleFilter[key]);
};
