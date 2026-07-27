import fs from 'fs';
import path from 'path';

// Regression test for: deleting several fields in quick succession could
// resurrect an earlier-deleted field and ship it back to the backend.
// Root cause: handleClear/handleDelKeyValue called handleSubmit (which does
// its own setState + enqueues the network write) *from inside* the
// setState(prev => ...) updater callback. Nested/side-effecting setState
// calls interleave unpredictably once several deletions queue up before any
// of them commit, so a stale newState snapshot could win and get re-synced.
describe('handleClear/handleDelKeyValue no longer call handleSubmit inside a setState updater', () => {
  const source = fs.readFileSync(path.join(__dirname, 'EditProfile.jsx'), 'utf8');

  const extractUpdaterBody = (fnBody, updaterStartMarker) => {
    const start = fnBody.indexOf(updaterStartMarker);
    expect(start).toBeGreaterThan(-1);
    const closeMarker = '\n      return newState;\n    });';
    const end = fnBody.indexOf(closeMarker, start);
    expect(end).toBeGreaterThan(start);
    return {
      updaterBody: fnBody.slice(start, end),
      afterUpdater: fnBody.slice(end + closeMarker.length),
    };
  };

  it('handleClear computes newState via a pure functional setState updater, then calls handleSubmit afterwards', () => {
    const fnBody = source.slice(
      source.indexOf('const handleClear = (fieldName, idx) => {'),
      source.indexOf('const handleDelKeyValue = fieldName => {')
    );
    const { updaterBody, afterUpdater } = extractUpdaterBody(fnBody, 'setState(prev => {');

    expect(updaterBody).not.toContain('handleSubmit(');
    expect(afterUpdater).toContain(
      "handleSubmit(capturedNewState, 'overwrite', capturedDelCondition, 'handleClear')"
    );
  });

  it('handleDelKeyValue computes newState via a pure functional setState updater, then calls handleSubmit afterwards', () => {
    const fnBody = source.slice(
      source.indexOf('const handleDelKeyValue = fieldName => {'),
      source.indexOf('const persistCanonicalByRules = async mergedCard => {')
    );
    const updaterStart = fnBody.indexOf('setState(prev => {');
    expect(updaterStart).toBeGreaterThan(-1);
    const closeMarker = '\n      return newState;\n    });';
    const updaterEnd = fnBody.indexOf(closeMarker, updaterStart);
    expect(updaterEnd).toBeGreaterThan(updaterStart);

    const updaterBody = fnBody.slice(updaterStart, updaterEnd);
    const afterUpdater = fnBody.slice(updaterEnd + closeMarker.length);

    expect(updaterBody).not.toContain('handleSubmit(');
    expect(afterUpdater).toContain(
      "handleSubmit(capturedNewState, 'overwrite', { [fieldName]: capturedDeletedValue })"
    );
  });
});
