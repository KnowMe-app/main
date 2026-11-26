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
