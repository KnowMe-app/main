import { get as firebaseGet, push, ref as ref2, remove, runTransaction, set, update } from 'firebase/database';
import { withAdminDownloadToast } from 'utils/backendDownloadToast';
import { isLongFormatUserId } from 'utils/userIdFormat';
import { mergeProfileNodes } from 'utils/profileNodeMerge';
import { PROFILE_NODES } from 'utils/profileNodeSchema';
import { buildSearchIdValueKey, SEARCH_ID_INDEXED_FIELDS } from 'utils/searchKeyUtils';
import {
  forgetOwnOverlayCardLocally,
  readOwnOverlayCardIds,
  rememberOwnOverlayCardLocally,
} from 'utils/ownOverlayCardsStorage';

import { database, updateSearchId } from 'components/config';

const get = (...args) =>
  withAdminDownloadToast(firebaseGet(...args), {
    operation: 'get',
    source: 'multiAccountEdits',
    path: args[0],
  });

const EDITS_ROOT = 'multiData/edits';
// Append-only journal of every overlay change ever written for a card. The
// overlay node itself only ever holds an editor's *current* delta (each save
// rewrites it), so without this log an earlier edit is unrecoverable the
// moment its author edits the same field again. Only admins read it - other
// editors see the stacked result, never who changed what or what came before.
const EDITS_HISTORY_ROOT = 'multiData/editsHistory';
// A durable roster of everybody who has ever edited a card. The overlay node
// is emptied as soon as an edit is settled - and its journal entries are
// purged with it - so by the time the card is published there is nothing left
// to tell who worked on it. Those editors must keep access to the card they
// helped build, so their ids are recorded here once and never removed.
const EDITS_CONTRIBUTORS_ROOT = 'multiData/editsContributors';
// Перелік карток, які доповнював один читач, — під його власним uid.
//
// Оверлеї лежать під карткою, тож без цього вузла питання «що я дописував»
// коштує читання на кожен рядок стрічки. Пишеться він best-effort, як і
// журнал: доповнення дорожче за свій індекс.
const EDITS_BY_EDITOR_ROOT = 'multiData/editsByEditor';
const TECHNICAL_FIELD_NAMES = new Set(['lastAction', 'cachedAt', 'cacheVersion']);

const isPlainObject = value => value && typeof value === 'object' && !Array.isArray(value);

const normalizeArray = value => {
  if (Array.isArray(value)) {
    // Empty rows are a form affordance, not card data. A cleared value is
    // represented by `removed` against the canonical array and preserved in
    // editsHistory, rather than by adding an empty historical value.
    return value.filter(item => item !== undefined && item !== null && item !== '');
  }
  if (value === undefined || value === null || value === '') {
    return [];
  }
  return [value];
};

const uniq = values => Array.from(new Set(values));

const areArraysEqual = (a, b) => {
  if (a.length !== b.length) return false;
  return a.every((item, idx) => item === b[idx]);
};

const shouldSkipField = key => key === 'userId' || key === 'photos';

const normalizeCardKey = value => String(value || '').trim();
const shouldDropOverlayByFieldNames = fieldNames => {
  if (!Array.isArray(fieldNames) || !fieldNames.length) return true;
  return fieldNames.every(fieldName => TECHNICAL_FIELD_NAMES.has(fieldName));
};

const cleanupOverlayIfOnlyTechnicalFields = async ({ editorUserId, cardUserId }) => {
  if (!editorUserId || !cardUserId) return;

  const editorRef = ref2(database, `${EDITS_ROOT}/${cardUserId}/${editorUserId}`);
  const fieldsSnapshot = await get(ref2(database, `${EDITS_ROOT}/${cardUserId}/${editorUserId}/fields`));
  if (!fieldsSnapshot?.exists?.()) {
    await remove(editorRef);
    await forgetOwnOverlayCard({ cardUserId, editorUserId });
    return;
  }

  const fieldNames = Object.keys(fieldsSnapshot.val() || {});
  if (shouldDropOverlayByFieldNames(fieldNames)) {
    await remove(editorRef);
    await forgetOwnOverlayCard({ cardUserId, editorUserId });
  }
};

const normalizeEditorNode = (overlay, cardUserId, editorUserId) => {
  if (!isPlainObject(overlay) || !isPlainObject(overlay.fields)) return null;

  return {
    fields: overlay.fields,
    updatedAt: overlay.updatedAt || null,
    cardUserId: overlay.cardUserId || cardUserId,
    editorUserId: overlay.editorUserId || editorUserId,
    ...(overlay.adminOnly === true ? { adminOnly: true } : {}),
  };
};

// Куди дзеркалити запис. Не щоб узяти звідти дані — їх веб бере з вузлів, — а
// щоб не завести в legacy нового тіла: анкети, створені у вебі, живуть лише у
// вузлах.
//
// Відповідь дає сам id, без жодного читання: довгий — це Firebase-Auth UID,
// тобто анкета акаунта; короткий — картка, заведена в застосунку, і
// legacy-тіла вона не має. Раніше на короткому id тут стояло читання
// `users/{id}` — останнє в цьому файлі й одне з останніх у вебі; тепер читань
// legacy-колекції в коді немає взагалі.
//
// `null` означає «legacy-тіла немає»: писати таку анкету треба лише у вузли.
export const getCardLegacyCollection = async cardUserId => {
  const normalizedCardId = normalizeCardKey(cardUserId);
  if (!normalizedCardId) return null;
  return isLongFormatUserId(normalizedCardId) ? 'users' : null;
};

export const getCanonicalCard = async cardUserId => {
  // Анкета живе у вузлах — і тільки в них. Legacy-колекція сюди не входить:
  // веб із неї не читає, вона лишилась адресатом дзеркального запису для
  // мобільного застосунку. Інакше чернетка правки складалася б із копії, у
  // якій ще лежить те, що у вебі вже стерли.
  const paths = [
    PROFILE_NODES.matchingCards,
    PROFILE_NODES.profileDetails,
    PROFILE_NODES.profileContacts,
    PROFILE_NODES.profileWorkflow,
    PROFILE_NODES.profileTechnical,
  ];
  const snapshots = await Promise.all(paths.map(path => get(ref2(database, `${path}/${cardUserId}`))));
  const values = snapshots.map(snapshot => (snapshot.exists() ? snapshot.val() : null));
  const [card, details, contacts, workflow, technical] = values;

  const merged = mergeProfileNodes({
    userId: cardUserId,
    card,
    details,
    contacts,
    workflow,
    technical,
  }) || { userId: cardUserId };
  // Кеш-мітки не мають права дожити до чернетки: у legacy-рядках вони лежать
  // записаними, а `mergeProfileNodes` ставить `__photosHydrated` сам.
  delete merged.__sourceCollection;
  delete merged.__photosHydrated;
  return merged;
};

