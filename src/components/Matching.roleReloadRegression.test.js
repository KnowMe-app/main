import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');

describe('Matching role reload regressions', () => {
  it('resolves the role before ancillary search-key discovery', () => {
    expect(source.indexOf('setCurrentUserRoleResolved(true);')).toBeLessThan(
      source.indexOf('await resolveAdditionalSearchKeySetKeysForMatching(profile, user.uid)')
    );
  });

  it('invalidates an active initial request before queuing its replacement', () => {
    const overlapBranch = source.slice(
      source.indexOf('if (initialLoadInFlightRef.current) {', source.indexOf('const reloadDefault =')),
      source.indexOf('loadInitial();', source.indexOf('const reloadDefault ='))
    );
    expect(overlapBranch).toContain('loadInitialVersionRef.current += 1;');
    expect(overlapBranch).toContain('initialRequestIdRef.current += 1;');
  });

  it('does not replace a search when role resolution completes', () => {
    const roleEffect = source.slice(
      source.indexOf('const initialRoleLoadedRef'),
      source.indexOf('// Лічильник публічних карток')
    );
    expect(roleEffect).toContain("if (viewModeRef.current !== 'default') return;");
  });
});
