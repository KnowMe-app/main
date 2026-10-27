import {
  alignPersonalFilterGroupsWithRoles,
  roleSelectionAllowsPersonalAnketas,
} from '../matchingPersonalFilters';
import { listFeedRoleFilterKeysForViewer, listViewerHiddenCardRoles } from '../matchingPeerVisibility';
import { applyMatchingSearchKeyFilters, buildMatchingIndexFilterGroups } from '../matchingDataProvider';
import { buildMatchingFilterRailChips } from '../../components/SearchFilters';

const ALL_ROLES = { ed: true, sm: true, ag: true, ip: true, other: true };
const railGroups = (filters, viewerRole) => buildMatchingFilterRailChips(filters, 'uk', {
  roleOptionKeys: listFeedRoleFilterKeysForViewer(viewerRole),
}).map(chip => chip.filterName).sort();

describe('фільтри стрічки за роллю читача', () => {
  it('донорка й СМ не бачать ні донорок, ні СМ', () => {
    expect(listViewerHiddenCardRoles('ed')).toEqual(['ed', 'sm']);
    expect(listViewerHiddenCardRoles('sm')).toEqual(['ed', 'sm']);
    expect(listFeedRoleFilterKeysForViewer('ed')).toEqual(['ag', 'ip', 'other']);
    expect(listFeedRoleFilterKeysForViewer('sm')).toEqual(['ag', 'ip', 'other']);
    // Роль організації знімає звуження цілком.
    expect(listViewerHiddenCardRoles(['ed', 'ag'])).toEqual([]);
  });

  it('донорці лишає самі «Тип профілю» й «Країну»', () => {
    expect(railGroups({ userRole: ALL_ROLES }, 'ed')).toEqual(['country', 'userRole']);
  });

  it('агенції, що обрала агенції й батьків, ховає групи про людину', () => {
    const roles = { ed: false, sm: false, ag: true, ip: true, other: false };
    expect(railGroups({ userRole: roles }, 'ag')).toEqual(['country', 'userRole']);
    expect(railGroups({ userRole: { ...roles, ed: true } }, 'ag')).toContain('maritalStatus');
  });

  it('звуження прихованих груп знімається зі стану', () => {
    const filters = {
      userRole: { ed: false, sm: false, ag: true, ip: true, other: true },
      maritalStatus: { married: false, unmarried: true, other: true },
      country: { ua: true, other: false, unknown: true },
    };
    const aligned = alignPersonalFilterGroupsWithRoles(filters, listFeedRoleFilterKeysForViewer('ag'));
    expect(aligned.maritalStatus).toEqual({ married: true, unmarried: true, other: true });
    expect(aligned.country).toBe(filters.country);
    const withDonors = { ...filters, userRole: { ...filters.userRole, ed: true } };
    expect(alignPersonalFilterGroupsWithRoles(withDonors, listFeedRoleFilterKeysForViewer('ag'))).toBe(withDonors);
    expect(roleSelectionAllowsPersonalAnketas(withDonors.userRole, listFeedRoleFilterKeysForViewer('ed'))).toBe(false);
  });

  it('фільтр про людину не викидає агенцію з деки, а індекс його тоді не бере', () => {
    const users = [
      { userId: 'donor-married', role: 'ed', maritalStatus: 'married' },
      { userId: 'donor-single', role: 'ed', maritalStatus: 'single' },
      { userId: 'agency', role: 'ag' },
    ];
    const filters = {
      userRole: { ed: true, sm: true, ag: true, ip: false, other: true },
      maritalStatus: { married: false, unmarried: true, other: false },
    };
    expect(applyMatchingSearchKeyFilters(users, filters).map(user => user.userId)).toEqual(['donor-single', 'agency']);
    expect(buildMatchingIndexFilterGroups({ filters }).map(group => group.indexName))
      .toEqual(['role']);
  });
});
