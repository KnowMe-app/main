import {
  applyPendingCardSave,
  countPendingCardSaves,
  getPendingCardSave,
  listPendingCardSaves,
  mergePendingCardSaveParams,
  rememberPendingCardSave,
  settlePendingCardSave,
} from './adminCardPendingSaves';

const UID = 'admin1';

describe('adminCardPendingSaves', () => {
  beforeEach(() => localStorage.clear());

  it('правка лягає на пристрій і знімається лише своєю позначкою', () => {
    const first = rememberPendingCardSave(UID, { syncedState: { userId: 'c1', name: 'A' }, overwrite: 'name' });
    const second = rememberPendingCardSave(UID, { syncedState: { userId: 'c1', name: 'B' }, overwrite: 'name' });
    expect(countPendingCardSaves(UID)).toBe(1);
    settlePendingCardSave(UID, 'c1', first);
    expect(getPendingCardSave(UID, 'c1').params.syncedState.name).toBe('B');
    settlePendingCardSave(UID, 'c1', second);
    expect(listPendingCardSaves(UID)).toEqual([]);
  });

  it('видалення накопичуються, а знову заповнене поле зі стертих знімається', () => {
    const merged = mergePendingCardSaveParams(
      { syncedState: { userId: 'c1' }, delCondition: { phone: '1', city: 'X' }, deletedKeys: ['phone', 'city'], overwrite: 'overwrite' },
      { syncedState: { userId: 'c1', city: 'Y' }, deletedKeys: [], overwrite: 'name', removedIndexValues: { email: ['a'] } }
    );
    expect(merged.delCondition).toEqual({ phone: '1' });
    expect(merged.deletedKeys).toEqual(['phone']);
    expect(merged.overwrite).toBe('overwrite');
    expect(merged.removedIndexValues).toEqual({ email: ['a'] });
  });

  it('відкрита картка показує недослану правку поверх бази', () => {
    rememberPendingCardSave(UID, {
      syncedState: { userId: 'c1', name: 'Нове' },
      localCardState: { userId: 'c1', name: 'Нове' },
      deletedKeys: ['phone'],
    });
    expect(applyPendingCardSave(UID, { userId: 'c1', name: 'Старе', phone: '380', city: 'Київ' })).toEqual({
      userId: 'c1',
      name: 'Нове',
      city: 'Київ',
    });
    expect(applyPendingCardSave(UID, { userId: 'c2', name: 'Інша' })).toEqual({ userId: 'c2', name: 'Інша' });
  });
});
