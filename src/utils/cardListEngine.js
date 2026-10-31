import { classifyGetInTouchMark } from './reactionCategory';
import {
  buildCardListPlanKey,
  hasAllCardListSegments,
  listCardListSegments,
  normalizeCardListPlan,
} from './cardListPlan';

/*
 * Двигун «Списку» на `AddNewProfile`: один на будь-який план галочок
 * (`utils/cardListPlan`).
 *
 * Сторінка збирається одним конвеєром, і порядок кроків у ньому — це і є ціна
 * сторінки:
 *
 * 1. **потік кандидатів** — id у порядку списку, одним запитом на порцію:
 *    позначки власника `getInTouch` (кожен стан своїм діапазоном, база вже
 *    впорядкувала й обрізала), картки за ключем (`matchingCards`) для «без
 *    дати», `profileWorkflow` за `lastAction`, або перелік з JSON-файлів;
 * 2. **позначка** — свіжа з самого потоку або точковим читанням: стан картки
 *    вирішує вона, а не кешована анкета (кеш живе шість годин, позначку за цей
 *    час переставляють);
 * 3. **відсів індексом** — групи фільтрів, які знає `searchKey`, лише для
 *    анкет, яких немає в кеші: кешовану фільтри перевіряють задарма, а
 *    відкинута тут картка не коштує анкети;
 * 4. **анкети** — спершу з кешу браузера, решта з бази;
 * 5. **фільтри панелі** — `filterMain` на анкеті.
 *
 * Курсор кожного потоку стоїть на останньому *прочитаному* рядку, а
 * непрочитаний залишок порції лежить у стані (`buffer`) і йде першим на
 * наступній сторінці: так зайвий рядок не перечитується й не губиться. Саме
 * на цьому губились картки в стрічці, поки курсор стояв у кінці сторінки
 * джерела (див. CLAUDE.md, «Курсор стрічки…»).
 *
 * Двигун не знає ні Firebase, ні React: базу йому дають адаптери, і саме
 * тому кожен крок можна перевірити тестом з підрахунком запитів.
 */

export const CARD_LIST_ENGINE_VERSION = 1;

// Скільки кругів (читань порції чи обробок кандидатів) одна сторінка може
// зробити, перш ніж віддати те, що встигла зібрати. Вузькі фільтри інакше
// перетворюють «наступну сторінку» на обхід усієї бази за один дотик.
export const CARD_LIST_MAX_ROUNDS = 25;
// Найбільша порція id за один запит. Рядок потоку — десятки байтів, тож
// велика порція дешевша за ще один круг, але межа потрібна: потік «без дати»
// читає картки `matchingCards` цілком.
export const CARD_LIST_MAX_READ = 100;
// Нижня межа оцінки «скільки кандидатів дотягує до списку»: на неї ділиться
// потреба сторінки, щоб узяти порцію одразу з запасом.
const MIN_ACCEPTANCE_RATE = 0.2;

/**
 * Потоки кандидатів для плану — у тому порядку, в якому їх видно у списку.
 *
 * `marks` каже, звідки двигун бере позначку: `row` — з самого рядка потоку
 * (запит до позначок власника), `probe` — точковим читанням перед анкетою,
 * `hydrated` — з анкети (коли план бере всі стани і питати нема про що).
 */
export const buildCardListStreams = plan => {
  const normalized = normalizeCardListPlan(plan);
  if (normalized.fromFiles) {
    return [{ key: 'files', source: 'files', marks: 'row', accepts: 'plan' }];
  }
  if (normalized.byLastAction) {
    return [{
      key: 'lastAction',
      source: 'lastAction',
      marks: hasAllCardListSegments(normalized) ? 'hydrated' : 'probe',
      accepts: 'plan',
    }];
  }
  return listCardListSegments(normalized).map(segment => ({
    key: segment,
    source: segment === 'undated' ? 'cardKeys' : 'getInTouch',
    segment,
    marks: segment === 'undated' ? 'probe' : 'row',
    accepts: 'segment',
  }));
};

