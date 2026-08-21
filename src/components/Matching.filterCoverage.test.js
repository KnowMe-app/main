jest.mock('firebase/database', () => ({ get: jest.fn(), ref: jest.fn() }));
jest.mock('components/config', () => ({
  database: { app: 'test-db' },
  collectAgeIdsByFilters: jest.fn(),
}));

const { MATCHING_FILTER_GROUPS } = require('./SearchFilters');
const { getDefaultFilters } = require('./FilterPanel');
const { buildMatchingIndexFilterGroups } = require('../utils/matchingDataProvider');

// Every group the Matching drawer renders has to reach the index. A group that does
// not is applied only after cards are hydrated, which means a page comes back short
// and the reader scrolls through gaps - the failure that hid BMI and country for as
// long as they had no index of their own.
describe('every Matching filter reaches the index', () => {
  const defaults = getDefaultFilters({ mode: 'matching' });

  const allOn = group => Object.fromEntries(group.options.map(option => [option.val, true]));

  it.each(MATCHING_FILTER_GROUPS.map(group => [group.filterName, group]))(
    '%s produces an index group once an option is switched off',
    (filterName, group) => {
      const [firstOption] = group.options;
      const filters = { [filterName]: { ...allOn(group), [firstOption.val]: false } };

      const indexGroups = buildMatchingIndexFilterGroups({ filters, collectionSource: 'users' });
      expect(indexGroups.length).toBeGreaterThan(0);
    },
  );

  it('renders no group the drawer has no defaults for', () => {
    // CheckboxGroup reads filters[filterName][option] directly, so a group missing
    // from the defaults is a crash, not a cosmetic gap.
    MATCHING_FILTER_GROUPS.forEach(group => {
      expect({ group: group.filterName, defaults: Object.keys(defaults[group.filterName] || {}).sort() })
        .toEqual({ group: group.filterName, defaults: group.options.map(option => option.val).sort() });
    });
  });

  it('restricts nothing while a group is untouched', () => {
    // userRole is the one group that ships narrowed - the deck opens on donors - so
    // it is expected to produce an index group from the defaults alone.
    const untouched = MATCHING_FILTER_GROUPS
      .filter(group => group.filterName !== 'userRole')
      .reduce((acc, group) => ({ ...acc, [group.filterName]: allOn(group) }), {});

    expect(buildMatchingIndexFilterGroups({ filters: untouched, collectionSource: 'users' })).toEqual([]);
    expect(Object.values(defaults.userRole).some(Boolean)).toBe(true);
  });

  it('keeps the near-empty cards while the fill-level group is untouched', () => {
    const group = MATCHING_FILTER_GROUPS.find(entry => entry.filterName === 'fields');
    expect(group.options.map(option => option.val)).toContain('le5');
    expect(Object.values(defaults.fields).every(Boolean)).toBe(true);
  });
});
