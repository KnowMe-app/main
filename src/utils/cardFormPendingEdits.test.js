import {
  CARD_FORM_PENDING_MAX_AGE_MS,
  buildCardFormTarget,
  clearCardFormPending,
  readCardFormPending,
  rememberCardFormPending,
  settleCardFormPending,
} from './cardFormPendingEdits';

describe('незбережене у формі картки', () => {
  beforeEach(() => localStorage.clear());

  it('знімає лише свій запис: новіша правка тієї самої картки лишається', () => {
    const first = rememberCardFormPending('u1', 'draft:c1', { name: 'A' });
    const second = rememberCardFormPending('u1', 'draft:c1', { name: 'B' });
    settleCardFormPending('u1', 'draft:c1', first);
    expect(readCardFormPending('u1', 'draft:c1').draft).toEqual({ name: 'B' });
    settleCardFormPending('u1', 'draft:c1', second);
    expect(readCardFormPending('u1', 'draft:c1')).toBeNull();
  });

  it('ціль доповнення й чернетки різні, читачі — теж', () => {
    expect(buildCardFormTarget({ overlayCardId: 'c1', draftCardId: 'c2' })).toBe('overlay:c1');
    expect(buildCardFormTarget({ draftCardId: 'c2' })).toBe('draft:c2');
    rememberCardFormPending('u1', 'overlay:c1', { phone: '1' });
    expect(readCardFormPending('u2', 'overlay:c1')).toBeNull();
  });

  it('старше за тиждень не повертається, вихід стирає все', () => {
    rememberCardFormPending('u1', 'draft:c1', { name: 'A' });
    expect(readCardFormPending('u1', 'draft:c1', { now: Date.now() + CARD_FORM_PENDING_MAX_AGE_MS + 1000 })).toBeNull();
    clearCardFormPending();
    expect(readCardFormPending('u1', 'draft:c1')).toBeNull();
  });
});
