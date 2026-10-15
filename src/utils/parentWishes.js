import { eyeColorOptions, getOptionLabel, hairColorOptions } from '../components/formFields';
import { PARENT_VIA_OPTIONS, parseSeekingRoles } from './donorPrograms';
import { uiText } from './uiTranslations';

/*
 * Що біологічні батьки кажуть про себе й про пошук — поза програмою.
 *
 * Програма однакова для всіх (агенція, клініка, батьки) і несе суму, вимоги,
 * покриття й місце. Тут лишається те, чого програма не вміє:
 *
 * — **побажання до донорки**: колір очей, волосся й освіта. Це не вимога —
 *   донорку вони не відсіюють і в «Вам підходить» не рахуються, — а підказка,
 *   кого шукають. Вік, ІМТ, зріст і групу крові батьки задають вимогами
 *   програми: там донорка бачить «підходить / ні»;
 * — **як шукають** (`parentVia`) і **де програма** (`programLocation`,
 *   лише вже записане — нове місце задається в самій програмі).
 *
 * Значення побажань лежать у тому самому полі, що й раніше
 * (`parentPreferences.donor.{eyeColor, hairColor, education}`), але тепер це
 * значення з довідників анкети донорки, а не вільний текст: лише так картка
 * може сказати донорці «✓ як у вас». Кілька значень — рядок через кому, як
 * написала б людина руками. Уже записаний вільний текст не губиться:
 * незнайоме слово показується як є і знімається тим самим дотиком.
 */

const norm = value => String(value ?? '').trim().toLowerCase();

const pickText = value => String((Array.isArray(value) ? value[value.length - 1] : value) ?? '').trim();

// Значення, які довідник тримає окремими записами, хоча людина вкладає в них
// те саме: «Карі» й «Hazel», «Брюнетка» й «Темне». Без цього донорка з
// записаним колись «Темним» волоссям не впізнала б себе в «брюнетці».
const EYE_FAMILIES = Object.freeze({ Hazel: 'Brown' });
const HAIR_FAMILIES = Object.freeze({
  Dark: 'Brunette',
  'Dark Brunette': 'Brunette',
  Brown: 'Shoten',
  'Dark Brown': 'Shoten',
  'Dark Chestnut': 'Chestnut',
});

export const PARENT_DONOR_WISH_FIELDS = Object.freeze([
  { key: 'eyeColor', label: 'Колір очей', short: 'Очі', options: eyeColorOptions, families: EYE_FAMILIES },
  { key: 'hairColor', label: 'Колір волосся', short: 'Волосся', options: hairColorOptions, families: HAIR_FAMILIES },
]);

/** Освіта в побажаннях одна — «вища»: «середню» ніхто не просить. */
export const HIGHER_EDUCATION_WISH = 'Higher';
const HIGHER_EDUCATION_VALUES = new Set([
  'higher', 'bachelor', 'master', 'phd',
  'вища', 'вища освіта', 'бакалавр', 'магістр', 'доктор філософії (phd)',
]);

