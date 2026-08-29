import fs from 'fs';
import path from 'path';

// Regression test for: deleting several fields in quick succession could
// resurrect an earlier-deleted field and ship it back to the backend.
// Root cause (two compounding bugs, fixed independently):
//  1) handleClear/handleDelKeyValue used to call handleSubmit (which does its
//     own setState + enqueues the network write) *from inside* the
//     setState(prev => ...) updater callback - nested/side-effecting setState
//     calls interleave unpredictably once several deletions queue up.
//  2) Even after moving handleSubmit outside the updater, capturing the
//     computed value via a `let captured...` variable assigned inside a
//     setState functional updater still isn't safe: React only runs that
//     updater synchronously (before setState() returns) via an internal
//     "eager state" optimization, and only when no other update is already
//     pending on the fiber - not guaranteed once handleSubmit's own setState
//     call schedules one immediately afterward. So the fix reads and writes a
//     plain ref (liveFieldsRef) with ordinary synchronous JS instead of
//     depending on setState's callback ever running before the next
//     statement.
describe('handleClear/handleDelKeyValue read/write liveFieldsRef synchronously instead of capturing via a setState updater', () => {
  const source = fs.readFileSync(path.join(__dirname, 'EditProfile.jsx'), 'utf8');

  const extractFnBody = (startMarker, endMarker) => {
    const start = source.indexOf(startMarker);
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf(endMarker, start);
    expect(end).toBeGreaterThan(start);
    return source.slice(start, end);
  };

  it('handleClear reads liveFieldsRef.current directly, writes it back, then calls handleSubmit', () => {
    const fnBody = extractFnBody(
      'const handleClear = (fieldName, idx) => {',
      'const handleDelKeyValue = fieldName => {'
    );

    expect(fnBody).not.toMatch(/setState\(\s*prev(State)?\s*=>/);
    expect(fnBody).toContain('const prev = liveFieldsRef.current;');
    expect(fnBody.indexOf('liveFieldsRef.current = capturedNewState;')).toBeLessThan(
      fnBody.indexOf('setState(capturedNewState);')
    );
    expect(fnBody).toContain(
      "handleSubmit(capturedNewState, 'overwrite', capturedDelCondition, 'handleClear')"
    );
  });

  it('handleDelKeyValue reads liveFieldsRef.current directly, writes it back, then calls handleSubmit', () => {
    const fnBody = extractFnBody(
      'const handleDelKeyValue = fieldName => {',
      'const persistCanonicalByRules = async mergedCard => {'
    );

    expect(fnBody).not.toMatch(/setState\(\s*prev(State)?\s*=>/);
    expect(fnBody).toContain('const prev = liveFieldsRef.current;');
    expect(fnBody.indexOf('liveFieldsRef.current = capturedNewState;')).toBeLessThan(
      fnBody.indexOf('setState(capturedNewState);')
    );
    expect(fnBody).toContain(
      "handleSubmit(capturedNewState, 'overwrite', { [fieldName]: capturedDeletedValue });"
    );
  });

  it('handleSubmit keeps liveFieldsRef in sync with its own optimistic setState(updatedState) call', () => {
    const fnBody = extractFnBody(
      'const handleSubmit = async (newState, overwrite, delCondition, submitSource) => {',
      'const handleFieldFocus = fieldName => {'
    );

    expect(fnBody.indexOf('liveFieldsRef.current = updatedState;')).toBeLessThan(
      fnBody.indexOf('setState(updatedState);')
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

  it('users-storage delete-only branch writes only nulls + lastAction, never touching makeUploadedInfo', () => {
    const longBranch = remoteUpdateBody.slice(
      remoteUpdateBody.indexOf("if (legacyCollection === 'users') {"),
      remoteUpdateBody.indexOf('} else if (updatedState?.userId) {')
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

  it('nodes-only delete-only branch also writes a minimal deletePayload', () => {
    const shortBranch = remoteUpdateBody.slice(remoteUpdateBody.indexOf('} else if (updatedState?.userId) {'));
    const deleteBranch = shortBranch.slice(
      shortBranch.indexOf('if (isDeleteOnlySubmit) {'),
      shortBranch.indexOf('} else {')
    );

    expect(deleteBranch).toContain("const deletePayload = { lastAction: updatedState.lastAction };");
    expect(deleteBranch).toContain(
      "await updateProfileNodesInRTDB(updatedState.userId, deletePayload, 'update', true);"
    );
  });
});
