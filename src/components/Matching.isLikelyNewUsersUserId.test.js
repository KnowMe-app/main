const fs = require('fs');
const path = require('path');

const matchingSource = () => fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');

const isLikelyNewUsersUserIdSource = () => {
  const source = matchingSource();
  const start = source.indexOf('const isLikelyNewUsersUserId = id =>');
  const end = source.indexOf('const getPreferredReactionSources = id =>', start);
  return source.slice(start, end);
};

describe('Matching isLikelyNewUsersUserId', () => {
  it('short-circuits to false for definitively long-format userIds before the prefix heuristic', () => {
    const source = isLikelyNewUsersUserIdSource();

    expect(source).toContain('if (isLongFormatUserId(value)) return false;');
    const guardIndex = source.indexOf('if (isLongFormatUserId(value)) return false;');
    const heuristicIndex = source.indexOf('NEW_USERS_USER_ID_PREFIXES.some(');
    expect(guardIndex).toBeGreaterThanOrEqual(0);
    expect(heuristicIndex).toBeGreaterThan(guardIndex);
  });

  it('imports isLongFormatUserId from the shared merge-collections util', () => {
    expect(matchingSource()).toContain("import { isLongFormatUserId } from 'utils/mergeUserCollections';");
  });

  it('keeps the short-id/prefix heuristic for everything else (unchanged)', () => {
    const source = isLikelyNewUsersUserIdSource();
    expect(source).toContain('isShortId(value) ||');
    expect(source).toContain('NEW_USERS_USER_ID_PREFIXES.some(prefix => value.startsWith(prefix))');
  });
});
