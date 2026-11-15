import {
  applyFlowPatch,
  clearFlowCache,
  countPendingFlowWrites,
  overlayPendingFlowWrites,
  readFlowCache,
  writeFlowCache,
} from './flowOfflineWrites';

const OWNER = 'owner1';
const ROOT = `multiData/flow/${OWNER}`;

describe('flowOfflineWrites', () => {
  beforeEach(() => localStorage.clear());

  it('накладає запис і видалення, знімаючи порожні гілки', () => {
    const base = { g: { '2026-11-01': { a: '1_x' } } };
    const added = applyFlowPatch(base, { [`${ROOT}/g/2026-11-02/b`]: '2_y' }, OWNER);
    expect(added.g['2026-11-02'].b).toBe('2_y');
    expect(base.g['2026-11-02']).toBeUndefined();
    const removed = applyFlowPatch(added, { [`${ROOT}/g/2026-11-01/a`]: null, [`${ROOT}/g/2026-11-02/b`]: null }, OWNER);
    expect(removed).toEqual({});
  });

  it('пропускає чужі шляхи й рахує лише записи Flow власника', () => {
    const patches = [{ [`${ROOT}/g/d/a`]: 'v' }, { 'multiData/favorites/owner1/c': true }, { 'multiData/flow/other/g': null }];
    expect(countPendingFlowWrites(OWNER, patches)).toBe(1);
    expect(overlayPendingFlowWrites({}, OWNER, patches)).toEqual({ g: { d: { a: 'v' } } });
  });

  it('памʼять пристрою читається й стирається', () => {
    writeFlowCache(OWNER, { g: { d: { a: 'v' } } });
    expect(readFlowCache(OWNER)).toEqual({ g: { d: { a: 'v' } } });
    clearFlowCache();
    expect(readFlowCache(OWNER)).toBeNull();
  });
});
