import fs from 'fs';
import path from 'path';

// A card can have pending overlays from several editors at once. Every editor
// must see them stacked (the last save wins), while the per-editor breakdown
// and the journal of superseded edits stay admin-only.
describe('EditProfile shows non-admin editors the stacked card', () => {
  const source = fs.readFileSync(path.join(__dirname, 'EditProfile.jsx'), 'utf8');

  it('no longer narrows a non-admin to their own overlay', () => {
    expect(source).toContain('if (isAdmin || currentUid) {\n        overlays = await getOverlaysForCard(userId);');
    expect(source).not.toContain('overlays = ownOverlay ? { [currentUid]: ownOverlay } : {};');
  });

  it('renders canonical for an admin and the stacked card for everybody else', () => {
    expect(source).toContain('const cardForEditor = isAdmin');
    expect(source).toContain(': applyOverlaysToCard(canonical, overlays);');
  });

  it('diffs a non-admin save against the card without their own overlay', () => {
    expect(source).toContain('excludeEditorUserId: editorUserId,');
    expect(source).toContain('const overlayFields = buildOverlayFromDraft(baseForOwnOverlay, updatedState);');
  });

  it('keeps the per-editor breakdown out of a non-admin session', () => {
    expect(source).toContain('if (!isAdmin) {\n      setPendingOverlays({});');
  });
});
