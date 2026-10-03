import { hasFilledProfileDraftData } from '../profileDraftContent';

describe('hasFilledProfileDraftData', () => {
  it('бачить заповнене поле', () => {
    expect(hasFilledProfileDraftData({ userId: 'c1', name: 'Олена' })).toBe(true);
    expect(hasFilledProfileDraftData({ phone: ['380501112233'] })).toBe(true);
  });

  // «Очистити все» лишає масив з порожнім хвостом — попередня версія в ньому
  // значенням не є.
  it('очищену чернетку вважає порожньою', () => {
    expect(hasFilledProfileDraftData({ userId: 'c1', name: '', phone: ['380501112233', ''], email: [''] })).toBe(false);
  });

  it('службових ключів не рахує', () => {
    expect(hasFilledProfileDraftData({ userId: 'c1', __profileMutationOperation: 'create' })).toBe(false);
    expect(hasFilledProfileDraftData(null)).toBe(false);
  });
});