export const buildOverlayFromDraft = (canonical, draft) => {
  if (!draft || typeof draft !== 'object') return {};

  const overlayFields = {};
  const keys = new Set([...Object.keys(canonical || {}), ...Object.keys(draft || {})]);

  keys.forEach(key => {
    if (shouldSkipField(key)) return;

    const mainValue = canonical?.[key];
    const draftValue = draft?.[key];

    if (Array.isArray(mainValue) || Array.isArray(draftValue)) {
      const mainArray = uniq(normalizeArray(mainValue));
      const draftArray = uniq(normalizeArray(draftValue));
      const added = draftArray.filter(item => !mainArray.includes(item));
      const removed = mainArray.filter(item => !draftArray.includes(item));
      if (added.length || removed.length) {
        overlayFields[key] = {
          ...(added.length ? { added } : {}),
          ...(removed.length ? { removed } : {}),
        };
      }
      return;
    }

    const safeMain = mainValue ?? '';
    const safeDraft = draftValue ?? '';

    if (safeMain !== safeDraft) {
      overlayFields[key] = { from: safeMain, to: safeDraft };
    }
  });

  return overlayFields;
};

/**
 * Значення, які доповнення подало в картку, — разом із полем.
 *
 * Оверлей — це те, що читач знає про людину понад картку, і знає він це
 * зазвичай саме тому, що шукав її за цим значенням. Тож дописаний телефон має
 * потрапити в `searchId`: інакше наступний пошук за ним не знаходить нічого, і
 * той самий читач заводить дубль тієї самої людини.
 *
 * Береться лише те, що доповнення **додає**: `added` і нове значення заміни.
 * `removed` в індексі не чіпається навмисно — прибране в оверлеї ще не прибране
 * в анкеті, а знімає ключ лише явний намір адміна (див. `pruneSearchIdValues`).
 */
export const collectOverlayIndexValues = (fields = {}) =>
  Object.entries(normalizeOverlayFields(fields)).flatMap(([fieldName, change]) => {
    if (!isPlainObject(change) || !SEARCH_ID_INDEXED_FIELDS.has(fieldName)) return [];
    const values = 'to' in change ? [change.to] : normalizeArray(change.added);
    return uniq(values.map(value => String(value ?? '').trim()).filter(Boolean))
      .map(value => ({ field: fieldName, value }));
  });

/**
 * Індексується весь поточний оверлей, а не сама лише різниця цього збереження:
 * значення, яке не записалось першого разу (правила, мережа), інакше не
 * потрапило б у пошук уже ніколи. Ціну повторів тримає памʼять таба всередині
 * `updateSearchId`, а відмова там не валить збереження — доповнення дорожче за
 * ключ індексу.
 */
const indexOverlayValuesInSearchId = async ({ cardUserId, fields }) => {
  for (const { field, value } of collectOverlayIndexValues(fields)) {
    // eslint-disable-next-line no-await-in-loop
    await updateSearchId(field, value, cardUserId, 'add');
  }
};

export const saveOverlayForUserCard = async ({ editorUserId, cardUserId, fields }) => {
  if (!editorUserId || !cardUserId) return;

  const normalizedCardId = normalizeCardKey(cardUserId);
  if (!normalizedCardId) return;

  const cardRef = ref2(database, `${EDITS_ROOT}/${normalizedCardId}/${editorUserId}`);
  const sanitized = Object.entries(fields || {}).reduce((acc, [fieldName, change]) => {
    if (!isPlainObject(change)) return acc;

    if ('from' in change || 'to' in change) {
      const from = change.from ?? '';
      const to = change.to ?? '';
      if (from === to) return acc;
      acc[fieldName] = { from, to };
      return acc;
    }

    const added = uniq(normalizeArray(change.added));
    const removed = uniq(normalizeArray(change.removed));
    if (!added.length && !removed.length) return acc;

    acc[fieldName] = {
      ...(added.length ? { added } : {}),
      ...(removed.length ? { removed } : {}),
    };

    return acc;
  }, {});

  if (shouldDropOverlayByFieldNames(Object.keys(sanitized))) {
    await remove(cardRef);
    await forgetOwnOverlayCard({ cardUserId: normalizedCardId, editorUserId });
    return;
  }

  let previousFields = null;
  try {
    const previousSnapshot = await get(ref2(database, `${EDITS_ROOT}/${normalizedCardId}/${editorUserId}/fields`));
    previousFields = previousSnapshot?.exists?.() ? previousSnapshot.val() : null;
  } catch {
    previousFields = null;
  }

  await set(cardRef, { fields: sanitized, updatedAt: Date.now(), cardUserId: normalizedCardId, editorUserId });

  await rememberCardContributor({ cardUserId: normalizedCardId, editorUserId });

  await rememberOwnOverlayCard({ cardUserId: normalizedCardId, editorUserId });

  // Після запису оверлея, а не до нього: право дописати id у `searchId` дають
  // правила саме за наявністю оверлея цього редактора на цій картці.
  await indexOverlayValuesInSearchId({ cardUserId: normalizedCardId, fields: sanitized });

  await appendOverlayHistory({
    cardUserId: normalizedCardId,
    editorUserId,
    action: 'edit',
    fields: diffOverlayFields(previousFields, sanitized),
  });
};

/**
 * Позначка «цю картку я доповнював» — і в базі, і в памʼяті пристрою.
 *
 * Стрічка питає її, щоб не читати оверлей на кожен свій рядок: питання
 * «у яких із цих карток лежить мій шар» коштує один запит за списком, а не
 * сотню за вузлами. Запис best-effort: доповнення вже збережене, і втрата
 * позначки коштує лише того, що шар не ляже на рядок стрічки — у видачі
 * пошуку й у формі він видно однаково.
 *
 * Локальна копія ставиться завжди й першою: правила бази викочуються руками,
 * і поки нового вузла в них немає, тільки вона й лишається.
 */
