/**
 * Знімки підписок на реакції, які можна прочитати, не питаючи базу вдруге.
 *
 * Стрічка тримає підписку (`onValue`) на обране й приховані кожного власника,
 * а `loadInitial` ще й читав ті самі вузли через `get` — на старті сторінки це
 * два повні читання кожного вузла замість одного. Тепер підписка кладе сюди
 * свій знімок, а читач бере його: одразу, якщо він уже прийшов, або дочекавшись
 * першого. Запасний шлях — звичайне читання: коли підписки на цього власника
 * немає, вона впала або мовчить довше за `waitMs`.
 */
const liveReactionKey = (type, ownerId) => `${type}:${ownerId}`;

export const ensureLiveReactionEntry = (registry, type, ownerId) => {
  const key = liveReactionKey(type, ownerId);
  let entry = registry.get(key);
  if (!entry || entry.failed) {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    entry = { loaded: false, failed: false, value: null, promise, resolve, active: true };
    registry.set(key, entry);
  }
  entry.active = true;
  return entry;
};

export const settleLiveReactionEntry = (entry, value) => {
  if (!entry) return;
  entry.value = value && typeof value === 'object' ? value : {};
  entry.loaded = true;
  entry.resolve(entry.value);
};

export const failLiveReactionEntry = entry => {
  if (!entry) return;
  entry.failed = true;
  entry.resolve(null);
};

export const readLiveReactionSnapshot = async (registry, type, ownerId, fetchFallback, { waitMs = 8000 } = {}) => {
  const entry = registry?.get(liveReactionKey(type, ownerId));
  if (!entry || !entry.active || entry.failed) return fetchFallback(ownerId);
  if (entry.loaded) return entry.value;
  let timer;
  const value = await Promise.race([
    entry.promise,
    new Promise(done => { timer = setTimeout(() => done(undefined), waitMs); }),
  ]);
  clearTimeout(timer);
  return value ? value : fetchFallback(ownerId);
};
