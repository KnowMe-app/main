import {
  updateDataInFiresoreDB,
  updateDataInNewUsersRTDB,
  updateDataInRealtimeDB,
} from './config';

export const MY_PROFILE_DRAFT_STORAGE_KEY = 'myProfileDraft';
export const MY_PROFILE_NEW_ROUTE = '/my-profile-new';

export const isPermissionDeniedError = error => {
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  return code.includes('permission-denied') || code.includes('permission_denied') || message.includes('permission_denied');
};

export const normalizeAuthEmail = email => String(email || '').trim();

export const isValidAuthEmail = email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

export const persistUserWithFallback = async (userId, uploadedInfo, firestoreCondition = 'update') => {
  let shouldWriteFullProfileToNewUsers = false;

  try {
    await updateDataInRealtimeDB(userId, uploadedInfo, firestoreCondition === 'set' ? undefined : 'update');
  } catch (error) {
    if (!isPermissionDeniedError(error)) {
      throw error;
    }
    shouldWriteFullProfileToNewUsers = true;
    console.warn('No write access to users/$uid, fallback to newUsers.');
  }

  try {
    await updateDataInFiresoreDB(userId, uploadedInfo, firestoreCondition);
  } catch (error) {
    shouldWriteFullProfileToNewUsers = true;
    console.warn('Firestore write failed, fallback to newUsers.', error);
  }

  await updateDataInNewUsersRTDB(
    userId,
    shouldWriteFullProfileToNewUsers ? uploadedInfo : { lastLogin2: uploadedInfo.lastLogin2 },
    'update'
  );
};

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
  lastLogin: todayDays,
  lastLogin2: todayDash,
  userId,
  userRole,
});

export const markAuthSession = ({ email, userId }) => {
  localStorage.setItem('isLoggedIn', 'true');
  localStorage.setItem('userEmail', email);
  localStorage.setItem('ownerId', userId);
  localStorage.removeItem(MY_PROFILE_DRAFT_STORAGE_KEY);
};
