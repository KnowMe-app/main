import fs from 'fs';
import path from 'path';

describe('ProfileCreationWorkspace existing-profile overlay flow', () => {
  const source = fs.readFileSync(path.join(__dirname, 'ProfileCreationWorkspace.jsx'), 'utf8');

  it('opens a blank ProfileForm instead of pulling the existing card into the draft', () => {
    expect(source).toContain("const nextDraft = { userId: profile.userId, myComment: '' }");
    expect(source).not.toContain('getCanonicalCard');
    expect(source).toContain('Додати власні дані');
  });

  it('stores entered values and the personal comment as an editor overlay', () => {
    expect(source).toContain('buildOverlayFromDraft(');
    expect(source).toContain('const touchedCanonical = Object.keys(nextDraft || {})');
    expect(source).toContain('saveOverlayForUserCard({');
    expect(source).toContain('editorUserId: uid');
    expect(source).toContain('cardUserId: overlayTarget.userId');
  });

  it('renders repeatable field rows with add and clear controls', () => {
    expect(source).toContain('appendDraftFieldItem');
    expect(source).toContain('clearDraftFieldItem');
    expect(source).toContain('Додати ще один рядок');
    expect(source).toContain('Очистити рядок');
  });

  it('merges a changed value with its already persisted history', () => {
    expect(source).toContain('const mergeFieldHistory =');
    expect(source).toContain('persistedDraftRef.current?.[fieldName]');
    expect(source).toContain('commitDraftFieldItems');
  });
});