export const rememberOwnOverlayCard = async ({ editorUserId, cardUserId }) => {
  const normalizedCardId = normalizeCardKey(cardUserId);
  if (!normalizedCardId || !editorUserId) return false;

  rememberOwnOverlayCardLocally(editorUserId, normalizedCardId);

  try {
    await update(ref2(database, `${EDITS_BY_EDITOR_ROOT}/${editorUserId}`), {
      [normalizedCardId]: Date.now(),
    });
    return true;
  } catch (error) {
    console.warn('[multiAccountEdits] own overlay index unavailable', error);
    return false;
  }
};

export const forgetOwnOverlayCard = async ({ editorUserId, cardUserId }) => {
  const normalizedCardId = normalizeCardKey(cardUserId);
  if (!normalizedCardId || !editorUserId) return;

  forgetOwnOverlayCardLocally(editorUserId, normalizedCardId);

  try {
    await remove(ref2(database, `${EDITS_BY_EDITOR_ROOT}/${editorUserId}/${normalizedCardId}`));
  } catch (error) {
    console.warn('[multiAccountEdits] own overlay index cleanup failed', error);
  }
};

/**
 * Картки, у яких у цього читача лежить власний шар.
 *
 * Відповідь зводиться з двох джерел, і жодне з них не повне саме по собі:
 * вузол `editsByEditor` знає дописане з будь-якого пристрою, але зʼявляється
 * лише після ручного викочування правил; `localStorage` знає дописане в цьому
 * браузері — зокрема й до того викочування. Відмова читання не порожній
 * список, а просто менше знань: лишається локальна памʼять.
 */
export const getOwnOverlayCardIndex = async editorUserId => {
  if (!editorUserId) return { cardUserIds: [], remoteCardUserIds: [] };

  const ids = new Set(readOwnOverlayCardIds(editorUserId));
  const remoteIds = new Set();

  try {
    const snapshot = await get(ref2(database, `${EDITS_BY_EDITOR_ROOT}/${editorUserId}`));
    if (snapshot?.exists?.()) {
      Object.entries(snapshot.val() || {}).forEach(([cardUserId, value]) => {
        if (value) {
          ids.add(cardUserId);
          remoteIds.add(cardUserId);
        }
      });
    }
  } catch (error) {
    console.warn('[multiAccountEdits] own overlay index unreadable', error);
  }

  return {
    cardUserIds: Array.from(ids).filter(Boolean),
    remoteCardUserIds: Array.from(remoteIds).filter(Boolean),
  };
};

export const getOwnOverlayCardIds = async editorUserId => (
  await getOwnOverlayCardIndex(editorUserId)
).cardUserIds;

// Best-effort by design, like the journal: an editor's save must not fail
// because the roster could not be written.
export const rememberCardContributor = async ({ cardUserId, editorUserId }) => {
  const normalizedCardId = normalizeCardKey(cardUserId);
  if (!normalizedCardId || !editorUserId) return false;

  try {
    await update(ref2(database, `${EDITS_CONTRIBUTORS_ROOT}/${normalizedCardId}`), {
      [editorUserId]: Date.now(),
    });
    return true;
  } catch (error) {
    console.warn('[multiAccountEdits] failed to remember card contributor', error);
    return false;
  }
};

// Everybody who should keep access to the card once it is published: the
// roster above, plus whoever still has an unsettled overlay on it (a card
// edited before the roster existed has only the latter).
export const getCardContributorIds = async cardUserId => {
  const normalizedCardId = normalizeCardKey(cardUserId);
  if (!normalizedCardId) return [];

  const contributors = new Set();

  try {
    const snapshot = await get(ref2(database, `${EDITS_CONTRIBUTORS_ROOT}/${normalizedCardId}`));
    if (snapshot?.exists?.()) Object.keys(snapshot.val() || {}).forEach(editorUserId => contributors.add(editorUserId));
  } catch (error) {
    console.warn('[multiAccountEdits] contributors roster unavailable', error);
  }

  try {
    Object.keys(await getOverlaysForCard(normalizedCardId)).forEach(editorUserId => contributors.add(editorUserId));
  } catch (error) {
    console.warn('[multiAccountEdits] pending overlays unavailable', error);
  }

  return Array.from(contributors).filter(Boolean);
};

/**
 * Власне доповнення читача до кількох карток — і більше нічого.
 *
 * Видача пошуку мусить показувати те, що читач сам дописав у знайдену картку:
 * інакше він доповнює її, шукає вдруге й бачить ту саму картку без своїх даних —
 * тобто не знає, чи його правка взагалі збереглась. Чужих оверлеїв тут немає
 * навмисно: рядок видачі показує картку плюс власне доповнення, а не зведення
 * всіх редакторів (його показує форма, і лише тому, хто її відкрив).
 *
 * Читається рівно вузол `{картка}/{редактор}`, по одному на показану знайдену
 * картку, і лише в режимі пошуку: у стрічці рядків сотні, і читання «на кожну
 * картку» там коштує рівно те, від чого стрічку відмивали
 * (`docs/matching-feed-traffic.md`). Відмова читання — це порожній оверлей, а
 * не поламана видача.
 */