export const createCardListState = plan => ({
  version: CARD_LIST_ENGINE_VERSION,
  planKey: buildCardListPlanKey(plan),
  streamIndex: 0,
  streams: {},
  order: [],
  hasMore: true,
});

/**
 * Стан, збережений раніше (кеш переліку, знімок «назад до списку»), — лише
 * якщо він від того самого плану й тієї самої версії двигуна. Чужий стан
 * гортав би інші потоки чужими курсорами.
 */
export const restoreCardListState = (raw, plan) => {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.version !== CARD_LIST_ENGINE_VERSION) return null;
  if (raw.planKey !== buildCardListPlanKey(plan)) return null;
  const streams = raw.streams && typeof raw.streams === 'object' ? raw.streams : {};
  return {
    version: CARD_LIST_ENGINE_VERSION,
    planKey: raw.planKey,
    streamIndex: Number.isInteger(raw.streamIndex) && raw.streamIndex >= 0 ? raw.streamIndex : 0,
    streams: Object.fromEntries(Object.entries(streams).map(([key, slot]) => [key, {
      cursor: slot?.cursor ?? null,
      buffer: Array.isArray(slot?.buffer) ? slot.buffer.filter(row => row?.userId) : [],
      exhausted: Boolean(slot?.exhausted),
    }])),
    order: Array.isArray(raw.order) ? raw.order.filter(Boolean).map(String) : [],
    hasMore: raw.hasMore !== false,
  };
};

const cloneState = state => ({
  ...state,
  streams: Object.fromEntries(Object.entries(state?.streams || {}).map(([key, slot]) => [key, {
    cursor: slot?.cursor ?? null,
    buffer: [...(slot?.buffer || [])],
    exhausted: Boolean(slot?.exhausted),
  }])),
  order: [...(state?.order || [])],
});

const getSlot = (state, key) => {
  if (!state.streams[key]) state.streams[key] = { cursor: null, buffer: [], exhausted: false };
  return state.streams[key];
};

const computeHasMore = (streams, state) => streams
  .slice(state.streamIndex)
  .some(stream => {
    const slot = state.streams[stream.key];
    return !slot || slot.buffer.length > 0 || !slot.exhausted;
  });

export const createCardListStats = () => ({
  listReads: 0,
  candidates: 0,
  markProbes: 0,
  segmentRejected: 0,
  indexChecked: 0,
  indexRejected: 0,
  hydrated: 0,
  fromCache: 0,
  missing: 0,
  filterRejected: 0,
  accepted: 0,
  rounds: 0,
});

const hasMarkValue = value => value !== undefined && value !== null && String(value).trim() !== '';

/**
 * Одна сторінка списку: до `limit` нових карток у порядку плану.
 *
 * Повертає нові картки (`users` — масив анкет у порядку списку), новий стан
 * (курсори й залишки порцій), `hasMore` і лічильники кроків (`stats`), за
 * якими видно, скільки коштувала сторінка. `isStale` питається після кожного
 * кола до бази: застаріла відповідь (адмін тим часом змінив план чи фільтри)
 * повертається з `ignored`, і стан викликача лишається недоторканим.
 */
