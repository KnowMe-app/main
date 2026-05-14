import fs from 'fs';
import path from 'path';
import { getProfileName } from './profileLayoutConfig';

describe('Matching redesigned profile regressions', () => {
  const source = () => fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');

  it('renders contacts through actionable links instead of generic profile chips', () => {
    const matchingSource = source();

    expect(matchingSource).toContain('const ProfileContactLinks = ({ user, role }) =>');
    expect(matchingSource).toContain("section.variant === 'contacts'");
    expect(matchingSource).toContain('<ProfileContactLinks user={user} role={resolvedRole} />');
    expect(matchingSource).toContain('<ModernContactSummary>Show contacts</ModernContactSummary>');
    expect(matchingSource).toContain('href={entry.href}');
    expect(matchingSource).toContain('CONTACT_LINK_BUILDERS.telegramFromPhone');
    expect(matchingSource).toContain('CONTACT_LINK_BUILDERS.viberFromPhone');
    expect(matchingSource).toContain('CONTACT_LINK_BUILDERS.whatsappFromPhone');
  });


  it('builds matching profile names only from approved identity fields', () => {
    const matchingSource = source();
    const layoutSource = fs.readFileSync(path.join(__dirname, 'profileLayoutConfig.js'), 'utf8');

    expect(getProfileName({ name: 'Anna', surname: 'Smith', nameWife: 'Olena', nameHusband: 'Petro' })).toBe('Anna Smith Olena Petro');
    expect(getProfileName({ email: 'person@example.com', agencyName: 'Agency LLC', companyName: 'Company LLC', agency: 'Hidden Agency' })).toBe('person');
    expect(getProfileName({ agencyName: 'Agency LLC', companyName: 'Company LLC', agency: 'Hidden Agency' })).toBe('');
    expect(layoutSource).toContain('const name = [user?.name, user?.surname, user?.nameWife, user?.nameHusband]');
    expect(layoutSource).toContain('return name || getEmailName(user);');
    expect(layoutSource).not.toContain('agencyName || name');
    expect(layoutSource).not.toContain('companyName');
    expect(matchingSource).toContain("const isGenericProfileRole = roleLabel === 'Profile';");
    expect(matchingSource).toContain('const shouldShowRoleBadge = !isGenericProfileRole;');
    expect(matchingSource).toContain("const name = profileName || '';");
    expect(matchingSource).toContain('{title && <ModernHeroTitle>{title}</ModernHeroTitle>}');
    expect(matchingSource).toContain('{shouldShowRoleBadge && <ModernRoleBadge $role={resolvedRole}>{roleLabel}</ModernRoleBadge>}');
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