export const getOwnOverlayFieldsForCards = async ({
  editorUserId,
  cardUserIds = [],
  remotelyIndexedCardUserIds = [],
}) => {
  if (!editorUserId) return {};

  const ids = uniq(cardUserIds.map(normalizeCardKey).filter(Boolean));
  if (!ids.length) return {};
  const remotelyIndexedIds = new Set(Array.from(remotelyIndexedCardUserIds || [], normalizeCardKey));

  const entries = await Promise.all(ids.map(async cardUserId => {
    try {
      const snapshot = await get(ref2(database, `${EDITS_ROOT}/${cardUserId}/${editorUserId}/fields`));
      const fields = snapshot?.exists?.() ? snapshot.val() : null;
      const normalizedFields = isPlainObject(fields) ? normalizeOverlayFields(fields) : {};
      // Старі оверлеї з'явилися раніше за обернений індекс. Пошук усе ще
      // читає їх напряму, тож використай це відкриття як ледачу міграцію:
      // наступне повернення до звичайної стрічки вже знайде цю картку через
      // `editsByEditor` (а цей браузер — ще й через локальну пам'ять).
      if (Object.keys(normalizedFields).length && !remotelyIndexedIds.has(cardUserId)) {
        // Міграція best-effort і не є частиною читання: шар уже знайдено, тож
        // не затримуй його показ ще одним мережевим кругом заради індексу.
        void rememberOwnOverlayCard({ editorUserId, cardUserId });
      }
      return [cardUserId, normalizedFields];
    } catch (error) {
      console.warn('[multiAccountEdits] own overlay unavailable', cardUserId, error);
      return [cardUserId, {}];
    }
  }));

  return Object.fromEntries(entries);
};

export const getOverlayForUserCard = async ({ editorUserId, cardUserId }) => {
  if (!cardUserId) return null;

  const normalizedCardId = normalizeCardKey(cardUserId);
  if (!normalizedCardId) return null;

  if (editorUserId) {
    const directSnapshot = await get(ref2(database, `${EDITS_ROOT}/${normalizedCardId}/${editorUserId}`));
    if (directSnapshot.exists()) {
      const normalized = normalizeEditorNode(directSnapshot.val(), normalizedCardId, editorUserId);
      if (normalized) return normalized;
    }
  }

  const overlaysByEditor = await getOverlaysForCard(cardUserId);
  if (!Object.keys(overlaysByEditor).length) return null;

  if (editorUserId && overlaysByEditor[editorUserId]) {
    return overlaysByEditor[editorUserId];
  }

  return Object.values(overlaysByEditor)[0] || null;
};

export const getOverlaysForCard = async (cardUserId, { includeAdminOnly = true } = {}) => {
  if (!cardUserId) return {};
  const normalizedCardId = normalizeCardKey(cardUserId);
  if (!normalizedCardId) return {};

  const snapshot = await get(ref2(database, `${EDITS_ROOT}/${normalizedCardId}`));
  if (!snapshot.exists()) return {};

  const result = {};
  const overlays = snapshot.val();
  Object.entries(overlays).forEach(([editorUserId, overlay]) => {
    const normalized = normalizeEditorNode(overlay, normalizedCardId, editorUserId);
    if (!normalized) return;
    if (!includeAdminOnly && normalized.adminOnly) return;
    result[editorUserId] = normalized;
  });

  return result;
};

// Older overlays were written with `add` where the current shape uses
// `added`. Normalizing here keeps every reader (stacking, previews, accept)
// working off one shape instead of each re-implementing the alias.
export const normalizeOverlayFields = fields => {
  if (!isPlainObject(fields)) return {};

  return Object.entries(fields).reduce((acc, [fieldName, change]) => {
    if (!isPlainObject(change)) return acc;

    if ('add' in change && !('added' in change)) {
      const { add, ...rest } = change;
      acc[fieldName] = { ...rest, added: add };
      return acc;
    }

    acc[fieldName] = change;
    return acc;
  }, {});
};

export const applyOverlayToCard = (canonical, overlayFields = {}) => {
  const merged = { ...(canonical || {}) };

  Object.entries(normalizeOverlayFields(overlayFields)).forEach(([fieldName, change]) => {
    if (!isPlainObject(change)) return;

    if ('to' in change) {
      merged[fieldName] = change.to ?? '';
      return;
    }

    const base = uniq(normalizeArray(merged[fieldName]));
    const removed = uniq(normalizeArray(change.removed));
    const added = uniq(normalizeArray(change.added));

    const next = base.filter(item => !removed.includes(item));
    added.forEach(item => {
      if (!next.includes(item)) next.push(item);
    });

    if (next.length === 0) {
      delete merged[fieldName];
    } else if (next.length === 1) {
      merged[fieldName] = next[0];
    } else {
      merged[fieldName] = next;
    }
  });

  return merged;
};

// Every editor's overlay is a delta against the card as that editor saw it,
// so the order they get replayed in decides the visible value of a field two
// people touched. Oldest first, i.e. the most recent editor's value wins -
// that is exactly the "останні правки" everybody (admin or not) is shown.
// updatedAt can be missing on legacy nodes and can tie when two saves land in
// the same millisecond; editorUserId breaks the tie so every client composes
// the same card instead of flip-flopping between renders.
export const sortOverlaysByAppliedOrder = (overlaysByEditor = {}) =>
  Object.entries(overlaysByEditor || {})
    .filter(([, overlay]) => isPlainObject(overlay))
    .map(([editorUserId, overlay]) => ({ ...overlay, editorUserId: overlay.editorUserId || editorUserId }))
    .sort((a, b) => {
      const byUpdatedAt = Number(a.updatedAt || 0) - Number(b.updatedAt || 0);
      if (byUpdatedAt !== 0) return byUpdatedAt;
      return String(a.editorUserId).localeCompare(String(b.editorUserId));
    });

// Stacks every editor's overlay onto the canonical card, in save order.
// `excludeEditorUserId` produces the card as it looks *without* one editor's
// own delta - that is the baseline their next save has to be diffed against,
// so their overlay keeps holding only their own changes instead of absorbing
// everyone else's into it.
export const applyOverlaysToCard = (canonical, overlaysByEditor = {}, { excludeEditorUserId } = {}) =>
  sortOverlaysByAppliedOrder(overlaysByEditor)
    .filter(overlay => !excludeEditorUserId || overlay.editorUserId !== excludeEditorUserId)
    .reduce((card, overlay) => applyOverlayToCard(card, overlay.fields || {}), { ...(canonical || {}) });

// One call for the two views an editor screen needs at the same time:
// what to render (everything stacked) and what to diff the next save against
// (everything stacked except this editor's own overlay).
export const getStackedCardViews = ({ canonical, overlaysByEditor = {}, editorUserId } = {}) => ({
  stacked: applyOverlaysToCard(canonical, overlaysByEditor),
  baseWithoutOwnOverlay: applyOverlaysToCard(canonical, overlaysByEditor, {
    excludeEditorUserId: editorUserId,
  }),
});

