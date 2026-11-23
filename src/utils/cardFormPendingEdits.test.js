import {
  CARD_FORM_PENDING_MAX_AGE_MS,
  advanceCardFormPending,
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

  it('читає старий запис окремо від запису з відомою порожньою базою', () => {
    const draft = { name: 'A' };
    const legacyAt = rememberCardFormPending('u1', 'draft:c1', draft);
    expect(readCardFormPending('u1', 'draft:c1')).toEqual({ draft, at: legacyAt });

    const targetKey = 'create:u1:c1';
    const at = rememberCardFormPending('u1', 'draft:c1', draft, { expected: null, targetKey });
    expect(readCardFormPending('u1', 'draft:c1')).toEqual({ draft, at, expected: null, targetKey });
  });

  it('підтвердження переносить базу лише новішої правки з тієї самої ревізії', () => {
    const target = 'draft:c1';
    const expected = { revision: 3, data: { name: 'A' } };
    const nextExpected = { revision: 4, data: { name: 'B' } };
    const targetKey = 'create:u1:c1';
    const first = rememberCardFormPending('u1', target, { name: 'B' }, { expected, targetKey });
    advanceCardFormPending('u1', target, expected, nextExpected, first);
    expect(readCardFormPending('u1', target).expected).toEqual(expected);

    const draft = { name: 'C' };
    const second = rememberCardFormPending('u1', target, draft, { expected, targetKey });
    advanceCardFormPending('u1', target, { ...expected, revision: 2 }, nextExpected, first);
    expect(readCardFormPending('u1', target).expected).toEqual(expected);

    advanceCardFormPending('u1', target, { data: { name: 'A' }, revision: 3 }, nextExpected, first);
    settleCardFormPending('u1', target, first);
    expect(readCardFormPending('u1', target)).toEqual({ draft, at: second, expected: nextExpected, targetKey });
  });

  it('підтвердження створення переносить відому порожню базу, а стара лишається невідомою', () => {
    const target = 'overlay:c1';
    const draft = { phone: '1' };
    const firstRevision = { revision: 1 };
    rememberCardFormPending('u1', target, draft);
    advanceCardFormPending('u1', target, null, firstRevision);
    expect(readCardFormPending('u1', target)).not.toHaveProperty('expected');

    rememberCardFormPending('u1', target, draft, { expected: null });
    advanceCardFormPending('u1', target, null, firstRevision);
    expect(readCardFormPending('u1', target).expected).toEqual(firstRevision);
  });

  it('старше за тиждень не повертається, вихід стирає все', () => {
    rememberCardFormPending('u1', 'draft:c1', { name: 'A' });
    expect(readCardFormPending('u1', 'draft:c1', { now: Date.now() + CARD_FORM_PENDING_MAX_AGE_MS + 1000 })).toBeNull();
    clearCardFormPending();
    expect(readCardFormPending('u1', 'draft:c1')).toBeNull();
  });

  it('мітка новішої правки враховує запис іншої вкладки', () => {
    const target = 'draft:c1';
    const storedAt = Date.now() + 1000;
    localStorage.setItem('km.cardFormPending.v1:u1', JSON.stringify({ [target]: { draft: { name: 'A' }, at: storedAt } }));

    const at = rememberCardFormPending('u1', target, { name: 'B' });
    expect(at).toBe(storedAt + 1);
    settleCardFormPending('u1', target, storedAt);
    expect(readCardFormPending('u1', target)).toEqual({ draft: { name: 'B' }, at });
  });
});
