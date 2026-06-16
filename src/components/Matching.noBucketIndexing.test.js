const fs = require('fs');
const path = require('path');

const configSource = () => fs.readFileSync(path.join(__dirname, 'config.js'), 'utf8');
const matchingDataProviderSource = () => fs.readFileSync(path.join(__dirname, '../utils/matchingDataProvider.js'), 'utf8');

describe('Matching no-bucket index filtering', () => {
  it('keeps no-excluding broad searchKey groups in the indexed point-check path', () => {
    const source = configSource();
    const broadStart = source.indexOf('const isBroadSearchKeyPointGroup = group => {');
    const broadEnd = source.indexOf('const readSearchKeyPointMembershipBuckets', broadStart);
    const broadSource = source.slice(broadStart, broadEnd);

    expect(source).toContain('const bucketGroupExcludesNo = group => {');
    expect(source).toContain('const isNoExcludingSearchKeyPointGroup = group => Boolean(group?.supportsPointCheck && bucketGroupExcludesNo(group));');
    expect(broadSource).toContain('if (isNoExcludingSearchKeyPointGroup(group)) return false;');
    expect(source).toContain('noBucketExcluded: bucketGroupExcludesNo(group)');
  });

  it('builds role and marital status buckets by inverting disabled no buckets', () => {
    const source = matchingDataProviderSource();

    expect(source).toContain('const buildAllowedBucketsFromFilterGroup = (group, allBuckets = [], bucketMap = {}) => {');
    expect(source).toContain("const buckets = buildAllowedBucketsFromFilterGroup(roleFilters, ROLE_BUCKETS, { no: 'empty', '?': 'other' });");
    expect(source).toContain("const buildMaritalStatusBuckets = filters => buildAllowedBucketsFromFilterGroup(");
    expect(source).toContain("{ '+': 'married', '-': 'unmarried', '?': 'other', no: 'empty' }");
  });
});