// The set of fields any editor currently has a pending change on, so a card
// can mark them without disclosing who changed them.
export const getStackedOverlayFieldNames = (overlaysByEditor = {}) => {
  const fieldNames = new Set();
  sortOverlaysByAppliedOrder(overlaysByEditor).forEach(overlay => {
    Object.keys(overlay?.fields || {}).forEach(fieldName => {
      if (!TECHNICAL_FIELD_NAMES.has(fieldName)) fieldNames.add(fieldName);
    });
  });
  return Array.from(fieldNames);
};

const buildHistoryEntries = ({ cardUserId, editorUserId, action, fields, at }) =>
  Object.entries(fields || {}).reduce((acc, [fieldName, change]) => {
    if (!isPlainObject(change)) return acc;
    if (TECHNICAL_FIELD_NAMES.has(fieldName)) return acc;
    acc.push({ cardUserId, editorUserId, action, fieldName, change, at });
    return acc;
  }, []);

// Best-effort by design: the journal is an admin-only audit trail, so a
// failure to append it (rules not deployed yet, offline, ...) must never turn
// a successful edit into a failed one for the editor who made it.
export const appendOverlayHistory = async ({ cardUserId, editorUserId, action = 'edit', fields }) => {
  const normalizedCardId = normalizeCardKey(cardUserId);
  if (!normalizedCardId) return [];

  const at = Date.now();
  const entries = buildHistoryEntries({
    cardUserId: normalizedCardId,
    editorUserId: editorUserId || '',
    action,
    fields,
    at,
  });
  if (!entries.length) return [];

  try {
    const historyRef = ref2(database, `${EDITS_HISTORY_ROOT}/${normalizedCardId}`);
    const updates = entries.reduce((acc, entry) => {
      const key = push(historyRef).key;
      if (key) acc[key] = entry;
      return acc;
    }, {});

    if (Object.keys(updates).length) {
      await update(historyRef, updates);
    }
  } catch (error) {
    console.warn('[multiAccountEdits] failed to append overlay history', error);
  }

  return entries;
};

// Every value a change mentions, whatever shape it was stored in. Used to
// match a settled edit against the journal entries that describe it.
const changeValueList = change => {
  if (!isPlainObject(change)) return [];

  const values = [];
  if ('from' in change || 'to' in change) values.push(change.from, change.to);
  values.push(...normalizeArray(change.added ?? change.add), ...normalizeArray(change.removed));

  return uniq(values.map(value => String(value ?? '').trim()).filter(Boolean));
};

// A settled edit must leave nothing behind: once a value has been saved into
// the card or thrown away, the journal entries that only described that value
// are deleted too, so the review queue never grows a tail of memos about work
// that is already done. Entries with no values of their own (`discarded`
// markers) are always dropped - they are pure bookkeeping.
export const purgeOverlayHistoryEntries = async ({ cardUserId, editorUserId, fieldName, values = [] }) => {
  const normalizedCardId = normalizeCardKey(cardUserId);
  if (!normalizedCardId || !fieldName) return 0;

  const settledValues = new Set(values.map(value => String(value ?? '').trim()).filter(Boolean));

  try {
    const historyRef = ref2(database, `${EDITS_HISTORY_ROOT}/${normalizedCardId}`);
    const snapshot = await get(historyRef);
    if (!snapshot?.exists?.()) return 0;

    const updates = Object.entries(snapshot.val() || {}).reduce((acc, [entryId, entry]) => {
      if (!isPlainObject(entry) || entry.fieldName !== fieldName) return acc;
      if (editorUserId && entry.editorUserId && entry.editorUserId !== editorUserId) return acc;

      const entryValues = changeValueList(entry.change);
      if (settledValues.size && entryValues.length && !entryValues.some(value => settledValues.has(value))) return acc;

      acc[entryId] = null;
      return acc;
    }, {});

    if (Object.keys(updates).length) await update(historyRef, updates);
    return Object.keys(updates).length;
  } catch (error) {
    console.warn('[multiAccountEdits] failed to purge overlay history', error);
    return 0;
  }
};

// Admin-only. Newest first, because the review UI reads top-down.
export const getOverlayHistoryForCard = async cardUserId => {
  const normalizedCardId = normalizeCardKey(cardUserId);
  if (!normalizedCardId) return [];

  const snapshot = await get(ref2(database, `${EDITS_HISTORY_ROOT}/${normalizedCardId}`));
  if (!snapshot?.exists?.()) return [];

  return Object.entries(snapshot.val() || {})
    .filter(([, entry]) => isPlainObject(entry))
    .map(([entryId, entry]) => ({
      entryId,
      backendEntryId: entryId,
      historySource: 'overlay',
      ...entry,
    }))
    .sort((a, b) => Number(b.at || 0) - Number(a.at || 0));
};

// Removes one journal row without touching the editor's current overlay. This
// is used by the admin's historical timeline, where the proposal has already
// been superseded and only the durable memo remains.
export const removeOverlayHistoryEntry = async ({ cardUserId, entryId }) => {
  const normalizedCardId = normalizeCardKey(cardUserId);
  const normalizedEntryId = normalizeCardKey(entryId);
  if (!normalizedCardId || !normalizedEntryId) return;

  await remove(ref2(database, `${EDITS_HISTORY_ROOT}/${normalizedCardId}/${normalizedEntryId}`));
};

// Only the fields whose stored change actually differs from what is already
// there - a blur that re-saves an unchanged overlay must not add a journal
// entry for every field the editor once touched.
const diffOverlayFields = (previousFields, nextFields) => {
  const previous = normalizeOverlayFields(previousFields);
  const next = normalizeOverlayFields(nextFields);

  return Object.entries(next).reduce((acc, [fieldName, change]) => {
    if (JSON.stringify(previous[fieldName]) === JSON.stringify(change)) return acc;
    acc[fieldName] = change;
    return acc;
  }, {});
};

export const removeOverlayForUserCard = async ({ editorUserId, cardUserId }) => {
  if (!editorUserId || !cardUserId) return;

  const normalizedCardId = normalizeCardKey(cardUserId);
  if (!normalizedCardId) return;

  await remove(ref2(database, `${EDITS_ROOT}/${normalizedCardId}/${editorUserId}`));
  await forgetOwnOverlayCard({ cardUserId: normalizedCardId, editorUserId });
};

