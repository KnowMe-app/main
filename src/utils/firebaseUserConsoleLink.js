const FIREBASE_CONSOLE_DATABASE_URL =
  'https://console.firebase.google.com/u/0/project/webringitapp/database/webringitapp-default-rtdb/data';

// Посилання на картку стрічки: вона є в кожної анкети, тоді як legacy `users`
// закрито й видалено з правил.
export const buildUserRtdbLink = userId =>
  `${FIREBASE_CONSOLE_DATABASE_URL}/~2FmatchingCards~2F${encodeURIComponent(userId || '')}`;
