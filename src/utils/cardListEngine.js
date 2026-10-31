import {
  buildCardListQueryKey,
  fieldHasMissing,
  getCardListField,
  isFieldValueMissing,
  normalizeCardListQuery,
  resolveCardListRange,
} from './cardListQuery';

/*
 * Двигун «Списку» на `AddNewProfile`: одна сторінка за запитом
 * (`utils/cardListQuery`) — поле, напрямок, діапазон, фільтри панелі.
 *
 * Потоків кандидатів два, і обидва — у порядку списку:
 *
 * - **значення** — картки, впорядковані за полем у діапазоні, одним запитом
 *   до бази на порцію (індекс поля робить порядок і межі);
 * - **без значення** — картки за ключем `matchingCards`, у яких поля немає
 *   (точкова перевірка значення; картка з ним відкидається до читання анкети).
 *
 * Далі для кожної порції той самий конвеєр, і його порядок — це ціна
 * сторінки: значення поля перевіряється на діапазон → групи фільтрів, які
 * знає `searchKey`, питаються поточково **лише для анкет, яких немає в кеші**
 * (кешовану фільтри перевірять задарма) → анкети спершу з кешу → `filterMain`.
 *
 * Курсор потоку стоїть на останньому *прочитаному* рядку, а непрочитаний
 * залишок порції лежить у стані (`buffer`) і йде першим на наступній
 * сторінці: зайвий рядок не перечитується й не губиться.
 *
 * Двигун не знає ні Firebase, ні React — базу йому дають адаптери, і кожен
 * крок можна перевірити тестом із підрахунком запитів.
 */

export const CARD_LIST_ENGINE_VERSION = 2;

// Скільки кругів (читань порції чи обробок кандидатів) одна сторінка може
// зробити, перш ніж віддати зібране: вузький фільтр інакше перетворює
// «наступну сторінку» на обхід усієї бази за один дотик.
export const CARD_LIST_MAX_ROUNDS = 25;
// Найбільша порція id за запит: рядок потоку — десятки байтів, тож велика
// порція дешевша за ще один круг, але потік «без значення» читає картки
// `matchingCards` цілком.
export const CARD_LIST_MAX_READ = 100;
// Нижня межа оцінки «скільки кандидатів доживає до списку»: на неї ділиться
// потреба сторінки, щоб узяти порцію одразу з запасом. Низька навмисно:
// коли до списку доживає кожна п'ятдесята картка (усі, де немає останньої
// дії), межа 20% тримала порцію в п'ять разів більшою за потребу, і сторінка
// збиралась десятками дрібних кругів. Стелю порції тримає `maxRead`.
const MIN_ACCEPTANCE_RATE = 0.05;

export const buildCardListStreams = rawQuery => {
  const query = normalizeCardListQuery(rawQuery);
  const field = getCardListField(query.field);
  const streams = [];
  if (query.missing !== 'only') streams.push({ key: 'value', kind: 'value' });
  if (fieldHasMissing(field) && query.missing !== 'exclude') streams.push({ key: 'missing', kind: 'missing' });
  return streams;
};

export const createCardListState = query => ({
  version: CARD_LIST_ENGINE_VERSION,
  queryKey: buildCardListQueryKey(query),
  streamIndex: 0,
  streams: {},
  order: [],
  hasMore: true,
});

/**
 * Стан, збережений раніше (кеш переліку, знімок «назад до списку»), — лише
 * якщо він від того самого запиту й тієї самої версії двигуна. Чужий стан
 * гортав би інші потоки чужими курсорами.
 */
export const restoreCardListState = (raw, query) => {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.version !== CARD_LIST_ENGINE_VERSION) return null;
  if (raw.queryKey !== buildCardListQueryKey(query)) return null;
  const streams = raw.streams && typeof raw.streams === 'object' ? raw.streams : {};
  return {
    version: CARD_LIST_ENGINE_VERSION,
    queryKey: raw.queryKey,
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
  valueProbes: 0,
  rangeRejected: 0,
  indexChecked: 0,
  indexRejected: 0,
  hydrated: 0,
  fromCache: 0,
  missing: 0,
  filterRejected: 0,
  accepted: 0,
  rounds: 0,
});

