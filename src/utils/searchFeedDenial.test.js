import { createFeedDenialReader, filterFeedDeniedSearchResult } from './searchFeedDenial';

describe('сховану анкету пошук не знаходить', () => {
  const card = (userId, extra = {}) => ({ userId, name: userId, ...extra });

  it('відкидає картку, чий свіжий feedDate — false, навіть коли кеш несе дату', async () => {
    const readDenied = async id => id === 'deleted';
    const result = await filterFeedDeniedSearchResult({
      deleted: card('deleted', { feedDate: '2026-10-01' }),
      alive: card('alive', { feedDate: '2026-10-02' }),
      draft: card('draft', { __profileMutationOperation: 'create' }),
    }, { readDenied });
    // Одна жива + чернетка — мапа з двох.
    expect(Object.keys(result).sort()).toEqual(['alive', 'draft']);
  });

  it('тримає форму пошуку: одна картка — обʼєкт, нічого — порожня мапа', async () => {
    const readDenied = async id => id === 'deleted';
    expect(await filterFeedDeniedSearchResult({ a: card('a'), deleted: card('deleted') }, { readDenied })).toEqual(card('a'));
    expect(await filterFeedDeniedSearchResult(card('deleted'), { readDenied })).toEqual({});
    expect(await filterFeedDeniedSearchResult(null, { readDenied })).toBeNull();
  });

  it('явне false у самій картці не питає базу', async () => {
    const readDenied = jest.fn(async () => false);
    expect(await filterFeedDeniedSearchResult(card('x', { feedDate: false }), { readDenied })).toEqual({});
    expect(await filterFeedDeniedSearchResult(card('y', { publish: false }), { readDenied })).toEqual({});
    expect(readDenied).not.toHaveBeenCalled();
  });

  it('чернетка не питає базу: картки стрічки в неї немає', async () => {
    const readDenied = jest.fn(async () => true);
    const draft = card('d', { __profileMutationOperation: 'create' });
    expect(await filterFeedDeniedSearchResult(draft, { readDenied })).toBe(draft);
    expect(readDenied).not.toHaveBeenCalled();
  });

  it('читач памʼятає відповідь хвилину, а збій читання картку лишає', async () => {
    let clock = 0;
    const reads = [];
    const read = createFeedDenialReader(async id => {
      reads.push(id);
      if (id === 'broken') throw new Error('offline');
      return id === 'deleted' ? false : '2026-10-01';
    }, { now: () => clock });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await read('deleted')).toBe(true);
    expect(await read('deleted')).toBe(true);
    expect(reads).toEqual(['deleted']);
    clock = 61 * 1000;
    await read('deleted');
    expect(reads).toEqual(['deleted', 'deleted']);
    expect(await read('alive')).toBe(false);
    expect(await read('broken')).toBe(false);
    warn.mockRestore();
  });
});
