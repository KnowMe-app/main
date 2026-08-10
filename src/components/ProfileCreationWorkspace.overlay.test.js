import fs from 'fs';
import path from 'path';

describe('ProfileCreationWorkspace existing-profile overlay flow', () => {
  const source = fs.readFileSync(path.join(__dirname, 'ProfileCreationWorkspace.jsx'), 'utf8');

  it('opens a blank ProfileForm instead of pulling the existing card into the draft', () => {
    expect(source).toContain("setDraft({ userId: profile.userId, myComment: '' })");
    expect(source).not.toContain('getCanonicalCard');
    expect(source).toContain('Додати власні дані');
  });

  it('stores entered values and the personal comment as an editor overlay', () => {
    expect(source).toContain('buildOverlayFromDraft(');
    expect(source).toContain('{ userId: overlayTarget.userId }');
    expect(source).toContain('saveOverlayForUserCard({');
    expect(source).toContain('editorUserId: uid');
    expect(source).toContain('cardUserId: overlayTarget.userId');
  });
});