const hasValue = value => value !== undefined && value !== null && String(value).trim() !== '';

/**
 * Одна сторінка списку: до `limit` нових карток у порядку запиту.
 *
 * Повертає нові картки (`users` — анкети в порядку списку), новий стан
 * (курсори й залишки порцій), `hasMore`, лічильники кроків (`stats`) і
 * помилки потоків (`errors`: потік, що впав, не валить решту). `isStale`
 * питається після кожного кола до бази: застаріла відповідь (адмін тим часом
 * змінив запит чи фільтри) приходить з `ignored`, і стан викликача
 * лишається недоторканим. `cacheFirst: false` — «оновити»: анкети з бази,
 * повз кеш.
 */
export const loadCardListPage = async ({
  query: rawQuery,
  state: rawState,
  limit = 20,
  adapters = {},
  cacheFirst = true,
  isStale = () => false,
  onProgress = null,
  now = new Date(),
  maxRounds = CARD_LIST_MAX_ROUNDS,
  maxRead = CARD_LIST_MAX_READ,
} = {}) => {
  const query = normalizeCardListQuery(rawQuery);
  const field = getCardListField(query.field);
  const range = resolveCardListRange(query, now);
  const streams = buildCardListStreams(query);
  const state = cloneState(rawState && rawState.queryKey === buildCardListQueryKey(query)
    ? rawState
    : createCardListState(query));
  const stats = createCardListStats();
  const errors = [];
  const accepted = [];
  const seen = new Set(state.order);
  const targetCount = Math.max(1, Number(limit) || 1);
  let acceptanceRate = 1;

  const isCached = id => Boolean(cacheFirst && typeof adapters.isCached === 'function' && adapters.isCached(id));

  const finish = (extra = {}) => {
    state.hasMore = computeHasMore(streams, state);
    return { users: accepted, state, hasMore: state.hasMore, stats, errors, ...extra };
  };

  const readStreamPage = (stream, cursor, readLimit) => (stream.kind === 'value'
    ? adapters.readValuePage({ query, bounds: range.bounds, cursor, limit: readLimit })
    : adapters.readKeyPage({ cursor, limit: readLimit, fieldKey: field.key }));

  const processRows = async (stream, rows) => {
    stats.candidates += rows.length;
    let candidates = rows;

    // 1. Значення поля: у потоці значень воно приїхало з рядком і ще раз
    // перевіряється на діапазон (рядкова межа бази пропускає нотатки й
    // крапкові дати); у потоці «без значення» його питають точково, і картка
    // зі значенням іде геть ще до анкети.
    if (stream.kind === 'value') {
      candidates = rows.filter(row => range.accepts(row.value));
    } else {
      // Поле, яке лежить у самій картці переліку, приїхало з рядком (`known`):
      // питати його вдруге нема чого.
      const unknownIds = rows.filter(row => !row.known).map(row => row.userId);
      let values = {};
      if (unknownIds.length) {
        values = (await adapters.readValues(field.key, unknownIds)) || {};
        if (isStale()) return null;
        stats.valueProbes += unknownIds.length;
      }
      candidates = rows
        .map(row => (row.known ? row : { ...row, value: values[row.userId] }))
        .filter(row => isFieldValueMissing(field.key, row.value));
    }
    stats.rangeRejected += rows.length - candidates.length;

    // 2. Відсів індексом — лише там, де він заощаджує анкету.
    if (typeof adapters.prefilter === 'function' && candidates.length) {
      const uncached = candidates.map(row => row.userId).filter(id => !isCached(id));
      if (uncached.length) {
        const passed = new Set(((await adapters.prefilter(uncached)) || []).map(String));
        if (isStale()) return null;
        stats.indexChecked += uncached.length;
        const rejected = new Set(uncached.filter(id => !passed.has(id)));
        stats.indexRejected += rejected.size;
        candidates = candidates.filter(row => !rejected.has(row.userId));
      }
    }
    if (!candidates.length) return [];

    // 3. Анкети.
    const ids = candidates.map(row => row.userId);
    stats.fromCache += ids.filter(isCached).length;
    stats.hydrated += ids.length;
    const profiles = (await adapters.hydrate(ids, { cacheFirst })) || {};
    if (isStale()) return null;

    const entries = [];
    candidates.forEach(row => {
      const profile = profiles[row.userId];
      if (!profile) {
        stats.missing += 1;
        return;
      }
      const user = { ...profile, userId: profile.userId || row.userId };
      // Свіже значення поля — поверх кешованої анкети: картка показує те, за
      // чим її щойно відібрали, а не те, що лежало в кеші шість годин тому.
      if (field.profileKey) {
        if (hasValue(row.value)) user[field.profileKey] = row.value;
        else delete user[field.profileKey];
      }
      entries.push([row.userId, user]);
    });

    // 4. Фільтри панелі.
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
      let page = null;
      try {
        // eslint-disable-next-line no-await-in-loop
        page = await readStreamPage(stream, slot.cursor, wanted - slot.buffer.length);
      } catch (error) {
        errors.push({ stream: stream.key, message: error?.message || String(error), code: error?.code || null });
        slot.exhausted = true;
      }
      if (isStale()) return { ...finish(), ignored: true };
      // Сторінка, нарізана з мапи в памʼяті екрана (обрані, «не цікаві»),
      // запитом до бази не є — і в ціну сторінки не рахується.
      if (!page?.local) stats.listReads += 1;
      if (page) {
        const buffered = new Set(slot.buffer.map(row => row.userId));
        (page.rows || []).forEach(row => {
          const id = row?.userId ? String(row.userId) : '';
          if (!id || seen.has(id) || buffered.has(id)) return;
          buffered.add(id);
          slot.buffer.push({ ...row, userId: id });
        });
        slot.cursor = page.nextCursor ?? slot.cursor;
        slot.exhausted = !page.hasMore || page.nextCursor === null || page.nextCursor === undefined;
      }
    }

    if (!slot.buffer.length) {
      if (slot.exhausted) state.streamIndex += 1;
      else stats.rounds += 1;
      continue;
    }

    // Без кешу анкета не читається понад потребу сторінки: кожна зайва — шість
    // вузлів, які могли й не знадобитись. З кешем порція більша, а прийняте
    // понад сторінку повертається в залишок і наступного разу йде з кешу.
    const chunkSize = Math.min(slot.buffer.length, cacheFirst ? wanted : need);
    // Картка, яку вже взяв інший потік (значення змінили між двома
    // читаннями), удруге в список не йде.
    const chunk = slot.buffer.splice(0, chunkSize).filter(row => !seen.has(row.userId));
    stats.rounds += 1;
    if (!chunk.length) continue;
    // eslint-disable-next-line no-await-in-loop
    const processed = await processRows(stream, chunk);
    if (processed === null) return { ...finish(), ignored: true };

    const acceptedById = new Map(processed);
    const putBack = [];
    let taken = 0;
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

/** Ціна сторінки словами — для рядка під панеллю списку й для логу. */
export const describeCardListStats = (stats, { ms } = {}) => {
  if (!stats) return '';
  const fromBackend = Math.max(0, (stats.hydrated || 0) - (stats.fromCache || 0) - (stats.missing || 0));
  const parts = [
    `${stats.listReads || 0} ${pluralizeQueries(stats.listReads || 0)} переліку`,
    `${stats.accepted || 0} у списку`,
    `анкет з кешу ${stats.fromCache || 0}, з бази ${fromBackend}`,
  ];
  if (stats.valueProbes) parts.push(`значень перевірено ${stats.valueProbes}`);
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
