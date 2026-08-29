const FIREBASE_CONSOLE_DATABASE_URL =
  'https://console.firebase.google.com/u/0/project/webringitapp/database/webringitapp-default-rtdb/data';

// Legacy-колекція у базі одна — `users`. Посилання веде саме туди, незалежно від
// формату id.
export const buildUserRtdbLink = userId =>
  `${FIREBASE_CONSOLE_DATABASE_URL}/~2Fusers~2F${encodeURIComponent(userId || '')}`;
