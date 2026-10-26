import { getCurrentValue } from 'components/getCurrentValue';
import { getProfileBio, getProfilePhotos } from 'components/profileLayoutConfig';
import { utilCalculateAge } from 'components/smallCard/utilCalculateAge';
import { deriveSurnameShort } from './profileFieldDerive';
import { listProfileRoles } from './matchingPeerVisibility';

/**
 * Анкета за посиланням — знімок, а не вікно в живі вузли.
 *
 * Читати анкету без входу не можна й не буде: правила бази не бачать, хто
 * питає, і відкритий анонімно вузол — це весь каталог донорок одним `curl`
 * (див. «Межа приватності» в CLAUDE.md). Тож посилання відкриває не
 * `matchingCards`/`profileDetails`, а окремий запис `profileShares/{token}`,
 * який власниця сама випускає: у ньому лише ті поля, які вона дозволила, і
 * лише їхнє **поточне** значення — масив у полі анкети це історія версій
 * (`getCurrentValue`), і старий номер чи попереднє прізвище не мусять їхати
 * до людини, якій переслали посилання.
 *
 * Знімок тримає сирі значення довідників (англійське слово з бази, а не
 * готове речення): сторінку гостя складають ті самі `ProfileRow` і
 * `ProfileFacts`, що й стрічку, тож мова й формат дат ідуть за читачем, а не
 * за власницею.
 *
 * Перелік полів тут — джерело правди і для писача, і для правил:
 * `profileShare.rulesContract.test.js` звіряє його з `database.rules.json`.
 */

export const PROFILE_SHARES_ROOT = 'profileShares';
export const PROFILE_SHARE_SLOTS_ROOT = 'multiData/profileShareSlots';

// Слот — місце для одного живого посилання. П'ять — стеля, яку тримають
// правила: кожен знімок мусить стояти у своєму слоті, тож засипати базу
// публічними сторінками не вийде.
export const PROFILE_SHARE_SLOT_COUNT = 5;
export const PROFILE_SHARE_MAX_PHOTOS = 6;

// Поки що — лише особисті анкети. Картка агенції, клініки й батьків — це
// насамперед програми, а вони лежать окремо й мали б власну перевірку в
// правилах; без них посилання на агенцію нічого б не показало.
export const PROFILE_SHARE_ROLES = Object.freeze(['ed', 'sm']);

/**
 * Групи полів, які власниця вмикає й вимикає. Імʼя, роль і вік є завжди:
 * без них картка нікого не описує.
 *
 * Дати народження в знімку немає зовсім — лише вік на день знімка
 * (`age` + `ageAt`): дата разом з імʼям і містом впізнає людину, а агенції
 * досить віку. Алергій, хронічних хвороб і операцій теж немає: рядок
 * стрічки їх не показує, а чого картка не малює, того знімок не везе.
 */
export const PROFILE_SHARE_GROUPS = Object.freeze({
  location: Object.freeze(['country', 'region', 'city']),
  body: Object.freeze([
    'height', 'weight', 'bmi', 'blood', 'eyeColor', 'hairColor', 'hairStructure', 'bodyType',
    'faceShape', 'noseShape', 'lipsShape', 'chin', 'breastSize', 'clothingSize', 'shoeSize', 'glasses', 'race',
  ]),
  family: Object.freeze([
    'maritalStatus', 'ownKids', 'csection', 'lastDelivery', 'experience', 'surrogacyExperience', 'healthComplications',
  ]),
  about: Object.freeze(['moreInfo_main', 'education', 'profession', 'reward', 'smoking', 'alcohol']),
  contacts: Object.freeze(['phone', 'email', 'telegram', 'whatsapp', 'viber', 'instagram', 'facebook', 'tiktok']),
});

export const PROFILE_SHARE_GROUP_KEYS = Object.freeze(Object.keys(PROFILE_SHARE_GROUPS));

// Контакти вимкнені за замовчуванням: посилання пересилають далі, ніж
// задумано, а номер телефону — це вже не анкета, а людина.
export const DEFAULT_PROFILE_SHARE_OPTIONS = Object.freeze({
  photos: 'all',
  surname: 'initial',
  location: true,
  body: true,
  family: true,
  about: true,
  contacts: false,
});

export const PROFILE_SHARE_PHOTO_OPTIONS = Object.freeze(['all', 'main', 'none']);
export const PROFILE_SHARE_SURNAME_OPTIONS = Object.freeze(['initial', 'full', 'none']);

// Строк дії в днях; 0 — поки власниця не відкличе. Стеля правил — 400 днів.
export const PROFILE_SHARE_EXPIRY_DAYS = Object.freeze([7, 30, 90, 0]);
export const DEFAULT_PROFILE_SHARE_EXPIRY_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

