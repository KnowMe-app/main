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

  // Той самий набір ролей у новому масиві — це не зміна ролі. Поки звірка йшла
  // по посиланню, друга відповідь про профіль доступу скидала кеш і вантажила
  // деку вдруге: читач бачив скелетон, картки, знову скелетон і знову картки.
  it('звіряє роль читача підписом, а не посиланням', () => {
    const roleEffect = source.slice(
      source.indexOf('const initialRoleLoadedRef'),
      source.indexOf('// Лічильник публічних карток')
    );
    expect(roleEffect).toContain('const nextRoleSignature = viewerRoleSignature(currentUserRole);');
    expect(roleEffect).toContain('if (previousRole === nextRoleSignature) return;');
    expect(roleEffect).not.toContain('initialRoleLoadedRef.current === currentUserRole');
  });

  it('does not replace a search when role resolution completes', () => {
    const roleEffect = source.slice(
      source.indexOf('const initialRoleLoadedRef'),
      source.indexOf('// Лічильник публічних карток')
    );
    expect(roleEffect).toContain("if (viewModeRef.current !== 'default') return;");
  });
});
