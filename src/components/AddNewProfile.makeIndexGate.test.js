import fs from 'fs';
import path from 'path';

// Regression test for: editing a plain scalar field (name/surname/city/...)
// in the profile form and blurring it never wrote the change to Firebase,
// with no error or toast - but editing any array-type field worked fine and
// also flushed previously "lost" scalar edits.
//
// Root cause: ProfileForm.jsx's submitWithNormalization (the function every
// scalar field's onBlur calls directly) always calls
// `handleSubmit(payload, overwrite, delCondition, 'submitWithNormalization')`
// - that 4th argument is a debug/source label, meaningless to
// EditProfile.jsx's handleSubmit. But AddNewProfile.jsx's handleSubmit used
// that same positional slot as `makeIndex`, a write-skip gate
// (`if (!makeIndex) { ...write to Firebase... }`). Since a non-empty string
// is truthy, every submit routed through submitWithNormalization silently
// skipped the write. Array-field edits go through the separate `handleBlur`
// prop instead, which called `handleSubmit(normalizedState)` with a single
// argument - `makeIndex` was `undefined` there, so the write proceeded,
// carrying along any previously-dropped scalar edits (since it submits the
// whole current draft).
describe('AddNewProfile.jsx no longer has a hidden write-skip gate on handleSubmit', () => {
  const source = fs.readFileSync(path.join(__dirname, 'AddNewProfile.jsx'), 'utf8');

  it('handleSubmit no longer accepts a 4th "makeIndex" parameter', () => {
    expect(source).not.toContain('makeIndex');
    expect(source).toContain('const handleSubmit = (newState, overwrite, delCondition) => {');
  });

  it('the long-userId branch writes to Firebase unconditionally (no truthy-string-skips-write gate)', () => {
    // The actual network write moved from handleSubmit into remoteUpdate
    // (see AddNewProfile.deletionRace.test.js for that refactor), so this
    // now checks remoteUpdate's non-delete-only long-userId sub-branch.
    const remoteUpdateBody = source.slice(
      source.indexOf('async function remoteUpdate('),
      source.indexOf('const enqueueProfileSync = params => {')
    );
    const longUserIdBranchStart = remoteUpdateBody.indexOf('syncedState?.userId?.length > 20');
    const longUserIdBranch = remoteUpdateBody.slice(
      longUserIdBranchStart,
      remoteUpdateBody.indexOf('} else {\n      if (isDeleteOnlySubmit) {', longUserIdBranchStart)
    );

    expect(longUserIdBranch).toContain('updateDataInRealtimeDB(syncedState.userId, uploadedInfo, \'update\')');
    expect(longUserIdBranch).toContain('updateDataInFiresoreDB(syncedState.userId, uploadedInfo, \'check\', delCondition)');
    expect(longUserIdBranch).not.toMatch(/if\s*\(!\w+\)\s*\{[\s\S]*updateDataInRealtimeDB/);
  });

  it('handleBlur passes overwrite so a changed scalar field replaces cleanly instead of becoming an array', () => {
    const handleBlurBody = source.slice(
      source.indexOf('const handleBlur = () => {'),
      source.indexOf('const hideFutureGitNewCardAndLoadNext')
    );

    expect(handleBlurBody).toContain("handleSubmit(normalizedState, 'overwrite');");
  });
});