// Межі довжини — ті самі, що в правилах; довше обрізається тут, бо правило
// відхилило б знімок цілком.
const MEASURE_FIELDS = new Set(['height', 'weight', 'bmi']);
const MEDIUM_FIELDS = new Set(['healthComplications', 'education', 'profession', 'reward']);
const LONG_FIELDS = new Set(['moreInfo_main']);

export const profileShareFieldLimit = field => {
  if (MEASURE_FIELDS.has(field)) return 20;
  if (LONG_FIELDS.has(field)) return 4000;
  if (MEDIUM_FIELDS.has(field)) return 1000;
  if (field === 'name') return 120;
  return 200;
};

/** Усі ключі, які може нести картка знімка (звіряється з правилами). */
export const PROFILE_SHARE_CARD_FIELDS = Object.freeze([
  'role', 'name', 'surname', 'age', 'ageAt', 'photos',
  ...PROFILE_SHARE_GROUP_KEYS.flatMap(group => PROFILE_SHARE_GROUPS[group]),
]);

// Кесарів лежить під кількома іменами в анкетах різних поколінь — та сама
// причина, що й `CSECTION_ALIASES` у `matchingCardIndex`.
const CSECTION_ALIASES = ['csection', 'cSection', 'c_section', 'cesareanSection'];

const currentText = value => {
  const current = getCurrentValue(value);
  if (current === undefined || current === null) return '';
  if (typeof current === 'object') return '';
  return String(current).trim();
};

const clip = (text, limit) => (text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text);

const readFieldValue = (profile, field) => {
  if (field === 'csection') {
    const key = CSECTION_ALIASES.find(alias => currentText(profile?.[alias]));
    return key ? currentText(profile[key]) : '';
  }
  // «Про себе» — те саме, що показує стрічка (`getProfileBio`).
  if (field === 'moreInfo_main') return String(getProfileBio(profile) || '').trim();
  const current = getCurrentValue(profile?.[field]);
  if (MEASURE_FIELDS.has(field) && typeof current === 'number') {
    return Number.isFinite(current) && current > 0 && current < 1000 ? current : '';
  }
  return currentText(profile?.[field]);
};

const isoDate = date => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const normalizeProfileShareOptions = (options = {}) => {
  const merged = { ...DEFAULT_PROFILE_SHARE_OPTIONS, ...(options || {}) };
  return {
    photos: PROFILE_SHARE_PHOTO_OPTIONS.includes(merged.photos) ? merged.photos : DEFAULT_PROFILE_SHARE_OPTIONS.photos,
    surname: PROFILE_SHARE_SURNAME_OPTIONS.includes(merged.surname) ? merged.surname : DEFAULT_PROFILE_SHARE_OPTIONS.surname,
    ...Object.fromEntries(PROFILE_SHARE_GROUP_KEYS.map(group => [group, merged[group] === true])),
  };
};

/** Особисті ролі анкети, якими можна поділитись, — основна першою. */
export const listShareableProfileRoles = (profile, preferredRole = '') => {
  const roles = listProfileRoles(profile).filter(role => PROFILE_SHARE_ROLES.includes(role));
  if (preferredRole && roles.includes(preferredRole)) {
    return [preferredRole, ...roles.filter(role => role !== preferredRole)];
  }
  return roles;
};

