import { buildMatchingIndexFilterGroups, withoutViewerHiddenRoleBuckets } from '../matchingDataProvider';

jest.mock('components/config', () => ({ database: {}, collectAgeIdsByFilters: jest.fn() }));

/*
 * Донорці `FilterPanel` тримає ввімкненими приховані від неї `ed`/`sm`, і план
 * індексу через це читав бакети донорок і СМ цілком: 334 точкові картки на
 * холодне відкриття заради 14 агенцій.
 */
const donorDefault = { userRole: { ed: true, sm: true, ag: true, ip: false, other: false } };

describe('план індексу не читає ролей, яких читач не бачить', () => {
  it('донорці лишає в групі ролей самі агенції', () => {
    expect(withoutViewerHiddenRoleBuckets(donorDefault, 'ed').userRole)
      .toEqual({ ed: false, sm: false, ag: true, ip: false, other: false });
  });

  it('агенції нічого не міняє', () => {
    expect(withoutViewerHiddenRoleBuckets(donorDefault, 'ag')).toBe(donorDefault);
  });

  it('«усе ввімкнено» лишається без звуження', () => {
    const all = { userRole: { ed: true, sm: true, ag: true, ip: true, other: true } };
    expect(withoutViewerHiddenRoleBuckets(all, 'ed')).toBe(all);
  });

  it('план донорки читає лише бакет агенцій', () => {
    const [withViewer] = buildMatchingIndexFilterGroups({ filters: donorDefault, viewerRole: 'ed' });
    const [withoutViewer] = buildMatchingIndexFilterGroups({ filters: donorDefault });
    expect(withViewer.readBuckets).toEqual(['ag']);
    expect(withoutViewer.readBuckets).toEqual(expect.arrayContaining(['ed', 'sm', 'ag']));
  });
});
