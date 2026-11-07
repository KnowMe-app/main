import { GoogleAuthProvider } from 'firebase/auth';

/**
 * Вхід через Google — третій спосіб поруч із Telegram і поштою (07.11, на
 * прохання власниці продукту: не всі хочуть ділитися номером телефону, а
 * пароль до пошти на телефоні набирають наосліп).
 *
 * Провайдер щоразу питає акаунт (`select_account`): на спільному телефоні
 * інакше Google мовчки підставляв би той, у який браузер уже увійшов.
 */
export const createGoogleAuthProvider = () => {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return provider;
};

/**
 * Що анкета нового акаунта бере з Google: пошту, імʼя й прізвище. Телефону
 * Google не дає — і саме заради цього цей вхід заведено.
 * `profile` — `getAdditionalUserInfo(credential).profile` (`given_name`,
 * `family_name`); без нього імʼя береться з `displayName` цілком.
 */
export const buildGoogleProfileData = (user = {}, profile = {}) => {
  const data = {};
  const email = String(user?.email || profile?.email || '').trim().toLowerCase();
  if (email) data.email = email;
  const givenName = String(profile?.given_name || '').trim();
  const familyName = String(profile?.family_name || '').trim();
  if (givenName) {
    data.name = givenName;
    if (familyName) data.surname = familyName;
  } else {
    const displayName = String(user?.displayName || '').trim();
    if (displayName) data.name = displayName;
  }
  return data;
};

// Людина закрила вікно Google сама — це не помилка, і тост тут зайвий.
export const isGoogleSignInCancelled = error =>
  error?.code === 'auth/popup-closed-by-user' || error?.code === 'auth/cancelled-popup-request' || error?.code === 'auth/user-cancelled';