/** Фото, які піде копіювати в знімок, — оригінальні адреси анкети. */
export const selectProfileSharePhotos = (profile, options) => {
  const { photos } = normalizeProfileShareOptions(options);
  if (photos === 'none') return [];
  const all = getProfilePhotos(profile).filter(url => /^https:\/\//i.test(url));
  return photos === 'main' ? all.slice(0, 1) : all.slice(0, PROFILE_SHARE_MAX_PHOTOS);
};

/**
 * Картка знімка з анкети. `photos` сюди кладе той, хто їх скопіював
 * (`profileShareRemote`): адреси оригіналів знімок не несе — інакше
 * відкликане посилання лишало б фото доступними, а адреса називала б uid.
 */
export const buildProfileShareCard = (profile, { role, options, photos = [], today = new Date() } = {}) => {
  const settings = normalizeProfileShareOptions(options);
  const card = { role };
  const name = clip(currentText(profile?.name), profileShareFieldLimit('name'));
  if (name) card.name = name;

  const surname = currentText(profile?.surname);
  if (surname && settings.surname === 'full') card.surname = clip(surname, 200);
  if (surname && settings.surname === 'initial') {
    const initial = deriveSurnameShort(surname).value;
    if (typeof initial === 'string' && initial) card.surname = initial;
  }

  const age = utilCalculateAge(currentText(profile?.birth));
  if (Number.isInteger(age) && age >= 14 && age <= 90) {
    card.age = age;
    card.ageAt = isoDate(today);
  }

  PROFILE_SHARE_GROUP_KEYS.forEach(group => {
    if (!settings[group]) return;
    PROFILE_SHARE_GROUPS[group].forEach(field => {
      const value = readFieldValue(profile, field);
      if (value === '' || value === undefined) return;
      card[field] = typeof value === 'number' ? value : clip(value, profileShareFieldLimit(field));
    });
  });

  const photoList = (photos || []).filter(Boolean).slice(0, PROFILE_SHARE_MAX_PHOTOS);
  if (photoList.length) card.photos = photoList;
  return card;
};

export const canShareProfileCard = card => Boolean(card?.name) && PROFILE_SHARE_ROLES.includes(card?.role);

/*
 * Телефон в анкеті — умова посилання, а не його вміст. Посилання створювалось
 * з самим лише іменем, і власниці, які обрали «Лише за посиланням», так і не
 * вписали номера: за посиланням анкета, а звʼязатися з людиною — ніяк, навіть
 * коли вона потім вирішить показати контакти. Тож номер обовʼязковий в анкеті,
 * а чи показувати його гостеві, вирішує власниця (`contacts`, за замовчуванням
 * вимкнено). Перевіряється анкета, а не знімок: у знімку без контактів
 * телефону немає й не має бути.
 */
export const profileHasPhoneForShare = profile => String(getCurrentValue(profile?.phone) ?? '').trim() !== '';

/**
 * Дата народження, з якої `ProfileRow` порахує саме той вік, що в знімку.
 *
 * Справжньої дати в знімку немає, а рядок стрічки вміє показувати вік лише з
 * дати. Тож береться день знімка мінус вік: на цей день вік точний, далі
 * він росте в річницю знімка, а не народження, — похибка до року, і лише в
 * посилання без строку, яке власниця давно не оновлювала.
 */
const syntheticBirth = (age, ageAt) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ageAt || ''));
  if (!match || !Number.isInteger(age)) return '';
  return `${Number(match[1]) - age}-${match[2]}-${match[3]}`;
};

/** Знімок у формі, яку малює `ProfileRow` (та сама, що прев'ю «Мого профілю»). */
export const expandProfileShareCard = card => {
  if (!card || typeof card !== 'object') return null;
  const { age, ageAt, photos, ...rest } = card;
  const birth = syntheticBirth(age, ageAt);
  const photoList = Array.isArray(photos) ? photos.filter(Boolean) : Object.values(photos || {}).filter(Boolean);
  return {
    ...rest,
    userId: 'shared-profile',
    userRole: card.role,
    ...(birth ? { birth } : {}),
    photos: photoList,
    __allPhotosLoaded: true,
    __photosHydrated: true,
  };
};

export const resolveProfileShareExpiresAt = (days, now = Date.now()) => (
  Number(days) > 0 ? now + Number(days) * DAY_MS : null
);

export const isProfileShareExpired = (slot, now = Date.now()) => (
  typeof slot?.expiresAt === 'number' && slot.expiresAt <= now
);

/** 16 випадкових байтів — 22 знаки base64url: токен не вгадати й не перебрати. */
export const generateProfileShareToken = (cryptoSource = window.crypto) => {
  const bytes = new Uint8Array(16);
  cryptoSource.getRandomValues(bytes);
  const binary = String.fromCharCode(...bytes);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export const isProfileShareToken = token => /^[A-Za-z0-9_-]{22,64}$/.test(String(token || ''));

export const buildProfileShareUrl = (token, origin = typeof window !== 'undefined' ? window.location.origin : '') => {
  const base = process.env.PUBLIC_URL || '/main';
  return `${origin}${base}/p/${token}`;
};

/** Вільний слот або `null`, коли всі п'ять зайняті. */
export const findFreeProfileShareSlot = (slots = {}) => {
  for (let index = 0; index < PROFILE_SHARE_SLOT_COUNT; index += 1) {
    if (!slots?.[String(index)]) return String(index);
  }
  return null;
};

/** Слоти власниці переліком, свіжі першими. */
export const listProfileShareSlots = (slots = {}) => Object.entries(slots || {})
  .filter(([slot, value]) => /^[0-4]$/.test(slot) && value && isProfileShareToken(value.token))
  .map(([slot, value]) => ({ slot, ...value, options: normalizeProfileShareOptions(value.options) }))
  .sort((left, right) => (right.createdAt || 0) - (left.createdAt || 0));

const stableStringify = value => {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

/**
 * Чи треба переписувати знімок. День знімка (`ageAt`) сам по собі причиною
 * не є — інакше кожне відкриття «Мого профілю» писало б у базу.
 */
export const isSameProfileShareCard = (left, right) => {
  const strip = card => {
    if (!card) return card;
    const { ageAt: _ageAt, ...rest } = card;
    return rest;
  };
  return stableStringify(strip(left)) === stableStringify(strip(right));
};

export const sameProfileSharePhotoSources = (left = [], right = []) => (
  stableStringify((left || []).filter(Boolean)) === stableStringify((right || []).filter(Boolean))
);
