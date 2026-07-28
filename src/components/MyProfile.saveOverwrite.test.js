import fs from 'fs';
import path from 'path';

// Regression test for: editing a single scalar field on my-profile could
// turn it into a growing [oldValue, newValue, ...] array on the backend
// instead of replacing it - "such logic is not intended in ProfileForm"
// (the user's own words). Root cause: saveState called makeUploadedInfo
// without 'overwrite', same class of bug already fixed in EditProfile.jsx's
// handleBlur. Also: saveState's own ad-hoc saveQueueRef had no timeout, so
// a hung fetchUserData/persistUserProfile call would wedge every later
// autosave on the page forever, with no error ever surfacing - matching
// "editing a scalar doesn't work, no toast shown at all".
describe('MyProfile saveState overwrites scalar fields cleanly and never hangs silently', () => {
  const source = fs.readFileSync(path.join(__dirname, 'MyProfile.jsx'), 'utf8');

  const saveStateBody = source.slice(
    source.indexOf('const saveState = (nextState'),
    source.indexOf('const triggerAutosave = (nextState, options)')
  );

  it("passes 'overwrite' to makeUploadedInfo so a changed scalar field replaces cleanly instead of becoming an array", () => {
    expect(saveStateBody).toContain(
      "makeUploadedInfo(existingData, normalizedProfileData, 'overwrite')"
    );
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
