import { MATCHING_FILTER_GROUPS, buildMatchingFilterChipLabel, buildMatchingFilterChips } from './SearchFilters';

const groupByName = name => MATCHING_FILTER_GROUPS.find(group => group.filterName === name);

const allOn = group => group.options.reduce((acc, option) => ({ ...acc, [option.val]: true }), {});
const withOff = (group, offVals) => {
  const values = allOn(group);
  offVals.forEach(val => { values[val] = false; });
  return values;
};

describe('matching active-filter chips', () => {
  const age = groupByName('age');
  const role = groupByName('userRole');
  const country = groupByName('country');

  it('shows no chip while a group is untouched', () => {
    expect(buildMatchingFilterChipLabel(age, allOn(age))).toBeNull();
  });

  it('collapses "everything except one" into a single short chip', () => {
    expect(buildMatchingFilterChipLabel(age, withOff(age, ['le25'])))
      .toEqual({ text: 'Age: крім ≤25', danger: false });
  });

  it('still says "крім" for two dropped options', () => {
    expect(buildMatchingFilterChipLabel(age, withOff(age, ['le25', '26_30'])))
      .toEqual({ text: 'Age: крім ≤25, 26-30', danger: false });
  });

  it('lists what is left once more than two options are off', () => {
    expect(buildMatchingFilterChipLabel(age, withOff(age, ['le25', '26_30', '31_33', '34_36'])))
      .toEqual({ text: 'Age: 37+, ?', danger: false });
  });

  it('falls back to a count when neither side is short', () => {
    expect(buildMatchingFilterChipLabel(age, withOff(age, ['le25', '26_30', '31_33'])))
      .toEqual({ text: 'Age: 3 з 6', danger: false });
  });

  it('marks an emptied group as the error it is', () => {
    const values = age.options.reduce((acc, option) => ({ ...acc, [option.val]: false }), {});
    expect(buildMatchingFilterChipLabel(age, values)).toEqual({ text: 'Age: нічого', danger: true });
  });

  it('keeps the no-data option out of the "крім" count', () => {
    // "?" plus two real values off would read as three exclusions if "?" counted;
    // it does not, so this still collapses to a two-value "крім".
    expect(buildMatchingFilterChipLabel(age, withOff(age, ['le25', '26_30', 'other'])))
      .toEqual({ text: 'Age: крім ≤25, 26-30', danger: false });
  });

  it('reads dropping only the no-data option as "лише заповнені"', () => {
    expect(buildMatchingFilterChipLabel(age, withOff(age, ['other'])))
      .toEqual({ text: 'Age: лише заповнені', danger: false });
    expect(buildMatchingFilterChipLabel(country, withOff(country, ['unknown'])))
      .toEqual({ text: 'Країна: лише заповнені', danger: false });
  });

  it('builds one chip per group that is off default', () => {
    const chips = buildMatchingFilterChips({
      age: withOff(age, ['le25']),
      userRole: withOff(role, ['ag', 'ip', 'other']),
    });
    expect(chips).toEqual([
      // Two real values off (the "?" doesn't count), so the "крім" branch wins
      // over listing what is left - that is the spec's stated precedence.
      { filterName: 'userRole', groupLabel: 'Тип профілю', text: 'Тип профілю: крім Агентства, Батьки', danger: false },
      { filterName: 'age', groupLabel: 'Age', text: 'Age: крім ≤25', danger: false },
    ]);
  });

  it('ignores a group with no stored value', () => {
    expect(buildMatchingFilterChips({})).toEqual([]);
  });
});
