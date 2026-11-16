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

/*
 * Вік і резус поруч із роллю: «донорка до 30», «СМ 25-30 років», «донор
 * резус негативний», «сурогатна мама O-» (16.11). Знімаються з запиту до
 * перевірки на контакт (цифри інакше читались би номером), а решта — роль і
 * місце, як і без них. Кошики ті самі, що в панелі фільтрів
 * (`defaultsMatching` у `FilterPanel`): вікові — `le25`, `26_30`, `31_33`,
 * `34_36`, `37_plus`; групу крові стрічка не фільтрує, тож з «O-» береться
 * самий резус.
 */
export const AGE_FILTER_BUCKETS = Object.freeze([
  { key: 'le25', min: 0, max: 25 },
  { key: '26_30', min: 26, max: 30 },
  { key: '31_33', min: 31, max: 33 },
  { key: '34_36', min: 34, max: 36 },
  { key: '37_plus', min: 37, max: 200 },
]);

// Одиниця — окремим словом: «р» без межі зʼїдав першу літеру «резус».
const AGE_UNIT = '(?:\\s*(?:років|роки|рік|лет|года|год|years?|y\\.?o\\.?|р\\.?)(?=\\s|$))?';
const AGE_PATTERNS = [
  { re: new RegExp(`(\\d{2})\\s*[-–—]\\s*(\\d{2})${AGE_UNIT}`, 'iu'), range: match => [Number(match[1]), Number(match[2])] },
  { re: new RegExp(`(?:до|молодше|молодші|не старше|under|younger than|<)\\s*(\\d{2})${AGE_UNIT}`, 'iu'), range: match => [0, Number(match[1])] },
  { re: new RegExp(`(?:від|старше|старші|over|older than|>)\\s*(\\d{2})${AGE_UNIT}`, 'iu'), range: match => [Number(match[1]), 200] },
  { re: new RegExp(`(\\d{2})\\s*\\+${AGE_UNIT}`, 'iu'), range: match => [Number(match[1]), 200] },
];
const RH_PATTERNS = [
  { re: /(?:резус|rh)[\s-]*(?:негативн\S*|відʼємн\S*|від'ємн\S*|negative|[-−–])(?=\s|$)/iu, rh: '-' },
  { re: /(?:негативн\S*|negative)\s+(?:резус\S*|rh)/iu, rh: '-' },
  { re: /(?:резус|rh)[\s-]*(?:позитивн\S*|додатн\S*|positive|\+)(?=\s|$)/iu, rh: '+' },
  { re: /(?:позитивн\S*|positive)\s+(?:резус\S*|rh)/iu, rh: '+' },
  // Група крові буквами: «O-», «AB+», «А+» (кирилицею теж).
  { re: /(?:^|\s)(?:ab|ав|o|о|a|а|b|в)\s?([-−–+])(?=\s|$)/iu, rh: match => (match[1] === '+' ? '+' : '-') },
];

const ageBucketsForRange = ([from, to]) => {
  if (!Number.isFinite(from) || !Number.isFinite(to) || from > to || to < 18 || from > 60) return null;
  const keys = AGE_FILTER_BUCKETS.filter(bucket => bucket.max >= from && bucket.min <= to).map(bucket => bucket.key);
  return keys.length ? keys : null;
};

/** Зняти з запиту вік і резус: `{ rest, age: [ключі кошиків] | null, rh: '+'|'-'|null }`. */
export const extractPersonTraits = query => {
  let rest = ` ${String(query ?? '').trim()} `;
  let age = null;
  let rh = null;
  // Межі збираються всі й перетинаються: «від 34 до 36» — це 34–36, а не
  // «до 36», що перезаписав «від 34» (ревʼю #3423).
  for (const pattern of AGE_PATTERNS) {
    const match = rest.match(pattern.re);
    if (!match) continue;
    const buckets = ageBucketsForRange(pattern.range(match));
    if (!buckets) continue;
    age = age ? age.filter(key => buckets.includes(key)) : buckets;
    rest = rest.replace(match[0], ' ');
  }
  if (age && !age.length) age = null;
  for (const pattern of RH_PATTERNS) {
    const match = rest.match(pattern.re);
    if (!match) continue;
    rh = typeof pattern.rh === 'function' ? pattern.rh(match) : pattern.rh;
    rest = rest.replace(match[0], ' ');
    break;
  }
  // Сполучники, що лишились між знятими шматками («донорка до 30 і резус -»).
  rest = rest.replace(/\s(?:і|й|та|and|,)\s/giu, ' ').replace(/\s+/g, ' ').trim();
  return { rest, age, rh };
};

/**
 * Намір запиту: `{ role, place }`. `role` — як `detectSearchRoleIntent`,
 * `place` — місце, назване поруч із роллю (або сам лише прийменник із місцем:
 * «з Києва»). Коли в запиті є щось, крім ролі й місця (імʼя, номер), —
 * `{ role: null, place: null }`: це пошук людини.
 */
export const detectSearchQueryIntent = query => {
  const empty = { role: null, place: null };
  const raw = String(query ?? '').trim();
  if (!raw) return empty;
  // Вік і резус мають сенс лише поруч із роллю: «до 30» саме по собі — не
  // намір, а «Олена до 30» — пошук людини.
  const traits = extractPersonTraits(raw);
  if ((traits.age || traits.rh) && traits.rest !== raw) {
    const inner = traits.rest ? detectSearchQueryIntent(traits.rest) : empty;
    if (!inner.role) return empty;
    const age = traits.age && inner.age ? traits.age.filter(key => inner.age.includes(key)) : traits.age || inner.age;
    return { ...inner, ...(age && age.length ? { age } : {}), ...(traits.rh ? { rh: traits.rh } : {}) };
  }
  if (looksLikeContact(raw.toLowerCase())) return empty;
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
