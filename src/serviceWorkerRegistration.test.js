import { shouldRegisterServiceWorker } from './serviceWorkerRegistration';

describe('реєстрація service worker', () => {
  const nav = { serviceWorker: {} };

  it('лише в прод-збірці', () => {
    expect(shouldRegisterServiceWorker({ env: { NODE_ENV: 'production' }, nav })).toBe(true);
    expect(shouldRegisterServiceWorker({ env: { NODE_ENV: 'development' }, nav })).toBe(false);
    expect(shouldRegisterServiceWorker({ env: { NODE_ENV: 'test' }, nav })).toBe(false);
  });

  it('аварійний вимикач і браузер без воркерів', () => {
    expect(shouldRegisterServiceWorker({ env: { NODE_ENV: 'production', REACT_APP_DISABLE_SW: 'true' }, nav })).toBe(false);
    expect(shouldRegisterServiceWorker({ env: { NODE_ENV: 'production' }, nav: {} })).toBe(false);
  });
});

describe('service worker', () => {
  // eslint-disable-next-line global-require
  const source = require('fs').readFileSync(require('path').join(__dirname, 'service-worker.js'), 'utf8');

  it('наперед кешує лише оболонку, а не всю збірку', () => {
    // Адмінські рушії PDF/Excel/Word важать ~6 МБ — качати їх кожному
    // відвідувачеві на встановленні воркера не можна.
    expect(source).toContain('const shellManifest = (self.__WB_MANIFEST || [])');
    expect(source).toContain('precacheAndRoute(shellManifest);');
    expect(source).not.toContain('precacheAndRoute(self.__WB_MANIFEST');
  });

  it('сторінка — мережа проти тайм-ауту, інакше оболонка поточної збірки', () => {
    // Тайм-аут діє й тоді, коли копії адреси немає (глибоке посилання),
    // а збереженої HTML минулого деплою немає зовсім.
    expect(source).toContain('const NAVIGATION_TIMEOUT_MS = 3000;');
    expect(source).toContain('await Promise.race([network.catch(() => null), timedOut]);');
    expect(source).toContain("const shell = await matchPrecache('/index.html');");
    expect(source).not.toContain('new NetworkFirst(');
    expect(source).toContain("caches.delete('km-pages')");
  });

  it('не чіпає чужих доменів, крім шрифтів', () => {
    expect(source).toContain('const isOwnOrigin = url => url.origin === self.location.origin;');
    // Коментарі називають Firebase словами — звіряється лише код.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/firebase|identitytoolkit|firebasestorage/i);
  });
});
