import {
  CARD_LIST_MAX_ROUNDS,
  buildCardListStreams,
  createCardListState,
  describeCardListStats,
  loadCardListPage,
  restoreCardListState,
} from '../cardListEngine';
import { DEFAULT_CARD_LIST_QUERY, getCardListPreset, normalizeCardListQuery } from '../cardListQuery';

// Двигун «Списку» на AddNewProfile. Тут перевіряється не лише *що* він
// показує, а й *скільки коштує* сторінка: кожне читання бази йде через
// адаптер, і лічильники адаптера — це і є рахунок, який платить адмін.

const isoDaysFromToday = shift => {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + shift);
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const TODAY = isoDaysFromToday(0);
const YESTERDAY = isoDaysFromToday(-1);
const WEEK_AGO = isoDaysFromToday(-7);
const TOMORROW = isoDaysFromToday(1);
const NEXT_WEEK = isoDaysFromToday(7);

const query = overrides => normalizeCardListQuery({ ...DEFAULT_CARD_LIST_QUERY, ...overrides });
const preset = key => normalizeCardListQuery(getCardListPreset(key).query);

const compare = (left, right) => {
  if (left === right) return 0;
  return left < right ? -1 : 1;
};

/**
 * Мінімальна «база»: значення полів за картками, перелік карток за ключем,
 * анкети, кеш і індекс. Сторінка значень віддається так, як її віддає RTDB:
 * межі — порівнянням значень, тож нотатка й «99» теж потрапляють у
 * рядковий діапазон і мусять бути відсіяні двигуном.
 */
const makeBackend = ({
  values = {},
  cardIds = null,
  profiles = null,
  cached = [],
  indexRejects = [],
  failStreams = [],
  carriedFields = ['feedDate'],
} = {}) => {
  const allIds = cardIds || [...new Set(Object.values(values).flatMap(map => Object.keys(map)))].sort();
  const profileOf = id => (profiles && profiles[id]) || { userId: id, name: `Картка ${id}` };
  const cachedSet = new Set(cached);
  const calls = { values: [], keys: [], probes: [], prefilter: [], hydrate: [] };

  const adapters = {
    readValuePage: async ({ query: rawQuery, bounds, cursor, limit }) => {
      calls.values.push({ field: rawQuery.field, bounds, cursor, limit });
      if (failStreams.includes('value')) {
        const error = new Error('Permission denied');
        error.code = 'PERMISSION_DENIED';
        throw error;
      }
      const map = values[rawQuery.field] || {};
      const rows = Object.entries(map)
        .map(([userId, value]) => ({ userId, value }))
        .filter(row => (bounds.from === undefined || compare(row.value, bounds.from) >= 0)
          && (bounds.to === undefined || compare(row.value, bounds.to) <= 0))
        .sort((a, b) => compare(a.value, b.value) || compare(a.userId, b.userId));
      if (rawQuery.direction === 'desc') rows.reverse();
      const offset = Number(cursor) || 0;
      const page = rows.slice(offset, offset + limit);
      return { rows: page, nextCursor: offset + page.length, hasMore: offset + page.length < rows.length };
    },
    readKeyPage: async ({ cursor, limit, fieldKey }) => {
      calls.keys.push({ cursor, limit, fieldKey });
      if (failStreams.includes('missing')) throw new Error('keys failed');
      const offset = Number(cursor) || 0;
      // Поле, що лежить у самій картці переліку, їде з рядком — як `feedDate`
      // у справжньому `matchingCards`.
      const carried = carriedFields.includes(fieldKey);
      const page = allIds.slice(offset, offset + limit).map(userId => (carried
        ? { userId, value: values[fieldKey]?.[userId], known: true }
        : { userId }));
      return { rows: page, nextCursor: offset + page.length, hasMore: offset + page.length < allIds.length };
    },
    readValues: async (fieldKey, ids) => {
      calls.probes.push({ fieldKey, ids: [...ids] });
      return Object.fromEntries(ids.map(id => [id, values[fieldKey]?.[id]]));
    },
    isCached: id => cachedSet.has(id),
    prefilter: async ids => {
      calls.prefilter.push([...ids]);
      return ids.filter(id => !indexRejects.includes(id));
    },
    hydrate: async (ids, options) => {
      calls.hydrate.push({ ids: [...ids], options });
      return Object.fromEntries(ids.map(id => [id, profileOf(id)]));
    },
    accept: entries => entries,
  };

  return { adapters, calls };
};

