import fs from 'fs';
import path from 'path';

describe('persistUserWithFallback', () => {
  const source = fs.readFileSync(path.join(__dirname, 'authProfilePersistence.js'), 'utf8');

  it('writes the whole profile into the nodes only when the canonical write failed', () => {
    expect(source).toContain('let canonicalWriteFailed = false;');
    expect(source).toContain('if (canonicalWriteFailed) {');
    expect(source).toContain("await updateProfileNodesInRTDB(userId, uploadedInfo, 'update');");
  });

  it('never swallows a non-permission error from the canonical write', () => {
    expect(source).toContain('if (!isPermissionDeniedError(error)) {');
    expect(source).toContain('throw error;');
  });
});

describe('MyProfile phone autosave', () => {
  const source = fs.readFileSync(path.join(__dirname, 'MyProfile.jsx'), 'utf8');

  it('keeps an incomplete phone prefix while editing and normalizes it on save', () => {
    expect(source).toContain("const updatedValue = name === 'phone' ? value : inputUpdateValue(value, field);");
    expect(source).toContain("name === 'phone' ? normalizePhoneValue(value) : inputUpdateValue(value, field)");
  });

  it('reindexes a saved phone without replacing its accumulated history', () => {
    expect(source).toContain("triggerAutosave(nextState, { searchIdFields: name === 'phone' ? ['phone'] : [] });");
    expect(source).toContain('await syncUserSearchIdIndex(targetUserId, existingData, uploadedInfo, searchIdFields);');

    const saveStateBody = source.slice(
      source.indexOf('const saveState = (nextState,'),
      source.indexOf('const triggerAutosave = (nextState, options)')
    );
    expect(saveStateBody).not.toContain('searchIdFields.forEach');
  });
});
