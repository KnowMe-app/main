import {
  syncUserSearchIdIndex,
  syncUserSearchKeyIndex,
  updateDataInFiresoreDB,
  updateDataInRealtimeDB,
  updateProfileNodesInRTDB,
} from './config';

export const MY_PROFILE_DRAFT_STORAGE_KEY = 'myProfileDraft';
export const MY_PROFILE_ROUTE = '/my-profile';

export const isPermissionDeniedError = error => {
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  return code.includes('permission-denied') || code.includes('permission_denied') || message.includes('permission_denied');
};

export const normalizeAuthEmail = email => String(email || '').trim();

export const isValidAuthEmail = email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

// Канонічне місце анкети акаунта — `users` (її читає мобільний застосунок) і
// Firestore. Коли туди не пускають права, анкета все одно мусить десь бути: тоді
// вона цілком їде у вузли профілю, на які власник акаунта право має завжди.
export const persistUserWithFallback = async (userId, uploadedInfo, firestoreCondition = 'update') => {
  let canonicalWriteFailed = false;

  try {
    await updateDataInRealtimeDB(userId, uploadedInfo, firestoreCondition === 'set' ? undefined : 'update');
  } catch (error) {
    if (!isPermissionDeniedError(error)) {
      throw error;
    }
    canonicalWriteFailed = true;
    console.warn('No write access to users/$uid, falling back to the profile nodes.');
  }

  try {
    await updateDataInFiresoreDB(userId, uploadedInfo, firestoreCondition);
  } catch (error) {
    canonicalWriteFailed = true;
    console.warn('Firestore write failed, falling back to the profile nodes.', error);
  }

  if (canonicalWriteFailed) {
    await updateProfileNodesInRTDB(userId, uploadedInfo, 'update');
  }

  // Реєстрація — це поява анкети, тож тут же зʼявляються і її пошукові індекси.
  //
  // Проєкцію під стрічку писачі оновлюють самі, а `searchId` і `searchKey` досі
  // не писав ніхто: щойно зареєстрований акаунт не знаходився ні за поштою, ні
  // за іменем, доки власник не відкриє й не збереже анкету вручну. Індекси —
  // прискорення читання, а не частина реєстрації, тож збій тут її не валить.
  if (firestoreCondition !== 'set') return;
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
