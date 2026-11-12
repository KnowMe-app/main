/* eslint-disable no-restricted-globals */
/**
 * Service worker KnowMe — застосунок відкривається з пристрою, а не з мережі.
 *
 * Чому. Без нього кожне відкриття качало оболонку з GitHub Pages, тож без
 * інтернету застосунок не відкривався зовсім, хоч стрічка, «Мій профіль» і
 * черга записів (`utils/writeOutbox`) уже вміють працювати з памʼяті
 * пристрою. Тепер:
 *
 * - **файли збірки** (`/static/…`, імʼя з хешем, тож вміст під ним не
 *   міняється ніколи) — з кешу пристрою, мережа їм не потрібна;
 * - **сторінка** (навігація) — мережа проти тайм-ауту: встигла за 3 с —
 *   свіжа сторінка (деплой приходить одразу), ні чи без звʼязку — оболонка з
 *   precache (`index.html` поточної збірки);
 * - наперед кешується **лише оболонка** (`index.html`, головний JS і CSS):
 *   у збірці ще й адмінські рушії PDF, Excel і Word (~6 МБ), і качати їх
 *   кожному відвідувачеві на встановленні не можна. Решта лягає в кеш, щойно
 *   браузер її вперше бере, — зокрема через `webpackPrefetch` стрічки й
 *   «Мого профілю» в `App.jsx`.
 *
 * Чужі домени (Firebase Auth, база, Storage з фото) він не чіпає: база й так
 * живе на WebSocket, фото браузер кешує сам на рік (`AVATAR_CACHE_CONTROL`), а
 * запит входу з кешу був би помилкою.
 *
 * Новий деплой: новий воркер ставиться у фоні й одразу бере сторінки
 * (`skipWaiting` + `clientsClaim`). Вкладці, відкритій до деплою, старі
 * файли збірки лишаються в кеші, тож лінивий екран не падає з
 * `ChunkLoadError` (його лікує `ScreenErrorBoundary`, але тепер рідше).
 * Вимкнути воркер без нового коду — `REACT_APP_DISABLE_SW=true` у збірці
 * (`serviceWorkerRegistration`).
 */
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, matchPrecache, precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

const SHELL_PATTERNS = [
  /\/index\.html$/,
  /\/static\/js\/main\.[\w]+\.js$/,
  /\/static\/css\/main\.[\w]+\.css$/,
  /\/manifest\.json$/,
];

// Лише оболонка — див. шапку файлу. Решта збірки кешується при першому
// запиті (маршрут `/static/` нижче).
const shellManifest = (self.__WB_MANIFEST || [])
  .filter(entry => SHELL_PATTERNS.some(pattern => pattern.test(typeof entry === 'string' ? entry : entry.url)));

clientsClaim();
self.skipWaiting();
cleanupOutdatedCaches();
precacheAndRoute(shellManifest);

const isOwnOrigin = url => url.origin === self.location.origin;

// Файли збірки: імʼя з хешем, тож копія з кешу завжди та сама, що в мережі.
registerRoute(
  ({ url }) => isOwnOrigin(url) && (url.pathname.startsWith('/static/') || url.pathname.startsWith('/fonts/')),
  new CacheFirst({
    cacheName: 'km-static',
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: 300, maxAgeSeconds: 60 * 24 * 60 * 60, purgeOnQuotaError: true }),
    ],
  }),
);

// Шрифти Google: таблиця — оновлюється у фоні, самі файли — з кешу.
registerRoute(
  ({ url }) => url.origin === 'https://fonts.googleapis.com',
  new StaleWhileRevalidate({ cacheName: 'km-font-css' }),
);
registerRoute(
  ({ url }) => url.origin === 'https://fonts.gstatic.com',
  new CacheFirst({
    cacheName: 'km-font-files',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 365 * 24 * 60 * 60 }),
    ],
  }),
);

// Сторінка: мережа проти тайм-ауту, а не `NetworkFirst`.
//
// Окремого кешу сторінок (`km-pages`) тут був і пішов. По-перше, тайм-аут
// `NetworkFirst` лише заглядає в кеш цієї адреси, а промахнувшись, чекає
// мережу далі: глибоке посилання (`/matching`) на GitHub Pages приходить як
// `404.html` і в кеш не лягає ніколи, тож на завислому звʼязку сторінка
// висіла без кінця, а оболонка нижче була недосяжна. По-друге, збережена
// HTML переживала деплой і посилалась на головні JS/CSS, які precache нової
// збірки вже прибрав, — застосунок без звʼязку не стартував зовсім.
// Будь-яка адреса застосунку — та сама оболонка, а поточна оболонка вже лежить
// у precache разом із файлами, на які посилається, — її й віддаємо.
const NAVIGATION_TIMEOUT_MS = 3000;

registerRoute(
  ({ request, url }) => request.mode === 'navigate' && isOwnOrigin(url),
  async ({ request }) => {
    const network = fetch(request);
    let timer = null;
    const timedOut = new Promise(resolve => {
      timer = setTimeout(() => resolve(null), NAVIGATION_TIMEOUT_MS);
    });
    try {
      const response = await Promise.race([network.catch(() => null), timedOut]);
      if (response) return response;
    } finally {
      clearTimeout(timer);
    }
    const shell = await matchPrecache('/index.html');
    if (shell) return shell;
    // Оболонки немає (воркер щойно ставиться) — дочекатись мережі як є.
    return network.catch(() => Response.error());
  },
);

// Кеш сторінок попередньої версії воркера — див. вище, чому його більше немає.
self.addEventListener('activate', event => {
  event.waitUntil(caches.delete('km-pages'));
});
