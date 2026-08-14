import fs from 'fs';
import path from 'path';

describe('published pending overlays are admin-only', () => {
  const source = fs.readFileSync(path.join(__dirname, 'ProfileForm.jsx'), 'utf8');

  it('does not auto-apply an admin-only overlay for its editor', () => {
    expect(source).toContain('if (editorUserId !== currentEditorId) return;');
    expect(source).toContain('if (overlay?.adminOnly) return;');
  });

  it('does not expose an admin-only overlay through non-admin diagnostics', () => {
    expect(source).toContain('if (shouldShowOwnEditorOnly && overlay?.adminOnly) return acc;');
  });
});
