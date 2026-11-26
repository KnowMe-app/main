/**
 * Посилання на анкету для кандидаток — `https://knowme.pp.ua/anketa`.
 *
 * Його надсилають лише потенційним донорам ооцитів і сурогатним мамам:
 * людина відкриває анкету одразу, без форми входу, обирає, ким хоче стати, і
 * зберігає заповнене в кінці (пошта й пароль). Агенціям, клінікам і батькам
 * дають звичайний вхід — тому й ролей тут лише дві.
 *
 * Межа входу від цього не слабшає: поки акаунта немає, анкета живе в чернетці
 * пристрою й бази не питає (`MyProfile` з `candidate`), а записує її вже
 * створений акаунт. Анонімного входу Firebase тут немає й не буде — для
 * правил така сесія нічим не відрізнялась би від агенції.
 */
import { getCurrentValue } from '../components/getCurrentValue';
import { rememberPendingProfileEdit } from './myProfilePendingEdits';
import { isSearchIdIndexedField } from './searchKeyUtils';

export const CANDIDATE_ANKETA_ROUTE = '/anketa';

export const CANDIDATE_ANKETA_ROLES = Object.freeze(['sm', 'ed']);

// `?role=sm|ed` обирає роль наперед. Приймаємо й людські скорочення, які
// координатор може дописати руками: «см», «до», «donor», «surrogate».
const ROLE_ALIASES = Object.freeze({
  sm: 'sm',
  'см': 'sm',
  surrogate: 'sm',
  ed: 'ed',
  'до': 'ed',
  do: 'ed',
  donor: 'ed',
});

export const readCandidateRoleFromSearch = search => {
  try {
    const value = new URLSearchParams(String(search || '')).get('role');
    return ROLE_ALIASES[String(value || '').trim().toLowerCase()] || '';
  } catch (error) {
    return '';
  }
};

export const buildCandidateAnketaLink = (origin, role = '') => {
  const base = `${String(origin || '').replace(/\/+$/, '')}${CANDIDATE_ANKETA_ROUTE}`;
  return CANDIDATE_ANKETA_ROLES.includes(role) ? `${base}?role=${role}` : base;
};

// Telegram завершує вхід не тут, а у формі входу (бот, код), і вона мусить
// знати, що нова анкета почалась на посиланні для кандидаток: тоді набране
// до входу (`myProfileDraft`) лягає в нову анкету разом з роллю. Позначка
// живе годину — спроба входу через бота коротша.
export const CANDIDATE_SIGNUP_STORAGE_KEY = 'km.candidateSignup.v1';
const CANDIDATE_SIGNUP_TTL_MS = 60 * 60 * 1000;

export const markCandidateSignup = role => {
  try {
    localStorage.setItem(CANDIDATE_SIGNUP_STORAGE_KEY, JSON.stringify({ role, at: Date.now() }));
  } catch (error) {
    // Без сховища нова анкета однаково заведеться з роллю зі спроби.
  }
};

export const takeCandidateSignup = (now = Date.now()) => {
  try {
    const raw = localStorage.getItem(CANDIDATE_SIGNUP_STORAGE_KEY);
    localStorage.removeItem(CANDIDATE_SIGNUP_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || !CANDIDATE_ANKETA_ROLES.includes(parsed.role)) return null;
    if (!(now - Number(parsed.at) <= CANDIDATE_SIGNUP_TTL_MS)) return null;
    return parsed;
  } catch (error) {
    return null;
  }
};

// Набране кандидаткою до входу (`myProfileDraft` гостьової анкети) — без
// входу, ролі й порожнього: роль дає спроба входу, пошту й номер — сам вхід.
export const CANDIDATE_DRAFT_SKIPPED_FIELDS = new Set([
  'userRole', 'role', 'email', 'password', 'userId', 'areTermsConfirmed',
  'publish', 'publishAudience', 'photos', 'lastLogin', 'lastLogin2', 'registrationDate',
]);

export const cleanCandidateDraft = draft => Object.fromEntries(Object.entries(draft || {})
  .filter(([name, value]) => !CANDIDATE_DRAFT_SKIPPED_FIELDS.has(name)
    && !name.startsWith('__')
    && String(getCurrentValue(value) ?? '').trim() !== ''));

export const readCandidateDraftFields = () => {
  try {
    return cleanCandidateDraft(JSON.parse(localStorage.getItem('myProfileDraft') || '{}') || {});
  } catch (error) {
    return {};
  }
};

// Кандидатка з посилання вже заповнила анкету, а вхід відкрив наявний
// акаунт: набране не губимо, але й наявного не переписуємо — лише порожні
// поля анкети стають незбереженими правками, і «Мій профіль» дописує їх на
// відкритті (`utils/myProfilePendingEdits`). Спільне для пошти, Google і
// Telegram: поки Telegram цього не робив, вхід наявним акаунтом через бота
// стирав набране разом з чернеткою (`markAuthSession`).
export const rememberCandidateDraftForExistingAccount = (uid, existing, draft) => {
  const base = existing || {};
  Object.entries(cleanCandidateDraft(draft)).forEach(([name, value]) => {
    if (String(getCurrentValue(base[name]) ?? '').trim() !== '') return;
    rememberPendingProfileEdit(uid, name, value, { searchId: isSearchIdIndexedField(name) });
  });
};
