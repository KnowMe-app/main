import { fetchPublicProfileCommentsStrict } from 'components/config';

/**
 * Памʼять таба про публічні відгуки картки.
 *
 * Відгуки читаються на кожну відкриту картку, тож ціну цього читання тримає
 * памʼять таба — рівно те саме, що `ownerCommentsSubtreeCache` робить для
 * нотаток: список карток згортають, розгортають і перемальовують десятки разів
 * за сеанс, і без кеша кожен показ коштував би ще одного запиту на картку.
 *
 * Кеш живе **тут, а не в `config.js`**, навмисно: тим самим
 * `fetchPublicProfileCommentsStrict` перенос легасі-відгуків питає базу, чи
 * цей текст у ній уже є, і відповідь із памʼяті означала б другу копію відгуку.
 *
 * А в окремому модулі — а не всередині `renderTopBlock` — тому, що знімати
 * позначку мусить не лише той, хто малює картку. Перенос відгуку з приватної
 * нотатки в публічну (`legacyImportCommentMigration`) пише не через картку, і
 * поки кеш був захований у розмітці, перенесений відгук не зʼявлявся на екрані
 * взагалі: людина бачила ту саму картку без відгуку й списувала це на невдалий
 * перенос. Лікувало лише «Очистити кеш», тобто найгрубіший з можливих жестів.
 */
const PUBLIC_COMMENTS_MEMORY_TTL_MS = 2 * 60 * 1000;
const publicCommentsMemoryCache = new Map();

export const readPublicCommentsCached = (profileId, { force = false } = {}) => {
  const cached = publicCommentsMemoryCache.get(profileId);
  if (!force && cached && Date.now() - cached.cachedAt <= PUBLIC_COMMENTS_MEMORY_TTL_MS) {
    return cached.promise;
  }
  const promise = fetchPublicProfileCommentsStrict([profileId])
    .then(byProfile => byProfile?.[profileId] || [])
    .catch(error => {
      // Відмова в кеші не лишається: інакше наступна картка тієї ж людини
      // отримала б ту саму помилку, не спробувавши читання ще раз.
      publicCommentsMemoryCache.delete(profileId);
      throw error;
    });
  publicCommentsMemoryCache.set(profileId, { promise, cachedAt: Date.now() });
  return promise;
};

/**
 * Подивитись, що вже прочитано, не читаючи.
 *
 * Потрібно тим, хто показує відгуки **поруч** з тим, хто їх читає: блок «усі
 * поля» стоїть у кожній картці списку, і власне читання там коштувало б по
 * запиту на приховану картку. Кеша немає — значить, ніхто ще не питав, і це
 * не те саме, що «відгуків немає»: різницю мусить назвати той, хто показує.
 */
export const peekPublicCommentsCached = profileId => {
  const cached = publicCommentsMemoryCache.get(profileId);
  if (!cached || Date.now() - cached.cachedAt > PUBLIC_COMMENTS_MEMORY_TTL_MS) return null;
  return cached.promise;
};

/**
 * Свій же запис робить кеш застарілим: правку, зняття й перенесений відгук
 * видно одразу, а не через строк памʼяті. Без аргументу — знімає все: перенос
 * партії торкається сотень карток, і перелічувати їх поіменно заради того, щоб
 * зекономити одне читання на відкриту картку, дорожче, ніж просто забути.
 */
export const dropCachedPublicComments = profileId => {
  if (profileId) publicCommentsMemoryCache.delete(profileId);
  else publicCommentsMemoryCache.clear();
};