export const acceptOverlayForUserCard = async ({
  editorUserId,
  cardUserId,
  persistCard,
}) => {
  const overlay = await getOverlayForUserCard({ editorUserId, cardUserId });
  if (!overlay?.fields) return null;

  const canonical = await getCanonicalCard(cardUserId);
  const merged = applyOverlayToCard(canonical, overlay.fields);

  await persistCard(merged);
  await appendOverlayHistory({
    cardUserId,
    editorUserId: overlay.editorUserId || editorUserId,
    action: 'accept',
    fields: overlay.fields,
  });
  await removeOverlayForUserCard({ editorUserId, cardUserId });

  return { canonical, merged, overlay };
};

export const getOtherEditorsChangedFields = (overlaysByEditor = {}, currentEditorUserId) => {
  const fields = new Set();
  Object.entries(overlaysByEditor).forEach(([editorId, overlay]) => {
    if (editorId === currentEditorUserId) return;
    Object.keys(overlay?.fields || {}).forEach(fieldName => fields.add(fieldName));
  });
  return Array.from(fields);
};

export const formatOverlayPreview = ({ fieldName, change, canonicalValue }) => {
  if (change?.to !== undefined || change?.from !== undefined) {
    return {
      fieldName,
      oldValue: change.from ?? canonicalValue ?? '',
      newValue: change.to ?? '',
    };
  }

  const mainArray = uniq(normalizeArray(canonicalValue));
  const removed = uniq(normalizeArray(change?.removed));
  const added = uniq(normalizeArray(change?.added));
  const nextArray = mainArray.filter(item => !removed.includes(item));
  added.forEach(item => {
    if (!nextArray.includes(item)) nextArray.push(item);
  });

  if (areArraysEqual(mainArray, nextArray)) {
    return null;
  }

  return {
    fieldName,
    oldValue: mainArray,
    newValue: nextArray,
  };
};

export const patchOverlayField = async ({ editorUserId, cardUserId, fieldName, change, historyAction }) => {
  if (!editorUserId || !cardUserId || !fieldName) return;

  const normalizedCardId = normalizeCardKey(cardUserId);
  if (!normalizedCardId) return;

  const path = `${EDITS_ROOT}/${normalizedCardId}/${editorUserId}/fields/${fieldName}`;
  if (!change || (!change.to && !change.from && !change.added && !change.removed)) {
    await remove(ref2(database, path));
    await cleanupOverlayIfOnlyTechnicalFields({ editorUserId, cardUserId: normalizedCardId });
    await appendOverlayHistory({
      cardUserId: normalizedCardId,
      editorUserId,
      action: historyAction || 'discard',
      fields: { [fieldName]: { discarded: true } },
    });
    return;
  }

  await update(ref2(database, `${EDITS_ROOT}/${normalizedCardId}/${editorUserId}/fields`), {
    [fieldName]: change,
  });
  await cleanupOverlayIfOnlyTechnicalFields({ editorUserId, cardUserId: normalizedCardId });
  await appendOverlayHistory({
    cardUserId: normalizedCardId,
    editorUserId,
    action: historyAction || 'edit',
    fields: { [fieldName]: change },
  });
};

const hasOverlayChangeValues = change => Boolean(
  change && (change.to || change.from || change.added?.length || change.removed?.length)
);

// Settles one *value* of an editor's field change - accept or discard - and
// leaves the rest of that field's change pending. Accepting one of three
// proposed phone numbers must not throw the other two away, so the caller
// passes what it settled and what remains; the journal records only the
// settled part, under the action that settled it.
//
// `purgeHistory` inverts that last part: instead of writing one more journal
// entry, the entries about the settled value are deleted. That is what the
// review UI's save/delete buttons use - a settled edit disappears from the
// backend completely rather than turning into another line of history.
export const settleOverlayFieldValue = async ({
  editorUserId,
  cardUserId,
  fieldName,
  settledChange,
  remainingChange,
  historyAction = 'discard',
  purgeHistory = false,
}) => {
  if (!editorUserId || !cardUserId || !fieldName) return;

  const normalizedCardId = normalizeCardKey(cardUserId);
  if (!normalizedCardId) return;

  const fieldsPath = `${EDITS_ROOT}/${normalizedCardId}/${editorUserId}/fields`;

  if (hasOverlayChangeValues(remainingChange)) {
    await update(ref2(database, fieldsPath), { [fieldName]: remainingChange });
  } else {
    await remove(ref2(database, `${fieldsPath}/${fieldName}`));
  }

  await cleanupOverlayIfOnlyTechnicalFields({ editorUserId, cardUserId: normalizedCardId });

  if (purgeHistory) {
    await purgeOverlayHistoryEntries({
      cardUserId: normalizedCardId,
      editorUserId,
      fieldName,
      values: changeValueList(settledChange),
    });
    return;
  }

  await appendOverlayHistory({
    cardUserId: normalizedCardId,
    editorUserId,
    action: historyAction,
    fields: { [fieldName]: settledChange || { discarded: true } },
  });
};

/**
 * Пропозиції редакторів — по одній на **значення**, а не на поле.
 *
 * Шар зберігає зміну поля цілком (`{ phone: { added: ['A', 'B'] } }`), і
 * форма адміна показувала її одним рядком: два дописані номери зліплювались в
 * «A, B» в одному інпуті. Звідси йшло дві поломки поспіль — «ОК» записував у
 * анкету той склеєний рядок як один номер, а «×» зносив геть увесь шар поля,
 * тобто й друге значення, якого адмін не чіпав.
 *
 * Тому розкладка тут одна на всі екрани: кожне значення — окремий запис із
 * автором, і саме на нього дивиться і кнопка «ОК», і хрестик.
 */
