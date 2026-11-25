import { get as firebaseGet, onValue, push, ref as ref2, remove, runTransaction, set, update } from 'firebase/database';
import { withAdminDownloadToast } from 'utils/backendDownloadToast';
import { applyOverlayToCard, isPlainObject, normalizeArray, normalizeOverlayFields, uniq } from 'utils/profileFieldChanges';
import { isLongFormatUserId } from 'utils/userIdFormat';
import { mergeProfileNodes } from 'utils/profileNodeMerge';
import { PROFILE_NODES } from 'utils/profileNodeSchema';
import { areProposalValuesEqual } from 'utils/profileProposals';
import { appendProfileProposalJournal } from 'utils/profileProposalJournal';
import { profileProposalPaths, usesUnifiedProposalStorage } from 'utils/profileProposalStoragePaths';
import { buildSearchIdValueKey, SEARCH_ID_INDEXED_FIELDS } from 'utils/searchKeyUtils';
import {
  forgetOwnOverlayCardLocally,
  readOwnOverlayCardIds,
  rememberOwnOverlayCardLocally,
} from 'utils/ownOverlayCardsStorage';

import { auth, database, fetchProfileDraftById, updateSearchId } from 'components/config';
import { canGrantProfilePrivileges } from 'utils/accessLevel';

export { applyOverlayToCard, buildOverlayFromDraft, normalizeOverlayFields } from 'utils/profileFieldChanges';

const get = (...args) =>
  withAdminDownloadToast(firebaseGet(...args), {
    operation: 'get',
    source: 'multiAccountEdits',
    path: args[0],
  });

export const EDITS_ROOT = profileProposalPaths.update;
// Append-only journal of every overlay change ever written for a card. The
// overlay node itself only ever holds an editor's *current* delta (each save
// rewrites it), so without this log an earlier edit is unrecoverable the
// moment its author edits the same field again. Only admins read it - other
// editors see the stacked result, never who changed what or what came before.
const EDITS_HISTORY_ROOT = profileProposalPaths.updateHistory;
// A durable roster of everybody who has ever edited a card. The overlay node
// is emptied as soon as an edit is settled - and its journal entries are
// purged with it - so by the time the card is published there is nothing left
// to tell who worked on it. Those editors must keep access to the card they
// helped build, so their ids are recorded here once and never removed.
const EDITS_CONTRIBUTORS_ROOT = profileProposalPaths.contributors;
// Перелік карток, які доповнював один читач, — під його власним uid.
//
// Оверлеї лежать під карткою, тож без цього вузла питання «що я дописував»
// коштує читання на кожен рядок стрічки. Пишеться він best-effort, як і
// журнал: доповнення дорожче за свій індекс.
const EDITS_BY_EDITOR_ROOT = profileProposalPaths.byEditor;
const TECHNICAL_FIELD_NAMES = new Set(['lastAction', 'cachedAt', 'cacheVersion']);

const areArraysEqual = (a, b) => {
  if (a.length !== b.length) return false;
  return a.every((item, idx) => item === b[idx]);
};

const normalizeCardKey = value => String(value || '').trim();
const overlayError = (code, cause) => Object.assign(new Error(code), { code, cause });
const valueLabel = value => String(value ?? '').trim();
const hasValue = (values, candidate) => values.some(value => areProposalValuesEqual(value, candidate));
const sameReplacement = (left, right) => (
  Boolean(left && right) && areProposalValuesEqual(left.from, right.from) && areProposalValuesEqual(left.to, right.to)
);

const readReplacementMap = proposal => {
  try {
    const replacements = JSON.parse(proposal?.replacements || '{}');
    return isPlainObject(replacements) ? replacements : {};
  } catch {
    return {};
  }
};

const listChange = (added, removed) => ({
  ...(added.length && { added }),
  ...(removed.length && { removed }),
});

export const getOverlayListReviewValues = change => {
  const { added, removed, replacements } = change ?? {};
  const additions = normalizeArray(added);
  const removals = normalizeArray(removed);
  const pairs = Array.isArray(replacements) ? replacements.filter(pair => (
    isPlainObject(pair) && valueLabel(pair.from) && valueLabel(pair.to) && hasValue(removals, pair.from)
  )) : [];
  return {
    pairs,
    added: additions.filter(value => !pairs.some(pair => areProposalValuesEqual(pair.to, value))),
    removed: removals.filter(value => !pairs.some(pair => areProposalValuesEqual(pair.from, value))),
  };
};

export const getOverlayReviewFields = overlay => {
  const fields = normalizeOverlayFields(overlay?.fields);
  const replacementMap = readReplacementMap(overlay?.proposal);
  return Object.fromEntries(Object.entries(fields).map(([field, change]) => {
    if ('to' in change || !Array.isArray(replacementMap[field])) return [field, change];
    const { pairs } = getOverlayListReviewValues({ ...change, replacements: replacementMap[field] });
    return [field, pairs.length ? { ...change, replacements: pairs } : change];
  }));
};

// Транзакція бере перше значення з кешу SDK. Тримаємо активне читання
// до завершення транзакції, щоб порожній кеш не виглядав як видалений шар.
const replaceOverlayIfUnchanged = async (overlayRef, expectedCurrent, nextOverlay) => {
  let unsubscribe;
  try {
    await new Promise((resolve, reject) => {
      unsubscribe = onValue(overlayRef, resolve, reject);
    });
    const result = await runTransaction(overlayRef, current => (
      areProposalValuesEqual(current, expectedCurrent) ? nextOverlay : undefined
    ), { applyLocally: false });
    if (!result.committed) throw overlayError('REVISION_CONFLICT');
    return result.snapshot.val();
  } finally {
    unsubscribe?.();
  }
};

const shouldDropOverlayByFieldNames = fieldNames => {
  if (!Array.isArray(fieldNames) || !fieldNames.length) return true;
  return fieldNames.every(fieldName => TECHNICAL_FIELD_NAMES.has(fieldName));
};

const normalizeEditorNode = (overlay, cardUserId, editorUserId, includeRecord = false) => {
  if (!isPlainObject(overlay) || !isPlainObject(overlay.fields)) return null;

  return {
    fields: overlay.fields,
    updatedAt: overlay.updatedAt || null,
    cardUserId: overlay.cardUserId || cardUserId,
    editorUserId: overlay.editorUserId || editorUserId,
    ...(overlay.adminOnly === true ? { adminOnly: true } : {}),
    ...(includeRecord && { expectedCurrent: overlay }),
  };
};

