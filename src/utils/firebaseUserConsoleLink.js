import { isLongFormatUserId } from './mergeUserCollections';

const FIREBASE_CONSOLE_DATABASE_URL =
  'https://console.firebase.google.com/u/0/project/webringitapp/database/webringitapp-default-rtdb/data';

export const buildUserRtdbLink = (userId, sourceCollection) => {
  const collection = sourceCollection || (isLongFormatUserId(userId) ? 'users' : 'newUsers');
  return `${FIREBASE_CONSOLE_DATABASE_URL}/~2F${collection}~2F${encodeURIComponent(userId || '')}`;
};
