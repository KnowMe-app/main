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

// Regression test for: deleting field A, then immediately deleting field B,
// could end up with both deleted momentarily and then one of them reappearing
// on the backend (reported after the fix above, so a second, independent bug).
// Root cause: a pure-deletion submit still went through makeUploadedInfo's
// full-profile merge (existingData merged against a locally-captured
// snapshot). When several deletions fire in quick succession, a later call's
// merge could re-include a field an earlier, still-in-flight call had already
// deleted from the server, resurrecting it. Fix: a submit whose only purpose
// is deleting fields (delCondition present) now writes a minimal payload
// containing nothing but explicit nulls for the known-deleted keys — it can
// never resurrect anything because it never carries any other field's value.
describe("remoteUpdate sends a minimal null-only payload for pure field deletions, bypassing makeUploadedInfo's merge", () => {
  const source = fs.readFileSync(path.join(__dirname, 'EditProfile.jsx'), 'utf8');
  const remoteUpdateBody = source.slice(
    source.indexOf('async function remoteUpdate'),
    source.indexOf('const enqueueProfileSync')
  );

  it('derives deleteOnlyKeys from the accumulated deletedKeys, not just this call\'s own delCondition', () => {
    expect(remoteUpdateBody).toContain(
      "const deleteOnlyKeys = delCondition\n      ? (deletedKeys || []).filter(key => key && key !== 'userId')\n      : [];"
    );
    expect(remoteUpdateBody).toContain('const isDeleteOnlySubmit = deleteOnlyKeys.length > 0;');
  });

  it('long-userId delete-only branch writes only nulls + lastAction, never touching makeUploadedInfo', () => {
    const longBranch = remoteUpdateBody.slice(
      remoteUpdateBody.indexOf('if (updatedState?.userId?.length > 20) {'),
      remoteUpdateBody.indexOf("} else if (updatedState?.userId) {")
    );
    const deleteBranch = longBranch.slice(
      longBranch.indexOf('if (isDeleteOnlySubmit) {'),
      longBranch.indexOf('} else {')
    );

    expect(deleteBranch).toContain("const deletePayload = { lastAction: updatedState.lastAction };");
    expect(deleteBranch).toContain('deletePayload[key] = null;');
    expect(deleteBranch).not.toContain('makeUploadedInfo(');
    expect(deleteBranch).toContain('await updateDataInRealtimeDB(updatedState.userId, deletePayload, \'update\');');
  });

  it('short-userId delete-only branch also writes a minimal deletePayload', () => {
    const shortBranch = remoteUpdateBody.slice(remoteUpdateBody.indexOf('} else if (updatedState?.userId) {'));
    const deleteBranch = shortBranch.slice(
      shortBranch.indexOf('if (isDeleteOnlySubmit) {'),
      shortBranch.indexOf('} else {')
    );

    expect(deleteBranch).toContain("const deletePayload = { lastAction: updatedState.lastAction };");
    expect(deleteBranch).toContain(
      "await updateDataInNewUsersRTDB(updatedState.userId, deletePayload, 'update', true);"
    );
  });
});