// Чи картка — анкета акаунта. Відповідь дає сам id, без жодного читання:
// довгий — це Firebase-Auth UID, короткий — картка, заведена в застосунку.
// Від відповіді залежить лише писач (`updateDataInRealtimeDB` з Firestore для
// акаунта, `updateProfileNodesInRTDB` для решти): legacy `users` закрито й
// видалено з правил, і веб не пише й не читає його ні для кого.
export const isAccountProfileCard = cardUserId => {
  const normalizedCardId = normalizeCardKey(cardUserId);
  return Boolean(normalizedCardId) && isLongFormatUserId(normalizedCardId);
};

export const getCanonicalCard = async cardUserId => {
  // Анкета живе у вузлах — і тільки в них.
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

  // Жодного вузла — це не порожня анкета, а картка, яка ще живе чернеткою
  // (`multiData/profileMutations`). Її канонічний вигляд — дані самої
  // чернетки: від них рахується шар доповнення, і на них лягає прийняте.
  // Порожня основа тут означала б, що кожне доповнення чернетки «додає» все,
  // що в ній уже стоїть.
  if (values.every(value => value === null)) {
    const draft = await fetchProfileDraftById(cardUserId);
    if (draft) return draft;
  }

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
    const values = 'to' in change ? [change.to] : [
      ...normalizeArray(change.added),
      ...getOverlayListReviewValues(change).pairs.map(pair => pair.to),
    ];
    return uniq(values.map(value => String(value ?? '').trim()).filter(Boolean))
      .map(value => ({ field: fieldName, value }));
  });

export const collectOverlaySearchIdValues = overlay => collectOverlayIndexValues(getOverlayReviewFields(overlay));

/**
 * Індексується весь поточний оверлей, а не сама лише різниця цього збереження:
 * значення, яке не записалось першого разу (правила, мережа), інакше не
 * потрапило б у пошук уже ніколи. Ціну повторів тримає памʼять таба всередині
 * `updateSearchId`, а відмова там не валить збереження — доповнення дорожче за
 * ключ індексу.
 */
const indexOverlayValuesInSearchId = async ({ cardUserId, fields, verify }) => {
  for (const { field, value } of collectOverlayIndexValues(fields)) {
    // eslint-disable-next-line no-await-in-loop
    await updateSearchId(field, value, cardUserId, 'add', ...(verify ? [{ verify: true }] : []));
  }
};