const ids = result => result.users.map(user => user.userId);

describe('потоки запиту', () => {
  it('значення поля, далі — за бажанням — картки без нього', () => {
    expect(buildCardListStreams(DEFAULT_CARD_LIST_QUERY).map(stream => stream.kind)).toEqual(['value']);
    expect(buildCardListStreams(query({ missing: 'after' })).map(stream => stream.kind)).toEqual(['value', 'missing']);
    expect(buildCardListStreams(query({ missing: 'only' })).map(stream => stream.kind)).toEqual(['missing']);
  });

  it('у обраних «без значення» немає: це був би весь каталог', () => {
    expect(buildCardListStreams(query({ field: 'favorite', missing: 'after' })).map(stream => stream.kind)).toEqual(['value']);
  });
});

describe('«Кому дзвонити»', () => {
  const marks = {
    today1: TODAY,
    today2: TODAY,
    past1: YESTERDAY,
    past2: WEEK_AGO,
    later: TOMORROW,
    note: '00 нотатка',
    disliked: '2099-99-99',
  };

  it('від сьогодні назад, без майбутнього, нотаток і «99»', async () => {
    const { adapters } = makeBackend({ values: { getInTouch: marks } });
    const result = await loadCardListPage({ query: DEFAULT_CARD_LIST_QUERY, limit: 10, adapters });

    expect(ids(result)).toEqual(['today2', 'today1', 'past1', 'past2']);
    expect(result.hasMore).toBe(false);
  });

  it('сторінка коштує один запит переліку і рівно стільки анкет, скільки на ній карток', async () => {
    const { adapters, calls } = makeBackend({ values: { getInTouch: marks } });
    const result = await loadCardListPage({ query: DEFAULT_CARD_LIST_QUERY, limit: 2, adapters });

    expect(ids(result)).toEqual(['today2', 'today1']);
    expect(calls.values).toHaveLength(1);
    expect(calls.values[0].bounds).toEqual({ to: TODAY });
    expect(calls.hydrate.flatMap(call => call.ids)).toEqual(['today2', 'today1']);
    expect(calls.probes).toHaveLength(0);
    expect(result.stats).toMatchObject({ listReads: 1, hydrated: 2, accepted: 2 });
  });

  it('друга сторінка продовжує з курсора: без повторів і без пропусків', async () => {
    const { adapters, calls } = makeBackend({ values: { getInTouch: marks } });
    const first = await loadCardListPage({ query: DEFAULT_CARD_LIST_QUERY, limit: 2, adapters });
    const second = await loadCardListPage({ query: DEFAULT_CARD_LIST_QUERY, state: first.state, limit: 2, adapters });

    expect(ids(second)).toEqual(['past1', 'past2']);
    expect(second.state.order).toEqual(['today2', 'today1', 'past1', 'past2']);
    expect(calls.values[1].cursor).toBe(2);
  });

  it('прочитаний, але не взятий рядок іде першим на наступній сторінці', async () => {
    const many = Object.fromEntries(Array.from({ length: 12 }, (_, index) => [`p${String(index).padStart(2, '0')}`, WEEK_AGO]));
    const { adapters } = makeBackend({ values: { getInTouch: many } });
    adapters.accept = entries => entries.filter(([id]) => Number(id.slice(1)) % 2 === 1 || Number(id.slice(1)) > 8);

    const first = await loadCardListPage({ query: DEFAULT_CARD_LIST_QUERY, limit: 3, adapters });
    const second = await loadCardListPage({ query: DEFAULT_CARD_LIST_QUERY, state: first.state, limit: 3, adapters });
    const third = await loadCardListPage({ query: DEFAULT_CARD_LIST_QUERY, state: second.state, limit: 10, adapters });

    const all = [...ids(first), ...ids(second), ...ids(third)];
    expect(all).toEqual(['p11', 'p10', 'p09', 'p07', 'p05', 'p03', 'p01']);
    expect(new Set(all).size).toBe(all.length);
    expect(third.hasMore).toBe(false);
  });

  it('свіже значення з потоку перебиває кешовану анкету', async () => {
    const { adapters } = makeBackend({
      values: { getInTouch: { stale: TODAY } },
      profiles: { stale: { userId: 'stale', getInTouch: NEXT_WEEK } },
      cached: ['stale'],
    });

    const result = await loadCardListPage({ query: DEFAULT_CARD_LIST_QUERY, limit: 5, adapters });

    expect(result.users[0].getInTouch).toBe(TODAY);
  });

  it('«спершу старі» гортає той самий діапазон з іншого кінця', async () => {
    const { adapters } = makeBackend({ values: { getInTouch: marks } });
    const result = await loadCardListPage({ query: query({ direction: 'asc' }), limit: 10, adapters });

    expect(ids(result)).toEqual(['past2', 'past1', 'today1', 'today2']);
  });
});

