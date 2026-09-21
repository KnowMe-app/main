import { listKeysAddedSince, HISTORY_PROTECTED_KEYS } from '../profileHistoryDiff';

describe('що відміна мусить прибрати', () => {
  it('називає поле, якого в знімку не було', () => {
    const before = { userId: 'ID0001', name: 'Оксана' };
    const after = { userId: 'ID0001', name: 'Оксана', email: 'oksana@example.com' };

    expect(listKeysAddedSince(before, after)).toEqual(['email']);
  });

  it('змінене значення прибирати не треба — його перезапише сам знімок', () => {
    const before = { userId: 'ID0001', name: 'Оксана', phone: ['380501112233'] };
    const after = { userId: 'ID0001', name: 'Оксана Б.', phone: ['380501112233', '380507778899'] };

    expect(listKeysAddedSince(before, after)).toEqual([]);
  });

  it('стерте поле теж не тут: його повертає запис знімка', () => {
    const before = { userId: 'ID0001', name: 'Оксана', telegram: 'oksana' };
    const after = { userId: 'ID0001', name: 'Оксана' };

    expect(listKeysAddedSince(before, after)).toEqual([]);
  });

  it('службові позначки застосунку не знімаються — у базі їх немає', () => {
    const before = { userId: 'ID0001' };
    const after = { userId: 'ID0001', __photosHydrated: true, __matchingSummary: true };

    expect(listKeysAddedSince(before, after)).toEqual([]);
  });

  it('фото, id і позначку останньої дії відміна не чіпає', () => {
    const before = { userId: 'ID0001' };
    const after = HISTORY_PROTECTED_KEYS.reduce((acc, key) => ({ ...acc, [key]: 'щось' }), { userId: 'ID0001' });

    expect(listKeysAddedSince(before, after)).toEqual([]);
  });

  it('порожні аргументи не валять розрахунок', () => {
    expect(listKeysAddedSince(null, null)).toEqual([]);
    expect(listKeysAddedSince(undefined, { email: 'a@b.c' })).toEqual(['email']);
    expect(listKeysAddedSince({ email: 'a@b.c' }, null)).toEqual([]);
  });
});