export const buildOverlayFieldEntries = (overlaysByEditor = {}) => {
  const result = {};

  const pushEntry = (fieldName, entry) => {
    const fieldEntries = result[fieldName] || [];
    if (fieldEntries.some(item => item.value === entry.value && item.editorUserId === entry.editorUserId)) return;
    result[fieldName] = [...fieldEntries, entry];
  };

  Object.entries(overlaysByEditor || {}).forEach(([editorUserId, overlay]) => {
    const fields = normalizeOverlayFields(overlay?.fields);

    Object.entries(fields).forEach(([fieldName, change]) => {
      if (TECHNICAL_FIELD_NAMES.has(fieldName) || fieldName === 'editor') return;
      if (!isPlainObject(change)) return;

      if ('to' in change) {
        const to = String(change.to ?? '').trim();
        if (to) {
          pushEntry(fieldName, { value: to, editorUserId, isDeleted: false });
          return;
        }
        // Порожнє `to` — це стирання: пропозиція прибрати те, що стоїть у
        // `from`. Значення показується як закреслене, а не як нове.
        const from = String(change.from ?? '').trim();
        if (from) pushEntry(fieldName, { value: from, editorUserId, isDeleted: true });
        return;
      }

      normalizeArray(change.added).forEach(value => {
        const normalized = String(value ?? '').trim();
        if (normalized) pushEntry(fieldName, { value: normalized, editorUserId, isDeleted: false });
      });

      normalizeArray(change.removed).forEach(value => {
        const normalized = String(value ?? '').trim();
        if (normalized) pushEntry(fieldName, { value: normalized, editorUserId, isDeleted: true });
      });
    });
  });

  return result;
};

/**
 * Одне значення зі зміни поля — окремо від решти.
 *
 * `settledChange` — те, що адмін щойно вирішив (прийняв або відхилив),
 * `remainingChange` — усе, чого він не чіпав. Порожній залишок означає, що
 * поле з шару йде цілком: саме це й розрізняє «прибрати один номер» від
 * «прибрати правку».
 */
export const splitOverlayChangeByValue = (change, value) => {
  if (!isPlainObject(change)) return { settledChange: null, remainingChange: null };
  const normalizedChange = normalizeOverlayFields({ value: change }).value;

  const normalizedValue = String(value ?? '').trim();
  if (!normalizedValue) return { settledChange: null, remainingChange: normalizedChange };

  if ('to' in normalizedChange) {
    const to = String(normalizedChange.to ?? '').trim();
    const from = String(normalizedChange.from ?? '').trim();
    if (to === normalizedValue || (!to && from === normalizedValue)) {
      return { settledChange: normalizedChange, remainingChange: null };
    }
    return { settledChange: null, remainingChange: normalizedChange };
  }

  const added = normalizeArray(normalizedChange.added).map(item => String(item ?? '').trim());
  const removed = normalizeArray(normalizedChange.removed).map(item => String(item ?? '').trim());
  const settledAdded = added.filter(item => item === normalizedValue);
  const settledRemoved = removed.filter(item => item === normalizedValue);
  if (!settledAdded.length && !settledRemoved.length) {
    return { settledChange: null, remainingChange: normalizedChange };
  }

  const remainingAdded = added.filter(item => item !== normalizedValue);
  const remainingRemoved = removed.filter(item => item !== normalizedValue);

  return {
    settledChange: {
      ...(settledAdded.length ? { added: settledAdded } : {}),
      ...(settledRemoved.length ? { removed: settledRemoved } : {}),
    },
    remainingChange: {
      ...(remainingAdded.length ? { added: remainingAdded } : {}),
      ...(remainingRemoved.length ? { removed: remainingRemoved } : {}),
    },
  };
};

/**
 * Чи лишається кому тримати це значення в `searchId` після відхилення.
 *
 * Ключ індексу веде на картку, а не на шар, тож знімати його можна лише тоді,
 * коли значення не лишилось ані в самій анкеті, ані в чужому шарі на цій
 * картці. Інакше відхилений дубль зносив би з пошуку номер, який в анкеті
 * стоїть.
 */
const isValueStillClaimedByCard = ({ canonical, overlaysByEditor, fieldName, value, editorUserId }) => {
  const normalizedValueKey = buildSearchIdValueKey(fieldName, value);
  if (!normalizedValueKey) return true;

  // `searchId` owns normalized keys (digits-only phones, normalized social
  // handles, etc.), so ownership must be compared in exactly that domain.
  // Comparing display strings can treat two spellings of the same key as
  // different and remove an index entry still used by the canonical card:
  // «38 093 112 06 78» в анкеті і «380931120678» у шарі — це один ключ.
  const matches = candidate => buildSearchIdValueKey(fieldName, candidate) === normalizedValueKey;
  if (normalizeArray(canonical?.[fieldName]).some(matches)) return true;

  return Object.entries(overlaysByEditor || {}).some(([otherEditorUserId, overlay]) => {
    if (otherEditorUserId === editorUserId) return false;
    const change = normalizeOverlayFields(overlay?.fields)[fieldName];
    if (!isPlainObject(change)) return false;
    if ('to' in change) return matches(change.to);
    return normalizeArray(change.added).some(matches);
  });
};

/**
 * Рішення адміна про **одне** значення чужого шару.
 *
 * Прийняте значення лишається в анкеті — його туди кладе сама форма, — а
 * відхилене мусить піти звідусіль, куди його поклав шар: із вузла шару
 * (решта значень лишається на місці) і з `searchId`, бо саме шар і завів там
 * ключ (`saveOverlayForUserCard`). Поки хрестик знімав лише рядок у формі,
 * прибраний номер далі знаходився пошуком і повертався в наступний перегляд.
 */
