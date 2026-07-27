import fs from 'fs';
import path from 'path';

// MyProfile intentionally preserves history: a field that differs from the
// server copy accumulates into a [oldValue, newValue, ...] array instead of
// being replaced (MyProfile's own UI only ever displays the last element -
// see normalizeProfileData - so this is invisible to the user). A previous
// change mistakenly added 'overwrite' here, copying a fix that was correct
// for the *admin* ProfileForm but wrong for MyProfile, which broke this
// on-purpose accumulation - reverted.
//
// The field being actively submitted in a given saveState call is still
// forced through as a plain scalar via directFields, so a normal single-
// field edit or clear doesn't itself produce an array; only fields that
// differ *without* being the one just submitted (e.g. from an earlier,
// not-yet-confirmed edit) accumulate.
describe('MyProfile saveState preserves field history instead of overwriting, and never hangs silently', () => {
  const source = fs.readFileSync(path.join(__dirname, 'MyProfile.jsx'), 'utf8');

  const saveStateBody = source.slice(
    source.indexOf('const saveState = (nextState'),
    source.indexOf('const triggerAutosave = (nextState, options)')
  );

  it("does not pass 'overwrite' to makeUploadedInfo, so a changed field accumulates into an array instead of replacing it", () => {
    expect(saveStateBody).toContain('makeUploadedInfo(existingData, normalizedProfileData)');
    expect(saveStateBody).not.toContain("makeUploadedInfo(existingData, normalizedProfileData, 'overwrite')");
  });

  it('still forces the actively-submitted field(s) through as a plain scalar via directFields', () => {
    expect(saveStateBody).toContain('directFields.forEach(field => {');
    expect(saveStateBody).toContain('uploadedInfo[field] = normalizedProfileData[field];');
  });

  it('serializes saves through the shared, timeout-guarded enqueueUserWrite instead of an unbounded ad-hoc queue', () => {
    expect(source).toContain("import { enqueueUserWrite } from 'utils/userWriteQueue';");
    expect(saveStateBody).toContain('return enqueueUserWrite(`myProfileSave:${targetUserId}`, async () => {');
    expect(source).not.toContain('saveQueueRef');
  });

  it('triggerAutosave surfaces both success and failure via toast, instead of only a console.warn on failure', () => {
    const triggerAutosaveBody = source.slice(
      source.indexOf('const triggerAutosave = (nextState, options)'),
      source.indexOf('const getSectionKeyByField')
    );
    expect(triggerAutosaveBody).toContain("toast.success('Збережено', { id: 'my-profile-save-success', duration: 1500 });");
    expect(triggerAutosaveBody).toContain('console.warn(');
    expect(triggerAutosaveBody).toContain('toast.error(');
  });
});