describe('картки без значення', () => {
  const marks = { due1: TODAY, due2: YESTERDAY, soon: TOMORROW, note: 'дзвонила', gone: '2099-99-99' };
  const cardIds = ['a-plain', 'b-plain', 'due1', 'due2', 'gone', 'note', 'soon'];

  it('«після решти»: спершу дзвінки, потім картки без дати за ключем', async () => {
    const { adapters, calls } = makeBackend({ values: { getInTouch: marks }, cardIds });
    const result = await loadCardListPage({ query: preset('callAndUndated'), limit: 10, adapters });

    expect(ids(result)).toEqual(['due1', 'due2', 'a-plain', 'b-plain', 'note']);
    // Значення питались лише для тих, кого ще немає в списку, — і картки з
    // датою відкинуто до читання анкети.
    expect(calls.probes.flatMap(call => call.ids)).toEqual(['a-plain', 'b-plain', 'gone', 'note', 'soon']);
    expect(calls.probes.every(call => call.fieldKey === 'getInTouch')).toBe(true);
    expect(calls.hydrate.slice(1).flatMap(call => call.ids)).toEqual(['a-plain', 'b-plain', 'note']);
  });

  it('«лише такі» не читає потоку значень зовсім', async () => {
    const { adapters, calls } = makeBackend({ values: { getInTouch: marks }, cardIds });
    const result = await loadCardListPage({ query: preset('undated'), limit: 10, adapters });

    expect(ids(result)).toEqual(['a-plain', 'b-plain', 'note']);
    expect(calls.values).toHaveLength(0);
    // Нотатку картка показує як є, а не як порожнечу.
    expect(result.users.find(user => user.userId === 'note').getInTouch).toBe('дзвонила');
  });

  it('неопубліковані: значення приїхало з карткою переліку, точкових читань немає', async () => {
    const { adapters, calls } = makeBackend({
      values: { feedDate: { pub: TODAY, hidden: false } },
      cardIds: ['hidden', 'never', 'pub'],
    });
    const result = await loadCardListPage({ query: query({ field: 'feedDate', missing: 'only' }), limit: 10, adapters });

    expect(ids(result)).toEqual(['hidden', 'never']);
    expect(calls.keys[0].fieldKey).toBe('feedDate');
    expect(calls.probes).toHaveLength(0);
  });

  it('без жодної дії: значення питається за полем запиту, а не за датою дзвінка', async () => {
    const { adapters, calls } = makeBackend({
      values: { lastAction: { active: Date.now() }, getInTouch: { idle: TODAY } },
      cardIds: ['active', 'idle'],
    });
    const result = await loadCardListPage({ query: query({ field: 'lastAction', missing: 'only' }), limit: 10, adapters });

    expect(ids(result)).toEqual(['idle']);
    expect(calls.probes).toEqual([{ fieldKey: 'lastAction', ids: ['active', 'idle'] }]);
  });

  it('потік, що впав, не валить список: решта показується, причина названа', async () => {
    const { adapters } = makeBackend({ values: { getInTouch: marks }, cardIds, failStreams: ['missing'] });
    const result = await loadCardListPage({ query: preset('callAndUndated'), limit: 10, adapters });

    expect(ids(result)).toEqual(['due1', 'due2']);
    expect(result.errors).toEqual([expect.objectContaining({ stream: 'missing', message: 'keys failed' })]);
  });
});

