/**
 * Реєстрація service worker (`src/service-worker.js`): лише в прод-збірці й
 * лише там, де браузер його вміє. У режимі розробки воркер віддавав би старі
 * файли поверх гарячого перезавантаження, тож там його немає зовсім.
 *
 * `REACT_APP_DISABLE_SW=true` у збірці — аварійний вимикач: замість реєстрації
 * знімає вже встановлені воркери й їхні кеші. Так воркер, що повівся б не
 * так, прибирається одним деплоєм без нового коду.
 */
export const shouldRegisterServiceWorker = ({
  env = process.env,
  nav = typeof navigator !== 'undefined' ? navigator : null,
} = {}) => (
  env.NODE_ENV === 'production'
  && env.REACT_APP_DISABLE_SW !== 'true'
  && Boolean(nav && 'serviceWorker' in nav)
);

const unregisterAll = async () => {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map(registration => registration.unregister()));
  if (typeof caches !== 'undefined') {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('km-') || key.startsWith('workbox-')).map(key => caches.delete(key)));
  }
};

export const registerServiceWorker = () => {
  if (process.env.REACT_APP_DISABLE_SW === 'true') {
    unregisterAll().catch(() => {});
    return;
  }
  if (!shouldRegisterServiceWorker()) return;
  // Після `load`: реєстрація не має змагатися з першим кадром за мережу.
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${process.env.PUBLIC_URL || ''}/service-worker.js`)
      .catch(error => console.warn('[sw] не вдалося зареєструвати service worker', error));
  });
};