export const saveOverlayForUserCard = async ({
  editorUserId, cardUserId, fields, expectedCurrent, proposal, actorUid, updatedAt,
}) => {
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

  const usesRevisionCheck = expectedCurrent !== undefined;
  if (usesUnifiedProposalStorage && !usesRevisionCheck) throw overlayError('INVALID_DRAFT');
  if (expectedCurrent?.reviewClaim) throw overlayError('REVISION_CONFLICT');
  if (shouldDropOverlayByFieldNames(Object.keys(sanitized))) {
    if (usesRevisionCheck) throw overlayError('INVALID_DRAFT');
    await remove(cardRef);
    await forgetOwnOverlayCard({ cardUserId: normalizedCardId, editorUserId });
    return;
  }

  let previousFields = expectedCurrent?.fields ?? null;
  if (!usesRevisionCheck) {
    try {
      const previousSnapshot = await get(ref2(database, `${EDITS_ROOT}/${normalizedCardId}/${editorUserId}/fields`));
      previousFields = previousSnapshot?.exists?.() ? previousSnapshot.val() : null;
    } catch {
      previousFields = null;
    }
  }

  const overlay = {
    fields: sanitized,
    updatedAt: updatedAt ?? Date.now(),
    cardUserId: normalizedCardId,
    editorUserId,
  };
  let committed;
  if (usesRevisionCheck) {
    committed = await replaceOverlayIfUnchanged(cardRef, expectedCurrent, {
      ...overlay,
      ...(expectedCurrent?.adminOnly === true && { adminOnly: true }),
      ...(proposal && { proposal }),
    });
  } else {
    await set(cardRef, overlay);
  }

  try {
    await rememberCardContributor({ cardUserId: normalizedCardId, editorUserId });

    const remembered = await rememberOwnOverlayCard({ cardUserId: normalizedCardId, editorUserId });

    // Після запису оверлея, а не до нього: право дописати id у `searchId` дають
    // правила саме за наявністю оверлея цього редактора на цій картці.
    const nextHistoryFields = usesRevisionCheck ? getOverlayReviewFields({ fields: sanitized, proposal }) : sanitized;
    await indexOverlayValuesInSearchId({
      cardUserId: normalizedCardId, fields: nextHistoryFields, verify: usesRevisionCheck,
    });

    const previousHistoryFields = usesRevisionCheck ? getOverlayReviewFields(expectedCurrent) : previousFields;
    await appendOverlayHistory({
      cardUserId: normalizedCardId,
      editorUserId,
      action: 'edit',
      fields: diffOverlayFields(previousHistoryFields, nextHistoryFields),
      actorUid,
      revision: proposal?.revision,
      throwOnError: usesRevisionCheck,
    });
    if (usesRevisionCheck && !remembered) throw new Error('Overlay author index was not saved');
  } catch (error) {
    if (usesRevisionCheck) throw overlayError('PARTIAL_WRITE', error);
    throw error;
  }
  return committed;
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

export const forgetOwnOverlayCard = async ({ editorUserId, cardUserId, throwOnError = false }) => {
  const normalizedCardId = normalizeCardKey(cardUserId);
  if (!normalizedCardId || !editorUserId) return;

  forgetOwnOverlayCardLocally(editorUserId, normalizedCardId);

  try {
    await remove(ref2(database, `${EDITS_BY_EDITOR_ROOT}/${editorUserId}/${normalizedCardId}`));
  } catch (error) {
    console.warn('[multiAccountEdits] own overlay index cleanup failed', error);
    if (throwOnError) throw error;
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
export const getOwnOverlayCardIndex = async (editorUserId, { throwOnError = false } = {}) => {
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
    if (throwOnError) throw error;
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
export const getCardContributorIds = async (cardUserId, { throwOnError = false } = {}) => {
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
    if (throwOnError) throw error;
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

export const readOverlayRecord = async ({ editorUserId, cardUserId }) => {
  const normalizedCardId = normalizeCardKey(cardUserId);
  if (!editorUserId || !normalizedCardId) return null;

  const snapshot = await get(ref2(database, `${EDITS_ROOT}/${normalizedCardId}/${editorUserId}`));
  return snapshot.exists() ? snapshot.val() : null;
};

export const claimOverlayValueForReview = async ({
  editorUserId, cardUserId, fieldName, value, acceptedValue, expectedCurrent, replacement,
}) => {
  const claim = {
    fieldName, value,
    ...(acceptedValue !== undefined && { acceptedValue }),
    ...(replacement && { replacement }),
  };
  if (!expectedCurrent || (expectedCurrent.reviewClaim && !areProposalValuesEqual(expectedCurrent.reviewClaim, claim))) {
    throw overlayError('REVISION_CONFLICT');
  }
  return replaceOverlayIfUnchanged(
    ref2(database, `${EDITS_ROOT}/${cardUserId}/${editorUserId}`),
    expectedCurrent,
    { ...expectedCurrent, reviewClaim: claim },
  );
};

export const releaseOverlayValueReview = ({ editorUserId, cardUserId, claimed }) => {
  const restored = { ...claimed };
  delete restored.reviewClaim;
  return replaceOverlayIfUnchanged(
    ref2(database, `${EDITS_ROOT}/${cardUserId}/${editorUserId}`), claimed, restored,
  );
};

export const getOverlayForUserCard = async ({ editorUserId, cardUserId }) => {
  if (!cardUserId) return null;

  const normalizedCardId = normalizeCardKey(cardUserId);
  if (!normalizedCardId) return null;

  if (editorUserId) {
    const record = await readOverlayRecord({ editorUserId, cardUserId: normalizedCardId });
    const normalized = normalizeEditorNode(record, normalizedCardId, editorUserId);
    if (normalized) return normalized;
  }

  const overlaysByEditor = await getOverlaysForCard(cardUserId);
  if (!Object.keys(overlaysByEditor).length) return null;

  if (editorUserId && overlaysByEditor[editorUserId]) {
    return overlaysByEditor[editorUserId];
  }

  return Object.values(overlaysByEditor)[0] || null;
};

/*
 * `editorUserId` — читач, для якого вузол картки цілком може бути закритий.
 *
 * `edits/{картка}` цілком правила відкривають лише адмінам, службовому
 * доступу й авторові чернетки. Звичайний читач отримував `permission_denied`,
 * форма доповнення ковтала відмову й відкривалась без його власного шару — і
 * перше ж збереження перезаписувало шар тим, що було на екрані, тобто мовчки
 * стирало дописане раніше. Свій шар (`edits/{картка}/{читач}`) правила
 * відкривають кожному, тож на відмові читаємо саме його.
 */
export const getOverlaysForCard = async (
  cardUserId, { includeAdminOnly = true, editorUserId = '', includeRecords = false } = {},
) => {
  if (!cardUserId) return {};
  const normalizedCardId = normalizeCardKey(cardUserId);
  if (!normalizedCardId) return {};

  let snapshot;
  try {
    snapshot = await get(ref2(database, `${EDITS_ROOT}/${normalizedCardId}`));
  } catch (error) {
    if (!editorUserId) throw error;
    const record = await readOverlayRecord({ editorUserId, cardUserId: normalizedCardId });
    const own = normalizeEditorNode(record, normalizedCardId, editorUserId, includeRecords);
    if (!own || (!includeAdminOnly && own.adminOnly)) return {};
    return { [editorUserId]: own };
  }
  if (!snapshot.exists()) return {};

  const result = {};
  const overlays = snapshot.val();
  Object.entries(overlays).forEach(([editorUserId, overlay]) => {
    const normalized = normalizeEditorNode(overlay, normalizedCardId, editorUserId, includeRecords);
    if (!normalized) return;
    if (!includeAdminOnly && normalized.adminOnly) return;
    result[editorUserId] = normalized;
  });

  return result;
};

// Одна зміна в тій самій формі, що й у шарі (див. `normalizeOverlayFields`):
// журнал правок зберігає зміни як були записані, зокрема заміни зі списками.
const normalizeOverlayChange = change => (isPlainObject(change) ? normalizeOverlayFields({ value: change }).value || {} : change);

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

const buildHistoryEntries = ({ cardUserId, editorUserId, action, fields, at, actorUid, revision }) =>
  Object.entries(fields || {}).reduce((acc, [fieldName, change]) => {
    if (!isPlainObject(change)) return acc;
    if (TECHNICAL_FIELD_NAMES.has(fieldName)) return acc;
    acc.push({
      cardUserId, editorUserId, action, fieldName, change, at,
      ...(actorUid && { actorUid }),
      ...(revision !== undefined && { revision }),
    });
    return acc;
  }, []);

// Best-effort by design: the journal is an admin-only audit trail, so a
// failure to append it (rules not deployed yet, offline, ...) must never turn
// a successful edit into a failed one for the editor who made it.
export const appendOverlayHistory = async ({
  cardUserId, editorUserId, action = 'edit', fields, actorUid, revision, throwOnError = false,
}) => {
  const normalizedCardId = normalizeCardKey(cardUserId);
  if (!normalizedCardId) return [];

  const at = Date.now();
  const entries = buildHistoryEntries({
    cardUserId: normalizedCardId,
    editorUserId: editorUserId || '',
    action,
    fields,
    at,
    actorUid,
    revision,
  });
  if (!entries.length) return [];

  try {
    await appendProfileProposalJournal(database, 'update', normalizedCardId, entries);
  } catch (error) {
    console.warn('[multiAccountEdits] failed to append overlay history', error);
    if (throwOnError) throw error;
  }

  return entries;
};

// Те, що зміна **пропонує**, без того, від чого вона відштовхувалась: нове
// значення заміни (або стерте, коли заміна — це стирання) і значення масиву.
// Для звірки журналу це важливо: дві послідовні правки того самого поля
// мають спільний `from`, і звірка з ним зносила б разом із розсудженою
// правкою ще й попередню версію, яку адмін іще не бачив.
const changeProposalValues = rawChange => {
  const change = normalizeOverlayChange(rawChange);
  if (!isPlainObject(change)) return [];
  if ('from' in change || 'to' in change) {
    const to = String(change.to ?? '').trim();
    const from = String(change.from ?? '').trim();
    return to ? [to] : (from ? [from] : []);
  }
  return uniq([...normalizeArray(change.added ?? change.add), ...normalizeArray(change.removed)]
    .map(value => String(value ?? '').trim())
    .filter(Boolean));
};

const isUnresolvedOverlayHistory = entry => isPlainObject(entry) && (entry.action || 'edit') === 'edit';

// Та сама зміна без розсуджених значень — або `null`, коли пропонувати в ній
// більше нічого. Заміна (`from`/`to`) несе одне значення, тож від неї
// лишитись нічого не може; масив — може.
const withoutSettledValues = (change, settledValues) => {
  if (!isPlainObject(change) || 'from' in change || 'to' in change) return null;
  const { pairs } = getOverlayListReviewValues(change);
  if (pairs.length) {
    return {
      ...listChange(
        normalizeArray(change.added).filter(value => (
          !settledValues.has(valueLabel(value)) || pairs.some(pair => areProposalValuesEqual(pair.to, value))
        )),
        normalizeArray(change.removed).filter(value => (
          !settledValues.has(valueLabel(value)) || pairs.some(pair => areProposalValuesEqual(pair.from, value))
        )),
      ),
      replacements: pairs,
    };
  }
  const keep = values => uniq(normalizeArray(values)
    .map(value => String(value ?? '').trim())
    .filter(value => value && !settledValues.has(value)));
  const added = keep(change.added ?? change.add);
  const removed = keep(change.removed);
  if (!added.length && !removed.length) return null;
  return {
    ...(added.length ? { added } : {}),
    ...(removed.length ? { removed } : {}),
  };
};

const removeHistoricalReplacement = (change, replacement, remainingReplacements) => {
  const { pairs } = getOverlayListReviewValues(change);
  if (pairs.length) {
    if (!pairs.some(pair => sameReplacement(pair, replacement))) return change;
    const split = splitPairedListChange(change, replacement);
    return {
      ...split.remainingChange,
      ...(split.remainingReplacements.length && { replacements: split.remainingReplacements }),
    };
  }

  // Старі записи не позначали пари. Обидва кінці повинні бути в тому самому
  // записі, інакше можна стерти чуже незалежне додавання або видалення.
  const added = normalizeArray(change?.added ?? change?.add);
  const removed = normalizeArray(change?.removed);
  if (!hasValue(added, replacement.to) || !hasValue(removed, replacement.from)) return change;
  const targetStillProposed = remainingReplacements.some(pair => areProposalValuesEqual(pair.to, replacement.to));
  return listChange(
    added.filter(value => targetStillProposed || !areProposalValuesEqual(value, replacement.to)),
    removed.filter(value => !areProposalValuesEqual(value, replacement.from)),
  );
};

// A settled edit must leave nothing behind: once a value has been saved into
// the card or thrown away, the journal entries that only described that value
// are deleted too, so the review queue never grows a tail of memos about work
// that is already done. Entries with no values of their own (`discarded`
// markers) are always dropped - they are pure bookkeeping.
export const purgeOverlayHistoryEntries = async ({
  cardUserId,
  editorUserId,
  fieldName,
  values = [],
  replacement,
  remainingReplacements = [],
  beforeWrite,
  throwOnError = false,
}) => {
  const normalizedCardId = normalizeCardKey(cardUserId);
  if (!normalizedCardId || !fieldName) return 0;

  const settledValues = new Set(values.map(value => String(value ?? '').trim()).filter(Boolean));

  try {
    const historyRef = ref2(database, `${EDITS_HISTORY_ROOT}/${normalizedCardId}`);
    const snapshot = await get(historyRef);
    if (!snapshot?.exists?.() && !beforeWrite) return 0;

    const history = snapshot?.exists?.() ? snapshot.val() || {} : {};
    const removedAliases = [];
    const updates = Object.entries(history).reduce((acc, [entryId, entry]) => {
      if (!isPlainObject(entry) || entry.fieldName !== fieldName) return acc;
      if (editorUserId && entry.editorUserId && entry.editorUserId !== editorUserId) return acc;

      if (!replacement) {
        const entryValues = changeProposalValues(entry.change);
        if (settledValues.size && entryValues.length && !entryValues.some(value => settledValues.has(value))) return acc;
      }

      // Один запис журналу — це одне збереження поля, і несе він усе, що в
      // тому збереженні було: `{ added: [A, B] }`. Розсудили лише A — а B
      // мусить лишитись, інакше він зникає з «попередніх версій» разом із
      // чужим рішенням. Частково переписати запис правила не дають (його
      // можна лише створити й видалити), тож старий знімається, а замість
      // нього пишеться новий — із рештою значень, тим самим автором і часом.
      const remainingChange = replacement
        ? removeHistoricalReplacement(entry.change, replacement, remainingReplacements)
        : (settledValues.size ? withoutSettledValues(entry.change, settledValues) : null);
      if ((replacement && remainingChange === entry.change)
        || (remainingChange && areProposalValuesEqual(remainingChange, entry.change))) return acc;
      acc[entryId] = null;
      if (beforeWrite && isUnresolvedOverlayHistory(entry)) {
        removedAliases.push(...collectOverlayIndexValues({ [fieldName]: entry.change }));
      }
      if (remainingChange && Object.keys(remainingChange).length) {
        const key = push(historyRef).key;
        if (key) acc[key] = { ...entry, change: remainingChange };
      }
      return acc;
    }, {});

    if (beforeWrite) {
      await beforeWrite(Object.values({ ...history, ...updates }).filter(Boolean), removedAliases);
    }
    if (Object.keys(updates).length) await update(historyRef, updates);
    // Лічильник — знятих записів; переписані замість них сюди не входять.
    return Object.values(updates).filter(value => value === null).length;
  } catch (error) {
    console.warn('[multiAccountEdits] failed to purge overlay history', error);
    if (throwOnError) throw error;
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

export const removeOverlayForUserCard = async ({ editorUserId, cardUserId, expectedCurrent }) => {
  if (!editorUserId || !cardUserId) return;

  const normalizedCardId = normalizeCardKey(cardUserId);
  if (!normalizedCardId) return;

  const overlayRef = ref2(database, `${EDITS_ROOT}/${normalizedCardId}/${editorUserId}`);
  const usesRevisionCheck = expectedCurrent !== undefined;
  if (expectedCurrent?.reviewClaim) throw overlayError('REVISION_CONFLICT');
  const canPruneAliases = canGrantProfilePrivileges(auth?.currentUser?.uid);
  const withdrawn = canPruneAliases ? (
    usesRevisionCheck ? expectedCurrent : await readOverlayRecord({ cardUserId: normalizedCardId, editorUserId })
  ) : null;
  if (usesRevisionCheck) await replaceOverlayIfUnchanged(overlayRef, expectedCurrent, null);
  else await remove(overlayRef);

  try {
    await forgetOwnOverlayCard({ cardUserId: normalizedCardId, editorUserId, throwOnError: usesRevisionCheck });
    if (withdrawn) {
      // Журнал ще доступний для перегляду. Його версії тримають ключ пошуку,
      // доки адміністратор явно не вирішить про значення.
      await pruneUnclaimedOverlayAliases(normalizedCardId, collectOverlaySearchIdValues(withdrawn));
    }
  } catch (error) {
    if (!usesRevisionCheck) throw error;
    throw overlayError('PARTIAL_WRITE', error);
  }
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

const hasOverlayChangeValues = change => Boolean(
  change && (change.to || change.from || change.added?.length || change.removed?.length)
);

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
export const buildOverlayFieldEntries = (overlaysByEditor = {}, { recordsByEditor } = {}) => {
  const result = {};

  const pushEntry = (fieldName, entry) => {
    const fieldEntries = result[fieldName] || [];
    if (fieldEntries.some(item => (
      item.value === entry.value && item.editorUserId === entry.editorUserId
      && ((!item.replacement && !entry.replacement) || sameReplacement(item.replacement, entry.replacement))
    ))) return;
    result[fieldName] = [...fieldEntries, entry];
  };

  Object.entries(overlaysByEditor || {}).forEach(([editorUserId, overlay]) => {
    const fields = getOverlayReviewFields(recordsByEditor?.[editorUserId] ?? overlay?.expectedCurrent ?? overlay);

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

      const { pairs, added, removed } = getOverlayListReviewValues(change);
      pairs.forEach(replacement => pushEntry(fieldName, {
        value: valueLabel(replacement.to),
        previousValue: valueLabel(replacement.from),
        editorUserId,
        isDeleted: false,
        replacement,
      }));
      added.forEach(value => {
        const normalized = String(value ?? '').trim();
        if (normalized) pushEntry(fieldName, { value: normalized, editorUserId, isDeleted: false });
      });

      removed.forEach(value => {
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

const splitPairedListChange = (change, replacement) => {
  const { pairs } = getOverlayListReviewValues(change);
  const remainingReplacements = pairs.filter(pair => !sameReplacement(pair, replacement));
  const added = normalizeArray(change.added).filter(value => (
    !areProposalValuesEqual(value, replacement.to)
    || remainingReplacements.some(pair => areProposalValuesEqual(pair.to, value))
  ));
  const removed = normalizeArray(change.removed).filter(value => !areProposalValuesEqual(value, replacement.from));
  return {
    settledChange: { added: [replacement.to], removed: [replacement.from] },
    remainingChange: listChange(added, removed),
    remainingReplacements,
    replacement,
  };
};

export const splitOverlayReviewChange = (record, fieldName, value, replacement) => {
  const change = getOverlayReviewFields(record)[fieldName];
  const { pairs, added, removed } = getOverlayListReviewValues(change);
  if (!pairs.length && !replacement) return splitOverlayChangeByValue(change, value);

  const matches = pairs.filter(pair => (
    valueLabel(pair.to) === valueLabel(value) && (!replacement || sameReplacement(pair, replacement))
  ));
  if (matches.length === 1) return splitPairedListChange(change, matches[0]);
  if (replacement || matches.length > 1) return { settledChange: null };

  // A replacement's original value must not be settled as a separate removal.
  const selectedAdded = added.filter(item => valueLabel(item) === valueLabel(value));
  const selectedRemoved = removed.filter(item => valueLabel(item) === valueLabel(value));
  if (!selectedAdded.length && !selectedRemoved.length) return { settledChange: null };
  return {
    settledChange: listChange(selectedAdded, selectedRemoved),
    remainingChange: listChange(
      normalizeArray(change.added).filter(item => !hasValue(selectedAdded, item)),
      normalizeArray(change.removed).filter(item => !hasValue(selectedRemoved, item)),
    ),
  };
};

const aliasKey = ({ field, value }) => {
  const key = buildSearchIdValueKey(field, value);
  return key ? JSON.stringify([field, key]) : null;
};

// Ключ `searchId` називає картку. Різні написання контакту в анкеті,
// залишку шару того самого автора й ще не розсудженому журналі можуть
// посилатись на цей самий ключ. Відмова читання не доводить відсутності.
const pruneUnclaimedOverlayAliases = async (cardUserId, aliases, remainingHistory) => {
  const candidates = new Map(aliases.map(alias => [aliasKey(alias), alias]));
  candidates.delete(null);
  if (!candidates.size) return;

  const [canonical, overlays, history] = await Promise.all([
    getCanonicalCard(cardUserId),
    getOverlaysForCard(cardUserId, { includeRecords: true }),
    remainingHistory ?? getOverlayHistoryForCard(cardUserId),
  ]);
  const referenced = new Set([
    ...Object.values(overlays).flatMap(overlay => collectOverlaySearchIdValues(overlay.expectedCurrent ?? overlay)),
    ...history.filter(isUnresolvedOverlayHistory).flatMap(entry => (
      collectOverlayIndexValues({ [entry.fieldName]: entry.change })
    )),
  ].map(aliasKey));

  for (const [key, { field, value }] of candidates) {
    const inCanonical = normalizeArray(canonical?.[field]).some(candidate => aliasKey({ field, value: candidate }) === key);
    if (!inCanonical && !referenced.has(key)) {
      // eslint-disable-next-line no-await-in-loop
      await updateSearchId(field, value, cardUserId, 'remove', { verify: true, throwOnError: true });
    }
  }
};

const buildSettledOverlay = ({
  overlay, fieldName, remainingChange, acceptedOriginal, remainingReplacements, guarded,
}) => {
  const fields = { ...(overlay?.fields || {}) };
  if (hasOverlayChangeValues(remainingChange)) fields[fieldName] = remainingChange;
  else delete fields[fieldName];
  if (shouldDropOverlayByFieldNames(Object.keys(fields))) return null;

  const next = { ...overlay, fields };
  if (guarded) {
    delete next.reviewClaim;
    if (Number.isSafeInteger(next.proposal?.revision)) {
      next.proposal = { ...next.proposal, revision: next.proposal.revision + 1 };
      if (remainingReplacements) {
        const replacements = readReplacementMap(next.proposal);
        if (remainingReplacements.length) replacements[fieldName] = remainingReplacements;
        else delete replacements[fieldName];
        next.proposal.replacements = JSON.stringify(replacements);
      }
      if (acceptedOriginal || !hasOverlayChangeValues(remainingChange)) {
        const originals = JSON.parse(next.proposal.originalValues || '{}');
        if (hasOverlayChangeValues(remainingChange)) originals[fieldName] = acceptedOriginal;
        else delete originals[fieldName];
        next.proposal.originalValues = JSON.stringify(originals);
      }
    }
  }
  return next;
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
  expectedCurrent,
  acceptedOriginal,
  replacement,
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
  let prefetchedOverlay;
  if (expectedCurrent === undefined) {
    const editorSnapshot = await get(editorRef);
    if (!editorSnapshot?.exists?.()) return null;
    prefetchedOverlay = editorSnapshot.val();
  }

  let settledChange = null;
  let remainingChange = null;
  let settledReplacement;
  let remainingReplacements;
  let removedEditorOverlay = false;
  let remainingOverlay;
  const removeSelectedValue = effectiveOverlay => {
    if (effectiveOverlay?.reviewClaim && (expectedCurrent === undefined || action !== 'accept')) return undefined;
    const split = splitOverlayReviewChange(effectiveOverlay, fieldName, value, replacement);
    settledChange = split.settledChange;
    remainingChange = split.remainingChange;
    settledReplacement = split.replacement;
    remainingReplacements = split.remainingReplacements;
    if (!settledChange || (settledReplacement && expectedCurrent === undefined)) return undefined;

    const next = buildSettledOverlay({
      overlay: effectiveOverlay, fieldName, remainingChange, acceptedOriginal, remainingReplacements,
      guarded: expectedCurrent !== undefined,
    });
    removedEditorOverlay = next === null;
    return next;
  };
  if (expectedCurrent === undefined) {
    const transaction = await runTransaction(editorRef, currentOverlay => (
      removeSelectedValue(currentOverlay || prefetchedOverlay)
    ));
    if (!transaction.committed || !settledChange) return null;
  } else {
    const next = removeSelectedValue(expectedCurrent);
    if (next === undefined) return null;
    remainingOverlay = await replaceOverlayIfUnchanged(editorRef, expectedCurrent, next);
  }
  const result = {
    settledChange, remainingChange,
    ...(expectedCurrent !== undefined && { remainingOverlay }),
  };

  if (removedEditorOverlay) await forgetOwnOverlayCard({ editorUserId, cardUserId: normalizedCardId });
  const submitted = valueLabel(value);
  const correctedValue = valueLabel(acceptedValue ?? value);
  const indexedField = SEARCH_ID_INDEXED_FIELDS.has(fieldName);
  const corrected = action === 'accept' && indexedField && correctedValue && correctedValue !== submitted
    && (expectedCurrent === undefined || settledChange.to || settledChange.added?.length);
  const retired = action === 'accept'
    ? [
      ...(corrected ? [submitted] : []),
      ...(indexedField && expectedCurrent !== undefined ? normalizeArray(settledChange.removed ?? settledChange.from) : []),
    ].map(oldValue => ({ field: fieldName, value: oldValue }))
    : collectOverlayIndexValues({ [fieldName]: settledChange });
  const beforeWrite = retired.length || corrected ? async history => {
    if (corrected) {
      await updateSearchId(fieldName, correctedValue, normalizedCardId, 'add', { verify: true, throwOnError: true });
    }
    await pruneUnclaimedOverlayAliases(normalizedCardId, retired, history);
  } : undefined;

  // Розсуджене значення не лишає по собі нічого: ні рядка «прийнято», ні
  // рядка «відхилено». Доти кожне рішення адміна дописувало в журнал ще один
  // запис, і журнал, який мав тримати **непрочитані** версії правок, ріс
  // слідами вже зробленої роботи. Прийняте тепер живе в анкеті, відхилене —
  // ніде, тож і записи про нього йдуть геть.
  await purgeOverlayHistoryEntries({
    cardUserId: normalizedCardId,
    editorUserId,
    fieldName,
    values: changeProposalValues(settledChange),
    replacement: settledReplacement,
    remainingReplacements,
    beforeWrite,
    throwOnError: true,
  });

  return result;
};

/**
 * Порівняння значень так, як їх порівнює індекс: для полів `searchId` —
 * нормалізованим ключем («38 050 …» і «38050…» — один номер), для решти —
 * обрізаним рядком.
 */
const overlayValueKey = (fieldName, value) => {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return '';
  if (SEARCH_ID_INDEXED_FIELDS.has(fieldName)) return buildSearchIdValueKey(fieldName, trimmed) || trimmed;
  return trimmed;
};

const canonicalValueKeys = (canonical, fieldName) => new Set(
  normalizeArray(canonical?.[fieldName]).map(value => overlayValueKey(fieldName, value)).filter(Boolean),
);

// Значення, які зміна **пропонує внести** в картку: нове значення заміни або
// дописане в масив.
const proposedChangeValues = rawChange => {
  const change = normalizeOverlayChange(rawChange);
  if (!isPlainObject(change)) return [];
  if ('to' in change || 'from' in change) {
    const to = String(change.to ?? '').trim();
    const from = String(change.from ?? '').trim();
    return to
      ? [{ value: to, isDeleted: false }]
      : (from ? [{ value: from, isDeleted: true }] : []);
  }
  const additions = uniq(normalizeArray(change.added ?? change.add)
    .map(value => String(value ?? '').trim())
    .filter(Boolean))
    .map(value => ({ value, isDeleted: false }));
  const removals = uniq(normalizeArray(change.removed)
    .map(value => String(value ?? '').trim())
    .filter(Boolean))
    .map(value => ({ value, isDeleted: true }));
  return [...additions, ...removals];
};

/**
 * Попередні версії правки, яких у шарі вже немає.
 *
 * Шар редактора тримає лише **поточну** різницю з карткою: кожне збереження
 * його переписує. Тож коли читач заміняв номер на А, а потім поправив А на Б,
 * адмін бачив самий лише Б — перша правка лишалась тільки в журналі
 * (`editsHistory`), а журнал форма адміна не читала. Виглядало це так, ніби
 * історії правок немає взагалі, хоч записана вона була.
 *
 * Тут журнал розкладається назад у пропозиції: кожне значення, яке редактор
 * колись пропонував (`edit`), але якого вже немає ні в чиєму поточному шарі й
 * немає в самій картці, стає окремим рядком із позначкою `superseded`. Рядок
 * розсуджується так само, як поточний: «ОК» вносить значення в картку, «×»
 * прибирає, і обидва знімають записи журналу про нього
 * (`settleSupersededOverlayValue`).
 */
export const buildSupersededOverlayEntries = ({ historyEntries = [], overlaysByEditor = {}, canonical = null } = {}) => {
  const currentKeysByField = {};
  Object.values(overlaysByEditor || {}).forEach(overlay => {
    Object.entries(normalizeOverlayFields(overlay?.fields)).forEach(([fieldName, change]) => {
      if (!isPlainObject(change)) return;
      const keys = currentKeysByField[fieldName] || new Set();
      proposedChangeValues(change).forEach(({ value, isDeleted }) => {
        const key = overlayValueKey(fieldName, value);
        if (key) keys.add(`${isDeleted ? 'deleted' : 'added'}::${key}`);
      });
      currentKeysByField[fieldName] = keys;
    });
  });

  const result = {};
  const seen = new Set();
  [...(historyEntries || [])]
    .filter(isUnresolvedOverlayHistory)
    .sort((a, b) => Number(a.at || 0) - Number(b.at || 0))
    .forEach(entry => {
      const { fieldName, editorUserId } = entry;
      if (!fieldName || !editorUserId || TECHNICAL_FIELD_NAMES.has(fieldName) || fieldName === 'editor') return;
      const canonicalKeys = canonicalValueKeys(canonical, fieldName);
      const currentKeys = currentKeysByField[fieldName] || new Set();
      proposedChangeValues(entry.change).forEach(({ value, isDeleted }) => {
        const key = overlayValueKey(fieldName, value);
        const canonicalAlreadySettled = isDeleted ? !canonicalKeys.has(key) : canonicalKeys.has(key);
        const currentKey = `${isDeleted ? 'deleted' : 'added'}::${key}`;
        if (!key || canonicalAlreadySettled || currentKeys.has(currentKey)) return;
        // Однакові пропозиції різних редакторів — різні рядки журналу.
        // Рішення чистить історію конкретного автора, тому й сховати другого
        // глобальною дедуплікацією тут не можна.
        const seenKey = `${fieldName}::${editorUserId}::${isDeleted ? 'deleted' : 'added'}::${key}`;
        if (seen.has(seenKey)) return;
        seen.add(seenKey);
        result[fieldName] = [
          ...(result[fieldName] || []),
          { value, editorUserId, isDeleted, superseded: true, at: Number(entry.at) || 0 },
        ];
      });
    });

  return result;
};

/**
 * Рішення адміна про попередню версію правки (див. `buildSupersededOverlayEntries`).
 *
 * У шарі цього значення вже немає, тож знімати там нічого: рішення — це
 * підчистити журнал, щоб версія не повертались у форму, і, якщо її
 * відхилили, зняти ключ `searchId`, який шар завів на неї тоді, коли вона
 * була поточною. Ключ знімається після перевірки самої анкети, поточних
 * шарів і нерозсуджених записів журналу.
 */
export const settleSupersededOverlayValue = async ({
  editorUserId,
  cardUserId,
  fieldName,
  value,
  acceptedValue,
  action = 'discard',
}) => {
  const normalizedCardId = normalizeCardKey(cardUserId);
  const normalizedValue = String(value ?? '').trim();
  if (!normalizedCardId || !fieldName || !normalizedValue) return null;

  const correctedValue = valueLabel(acceptedValue ?? normalizedValue);
  const corrected = action === 'accept' && correctedValue && correctedValue !== normalizedValue;
  const beforeWrite = SEARCH_ID_INDEXED_FIELDS.has(fieldName) && (corrected || action === 'discard')
    ? async (history, removedAliases) => {
      const selected = aliasKey({ field: fieldName, value: normalizedValue });
      const retired = removedAliases.filter(alias => aliasKey(alias) === selected);
      if (!retired.length) return;
      if (corrected) {
        await updateSearchId(fieldName, correctedValue, normalizedCardId, 'add', { verify: true, throwOnError: true });
      }
      await pruneUnclaimedOverlayAliases(normalizedCardId, retired, history);
    }
    : undefined;

  // Індекс перевіряється першим: якщо читання чи зняття ключа не вдалося,
  // журнал лишається видимим і рішення можна безпечно повторити.
  await purgeOverlayHistoryEntries({
    cardUserId: normalizedCardId,
    editorUserId,
    fieldName,
    values: [normalizedValue],
    beforeWrite,
    throwOnError: true,
  });
  return { settled: true };
};

/**
 * Прибрати з шарів те, що в картці вже є.
 *
 * Шар — це різниця з карткою, і щойно картка сама почала містити
 * запропоноване значення (адмін вписав його руками, його прийняли з іншого
 * шару, анкету поправила сама власниця), пропозиція перестає щось
 * пропонувати: вона лише дублює канонічне значення на бекенді й висить у черзі
 * адміна як нерозсуджена. Те саме з пропозицією прибрати значення, якого в
 * картці вже немає. Такі значення знімаються так само, як прийняті, — разом зі
 * своїми записами в журналі.
 *
 * Повертає кількість знятих значень; викликач перечитує шари, коли вона не 0.
 */
export const pruneOverlaysMatchingCanonical = async ({ cardUserId, canonical, overlaysByEditor } = {}) => {
  const normalizedCardId = normalizeCardKey(cardUserId);
  if (!normalizedCardId || !isPlainObject(canonical)) return 0;

  const redundant = [];
  Object.entries(overlaysByEditor || {}).forEach(([editorUserId, overlay]) => {
    Object.entries(getOverlayReviewFields(overlay?.expectedCurrent ?? overlay)).forEach(([fieldName, change]) => {
      if (!isPlainObject(change) || TECHNICAL_FIELD_NAMES.has(fieldName) || fieldName === 'editor') return;
      const canonicalKeys = canonicalValueKeys(canonical, fieldName);
      if ('to' in change || 'from' in change) {
        const to = String(change.to ?? '').trim();
        const from = String(change.from ?? '').trim();
        if (to && canonicalKeys.has(overlayValueKey(fieldName, to))) redundant.push({ editorUserId, fieldName, value: to });
        else if (!to && from && !canonicalKeys.has(overlayValueKey(fieldName, from))) {
          redundant.push({ editorUserId, fieldName, value: from });
        }
        return;
      }
      const { added, removed } = getOverlayListReviewValues(change);
      added.forEach(value => {
        const trimmed = String(value ?? '').trim();
        if (trimmed && canonicalKeys.has(overlayValueKey(fieldName, trimmed))) {
          redundant.push({ editorUserId, fieldName, value: trimmed });
        }
      });
      removed.forEach(value => {
        const trimmed = String(value ?? '').trim();
        if (trimmed && !canonicalKeys.has(overlayValueKey(fieldName, trimmed))) {
          redundant.push({ editorUserId, fieldName, value: trimmed });
        }
      });
    });
  });

  let pruned = 0;
  const currentByEditor = new Map(Object.entries(overlaysByEditor || {}).map(([editorId, overlay]) => (
    [editorId, overlay?.expectedCurrent ?? overlay]
  )));
  for (const item of redundant) {
    try {
      const expectedCurrent = currentByEditor.get(item.editorUserId);
      if (usesUnifiedProposalStorage && !expectedCurrent) continue;
      // eslint-disable-next-line no-await-in-loop
      const result = await settleOverlayValueForCard({
        ...item,
        cardUserId: normalizedCardId,
        acceptedValue: item.value,
        action: 'accept',
        ...(usesUnifiedProposalStorage && { expectedCurrent }),
      });
      if (result) {
        pruned += 1;
        if (usesUnifiedProposalStorage) currentByEditor.set(item.editorUserId, result.remainingOverlay);
      }
    } catch (error) {
      console.warn('[multiAccountEdits] failed to prune overlay value present on the card', { ...item, error });
    }
  }
  return pruned;
};

/**
 * Знести все, що про цю картку знає шар доповнень, — разом із карткою.
 *
 * Журнал, перелік дописувачів і позначки в переліках редакторів — сліди правок
 * живої картки, і знімати їх при звичайному «розсудили» не можна. А коли
 * картки більше немає, ці сліди вказують у порожнечу: журнал під `cardId`,
 * якого не існує, і рядок у власному переліку доповнень, що відкриває
 * неіснуючу анкету.
 *
 * Перелік редакторів береться з `getCardContributorIds` — оберненого індексу
 * «картка → хто дописував» немає (див. `listPendingOverlayCards`), тож читаємо
 * вузол картки, поки він ще є, і аж потім зносимо.
 */
export const purgeCardOverlays = async (cardUserId, { throwOnError = false, removeSearchAliases = false } = {}) => {
  const normalizedCardId = normalizeCardKey(cardUserId);
  if (!normalizedCardId) return { editorUserIds: [] };

  // Перелік уже зводить обидва джерела — вузол дописувачів і самі шари — і
  // відмову кожного з них переживає окремо: прочитати їх може не вийти
  // (правила), і це не привід лишити картку напівживою.
  const editorUserIds = await getCardContributorIds(normalizedCardId, { throwOnError });
  const historyEntries = await getOverlayHistoryForCard(normalizedCardId).catch(error => {
    if (throwOnError) throw error;
    console.warn('[multiAccountEdits] журнал правок не прочитано', error);
    return [];
  });

  // Видалення цілі знімає її ID зі спільного індексу, поки значення ще є у
  // головних записах і журналі. Відмова лишає джерела доступними для повтору.
  if (removeSearchAliases) {
    const overlays = await getOverlaysForCard(normalizedCardId, { includeRecords: true });
    const candidates = [
      ...Object.values(overlays).flatMap(overlay => collectOverlaySearchIdValues(overlay.expectedCurrent ?? overlay)),
      ...historyEntries.flatMap(entry => collectOverlayIndexValues({ [entry.fieldName]: entry.change })),
    ];
    const aliases = new Map(candidates.map(candidate => [aliasKey(candidate), candidate]));
    await Promise.all([...aliases.values()].map(({ field, value }) => (
      updateSearchId(field, value, normalizedCardId, 'remove', { throwOnError: true })
    )));
  }

  // Зноситься поіменно, а не вузлом картки, і це не про акуратність, а про
  // права: у `database.rules.json` `.write` стоїть на `edits/$картка/$редактор`
  // і на `editsHistory/$картка/$запис`, а на самій картці його немає — запис у
  // батьківський вузол відхиляється цілком. Один `remove` по картці виглядав би
  // як «видалено», лишаючи і шари, і журнал на місці.
  const [roster, ...results] = await Promise.allSettled([
    remove(ref2(database, `${EDITS_CONTRIBUTORS_ROOT}/${normalizedCardId}`)),
    ...editorUserIds.map(editorUserId => remove(
      ref2(database, `${EDITS_ROOT}/${normalizedCardId}/${editorUserId}`),
    )),
    ...historyEntries.map(entry => remove(
      ref2(database, `${EDITS_HISTORY_ROOT}/${normalizedCardId}/${entry.backendEntryId}`),
    )),
    ...editorUserIds.map(editorUserId => forgetOwnOverlayCard({
      editorUserId,
      cardUserId: normalizedCardId,
      throwOnError,
    })),
  ]);
  if (throwOnError) {
    const failure = results.find(result => result.status === 'rejected');
    if (failure) throw failure.reason;
    // У старих правил немає дозволу на реєстр. Інші збої очищення цього
    // вузла важливі, коли він доступний.
    if (roster.status === 'rejected'
      && ![roster.reason?.code, roster.reason?.message].some(value => (
        /permission[-_ ]denied/i.test(value || '')
      ))) throw roster.reason;
  }

  return { editorUserIds };
};

/**
 * Clear pending values when a live draft is reset, without erasing its audit
 * trail or contributor roster. Draft creators are allowed by the database
 * rules to remove these active nodes; unlike the card-deletion purge, a
 * failure is surfaced and the remaining nodes are verified before success.
 */
export const clearCardOverlays = async cardUserId => {
  const normalizedCardId = normalizeCardKey(cardUserId);
  if (!normalizedCardId) return;

  const overlays = await getOverlaysForCard(normalizedCardId);
  await Promise.all(Object.keys(overlays).flatMap(editorUserId => [
    remove(ref2(database, `${EDITS_ROOT}/${normalizedCardId}/${editorUserId}`)),
    forgetOwnOverlayCard({ editorUserId, cardUserId: normalizedCardId, throwOnError: true }),
  ]));

  const remaining = await getOverlaysForCard(normalizedCardId);
  if (Object.keys(remaining).length) throw new Error('OVERLAY_CLEAR_INCOMPLETE');
};

// ---------------------------------------------------------------------------
// Черга доповнень цілком — вхід адміна в перегляд «усе, що дописали».
// ---------------------------------------------------------------------------

/**
 * Усі картки, під якими зараз лежить бодай один шар, одним читанням.
 *
 * Оберненого індексу «картка → є шар» немає й не буде: шари лежать **під
 * карткою** (`multiData/edits/{картка}/{редактор}`), а перелік власних
 * доповнень (`editsByEditor`) знає лише свого редактора — щоб зібрати з нього
 * чергу, довелось би спершу перелічити всіх редакторів, тобто прочитати той
 * самий корінь. Тому черга береться прямо з кореня, і `.read` на ньому в
 * `database.rules.json` має рівно адмін: доповнити картку може кожен, а
 * «подивитись, хто що дописав» — ні (та сама межа, що й для переліку чернеток).
 *
 * Читання дороге, тож воно **на дотик**: його робить кнопка перегляду черги, а
 * не стрічка й не пошук. Відмова тут — це не порожня черга: викликач мусить
 * показати причину (найімовірніша — нерозгорнуті правила), інакше «черга
 * порожня» бреше рівно тоді, коли доповнень найбільше.
 */
export const readOverlayRecordsForReview = async () => {
  const snapshot = await get(ref2(database, EDITS_ROOT));
  return snapshot.exists() ? snapshot.val() || {} : {};
};

export const listPendingOverlayCards = async ({ includeRecords = false } = {}) => {
  const byCard = await readOverlayRecordsForReview();

  return Object.entries(byCard)
    .map(([cardUserId, editors]) => {
      const overlaysByEditor = {};
      Object.entries(editors || {}).forEach(([editorUserId, overlay]) => {
        const normalized = normalizeEditorNode(overlay, cardUserId, editorUserId);
        if (normalized) overlaysByEditor[editorUserId] = normalized;
      });

      const editorIds = Object.keys(overlaysByEditor);
      if (!editorIds.length) return null;

      const fieldNames = getStackedOverlayFieldNames(overlaysByEditor);
      if (!fieldNames.length) return null;

      const updatedAt = editorIds.reduce(
        (latest, editorUserId) => Math.max(latest, Number(overlaysByEditor[editorUserId]?.updatedAt) || 0),
        0,
      );

      return {
        cardUserId, overlaysByEditor, editorIds, fieldNames, updatedAt,
        ...(includeRecords && { recordsByEditor: editors }),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.updatedAt - a.updatedAt || a.cardUserId.localeCompare(b.cardUserId));
};