export const loadCardListPage = async ({
  plan: rawPlan,
  state: rawState,
  limit = 20,
  adapters = {},
  isStale = () => false,
  onProgress = null,
  maxRounds = CARD_LIST_MAX_ROUNDS,
  maxRead = CARD_LIST_MAX_READ,
} = {}) => {
  const plan = normalizeCardListPlan(rawPlan);
  const streams = buildCardListStreams(plan);
  const state = cloneState(rawState && rawState.planKey === buildCardListPlanKey(plan)
    ? rawState
    : createCardListState(plan));
  const stats = createCardListStats();
  const errors = [];
  const accepted = [];
  const seen = new Set(state.order);
  const targetCount = Math.max(1, Number(limit) || 1);
  let acceptanceRate = 1;

  const isCached = id => Boolean(plan.cacheFirst && typeof adapters.isCached === 'function' && adapters.isCached(id));

  const finish = (extra = {}) => {
    state.hasMore = computeHasMore(streams, state);
    return {
      users: accepted,
      state,
      hasMore: state.hasMore,
      stats,
      errors,
      ...extra,
    };
  };

  const processRows = async (stream, rows) => {
    const rowById = new Map(rows.map(row => [row.userId, row]));
    const ids = rows.map(row => row.userId);
    stats.candidates += ids.length;

    // 2. Позначка. Свіжа — з рядка чи точкового читання; кешованій анкеті
    // стан картки не довіряється.
    let marks = null;
    if (stream.marks === 'row') {
      marks = Object.fromEntries(rows.map(row => [row.userId, row.getInTouch]));
    } else if (stream.marks === 'probe' && typeof adapters.readMarks === 'function') {
      marks = (await adapters.readMarks(ids)) || {};
      stats.markProbes += ids.length;
      if (isStale()) return null;
    }

    const segmentAccepts = mark => (stream.accepts === 'segment'
      ? classifyGetInTouchMark(mark) === stream.segment
      : Boolean(plan.segments[classifyGetInTouchMark(mark)]));

    let candidates = marks ? ids.filter(id => segmentAccepts(marks[id])) : ids;
    stats.segmentRejected += ids.length - candidates.length;

    // 3. Відсів індексом — лише там, де він заощаджує анкету: кешовану
    // фільтри перевірять на ній самій, без жодного запиту.
    if (plan.indexPrefilter && typeof adapters.prefilter === 'function' && candidates.length) {
      const uncached = candidates.filter(id => !isCached(id));
      if (uncached.length) {
        const passed = new Set(((await adapters.prefilter(uncached)) || []).map(String));
        if (isStale()) return null;
        stats.indexChecked += uncached.length;
        const rejected = new Set(uncached.filter(id => !passed.has(id)));
        stats.indexRejected += rejected.size;
        candidates = candidates.filter(id => !rejected.has(id));
      }
    }

    if (!candidates.length) return [];

    // 4. Анкети.
    stats.fromCache += candidates.filter(isCached).length;
    stats.hydrated += candidates.length;
    const profiles = (await adapters.hydrate(candidates, { cacheFirst: plan.cacheFirst })) || {};
    if (isStale()) return null;

    const entries = [];
    candidates.forEach(id => {
      const profile = profiles[id];
      if (!profile) {
        stats.missing += 1;
        return;
      }
      const user = { ...profile, userId: profile.userId || id };
      const row = rowById.get(id) || {};
      if (marks) {
        if (hasMarkValue(marks[id])) user.getInTouch = marks[id];
        else delete user.getInTouch;
      } else if (!plan.segments[classifyGetInTouchMark(user.getInTouch)]) {
        stats.segmentRejected += 1;
        return;
      }
      if (row.lastAction !== undefined && row.lastAction !== null) user.lastAction = row.lastAction;
      entries.push([id, user]);
    });

    // 5. Фільтри панелі.
    const kept = typeof adapters.accept === 'function' ? adapters.accept(entries) || [] : entries;
    stats.filterRejected += entries.length - kept.length;
    const keptIds = new Set(kept.map(([id]) => id));
    return entries.filter(([id]) => keptIds.has(id));
  };

  while (accepted.length < targetCount && state.streamIndex < streams.length && stats.rounds < maxRounds) {
    const stream = streams[state.streamIndex];
    const slot = getSlot(state, stream.key);
    const need = targetCount - accepted.length;
    // Порція з запасом під очікуваний відсів: вузький фільтр інакше коштував
    // би круг на кожні кілька карток.
    const wanted = Math.min(maxRead, Math.max(need, Math.ceil(need / Math.max(acceptanceRate, MIN_ACCEPTANCE_RATE))));

    if (slot.buffer.length < wanted && !slot.exhausted) {
      stats.rounds += 1;
      let page;
      try {
        // 1. Потік кандидатів.
        // eslint-disable-next-line no-await-in-loop
        page = await adapters.readStreamPage({ stream, cursor: slot.cursor, limit: wanted - slot.buffer.length, plan });
      } catch (error) {
        errors.push({ stream: stream.key, message: error?.message || String(error), code: error?.code || null });
        slot.exhausted = true;
        page = null;
      }
      if (isStale()) return { ...finish(), ignored: true };
      stats.listReads += 1;
      if (page) {
        const known = new Set(slot.buffer.map(row => row.userId));
        (page.rows || []).forEach(row => {
          const id = row?.userId ? String(row.userId) : '';
          if (!id || seen.has(id) || known.has(id)) return;
          known.add(id);
          slot.buffer.push({ ...row, userId: id });
        });
        slot.cursor = page.nextCursor ?? slot.cursor;
        slot.exhausted = !page.hasMore || page.nextCursor === null || page.nextCursor === undefined;
      }
    }

    if (!slot.buffer.length) {
      if (slot.exhausted) {
        state.streamIndex += 1;
        continue;
      }
      stats.rounds += 1;
      continue;
    }

    // Анкета не читається понад потребу сторінки, коли кешу немає: кожна
    // зайва — п'ять вузлів, які могли й не знадобитись. З кешем порція може
    // бути більшою: прийняте понад сторінку повертається в залишок і
    // наступного разу береться з кешу.
    const chunkSize = plan.cacheFirst ? Math.min(slot.buffer.length, wanted) : Math.min(slot.buffer.length, need);
    // Картка, яку вже взяв інший потік (позначку переставили між двома
    // читаннями), у список удруге не йде.
    const chunk = slot.buffer.splice(0, chunkSize).filter(row => !seen.has(row.userId));
    stats.rounds += 1;
    if (!chunk.length) continue;
    // eslint-disable-next-line no-await-in-loop
    const processed = await processRows(stream, chunk);
    if (processed === null) return { ...finish(), ignored: true };

    const acceptedById = new Map(processed);
    let taken = 0;
    const putBack = [];
    chunk.forEach(row => {
      const user = acceptedById.get(row.userId);
      if (!user) return;
      if (accepted.length >= targetCount) {
        putBack.push(row);
        return;
      }
      accepted.push(user);
      seen.add(row.userId);
      state.order.push(row.userId);
      taken += 1;
    });
    if (putBack.length) slot.buffer.unshift(...putBack);
    stats.accepted += taken;
    acceptanceRate = Math.max(MIN_ACCEPTANCE_RATE, acceptedById.size / chunk.length);

    if (taken && typeof onProgress === 'function') onProgress([...accepted]);
  }

  return finish();
};

/** Ціна сторінки словами — для рядка під шухлядою й для логу. */
export const describeCardListStats = (stats, { ms } = {}) => {
  if (!stats) return '';
  const fromBackend = Math.max(0, (stats.hydrated || 0) - (stats.fromCache || 0) - (stats.missing || 0));
  const parts = [
    `${stats.listReads || 0} ${pluralizeQueries(stats.listReads || 0)} переліку`,
    `${stats.accepted || 0} у списку`,
    `анкет з кешу ${stats.fromCache || 0}, з бази ${fromBackend}`,
  ];
  if (stats.markProbes) parts.push(`позначок перевірено ${stats.markProbes}`);
  if (stats.indexChecked) parts.push(`індекс відсіяв ${stats.indexRejected || 0} з ${stats.indexChecked}`);
  if (stats.filterRejected) parts.push(`фільтри відсіяли ${stats.filterRejected}`);
  if (Number.isFinite(ms)) parts.push(`${Math.round(ms)} мс`);
  return parts.join(' · ');
};

const pluralizeQueries = count => {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'запит';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'запити';
  return 'запитів';
};
