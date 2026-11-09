// jest-environment-jsdom doesn't expose TextEncoder/TextDecoder, which @react-pdf/renderer's
// font engine (fontkit) needs even just to be imported. Any test that pulls in a module importing
// @react-pdf/renderer needs this polyfilled before that import runs.
const { TextEncoder, TextDecoder } = require('util');

if (typeof global.TextEncoder === 'undefined') global.TextEncoder = TextEncoder;
if (typeof global.TextDecoder === 'undefined') global.TextDecoder = TextDecoder;

// Конфіг Firebase у тестах — фіктивний, якщо справжнього в оточенні немає.
// `config.js` викликає `getAuth(app)` ще під час імпорту, і без ключа той
// кидає `auth/invalid-api-key`: у веб-сесії змінні лежать в оточенні, а на
// раннері CI їх немає, тож ті самі 22 сюїти були зелені локально й червоні в
// CI. Мережі тести не питають — значення лише мусять мати правильну форму.
const TEST_FIREBASE_ENV = {
  REACT_APP_API_KEY: 'test-api-key',
  REACT_APP_AUTH_DOMAIN: 'demo-knowme.firebaseapp.com',
  REACT_APP_DATABASE_URL: 'https://demo-knowme-default-rtdb.firebaseio.com',
  REACT_APP_PROJECT_ID: 'demo-knowme',
  REACT_APP_STORAGE_BUCKET: 'demo-knowme.appspot.com',
  REACT_APP_MESSAGING_SENDER_ID: '0',
  REACT_APP_APP_ID: '1:0:web:0',
};
Object.entries(TEST_FIREBASE_ENV).forEach(([key, value]) => {
  if (!process.env[key]) process.env[key] = value;
});