export const settleOverlayValueForCard = async ({
  editorUserId,
  cardUserId,
  fieldName,
  value,
  acceptedValue,
  action = 'discard',
}) => {
  if (!editorUserId || !cardUserId || !fieldName) return null;

  const normalizedCardId = normalizeCardKey(cardUserId);
  if (!normalizedCardId) return null;

  const editorRef = ref2(
    database,
    `${EDITS_ROOT}/${normalizedCardId}/${editorUserId}`,
  );
  // RTDB transactions invoke their updater with the locally cached value
  // first.  On an admin screen this exact editor node normally has not been
  // read yet, so that first value is `null`; returning `undefined` below then
  // aborts the transaction before Firebase ever supplies the server value.
  // Prime the cache and fail explicitly when the proposal really disappeared.
  const editorSnapshot = await get(editorRef);
  if (!editorSnapshot?.exists?.()) return null;
  const prefetchedOverlay = editorSnapshot.val();

  let settledChange = null;
  let remainingChange = null;
  let removedEditorOverlay = false;
  const transaction = await runTransaction(editorRef, currentOverlay => {
    // `get()` normally primes the cache, but using its value as the first
    // transaction baseline also makes the behavior explicit and testable.
    // If the server changed meanwhile, RTDB retries this callback with the
    // newer value before committing.
    const effectiveOverlay = currentOverlay || prefetchedOverlay;
    const currentChange = normalizeOverlayFields(effectiveOverlay?.fields)[fieldName];
    const split = splitOverlayChangeByValue(currentChange, value);
    settledChange = split.settledChange;
    remainingChange = split.remainingChange;
    if (!settledChange) return undefined;

    const nextFields = { ...(effectiveOverlay?.fields || {}) };
    if (hasOverlayChangeValues(remainingChange)) nextFields[fieldName] = remainingChange;
    else delete nextFields[fieldName];

    removedEditorOverlay = shouldDropOverlayByFieldNames(Object.keys(nextFields));
    if (removedEditorOverlay) return null;
    return { ...effectiveOverlay, fields: nextFields };
  });
  if (!transaction.committed || !settledChange) return null;

  if (removedEditorOverlay) await forgetOwnOverlayCard({ editorUserId, cardUserId: normalizedCardId });
  await appendOverlayHistory({
    cardUserId: normalizedCardId,
    editorUserId,
    action: action === 'accept' ? 'accept' : 'discard',
    fields: { [fieldName]: settledChange },
  });

  if (action === 'accept') {
    const normalizedAcceptedValue = String(acceptedValue ?? value ?? '').trim();
    const normalizedOriginalValue = String(value ?? '').trim();
    if (
      SEARCH_ID_INDEXED_FIELDS.has(fieldName) &&
      normalizedAcceptedValue &&
      normalizedAcceptedValue !== normalizedOriginalValue
    ) {
      // The overlay claimed the submitted value. If an admin corrects it in
      // the review input, transfer that claim instead of leaving the stale
      // identifier searchable for this card.
      await updateSearchId(fieldName, normalizedOriginalValue, normalizedCardId, 'remove');
      await updateSearchId(fieldName, normalizedAcceptedValue, normalizedCardId, 'add');
    }
    return { settledChange, remainingChange };
  }

  if (!SEARCH_ID_INDEXED_FIELDS.has(fieldName)) return { settledChange, remainingChange };

  let canonical;
  try {
    canonical = await getCanonicalCard(normalizedCardId);
  } catch (error) {
    // Absence of a readable canonical card is not evidence that it no longer
    // claims the key. Keep the append-only index rather than destructively
    // guessing after a transient/permission failure.
    console.warn('[multiAccountEdits] canonical card unavailable during searchId cleanup', error);
    return { settledChange, remainingChange };
  }
  const overlaysByEditor = await getOverlaysForCard(normalizedCardId);
  const stillClaimed = isValueStillClaimedByCard({
    canonical,
    overlaysByEditor,
    fieldName,
    value,
    editorUserId,
  });
  if (!stillClaimed) await updateSearchId(fieldName, value, normalizedCardId, 'remove');

  return { settledChange, remainingChange };
};

// ---------------------------------------------------------------------------
// Admin review operations. An admin is the only role that can turn a pending
// overlay into canonical data, and the only one who gets to see the journal
// these write into.
// ---------------------------------------------------------------------------

// Accept a single field from a single editor: the rest of that editor's
// overlay - and every other editor's - stays pending.
export const acceptOverlayFieldForUserCard = async ({
  editorUserId,
  cardUserId,
  fieldName,
  persistCard,
}) => {
  if (!editorUserId || !cardUserId || !fieldName) return null;

  const overlays = await getOverlaysForCard(cardUserId);
  const change = normalizeOverlayFields(overlays?.[editorUserId]?.fields)[fieldName];
  if (!change) return null;

  const canonical = await getCanonicalCard(cardUserId);
  const merged = applyOverlayToCard(canonical, { [fieldName]: change });

  await persistCard(merged);
  await patchOverlayField({
    editorUserId,
    cardUserId,
    fieldName,
    change: null,
    historyAction: 'accept',
  });

  return { canonical, merged, change };
};

// Accept everything pending on the card at once: the stacked result is
// exactly what every editor already sees, so accepting it changes nothing
// visually - it just makes those values canonical and clears the queue.
export const acceptAllOverlaysForCard = async ({ cardUserId, persistCard }) => {
  const overlays = await getOverlaysForCard(cardUserId);
  const orderedOverlays = sortOverlaysByAppliedOrder(overlays);
  if (!orderedOverlays.length) return null;

  const canonical = await getCanonicalCard(cardUserId);
  const merged = applyOverlaysToCard(canonical, overlays);

  await persistCard(merged);
  await removeAllOverlaysForCard(cardUserId, { historyAction: 'accept' });

  return { canonical, merged, overlays };
};

// Clears the whole queue for a card in one write. `historyAction` records
// why: 'accept' when the values were just written to the card, 'discard'
// when the admin threw them away.
export const removeAllOverlaysForCard = async (cardUserId, { historyAction = 'discard' } = {}) => {
  const normalizedCardId = normalizeCardKey(cardUserId);
  if (!normalizedCardId) return null;

  const overlays = await getOverlaysForCard(normalizedCardId);
  const orderedOverlays = sortOverlaysByAppliedOrder(overlays);
  if (!orderedOverlays.length) return null;

  for (const overlay of orderedOverlays) {
    if (historyAction === 'accept') {
      // Accepted values are canonical now. Remove their earlier audit rows
      // instead of adding another permanent "accept" row to the journal.
      for (const [fieldName, change] of Object.entries(overlay.fields || {})) {
        await purgeOverlayHistoryEntries({
          cardUserId: normalizedCardId,
          editorUserId: overlay.editorUserId,
          fieldName,
          values: changeValueList(change),
        });
      }
      continue;
    }
    await appendOverlayHistory({
      cardUserId: normalizedCardId,
      editorUserId: overlay.editorUserId,
      action: historyAction,
      fields: overlay.fields,
    });
  }

  await remove(ref2(database, `${EDITS_ROOT}/${normalizedCardId}`));

  return { overlays };
};
