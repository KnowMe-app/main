import { get as firebaseGet, ref as ref2 } from 'firebase/database';
import { auth, database } from 'components/config';
import { ADMIN_UIDS, READONLY_ADMIN_UIDS } from 'utils/accessLevel';
import { getCard } from 'utils/cardIndex';
import { resolveMatchingMultiDataOwnerIds } from 'utils/multiDataAccess';
import { noteRealtimeDemand } from 'utils/realtimeConnectionManager';

/*
 * Те, що належить картці, але в анкеті не лежить, — для блоку «усі поля»
 * (`renderAllFields`).
 *
 * Той блок — перевірка «що справді збереглось»: кнопка щоразу перечитує
 * анкету з бекенду. Але анкета — це лише пʼять вузлів, а нотатки, відгуки,
 * реакції, доповнення й програми живуть поруч, у власних сховищах, і блок їх
 * не показував зовсім: записаний коментар не було чим перевірити.
 *
 * Тут кожне таке місце читається **прямим `get` з бази на кожне
 * розгортання** — повз кеш нотаток (`commentPointCache`, кеш пристрою) і кеш
 * відгуків: блок мусить показувати базу, а не памʼять браузера. Відмова чи
 * збій читання — не «порожньо», а рядок з причиною: інакше перевірка
 * казала б «не збереглось» там, де їй просто не дали прочитати.
 *
 * Це не «Усі дані картки в базі» (`utils/profileDataTree`): там — сирі вузли
 * за шляхами з правкою на місці, тут — зведений перегляд для очей.
 */

export const CARD_BACKEND_EXTRAS_STATUS = Object.freeze({
  loading: 'loading',
  ready: 'ready',
});

// Позначки власника, які анкета не несе: `getInTouch`, `writer` і
// `stimulationSchedule` `readProfileFromNodes` уже кладе в саму картку.
const OWNER_MARK_STORES = [
  ['favorites', 'Вподобано'],
  ['dislikes', 'Не цікаво'],
  ['contactViews', 'Дотики до контактів'],
  ['stimulation', 'Таблиця стимуляції'],
  ['stimulationShortcuts', 'Ярлик графіка'],
];

const state = new Map();
const listeners = new Set();
let requestSeq = 0;

const emit = () => {
  listeners.forEach(listener => listener());
};

export const subscribeCardBackendExtras = listener => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getCardBackendExtras = cardId => state.get(String(cardId || '')) || null;

const describeReadError = error => {
  const message = String(error?.message || error || '');
  if (/permission/i.test(message)) return 'немає доступу (правила бази)';
  return message || 'не вдалося прочитати';
};

const readPath = async path => {
  try {
    const snap = await firebaseGet(ref2(database, path));
    return { path, value: snap.exists() ? snap.val() : null };
  } catch (error) {
    return { path, value: null, error: describeReadError(error) };
  }
};

/**
 * Чиї особисті нотатки питати. Перелічити `multiData/comments` цілком правила
 * не дають нікому, тож питаємо тих, кого знаємо: себе, власників спільного
 * доступу й адмінів (їхні нотатки адмінам відкриті; чужу відмову покаже рядок).
 */
export const listNoteOwnerIds = viewerId => {
  const viewer = String(viewerId || '').trim();
  const profile = viewer ? getCard(viewer) : null;
  const owners = [
    viewer,
    ...resolveMatchingMultiDataOwnerIds({ viewerId: viewer, profile }),
    ...ADMIN_UIDS,
    ...READONLY_ADMIN_UIDS,
  ].map(id => String(id || '').trim()).filter(Boolean);
  return [...new Set(owners)];
};

/** Перелік місць для картки: `{ id, title, path, owner? }`. */
export const buildCardBackendExtraSources = (cardId, viewerId) => {
  const id = String(cardId || '').trim();
  if (!id) return [];
  const viewer = String(viewerId || '').trim();
  const sources = [];

  listNoteOwnerIds(viewer).forEach(ownerId => {
    sources.push({
      id: `note:${ownerId}`,
      group: 'notes',
      title: ownerId === viewer ? 'Особиста нотатка (ваша)' : `Особиста нотатка (${ownerId})`,
      path: `multiData/comments/${ownerId}/${id}`,
      owner: ownerId,
    });
  });

  sources.push({ id: 'public', group: 'public', title: 'Публічні відгуки', path: `comments/${id}` });

  if (viewer) {
    OWNER_MARK_STORES.forEach(([store, title]) => {
      sources.push({
        id: `mark:${store}`,
        group: 'marks',
        title: `${title} (ваше)`,
        path: `multiData/${store}/${viewer}/${id}`,
      });
    });
  }

  sources.push(
    { id: 'edits', group: 'edits', title: 'Доповнення редакторів', path: `multiData/edits/${id}` },
    { id: 'editsHistory', group: 'edits', title: 'Журнал доповнень', path: `multiData/editsHistory/${id}` },
    { id: 'programs', group: 'programs', title: 'Програми', path: `multiData/programs/${id}` },
    { id: 'draftOwner', group: 'draft', title: 'Автор чернетки', path: `multiData/profileMutationOwners/${id}` },
    { id: 'draftHistory', group: 'draft', title: 'Журнал чернетки', path: `multiData/profileMutationHistory/${id}` },
  );

  return sources;
};

/**
 * Перечитує все з бази й кладе в памʼять вкладки. Відповідь старішого виклику
 * для тієї ж картки не перебиває новішу.
 */
export const loadCardBackendExtras = async (cardId, { viewerId = auth.currentUser?.uid } = {}) => {
  const id = String(cardId || '').trim();
  if (!id) return null;
  const seq = ++requestSeq;
  const previous = state.get(id);
  state.set(id, { ...(previous || {}), status: CARD_BACKEND_EXTRAS_STATUS.loading, seq });
  emit();

  noteRealtimeDemand();
  const sources = buildCardBackendExtraSources(id, viewerId);
  const results = await Promise.all(sources.map(async source => ({ ...source, ...(await readPath(source.path)) })));

  // Чужа нотатка, якої немає або яку не дали прочитати, — не дані картки:
  // список адмінів і спільних власників питається наосліп.
  const entries = results.filter(entry => (
    entry.group !== 'notes' || entry.owner === viewerId || (entry.value !== null && !entry.error)
  ));

  if (state.get(id)?.seq !== seq) return state.get(id);
  const next = { status: CARD_BACKEND_EXTRAS_STATUS.ready, seq, loadedAt: Date.now(), entries };
  state.set(id, next);
  emit();
  return next;
};

/** Для тестів. */
export const resetCardBackendExtras = () => {
  state.clear();
  emit();
};
