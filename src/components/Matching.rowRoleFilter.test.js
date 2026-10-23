import fs from 'fs';
import path from 'path';
import { isRoleCategoryAllowed, roleFilterCategoryOf, toRoleCategories } from '../utils/matchingDataProvider';
import { cardHasAnketaForRoleFilter } from '../utils/cardAnketas';

const source = () => fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');
const allows = roleFilter => role => isRoleCategoryAllowed(roleFilter, roleFilterCategoryOf(role));

// «Тип профілю» обирає анкету, а не людину. СМ під «Тип профілю: Агенція»
// бачила донорські анкети донорок-агенток, а донорка — анкету батьків у
// картки «батьки + донорка».
describe('фільтр «Тип профілю» в рядках стрічки', () => {
  // Донорці приховану від неї опцію «Донор ооцитів» стан фільтра тримає
  // ввімкненою — саме через неї картка «батьки + донорка» й проходила.
  const donorOnlyAgencies = { ed: true, sm: false, ag: true, ip: false, other: false };

  it('одна роль анкети йде під ту саму опцію, що й картка цілком', () => {
    ['ed', 'sm', 'ag', 'ip'].forEach(role => {
      expect(roleFilterCategoryOf(role)).toBe(role);
      expect(toRoleCategories({ role })).toEqual([role]);
    });
    ['cl', 'pp', '', undefined].forEach(role => expect(roleFilterCategoryOf(role)).toBe('other'));
  });

  it('лишає в рядку лише анкети дозволених типів', () => {
    const onlyAgencies = { ed: false, sm: false, ag: true, ip: false, other: false };
    expect(['ed', 'ag'].filter(allows(onlyAgencies))).toEqual(['ag']);
    expect(['ip'].filter(allows(onlyAgencies))).toEqual([]);
  });

  it('картку питає за ролями, видимими читачеві', () => {
    const parentsAndDonor = { role: ['ip', 'ed'] };
    expect(cardHasAnketaForRoleFilter(parentsAndDonor, allows(donorOnlyAgencies), ['ed', 'sm'])).toBe(false);
    // Без прихованих ролей донорська анкета видима — і дозволена.
    expect(cardHasAnketaForRoleFilter(parentsAndDonor, allows(donorOnlyAgencies), [])).toBe(true);
    expect(cardHasAnketaForRoleFilter({ role: ['ed', 'ag'] }, allows(donorOnlyAgencies), ['ed', 'sm'])).toBe(true);
    // Картку без жодної видимої ролі вирішує фільтр картки, а не рядок.
    expect(cardHasAnketaForRoleFilter({ role: 'ed' }, allows(donorOnlyAgencies), ['ed'])).toBe(true);
    expect(cardHasAnketaForRoleFilter({}, allows(donorOnlyAgencies), ['ed'])).toBe(true);
  });

  it('звужує лише стрічку, а «Показати N» рахує ті самі рядки', () => {
    const matching = source();
    expect(matching).toContain(
      "const feedRoleFilter = viewMode === 'default' && !isSearching && hasActiveSearchKeyFilterGroup(filters?.userRole)",
    );
    expect(matching).toContain('listed.filter(role => allowsAnketaRole(feedRoleFilter, role))');
    expect(matching).toContain('cardHasAnketaForRoleFilter(projection, role => allowsAnketaRole(feedRoleFilter, role), feedRowHiddenRoles)');
    expect(matching).toContain('cardHasAnketaForRoleFilter(user, role => allowsAnketaRole(roleFilter, role), hiddenRoles)');
  });
});
