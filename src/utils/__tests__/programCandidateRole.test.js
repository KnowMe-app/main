import { applyMatchingSearchKeyFilters, buildMatchingIndexFilterGroups, narrowRoleToProgramType } from 'utils/matchingDataProvider';

const program = { id: 'p1', type: 'sm', label: 'СМ', requirements: { bmiMax: 28, rh: '+', marital: 'unmarried' } };
// Збережений «Тип профілю» адміна без СМ (наживо 16.11).
const savedRoles = { ed: true, sm: false, ag: false, ip: false, other: false };

describe('«Кандидатки під програму» задають роль', () => {
  it('програма звужує «Тип профілю» до свого типу', () => {
    expect(narrowRoleToProgramType({ userRole: savedRoles, program }).userRole)
      .toEqual({ ed: false, sm: true, ag: false, ip: false, other: false });
    expect(narrowRoleToProgramType({ userRole: savedRoles }).userRole).toBe(savedRoles);
  });

  it('пост-фільтр лишає кандидатку СМ попри збережений «Тип профілю» без СМ', () => {
    const fits = { userId: 'a', role: 'sm', maritalStatus: 'No', rh: '+', height: '160', weight: '70' };
    const married = { userId: 'b', role: 'sm', maritalStatus: 'Yes', rh: '+', height: '160', weight: '70' };
    const donor = { userId: 'c', role: 'ed', maritalStatus: 'No', rh: '+', height: '160', weight: '50' };
    const kept = applyMatchingSearchKeyFilters([fits, married, donor], { userRole: savedRoles, program });
    expect(kept.map(card => card.userId)).toEqual(['a']);
  });

  it('план індексу бере роль програми, а не дочитує всю стрічку', () => {
    const groups = buildMatchingIndexFilterGroups({ filters: { userRole: savedRoles, program } });
    const role = groups.find(group => group.indexName === 'role');
    expect(role?.values).toEqual(['sm']);
  });
});
