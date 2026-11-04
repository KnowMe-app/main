import {
  createFeedStateReader,
  filterFeedDeniedSearchResult,
  gateRowsByFeedState,
  isFeedStateDeniedForFeed,
  isFeedStateDeniedForSearch,
} from './searchFeedDenial';

const card = (userId, extra = {}) => ({ userId, name: userId, ...extra });

describe('сховану анкету пошук не знаходить', () => {
  it('відкидає картку, чий свіжий feedDate — false, навіть коли кеш несе дату', async () => {
    const readDenied = async id => id === 'deleted';
    const result = await filterFeedDeniedSearchResult({
      deleted: card('deleted', { feedDate: '2026-10-01' }),
      alive: card('alive', { feedDate: '2026-10-02' }),
      draft: card('draft', { __profileMutationOperation: 'create' }),
    }, { readDenied });
    expect(Object.keys(result).sort()).toEqual(['alive', 'draft']);
  });

  it('тримає форму пошуку: одна картка — обʼєкт, нічого — порожня мапа', async () => {
    const readDenied = async id => id === 'deleted';
    expect(await filterFeedDeniedSearchResult({ a: card('a'), deleted: card('deleted') }, { readDenied })).toEqual(card('a'));
    expect(await filterFeedDeniedSearchResult(card('deleted'), { readDenied })).toEqual({});
    expect(await filterFeedDeniedSearchResult(null, { readDenied })).toBeNull();
  });

  it('явне false у самій картці базу не питає', async () => {
    const readDenied = jest.fn(async () => false);
    expect(await filterFeedDeniedSearchResult(card('x', { feedDate: false }), { readDenied })).toEqual({});
    expect(readDenied).not.toHaveBeenCalled();
  });
});

describe('правило показу', () => {
  it('пошук ховає будь-яке false, стрічка — крім кола «лише для вподобаних»', () => {
    expect(isFeedStateDeniedForSearch({ feedDate: false })).toBe(true);
    expect(isFeedStateDeniedForSearch({ feedDate: false, audience: 'liked' })).toBe(true);
    expect(isFeedStateDeniedForFeed({ feedDate: false })).toBe(true);
    expect(isFeedStateDeniedForFeed({ feedDate: 'false' })).toBe(true);
    expect(isFeedStateDeniedForFeed({ feedDate: false, audience: 'liked' })).toBe(false);
    expect(isFeedStateDeniedForFeed({ feedDate: '2026-10-01' })).toBe(false);
    // Неопублікована (ключа немає) — не схована: пошук її знаходить.
    expect(isFeedStateDeniedForFeed({ feedDate: null })).toBe(false);
  });
});

describe('читач стану картки', () => {
  it('памʼятає відповідь, ділить політ, а prime знімає потребу читати', async () => {
    let clock = 0;
    const reads = [];
    const reader = createFeedStateReader(async id => {
      reads.push(id);
      return { feedDate: id === 'deleted' ? false : '2026-10-01', audience: null };
    }, { ttlMs: 1000, now: () => clock });
    const [first, second] = await Promise.all([reader.read('deleted'), reader.read('deleted')]);
    expect(first).toEqual({ feedDate: false, audience: null });
    expect(second).toBe(first);
    expect(reads).toEqual(['deleted']);
    expect(reader.peek('deleted')).toEqual({ feedDate: false, audience: null });
    clock = 2000;
    expect(reader.peek('deleted')).toBeUndefined();

    reader.prime('fresh', { feedDate: '2026-11-01' });
    expect(await reader.read('fresh')).toEqual({ feedDate: '2026-11-01' });
    expect(reads).toEqual(['deleted']);
  });

  it('збій читання стану не дає і картку не ховає', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const reader = createFeedStateReader(async () => { throw new Error('offline'); });
    expect(await reader.read('x')).toBeNull();
    expect(reader.peek('x')).toBeUndefined();
    warn.mockRestore();
  });
});

describe('рядки стрічки перед показом', () => {
  const states = {
    alive: { feedDate: '2026-10-01' },
    deleted: { feedDate: false },
    liked: { feedDate: false, audience: 'liked' },
  };
  const peek = id => states[id];

  it('сховане й видалене не показується, неперевірене чекає, а не мигає', () => {
    const rows = [card('alive'), card('deleted'), card('liked'), card('unknown'), card('d', { __profileMutationOperation: 'create' }), card('me')];
    const { visible, pendingIds } = gateRowsByFeedState(rows, {
      peek,
      isChecked: () => false,
      skip: row => row.userId === 'me',
    });
    expect(visible.map(row => row.userId)).toEqual(['alive', 'liked', 'd', 'me']);
    expect(pendingIds).toEqual(['unknown']);
  });

  it('прочитане без стану (збій) — показується: без звʼязку стрічка не порожніє', () => {
    const { visible, pendingIds } = gateRowsByFeedState([card('unknown')], { peek, isChecked: () => true });
    expect(visible.map(row => row.userId)).toEqual(['unknown']);
    expect(pendingIds).toEqual([]);
  });
});
