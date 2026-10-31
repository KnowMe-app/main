import {
  CARD_LIST_MAX_ROUNDS,
  buildCardListStreams,
  createCardListState,
  describeCardListStats,
  loadCardListPage,
  restoreCardListState,
} from '../cardListEngine';
import { DEFAULT_CARD_LIST_PLAN, normalizeCardListPlan } from '../cardListPlan';

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

const plan = overrides => normalizeCardListPlan({
  ...DEFAULT_CARD_LIST_PLAN,
  ...overrides,
  segments: { ...DEFAULT_CARD_LIST_PLAN.segments, ...(overrides?.segments || {}) },
});

/**
 * Мінімальна «база»: позначки власника, картки за ключем, `lastAction`,
 * анкети, кеш і індекс. Потоки віддають рядки так само, як їх віддає RTDB:
 * діапазон станів позначки — рядковим порівнянням, тож нотатка й порожнє
 * значення теж потрапляють у вибірку і мусять бути відсіяні двигуном.
 */
const makeBackend = ({
  marks = {},
  cardIds = null,
  lastActions = {},
  profiles = null,
  cached = [],
  indexRejects = [],
  failStreams = [],
} = {}) => {
  const allCardIds = cardIds || [...new Set([...Object.keys(marks), ...Object.keys(lastActions)])].sort();
  const profileOf = id => (profiles && profiles[id]) || { userId: id, name: `Картка ${id}` };
  const cachedSet = new Set(cached);
  const calls = { stream: [], marks: [], prefilter: [], hydrate: [] };

  const streamRows = stream => {
    if (stream.source === 'getInTouch') {
      const rows = Object.entries(marks).map(([userId, getInTouch]) => ({ userId, getInTouch }));
      const byValueAsc = (a, b) => String(a.getInTouch).localeCompare(String(b.getInTouch)) || a.userId.localeCompare(b.userId);
      if (stream.segment === 'due') {
        return rows.filter(row => String(row.getInTouch) <= TODAY).sort(byValueAsc).reverse();
      }
      if (stream.segment === 'future') {
        return rows.filter(row => String(row.getInTouch) >= TOMORROW && String(row.getInTouch) <= '2099-12-31').sort(byValueAsc);
      }
      return rows.filter(row => String(row.getInTouch) >= '2099-99-99' && String(row.getInTouch) <= '9999-99-99').sort(byValueAsc);
    }
    if (stream.source === 'cardKeys') return allCardIds.map(userId => ({ userId }));
    if (stream.source === 'lastAction') {
      return Object.entries(lastActions)
        .map(([userId, lastAction]) => ({ userId, lastAction }))
        .sort((a, b) => b.lastAction - a.lastAction || b.userId.localeCompare(a.userId));
    }
    return [];
  };

  const adapters = {
    readStreamPage: async ({ stream, cursor, limit }) => {
      calls.stream.push({ key: stream.key, cursor, limit });
      if (failStreams.includes(stream.key)) {
        const error = new Error('Permission denied');
        error.code = 'PERMISSION_DENIED';
        throw error;
      }
      const all = streamRows(stream);
      const offset = Number(cursor) || 0;
      const rows = all.slice(offset, offset + limit);
      return { rows, nextCursor: offset + rows.length, hasMore: offset + rows.length < all.length };
    },
    readMarks: async ids => {
      calls.marks.push([...ids]);
      return Object.fromEntries(ids.map(id => [id, marks[id]]));
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

describe('потоки плану', () => {
  it('за датою дзвінка — один потік на кожен обраний стан, у порядку списку', () => {
    const streams = buildCardListStreams(plan({ segments: { due: true, future: true, undated: true, never: true } }));
    expect(streams.map(stream => stream.key)).toEqual(['due', 'future', 'undated', 'never']);
    // «Без дати» не має діапазону в позначках — це картки за ключем, і стан
    // кожної доводить точкове читання позначки.
    expect(streams.find(stream => stream.key === 'undated')).toMatchObject({ source: 'cardKeys', marks: 'probe' });
    expect(streams.find(stream => stream.key === 'due')).toMatchObject({ source: 'getInTouch', marks: 'row' });
  });

  it('за останньою дією — один потік; позначки питаються, лише коли стани звужують список', () => {
    expect(buildCardListStreams(plan({ byLastAction: true, segments: { due: true, future: true, undated: true, never: true } })))
      .toEqual([expect.objectContaining({ key: 'lastAction', marks: 'hydrated' })]);
    expect(buildCardListStreams(plan({ byLastAction: true, segments: { due: true } })))
      .toEqual([expect.objectContaining({ key: 'lastAction', marks: 'probe' })]);
  });

  it('JSON-файли замінюють джерело, а не додають ще одне', () => {
    expect(buildCardListStreams(plan({ fromFiles: true, segments: { due: true, undated: true } })))
      .toEqual([expect.objectContaining({ key: 'files', source: 'files' })]);
  });
});

describe('«Кому дзвонити» — умовчання', () => {
  const marks = {
    today1: TODAY,
    today2: TODAY,
    past1: YESTERDAY,
    past2: WEEK_AGO,
    later: TOMORROW,
    note: '99',
    empty: '',
    disliked: '2099-99-99',
  };

  it('від сьогодні назад, без майбутнього, нотаток і «99»', async () => {
    const { adapters } = makeBackend({ marks });
    const result = await loadCardListPage({ plan: DEFAULT_CARD_LIST_PLAN, limit: 10, adapters });

    expect(ids(result)).toEqual(['today2', 'today1', 'past1', 'past2']);
    expect(result.hasMore).toBe(false);
  });

  it('сторінка коштує один запит переліку і рівно стільки анкет, скільки на ній карток', async () => {
    const { adapters, calls } = makeBackend({ marks });
    const result = await loadCardListPage({ plan: DEFAULT_CARD_LIST_PLAN, limit: 2, adapters });

    expect(ids(result)).toEqual(['today2', 'today1']);
    expect(calls.stream).toHaveLength(1);
    expect(calls.hydrate.flatMap(call => call.ids)).toEqual(['today2', 'today1']);
    // Позначку приніс сам запит — точкових читань немає.
    expect(calls.marks).toHaveLength(0);
    expect(result.stats).toMatchObject({ listReads: 1, hydrated: 2, accepted: 2 });
  });

  it('друга сторінка продовжує з курсора: без повторів і без пропусків', async () => {
    const { adapters, calls } = makeBackend({ marks });
    const first = await loadCardListPage({ plan: DEFAULT_CARD_LIST_PLAN, limit: 2, adapters });
    const second = await loadCardListPage({ plan: DEFAULT_CARD_LIST_PLAN, state: first.state, limit: 2, adapters });

    expect(ids(second)).toEqual(['past1', 'past2']);
    expect(second.state.order).toEqual(['today2', 'today1', 'past1', 'past2']);
    expect(calls.stream[1].cursor).toBe(2);
  });

  it('непрочитаний залишок порції йде першим на наступній сторінці, а не губиться', async () => {
    // Вузький фільтр змушує брати порцію з запасом; що не влізло в сторінку,
    // лишається в стані й наступного разу береться без нового запиту.
    const many = Object.fromEntries(Array.from({ length: 12 }, (_, index) => [`p${String(index).padStart(2, '0')}`, WEEK_AGO]));
    const { adapters, calls } = makeBackend({ marks: many });
    adapters.accept = entries => entries.filter(([id]) => Number(id.slice(1)) % 2 === 1 || Number(id.slice(1)) > 8);

    const first = await loadCardListPage({ plan: DEFAULT_CARD_LIST_PLAN, limit: 3, adapters });
    const second = await loadCardListPage({ plan: DEFAULT_CARD_LIST_PLAN, state: first.state, limit: 3, adapters });
    const third = await loadCardListPage({ plan: DEFAULT_CARD_LIST_PLAN, state: second.state, limit: 10, adapters });

    const all = [...ids(first), ...ids(second), ...ids(third)];
    expect(all).toEqual(['p11', 'p10', 'p09', 'p07', 'p05', 'p03', 'p01']);
    expect(new Set(all).size).toBe(all.length);
    expect(third.hasMore).toBe(false);
    // Жодна позначка не прочитана двічі.
    const readRanges = calls.stream.map(call => [call.cursor || 0, (call.cursor || 0) + call.limit]);
    readRanges.slice(1).forEach(([start], index) => {
      expect(start).toBeGreaterThanOrEqual(readRanges[index][1] > 12 ? 12 : readRanges[index][1]);
    });
  });

  it('свіжа позначка з потоку перебиває кешовану анкету', async () => {
    // Кешована анкета живе шість годин, а позначку за цей час переставляють:
    // картка, яку сьогодні знову треба набрати, не мусить зникати лише тому,
    // що в кеші ще лежить її майбутня дата.
    const { adapters } = makeBackend({
      marks: { stale: TODAY },
      profiles: { stale: { userId: 'stale', getInTouch: NEXT_WEEK } },
      cached: ['stale'],
    });

    const result = await loadCardListPage({ plan: DEFAULT_CARD_LIST_PLAN, limit: 5, adapters });

    expect(ids(result)).toEqual(['stale']);
    expect(result.users[0].getInTouch).toBe(TODAY);
  });
});

describe('кілька станів одним списком', () => {
  const marks = { due1: TODAY, due2: YESTERDAY, soon: TOMORROW, note: 'дзвонила', gone: '2099-99-99' };
  const cardIds = ['a-plain', 'b-plain', 'due1', 'due2', 'gone', 'note', 'soon'];

  it('«Кому дзвонити» + «Без дати»: спершу дзвінки, потім решта за ключем', async () => {
    const { adapters, calls } = makeBackend({ marks, cardIds });
    const result = await loadCardListPage({
      plan: plan({ segments: { due: true, undated: true } }),
      limit: 10,
      adapters,
    });

    expect(ids(result)).toEqual(['due1', 'due2', 'a-plain', 'b-plain', 'note']);
    // Позначки питались лише для кандидатів «без дати», яких ще немає у
    // списку, — і картки з датою відкинуто до читання анкети.
    expect(calls.marks.flat()).toEqual(['a-plain', 'b-plain', 'gone', 'note', 'soon']);
    const hydratedForUndated = calls.hydrate.slice(1).flatMap(call => call.ids);
    expect(hydratedForUndated).toEqual(['a-plain', 'b-plain', 'note']);
  });

  it('усі чотири стани — кожна картка рівно один раз', async () => {
    const { adapters } = makeBackend({ marks, cardIds });
    const result = await loadCardListPage({
      plan: plan({ segments: { due: true, future: true, undated: true, never: true } }),
      limit: 20,
      adapters,
    });

    expect(ids(result)).toEqual(['due1', 'due2', 'soon', 'a-plain', 'b-plain', 'note', 'gone']);
  });

  it('потік, що впав, не валить список: решта станів показується, причина названа', async () => {
    const { adapters } = makeBackend({ marks, cardIds, failStreams: ['undated'] });
    const result = await loadCardListPage({
      plan: plan({ segments: { due: true, undated: true, future: true } }),
      limit: 20,
      adapters,
    });

    expect(ids(result)).toEqual(['due1', 'due2', 'soon']);
    expect(result.errors).toEqual([expect.objectContaining({ stream: 'undated', code: 'PERMISSION_DENIED' })]);
  });
});

describe('відсів індексом і кеш', () => {
  const marks = { a: TODAY, b: TODAY, c: YESTERDAY, d: YESTERDAY, e: WEEK_AGO };

  it('відкинута індексом картка не коштує анкети', async () => {
    const { adapters, calls } = makeBackend({ marks, indexRejects: ['b', 'd'] });
    const result = await loadCardListPage({ plan: DEFAULT_CARD_LIST_PLAN, limit: 10, adapters });

    expect(ids(result)).toEqual(['b', 'a', 'd', 'c', 'e'].filter(id => !['b', 'd'].includes(id)));
    expect(calls.hydrate.flatMap(call => call.ids)).not.toEqual(expect.arrayContaining(['b']));
    expect(calls.hydrate.flatMap(call => call.ids)).not.toEqual(expect.arrayContaining(['d']));
    expect(result.stats).toMatchObject({ indexChecked: 5, indexRejected: 2 });
  });

  it('кешовану анкету індекс не питають: фільтри перевірять її задарма', async () => {
    const { adapters, calls } = makeBackend({ marks, cached: ['a', 'c'] });
    const result = await loadCardListPage({ plan: DEFAULT_CARD_LIST_PLAN, limit: 10, adapters });

    expect(calls.prefilter.flat()).toEqual(['b', 'd', 'e']);
    expect(result.stats.fromCache).toBe(2);
  });

  it('без «Відсіву індексом» індекс не питається зовсім', async () => {
    const { adapters, calls } = makeBackend({ marks, indexRejects: ['b'] });
    const result = await loadCardListPage({ plan: plan({ indexPrefilter: false }), limit: 10, adapters });

    expect(calls.prefilter).toHaveLength(0);
    expect(ids(result)).toContain('b');
  });

  it('без кешу анкета читається з бази й не понад сторінку', async () => {
    const { adapters, calls } = makeBackend({ marks, cached: ['a', 'b', 'c'] });
    adapters.accept = entries => entries.filter(([id]) => id !== 'a');
    const result = await loadCardListPage({ plan: plan({ cacheFirst: false }), limit: 2, adapters });

    // Порядок — пара (дата, ключ) від новішого: b, a, d, c, e.
    expect(ids(result)).toEqual(['b', 'd']);
    expect(calls.hydrate.every(call => call.options.cacheFirst === false)).toBe(true);
    // Без кешу кожна зайва анкета — п'ять вузлів: порція не більша за потребу,
    // і прочитана, але не потрібна `c` лишається в залишку, а не в анкетах.
    expect(calls.hydrate.flatMap(call => call.ids)).toEqual(['b', 'a', 'd']);
    expect(result.state.streams.due.buffer.map(row => row.userId)).toEqual(['c']);
    // І індекс без кешу питається для всіх: кешованої відповіді тут немає.
    expect(calls.prefilter.flat()).toEqual(['b', 'a', 'd']);
  });
});

describe('фільтри панелі', () => {
  it('вузький фільтр дочитує потік, доки сторінка не набереться', async () => {
    const marks = Object.fromEntries(Array.from({ length: 40 }, (_, index) => [`u${String(index).padStart(2, '0')}`, WEEK_AGO]));
    const { adapters, calls } = makeBackend({ marks });
    adapters.accept = entries => entries.filter(([id]) => Number(id.slice(1)) % 10 === 0);

    const result = await loadCardListPage({ plan: DEFAULT_CARD_LIST_PLAN, limit: 3, adapters });

    expect(ids(result)).toEqual(['u30', 'u20', 'u10']);
    // Порція росте під відсів: не круг на кожні дві картки.
    expect(calls.stream.length).toBeLessThan(6);
  });

  it('сторінка не обходить базу без кінця, коли фільтр не пропускає нікого', async () => {
    const marks = Object.fromEntries(Array.from({ length: 5000 }, (_, index) => [`u${index}`, WEEK_AGO]));
    const { adapters, calls } = makeBackend({ marks });
    adapters.accept = () => [];

    const result = await loadCardListPage({ plan: plan({ indexPrefilter: false }), limit: 20, adapters });

    expect(result.users).toEqual([]);
    expect(result.hasMore).toBe(true);
    expect(calls.stream.length).toBeLessThanOrEqual(CARD_LIST_MAX_ROUNDS);
  });
});

describe('за останньою дією', () => {
  const lastActions = { old: 100, fresh: 300, mid: 200, idle: 50 };
  const marks = { fresh: NEXT_WEEK, mid: TODAY, idle: '2099-99-99' };

  it('усі стани — один потік від найсвіжішої дії, без жодної перевірки позначок', async () => {
    const { adapters, calls } = makeBackend({ lastActions, marks });
    const result = await loadCardListPage({
      plan: plan({ byLastAction: true, segments: { due: true, future: true, undated: true, never: true } }),
      limit: 10,
      adapters,
    });

    expect(ids(result)).toEqual(['fresh', 'mid', 'old', 'idle']);
    expect(calls.marks).toHaveLength(0);
    expect(result.users[0].lastAction).toBe(300);
  });

  it('звужений станами — позначки питаються до анкет, і відкинуте не читається', async () => {
    const { adapters, calls } = makeBackend({ lastActions, marks });
    const result = await loadCardListPage({
      plan: plan({ byLastAction: true, segments: { due: true } }),
      limit: 10,
      adapters,
    });

    expect(ids(result)).toEqual(['mid']);
    expect(calls.hydrate.flatMap(call => call.ids)).toEqual(['mid']);
  });
});

describe('стан двигуна', () => {
  it('застаріла відповідь не міняє стану викликача', async () => {
    const { adapters } = makeBackend({ marks: { a: TODAY, b: TODAY } });
    const state = createCardListState(DEFAULT_CARD_LIST_PLAN);
    const result = await loadCardListPage({ plan: DEFAULT_CARD_LIST_PLAN, state, limit: 5, adapters, isStale: () => true });

    expect(result.ignored).toBe(true);
    expect(state.order).toEqual([]);
    expect(state.streams).toEqual({});
  });

  it('збережений стан відновлюється лише для того самого плану', async () => {
    const { adapters } = makeBackend({ marks: { a: TODAY, b: YESTERDAY } });
    const first = await loadCardListPage({ plan: DEFAULT_CARD_LIST_PLAN, limit: 1, adapters });
    const serialized = JSON.parse(JSON.stringify(first.state));

    expect(restoreCardListState(serialized, DEFAULT_CARD_LIST_PLAN)).toEqual(expect.objectContaining({ order: ['a'] }));
    expect(restoreCardListState(serialized, plan({ segments: { undated: true } }))).toBeNull();

    const restored = restoreCardListState(serialized, DEFAULT_CARD_LIST_PLAN);
    const second = await loadCardListPage({ plan: DEFAULT_CARD_LIST_PLAN, state: restored, limit: 5, adapters });
    expect(ids(second)).toEqual(['b']);
  });

  it('проміжний результат приходить, щойно перша порція готова', async () => {
    const marks = Object.fromEntries(Array.from({ length: 6 }, (_, index) => [`u${index}`, WEEK_AGO]));
    const { adapters } = makeBackend({ marks });
    adapters.accept = entries => entries.filter(([id]) => id !== 'u4');
    const progress = [];

    await loadCardListPage({ plan: DEFAULT_CARD_LIST_PLAN, limit: 4, adapters, onProgress: users => progress.push(users.length) });

    expect(progress[0]).toBeGreaterThan(0);
    expect(progress[progress.length - 1]).toBe(4);
  });

  it('ціну сторінки можна прочитати словами', () => {
    expect(describeCardListStats({
      listReads: 2, accepted: 20, hydrated: 22, fromCache: 15, missing: 0, indexChecked: 7, indexRejected: 2,
    }, { ms: 340.2 })).toBe('2 запити переліку · 20 у списку · анкет з кешу 15, з бази 7 · індекс відсіяв 2 з 7 · 340 мс');
  });
});