describe('відсів індексом і кеш', () => {
  const marks = { a: TODAY, b: TODAY, c: YESTERDAY, d: YESTERDAY, e: WEEK_AGO };

  it('відкинута індексом картка не коштує анкети', async () => {
    const { adapters, calls } = makeBackend({ values: { getInTouch: marks }, indexRejects: ['b', 'd'] });
    const result = await loadCardListPage({ query: DEFAULT_CARD_LIST_QUERY, limit: 10, adapters });

    expect(ids(result)).toEqual(['a', 'c', 'e']);
    expect(calls.hydrate.flatMap(call => call.ids)).toEqual(['a', 'c', 'e']);
    expect(result.stats).toMatchObject({ indexChecked: 5, indexRejected: 2 });
  });

  it('кешовану анкету індекс не питають: фільтри перевірять її задарма', async () => {
    const { adapters, calls } = makeBackend({ values: { getInTouch: marks }, cached: ['a', 'c'] });
    const result = await loadCardListPage({ query: DEFAULT_CARD_LIST_QUERY, limit: 10, adapters });

    expect(calls.prefilter.flat()).toEqual(['b', 'd', 'e']);
    expect(result.stats.fromCache).toBe(2);
  });

  it('«оновити» читає анкети з бази і не понад сторінку', async () => {
    const { adapters, calls } = makeBackend({ values: { getInTouch: marks }, cached: ['a', 'b', 'c'] });
    adapters.accept = entries => entries.filter(([id]) => id !== 'a');
    const result = await loadCardListPage({ query: DEFAULT_CARD_LIST_QUERY, limit: 2, adapters, cacheFirst: false });

    expect(ids(result)).toEqual(['b', 'd']);
    expect(calls.hydrate.every(call => call.options.cacheFirst === false)).toBe(true);
    expect(calls.hydrate.flatMap(call => call.ids)).toEqual(['b', 'a', 'd']);
    expect(result.state.streams.value.buffer.map(row => row.userId)).toEqual(['c']);
  });
});

describe('фільтри панелі', () => {
  it('вузький фільтр дочитує потік, доки сторінка не набереться', async () => {
    const marks = Object.fromEntries(Array.from({ length: 40 }, (_, index) => [`u${String(index).padStart(2, '0')}`, WEEK_AGO]));
    const { adapters, calls } = makeBackend({ values: { getInTouch: marks } });
    adapters.accept = entries => entries.filter(([id]) => Number(id.slice(1)) % 10 === 0);

    const result = await loadCardListPage({ query: DEFAULT_CARD_LIST_QUERY, limit: 3, adapters });

    expect(ids(result)).toEqual(['u30', 'u20', 'u10']);
    // Порція росте під відсів: не круг на кожні дві картки.
    expect(calls.values.length).toBeLessThan(6);
  });

  it('сторінка не обходить базу без кінця, коли фільтр не пропускає нікого', async () => {
    const marks = Object.fromEntries(Array.from({ length: 5000 }, (_, index) => [`u${index}`, WEEK_AGO]));
    const { adapters, calls } = makeBackend({ values: { getInTouch: marks } });
    adapters.prefilter = null;
    adapters.accept = () => [];

    const result = await loadCardListPage({ query: DEFAULT_CARD_LIST_QUERY, limit: 20, adapters });

    expect(result.users).toEqual([]);
    expect(result.hasMore).toBe(true);
    expect(calls.values.length).toBeLessThanOrEqual(CARD_LIST_MAX_ROUNDS);
  });
});

