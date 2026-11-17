import {
  FLOW_HISTORY_MAX_AGE_MS,
  buildInverseFlowPatch,
  clearFlowHistory,
  pushFlowHistoryStep,
  readFlowHistory,
  writeFlowHistory,
} from './flowHistory';
import { applyFlowPatch, clearFlowCache } from './flowOfflineWrites';

const root = 'multiData/flow/u1';

describe('flowHistory', () => {
  beforeEach(() => localStorage.clear());

  it('латка навпаки повертає дані до стану перед правкою', () => {
    const before = { 'Витрати': { '2026-01-01': { a: '10_кава' } } };
    const patch = {
      [`${root}/Витрати/2026-01-01/a`]: null,
      [`${root}/Витрати/2026-02-01/a`]: '12_кава',
    };
    const inverse = buildInverseFlowPatch(before, patch, 'u1');
    expect(inverse).toEqual({
      [`${root}/Витрати/2026-01-01/a`]: '10_кава',
      [`${root}/Витрати/2026-02-01/a`]: null,
    });
    const after = applyFlowPatch(before, patch, 'u1');
    expect(applyFlowPatch(after, inverse, 'u1')).toEqual(before);
  });

  it('записи однієї дії зливаються в крок, а «до» лишається найпершим', () => {
    let history = pushFlowHistoryStep({ undo: [], redo: [{ at: 1 }] }, {
      patch: { p1: 'a' }, inverse: { p1: null }, label: 'новий запис', batch: 'b',
    });
    expect(history.redo).toEqual([]);
    history = pushFlowHistoryStep(history, { patch: { p1: 'b', p2: 'c' }, inverse: { p1: 'a', p2: null }, batch: 'b' });
    expect(history.undo).toHaveLength(1);
    expect(history.undo[0].patch).toEqual({ p1: 'b', p2: 'c' });
    expect(history.undo[0].inverse).toEqual({ p1: null, p2: null });
    history = pushFlowHistoryStep(history, { patch: { p3: 'x' }, inverse: { p3: null }, batch: 'other' });
    expect(history.undo).toHaveLength(2);
  });

  it('на пристрої — три дні, старіше відкидається', () => {
    const now = 1_800_000_000_000;
    writeFlowHistory('u1', {
      undo: [
        { at: now - FLOW_HISTORY_MAX_AGE_MS - 1, patch: { a: 1 }, inverse: { a: null } },
        { at: now - 1000, patch: { b: 1 }, inverse: { b: null } },
      ],
      redo: [],
    }, now);
    expect(readFlowHistory('u1', now).undo.map(entry => Object.keys(entry.patch)[0])).toEqual(['b']);
    expect(readFlowHistory('u1', now + FLOW_HISTORY_MAX_AGE_MS).undo).toEqual([]);
  });

  it('вихід з акаунта стирає історію разом із памʼяттю Flow', () => {
    writeFlowHistory('u1', { undo: [{ at: Date.now(), patch: { a: 1 }, inverse: { a: null } }], redo: [] });
    clearFlowCache();
    expect(readFlowHistory('u1').undo).toEqual([]);
    writeFlowHistory('u2', { undo: [{ at: Date.now(), patch: { a: 1 }, inverse: { a: null } }], redo: [] });
    clearFlowHistory('u2');
    expect(readFlowHistory('u2').undo).toEqual([]);
  });
});
