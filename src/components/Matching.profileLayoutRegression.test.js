import fs from 'fs';
import path from 'path';

describe('Matching redesigned profile regressions', () => {
  const source = () => fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');

  it('renders contacts through actionable links instead of generic profile chips', () => {
    const matchingSource = source();

    expect(matchingSource).toContain('const ProfileContactLinks = ({ user, role }) =>');
    expect(matchingSource).toContain("section.variant === 'contacts'");
    expect(matchingSource).toContain('<ProfileContactLinks user={user} role={resolvedRole} />');
    expect(matchingSource).toContain('href={entry.href}');
    expect(matchingSource).toContain('CONTACT_LINK_BUILDERS.telegramFromPhone');
    expect(matchingSource).toContain('CONTACT_LINK_BUILDERS.viberFromPhone');
    expect(matchingSource).toContain('CONTACT_LINK_BUILDERS.whatsappFromPhone');
  });

  it('supports desktop next/previous navigation without reaction side effects', () => {
    const matchingSource = source();

    expect(matchingSource).toContain("event.key === 'ArrowRight'");
    expect(matchingSource).toContain('navigateActiveProfile(1);');
    expect(matchingSource).toContain("event.key === 'ArrowLeft'");
    expect(matchingSource).toContain('navigateActiveProfile(-1);');
    expect(matchingSource).toContain('aria-label="Previous profile"');
    expect(matchingSource).toContain('aria-label="Next profile"');
    expect(matchingSource).toContain('onNavigate(direction === \'left\' ? 1 : -1);');
    expect(matchingSource).not.toContain('swipedRef.current = true;\n    setDir(direction);\n    handleRemove');
  });
});