/** Рядок через кому (або вже масив) — список без порожніх і повторів. */
export const parseWishList = value => {
  const raw = Array.isArray(value) ? value : String(value ?? '').split(/[,;]+/);
  const seen = new Set();
  return raw
    .map(item => String(item ?? '').trim())
    .filter(item => {
      const key = norm(item);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

const findOption = (token, options) => {
  const key = norm(token);
  if (!key) return null;
  return options.find(option => norm(option.placeholder) === key && !option.legacy)
    || options.find(option => norm(option.placeholder) === key)
    || options.find(option => norm(option.ukrainian) === key && !option.legacy)
    || options.find(option => norm(option.ukrainian) === key)
    || null;
};

// Ключ порівняння: значення довідника зводиться до своєї «родини», незнайоме
// слово — до самого себе.
const wishKey = (token, field) => {
  const option = findOption(token, field.options);
  if (!option) return norm(token);
  return norm(field.families?.[option.placeholder] || option.placeholder);
};

/** Варіанти, які пропонує форма: запропоновані довідником плюс записане незнайоме. */
export const listWishChoices = (value, field) => {
  const offered = field.options.filter(option => !option.legacy);
  const offeredKeys = new Set(offered.map(option => wishKey(option.placeholder, field)));
  const extra = parseWishList(value)
    .filter(token => !offeredKeys.has(wishKey(token, field)))
    .map(token => ({ placeholder: token, ukrainian: token, recorded: true }));
  return [...offered, ...extra];
};

export const isWishSelected = (value, field, option) => {
  const key = wishKey(option.placeholder, field);
  return parseWishList(value).some(token => wishKey(token, field) === key);
};

/** Дотик до варіанта: обраний знімається (разом із «родиною»), інший додається. */
export const toggleWish = (value, field, option) => {
  const key = wishKey(option.placeholder, field);
  const tokens = parseWishList(value);
  const kept = tokens.filter(token => wishKey(token, field) !== key);
  const next = kept.length === tokens.length ? [...tokens, option.placeholder] : kept;
  return next.join(', ');
};

export const isHigherEducationWish = value => parseWishList(value)
  .some(token => HIGHER_EDUCATION_VALUES.has(norm(token)) || norm(token).startsWith('вищ'));

const describeWishTokens = (value, field, language) => parseWishList(value)
  .map(token => {
    const option = findOption(token, field.options);
    return option ? norm(getOptionLabel(option, language)) : token;
  })
  .join(', ');

// Збіг із анкетою читачки — лише «так»: «ні» тут не кажемо, бо побажання не
// відсіюють, а незаповнене поле в анкеті донорки — не відмова.
const matchesViewer = (value, field, viewerValue) => {
  const own = pickText(viewerValue);
  if (!own) return false;
  const ownKey = wishKey(own, field);
  return parseWishList(value).some(token => wishKey(token, field) === ownKey);
};

const isHigherEducation = value => HIGHER_EDUCATION_VALUES.has(norm(pickText(value)));

/**
 * Чиї побажання зараз чинні — за тим, кого батьки шукають.
 *
 * Шукають сурогатну маму — побажань до донорки картка не показує (і
 * навпаки), хоч в анкеті вони й лежать: зміна «кого шукаєте» не стирає
 * записаного мовчки (дотик повз «Донорку» коштував би всіх побажань), а
 * картка не мусить казати, якою має бути донорка, тим, кого донорка вже не
 * цікавить. Форма показує сховане окремо й дає його стерти
 * (`ParentProfileFields`). Невідоме «кого» не ховає нічого.
 */
export const resolveParentWishGroups = seeking => {
  // Агенція чи клініка в наборі побажань не ховає: вони про те, хто
  // допоможе, а не про те, якою має бути донорка чи СМ.
  const keys = parseSeekingRoles(seeking);
  const wantsDonor = keys.includes('ed');
  const wantsSurrogate = keys.includes('sm');
  if (!wantsDonor && !wantsSurrogate) return { donor: true, surrogate: true };
  return { donor: wantsDonor, surrogate: wantsSurrogate };
};

const readPrefsGroup = (prefs, group) => (prefs?.[group] && typeof prefs[group] === 'object' ? prefs[group] : {});

const describeDonorWishItems = (donor, language, { isDonorViewer = false, facts = {} } = {}) => {
  const items = [];
  PARENT_DONOR_WISH_FIELDS.forEach(field => {
    if (!parseWishList(donor[field.key]).length) return;
    items.push({
      key: field.key,
      label: uiText(field.short, language),
      text: describeWishTokens(donor[field.key], field, language),
      match: isDonorViewer && matchesViewer(donor[field.key], field, facts[field.key]),
    });
  });
  if (parseWishList(donor.education).length) {
    const higher = isHigherEducationWish(donor.education);
    items.push({
      key: 'education',
      text: higher ? norm(uiText('Вища освіта', language)) : parseWishList(donor.education).join(', '),
      match: isDonorViewer && higher && isHigherEducation(facts.education),
    });
  }
  // Записане до того, як групу крові й зріст стали задавати вимогами
  // програми, лишається видно — без позначки збігу.
  if (pickText(donor.blood)) items.push({ key: 'blood', label: uiText('Група крові', language), text: pickText(donor.blood), match: false });
  if (pickText(donor.heightFrom)) {
    items.push({ key: 'heightFrom', text: uiText('зріст від {value} см', language, { value: pickText(donor.heightFrom) }), match: false });
  }
  return items;
};

const describeSurrogateWishItems = (surrogate, language) => {
  const items = [];
  if (pickText(surrogate.ageTo)) items.push({ key: 'ageTo', text: uiText('вік до {value}', language, { value: pickText(surrogate.ageTo) }), match: false });
  if (pickText(surrogate.location)) items.push({ key: 'location', text: pickText(surrogate.location), match: false });
  return items;
};

/**
 * Побажання програми (`requirements.eyeColors`, `hairColors`, `education` —
 * `PROGRAM_WISH_FIELDS`) — чіпами поруч із вимогами. `ok: true` — «✓ як у
 * вас» (лише донорці, `facts` її анкети); «ні» тут не кажемо ніколи, як і в
 * побажаннях батьків: це підказка, а не відмова.
 */
export const PROGRAM_WISH_DEFS = Object.freeze([
  { key: 'eyes', field: 'eyeColors', wish: PARENT_DONOR_WISH_FIELDS[0], text: 'бажано: очі {value}' },
  { key: 'hair', field: 'hairColors', wish: PARENT_DONOR_WISH_FIELDS[1], text: 'бажано: волосся {value}' },
]);

export const describeProgramWishes = (program, language, facts = null) => {
  const req = program?.requirements || {};
  const items = [];
  PROGRAM_WISH_DEFS.forEach(def => {
    if (!parseWishList(req[def.field]).length) return;
    items.push({
      key: def.key,
      text: uiText(def.text, language, { value: describeWishTokens(req[def.field], def.wish, language) }),
      ok: facts && matchesViewer(req[def.field], def.wish, facts[def.wish.key]) ? true : undefined,
    });
  });
  if (req.education === 'higher') {
    items.push({
      key: 'education',
      text: uiText('бажано: вища освіта', language),
      ok: facts && isHigherEducation(facts.education) ? true : undefined,
    });
  }
  return items;
};

/** Записані побажання групи (`donor` чи `surrogate`) словами — без позначок збігу. */
export const listParentWishItems = (prefs, group, language) => (group === 'donor'
  ? describeDonorWishItems(readPrefsGroup(prefs, 'donor'), language)
  : describeSurrogateWishItems(readPrefsGroup(prefs, 'surrogate'), language));

/**
 * Розділи «Більше про біологічних батьків» (крім «Про нас», яке малює
 * `ProfileAboutSection`). `viewer` — `{ type, facts }` з `programsContext`:
 * позначку «✓ як у вас» бачить лише донорка.
 */
export const buildParentDetailSections = (user, viewer = {}, language) => {
  const sections = [];
  const via = PARENT_VIA_OPTIONS.find(option => option.key === pickText(user?.parentVia));
  if (via) {
    sections.push({ key: 'parent-via', title: uiText('Як шукають', language), text: uiText(via.label, language) });
  }
  const place = pickText(user?.programLocation);
  if (place) sections.push({ key: 'parent-place', title: uiText('Де програма', language), text: place });

  const prefs = user?.parentPreferences && typeof user.parentPreferences === 'object' ? user.parentPreferences : {};
  const groups = resolveParentWishGroups(user?.seeking);
  const isDonorViewer = viewer?.type === 'ed';
  const facts = isDonorViewer && viewer?.facts ? viewer.facts : {};
  const donorItems = groups.donor ? describeDonorWishItems(readPrefsGroup(prefs, 'donor'), language, { isDonorViewer, facts }) : [];
  if (donorItems.length) {
    sections.push({
      key: 'parent-donor-wishes',
      title: uiText('Бажано у донорки', language),
      items: donorItems,
      note: isDonorViewer
        ? uiText('✓ — як у вашій анкеті. Побажання не відсіюють: «Вам підходить» рахує лише вимоги програми.', language)
        : '',
    });
  }

  const surrogateItems = groups.surrogate ? describeSurrogateWishItems(readPrefsGroup(prefs, 'surrogate'), language) : [];
  if (surrogateItems.length) {
    sections.push({ key: 'parent-surrogate-wishes', title: uiText('Бажано у сурогатної мами', language), items: surrogateItems });
  }
  return sections;
};
