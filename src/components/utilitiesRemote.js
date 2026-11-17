import { get, ref } from 'firebase/database';
import { auth, database } from './config';
import { noteRealtimeDemand } from '../utils/realtimeConnectionManager';
import { enqueueOutboxWrite, registerOutboxRejectionHandler } from '../utils/writeOutbox';
import { UTILITIES_OUTBOX_TYPE, clearUtilitiesCache, utilitiesRootPath } from '../utils/utilitiesOfflineWrites';
import { listDataOwners } from './flowOwnersRemote';

/*
 * Комуналка лежить під власником — `multiData/utilities/{uid}` =
 * `{ apartments: {…}, months: { {квартира}: { {РРРР-ММ}: {…} } } }`. Читає й
 * пише сам власник; адміни читають усіх, пишуть у чужу лише двоє повних
 * (правило `multiData/utilities` у `database.rules.json`).
 */

export const fetchUtilitiesData = async ownerId => {
  if (!ownerId) return {};
  // Читання призупиненої бази не падає, а висить (`realtimeConnectionManager`).
  noteRealtimeDemand();
  const snapshot = await get(ref(database, utilitiesRootPath(ownerId)));
  return snapshot.exists() ? snapshot.val() || {} : {};
};

/**
 * Запис через чергу пристрою. Черга належить тому, хто увійшов (а не
 * власникові даних): адмін, що править комуналку учасника без звʼязку, інакше
 * клав би записи в чужу чергу, яку ніхто не досилає (та сама пастка, що
 * вже була у Flow).
 */
export const enqueueUtilitiesPatch = (ownerId, patch) => {
  if (!ownerId || !patch || !Object.keys(patch).length) {
    return { patch: {}, delivered: Promise.resolve() };
  }
  const delivered = enqueueOutboxWrite({
    uid: auth.currentUser?.uid || ownerId,
    patch,
    meta: { type: UTILITIES_OUTBOX_TYPE, ownerId: String(ownerId) },
  });
  return { patch, delivered };
};

// Відмова бази для запису з минулої вкладки: памʼять пристрою несла його як
// збережений — забуваємо її, наступне відкриття візьме правду з бази.
registerOutboxRejectionHandler(UTILITIES_OUTBOX_TYPE, meta => {
  if (meta?.ownerId) clearUtilitiesCache(meta.ownerId);
});

/** Хто з учасників веде комуналку — для вибору адміном, як у Flow. */
export const listUtilitiesOwners = options => listDataOwners('utilities', options);
