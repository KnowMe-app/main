import {
  recordDailyLogin,
  syncUserSearchIdIndex,
  syncUserSearchKeyIndex,
  updateDataInRealtimeDB,
} from './config';

export const MY_PROFILE_DRAFT_STORAGE_KEY = 'myProfileDraft';
export const MY_PROFILE_ROUTE = '/my-profile';

export const normalizeAuthEmail = email => String(email || '').trim();

export const isValidAuthEmail = email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

// Анкета акаунта лягає у вузли профілю (`updateDataInRealtimeDB`), і тільки в
// них. Тут стояв ще запис у Firestore й «запасний шлях»: коли один із двох
// записів падав, анкета вдруге їхала в ті самі вузли. Той повтор нічого не
// рятував — відмова вузлів повторювалась, а падіння Firestore лише
// перезаписувало вже збережене, — тож відмова тепер просто доходить до того,
// хто кликав: людина мусить знати, що анкета не збереглась.
// `revisionNeutral` — запис, що анкети не міняє (вхід: дата входу, згода й та
// сама пошта). Без позначки кожен вхід поштою ставив би нову версію анкети
// (`rev`) і скидав її кеш у всіх читачів.
// Запис самого входу (дата, згода, та сама пошта) картки стрічки не міняє, а
// загальний писач після нього перечитував анкету з усіх вузлів і збирав картку
// заново — друге повне читання власної анкети на кожному вході (заміряно
// наживо 13.11: вхід агенції — три повні читання, одне з них саме це). Такий
// запис іде тим самим точковим шляхом, що й щоденна дата входу.
const LOGIN_ONLY_FIELDS = new Set(['email', 'areTermsConfirmed', 'lastLogin', 'lastLogin2', 'userId']);
const isLoginOnlyPayload = payload => Boolean(payload)
  && typeof payload === 'object'
  && Boolean(payload.lastLogin2)
  && Object.keys(payload).every(key => LOGIN_ONLY_FIELDS.has(key));

export const persistAccountProfile = async (userId, uploadedInfo, mode = 'update', { revisionNeutral = false } = {}) => {
  if (mode !== 'set' && revisionNeutral && isLoginOnlyPayload(uploadedInfo)) {
    const extra = Object.fromEntries(Object.entries(uploadedInfo)
      .filter(([key]) => key === 'email' || key === 'areTermsConfirmed'));
    await recordDailyLogin(userId, uploadedInfo.lastLogin2, extra);
    return;
  }
  await updateDataInRealtimeDB(userId, uploadedInfo, mode === 'set' ? undefined : 'update', { revisionNeutral });

  // Реєстрація — це поява анкети, тож тут же зʼявляються і її пошукові індекси.
  //
  // Проєкцію під стрічку писачі оновлюють самі, а `searchId` і `searchKey` досі
  // не писав ніхто: щойно зареєстрований акаунт не знаходився ні за поштою, ні
  // за іменем, доки власник не відкриє й не збереже анкету вручну. Індекси —
  // прискорення читання, а не частина реєстрації, тож збій тут її не валить.
  if (mode !== 'set') return;
  await Promise.all([
    syncUserSearchIdIndex(userId, {}, uploadedInfo).catch(error => {
      console.warn('[registration] не вдалося оновити searchId', error);
    }),
    syncUserSearchKeyIndex(userId, {}, uploadedInfo).catch(error => {
      console.warn('[registration] не вдалося оновити searchKey', error);
    }),
  ]);
};

export const buildAuthSessionPayload = ({ todayDays, todayDash }) => ({
  lastLogin: todayDays,
  lastLogin2: todayDash,
});

/**
 * Що пише вхід у вже наявний акаунт: дату входу й згоду з умовами — і більше
 * нічого.
 *
 * Роль тут стояла, і вхід її **переписував**: форма щоразу вимагала обрати
 * роль, пропонувала з п'яти лише дві («донорка», «агенція») і клала вибране в
 * анкету. Батьки, які просто заходили в застосунок, після кожного входу ставали
 * донорками чи агенціями, а «Мій профіль» (тоді він читав Firestore) показував роль
 * з останнього входу замість тієї, яку людина обрала в ньому ж. Роль
 * обирається при реєстрації й міняється в «Моєму профілі» — окремим шляхом
 * (`updateProfileRole`).
 */
export const buildAuthLoginPayload = ({ email, userId, todayDays, todayDash }) => ({
  email,
  areTermsConfirmed: todayDays,
  ...buildAuthSessionPayload({ todayDays, todayDash }),
  userId,
});

export const buildAuthProfilePayload = ({
  email,
  userId,
  userRole = 'ed',
  todayDays,
  todayDash,
  isRegistration = false,
  extraProfileData = {},
}) => ({
  ...extraProfileData,
  email,
  areTermsConfirmed: todayDays,
  ...(isRegistration ? { registrationDate: todayDays } : {}),
  ...buildAuthSessionPayload({ todayDays, todayDash }),
  userId,
  userRole,
});

export const markAuthSession = ({ email, userId }) => {
  localStorage.setItem('isLoggedIn', 'true');
  localStorage.setItem('userEmail', email);
  localStorage.setItem('ownerId', userId);
  localStorage.removeItem(MY_PROFILE_DRAFT_STORAGE_KEY);
};