describe('будь-яке поле', () => {
  it('остання дія за 7 днів — від найсвіжішої, межа в мс від початку дня', async () => {
    const now = new Date();
    const day = 24 * 60 * 60 * 1000;
    const lastAction = { old: now.getTime() - 40 * day, fresh: now.getTime() - day, mid: now.getTime() - 3 * day };
    const { adapters, calls } = makeBackend({ values: { lastAction } });

    const result = await loadCardListPage({ query: query({ field: 'lastAction', range: 'last7' }), limit: 10, adapters, now });

    expect(ids(result)).toEqual(['fresh', 'mid']);
    expect(calls.values[0].bounds.from).toBe(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7).getTime());
    expect(result.users[0].lastAction).toBe(lastAction.fresh);
  });

  it('поле без імені в анкеті нічого в анкету не дописує', async () => {
    const { adapters } = makeBackend({ values: { feedDate: { x: TODAY } } });
    const result = await loadCardListPage({ query: preset('feed'), limit: 5, adapters });

    expect(ids(result)).toEqual(['x']);
    expect(result.users[0].feedDate).toBeUndefined();
  });
});

describe('стан двигуна', () => {
  it('застаріла відповідь не міняє стану викликача', async () => {
    const { adapters } = makeBackend({ values: { getInTouch: { a: TODAY, b: TODAY } } });
    const state = createCardListState(DEFAULT_CARD_LIST_QUERY);
    const result = await loadCardListPage({ query: DEFAULT_CARD_LIST_QUERY, state, limit: 5, adapters, isStale: () => true });

    expect(result.ignored).toBe(true);
    expect(state.order).toEqual([]);
  });

  it('збережений стан відновлюється лише для того самого запиту', async () => {
    const { adapters } = makeBackend({ values: { getInTouch: { a: TODAY, b: YESTERDAY } } });
    const first = await loadCardListPage({ query: DEFAULT_CARD_LIST_QUERY, limit: 1, adapters });
    const serialized = JSON.parse(JSON.stringify(first.state));

    expect(restoreCardListState(serialized, query({ direction: 'asc' }))).toBeNull();
    const restored = restoreCardListState(serialized, DEFAULT_CARD_LIST_QUERY);
    const second = await loadCardListPage({ query: DEFAULT_CARD_LIST_QUERY, state: restored, limit: 5, adapters });
    expect(ids(second)).toEqual(['b']);
  });

  it('проміжний результат приходить, щойно перша порція готова', async () => {
    const marks = Object.fromEntries(Array.from({ length: 6 }, (_, index) => [`u${index}`, WEEK_AGO]));
    const { adapters } = makeBackend({ values: { getInTouch: marks } });
    adapters.accept = entries => entries.filter(([id]) => id !== 'u4');
    const progress = [];

    await loadCardListPage({ query: DEFAULT_CARD_LIST_QUERY, limit: 4, adapters, onProgress: users => progress.push(users.length) });

    expect(progress[0]).toBeGreaterThan(0);
    expect(progress[progress.length - 1]).toBe(4);
  });

  it('ціну сторінки можна прочитати словами', () => {
    expect(describeCardListStats({
      listReads: 2, accepted: 20, hydrated: 22, fromCache: 15, missing: 0, indexChecked: 7, indexRejected: 2,
    }, { ms: 340.2 })).toBe('2 запити переліку · 20 у списку · анкет з кешу 15, з бази 7 · індекс відсіяв 2 з 7 · 340 мс');
  });
});
