import {
  __resetCardStoreForTests,
  clearCardStore,
  getCardStoreVersion,
  getStoredProjection,
  patchStoredProjection,
  resolveStoredProjection,
  resolveStoredProjectionList,
  restoreStoredProjection,
  subscribeCardStore,
  switchCardStoreViewer,
  upsertStoredProjections,
} from './cardStore';

const isProjection = user => Boolean(user?.__matchingSummary);
const card = (id, extra = {}) => ({ userId: id, __matchingSummary: true, ...extra });

beforeEach(() => __resetCardStoreForTests());

describe('одне сховище проєкцій', () => {
  it('рядок будь-якого джерела бере найсвіжішу прочитану проєкцію цілком', () => {
    upsertStoredProjections('viewer', { a: card('a', { name: 'Нова', avatar: 'new.jpg', rev: 2 }) });
    const fromLikedAudience = card('a', { name: 'Стара', avatar: 'old.jpg', programsAt: 5, rev: 1, __likedAudience: true });
    const resolved = resolveStoredProjection(fromLikedAudience, isProjection);
    expect(resolved).toMatchObject({ name: 'Нова', avatar: 'new.jpg', rev: 2, __likedAudience: true });
    // Стерте в новій проєкції (знялі програми) не лишається зі старої.
    expect(resolved).not.toHaveProperty('programsAt');
  });

  it('старіша версія не перебиває новішу ні в сховищі, ні в рядку', () => {
    upsertStoredProjections('viewer', { a: card('a', { name: 'Нова', rev: 2 }) });
    upsertStoredProjections('viewer', { a: card('a', { name: 'Стара', rev: 1 }) });
    expect(getStoredProjection('a').name).toBe('Нова');
    const newerRow = card('a', { name: 'Ще новіша', rev: 3 });
    expect(resolveStoredProjection(newerRow, isProjection)).toBe(newerRow);
  });

  it('та сама версія — перемагає пізніше прочитане', () => {
    upsertStoredProjections('viewer', { a: card('a', { programsAt: 5, rev: 1 }) });
    upsertStoredProjections('viewer', { a: card('a', { rev: 1 }) });
    expect(getStoredProjection('a')).not.toHaveProperty('programsAt');
  });

  it('повну анкету й рядок без змін не чіпає', () => {
    upsertStoredProjections('viewer', { a: card('a', { name: 'Нова' }) });
    const full = { userId: 'a', name: 'Стара', surname: 'Коваленко' };
    expect(resolveStoredProjection(full, isProjection)).toBe(full);
    const same = card('a', { name: 'Нова' });
    expect(resolveStoredProjection(same, isProjection)).toBe(same);
  });

  it('скидається з «Оновити стрічку» й на зміні читача, сповіщаючи слухачів', async () => {
    const listener = jest.fn();
    subscribeCardStore(listener);
    upsertStoredProjections('viewer', { a: card('a') });
    const version = getCardStoreVersion();
    clearCardStore();
    expect(getStoredProjection('a')).toBeNull();
    expect(getCardStoreVersion()).toBe(version + 1);
    upsertStoredProjections('viewer', { a: card('a') });
    switchCardStoreViewer('other');
    expect(getStoredProjection('a')).toBeNull();
    await Promise.resolve();
    expect(listener).toHaveBeenCalled();
  });

  it('пачка записів поспіль — одне сповіщення', async () => {
    const listener = jest.fn();
    subscribeCardStore(listener);
    ['a', 'b', 'c'].forEach(id => upsertStoredProjections('viewer', { [id]: card(id) }));
    await Promise.resolve();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('список джерела бере свіжі проєкції, а без змін лишається тим самим масивом', () => {
    const list = [card('a', { birth: '1990-01-01', rev: 1 }), card('b', { rev: 1 })];
    expect(resolveStoredProjectionList(list, isProjection)).toBe(list);
    upsertStoredProjections('viewer', { a: card('a', { birth: '1985-01-01', rev: 2 }) });
    const resolved = resolveStoredProjectionList(list, isProjection);
    expect(resolved).not.toBe(list);
    expect(resolved[0].birth).toBe('1985-01-01');
    expect(resolved[1]).toBe(list[1]);
    upsertStoredProjections('viewer', { b: card('b', { rev: 1 }) });
    expect(resolveStoredProjectionList([resolved[0]], isProjection)[0]).toBe(resolved[0]);
  });

  it('локальна правка публікації лягає в сховище й відкочується', () => {
    const stored = card('a', { publish: true, feedDate: '2026-11-10', rev: 1 });
    upsertStoredProjections('viewer', { a: stored });
    const before = patchStoredProjection('a', current => ({ ...current, publish: false, feedDate: false }));
    expect(before).toBe(stored);
    const row = card('a', { publish: false, feedDate: false, rev: 1 });
    expect(resolveStoredProjection(row, isProjection)).toBe(row);
    restoreStoredProjection('a', before);
    expect(getStoredProjection('a')).toBe(stored);
  });

  it('правка без проєкції в сховищі нічого не пише', () => {
    expect(patchStoredProjection('missing', current => ({ ...current, publish: false }))).toBeNull();
    expect(getStoredProjection('missing')).toBeNull();
  });
});
