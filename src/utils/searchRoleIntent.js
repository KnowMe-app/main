import { resolveKnownPlace } from './profileNormalization';

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

/*
 * Роль і місце в одному запиті: «Сурогатна мати Київ», «донорка з Харкова»,
 * «агенції у Львові» (15.11). Доти намір упізнавав саму роль, а місто — саме
 * місто, і запит з обома падав у пошук імені: «Немає доступних профілів».
 * Тепер місце (одне-два слова на початку чи в кінці, можна з прийменником і
 * у відмінку) знімається з запиту, а решта звіряється зі словником ролей.
 * Стрічка тоді звужується обома чіпами — «Тип профілю» й «Місце».
 */
const PLACE_PREPOSITIONS = new Set(['з', 'із', 'зі', 'в', 'у', 'во', 'from', 'in']);
const PLACE_CASE_ENDINGS = ['ові', 'еві', 'ом', 'ою', 'ах', 'ам', 'а', 'я', 'у', 'ю', 'і', 'и', 'е'];
const PLACE_NOMINATIVE_ENDINGS = ['', 'а', 'я', 'о', 'и'];

/**
 * Місто чи область і в непрямому відмінку: «Києва» → Київ, «Харкові» →
 * Харків, «Одеси» → Одеса, «Дніпра» → Дніпро. Відмінок відкидається, а
 * основа пробує називні закінчення й чергування «о/е/є → і/ї» (Харков →
 * Харків, Києв → Київ). Що довідник не знає — `null`.
 */
export const resolveInflectedPlace = value => {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const direct = resolveKnownPlace(text);
  if (direct) return direct;
  const words = text.split(/\s+/);
  const last = words[words.length - 1].toLowerCase();
  const head = words.slice(0, -1).join(' ');
  const stems = new Set();
  PLACE_CASE_ENDINGS.forEach(ending => {
    if (last.length > ending.length + 2 && last.endsWith(ending)) stems.add(last.slice(0, last.length - ending.length));
  });
  const candidates = [];
  stems.forEach(stem => {
    PLACE_NOMINATIVE_ENDINGS.forEach(ending => candidates.push(`${stem}${ending}`));
    const alternated = stem.replace(/о(\S)$/, 'і$1').replace(/е(\S)$/, 'і$1').replace(/є(\S)$/, 'ї$1');
    if (alternated !== stem) candidates.push(alternated);
  });
  for (let index = 0; index < candidates.length; index += 1) {
    const place = resolveKnownPlace(head ? `${head} ${candidates[index]}` : candidates[index]);
    if (place) return place;
  }
  return null;
};

const stripPreposition = tokens => (tokens.length > 1 && PLACE_PREPOSITIONS.has(tokens[0].toLowerCase())
  ? tokens.slice(1)
  : tokens);

/**
 * Намір запиту: `{ role, place }`. `role` — як `detectSearchRoleIntent`,
 * `place` — місце, назване поруч із роллю (або сам лише прийменник із місцем:
 * «з Києва»). Коли в запиті є щось, крім ролі й місця (імʼя, номер), —
 * `{ role: null, place: null }`: це пошук людини.
 */
export const detectSearchQueryIntent = query => {
  const empty = { role: null, place: null };
  const raw = String(query ?? '').trim();
  if (!raw || looksLikeContact(raw.toLowerCase())) return empty;
  const wholeRole = detectSearchRoleIntent(raw);
  if (wholeRole) return { role: wholeRole, place: null };
  const tokens = raw.split(/\s+/).filter(Boolean);
  if (tokens.length < 2 || tokens.length > 7) return empty;
  // Місце — одне-два слова в кінці або на початку, можна з прийменником.
  const spans = [];
  for (let size = 1; size <= 3; size += 1) {
    if (tokens.length - size >= 0) spans.push({ place: tokens.slice(-size), rest: tokens.slice(0, -size) });
    if (tokens.length - size > 0) spans.push({ place: tokens.slice(0, size), rest: tokens.slice(size) });
  }
  for (let index = 0; index < spans.length; index += 1) {
    const { place: placeTokens, rest } = spans[index];
    const bare = stripPreposition(placeTokens);
    if (!bare.length || bare.length > 2) continue;
    const place = resolveInflectedPlace(bare.join(' '));
    if (!place) continue;
    if (!rest.length) {
      // «з Києва» — місце з прийменником, без ролі; голе «Київ» уже бере
      // `resolveKnownPlace` на всьому запиті.
      if (bare.length < placeTokens.length) return { role: null, place };
      continue;
    }
    const role = detectSearchRoleIntent(rest.join(' '));
    if (role) return { role, place };
  }
  return empty;
};
