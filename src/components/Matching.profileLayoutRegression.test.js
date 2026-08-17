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

  it('hides VK contacts from matching cards for every viewer, including admins', () => {
    const matchingSource = source();

    expect(matchingSource).toContain("const MATCHING_HIDDEN_CONTACT_KEYS = ['vk'];");
    expect(matchingSource).toContain('getContactEntries(user).filter(entry => !MATCHING_HIDDEN_CONTACT_KEYS.includes(entry.key))');
    expect(matchingSource).toContain('...MATCHING_HIDDEN_CONTACT_KEYS');
  });

  it('builds matching profile names only from approved identity fields', () => {
    const matchingSource = source();
    const layoutSource = fs.readFileSync(path.join(__dirname, 'profileLayoutConfig.js'), 'utf8');

    expect(getProfileName({ name: 'Anna', surname: 'Smith', nameWife: 'Olena', nameHusband: 'Petro' })).toBe('Anna Smith Olena Petro');
    expect(getProfileName({ name: 'Anna', surname: 'Smith', nameWife: 'Anna', nameHusband: 'Petro' })).toBe('Anna Smith Petro');
    expect(getProfileName({ name: 'Anna Smith', surname: '', nameWife: 'Anna Smith', nameHusband: 'Petro' })).toBe('Anna Smith Petro');
    expect(getProfileName({ name: ['Rajpootgkhan', 'Muhammad'], surname: ['Shafique', 'Hafeez'], nameHusband: 'Muhammad Hafeez' })).toBe('Muhammad Hafeez');
    expect(getProfileName({ email: 'person@example.com', agencyName: 'Agency LLC', companyName: 'Company LLC', agency: 'Hidden Agency' })).toBe('person');
    expect(getProfileName({ agencyName: 'Agency LLC', companyName: 'Company LLC', agency: 'Hidden Agency' })).toBe('');
    expect(layoutSource).toContain('const getPrimaryNamePart = user => [user?.name, user?.surname]');
    expect(layoutSource).toContain('const getUniqueNameParts = user =>');
    expect(layoutSource).toContain('return name || getEmailName(user);');
    expect(layoutSource).not.toContain('agencyName || name');
    expect(layoutSource).not.toContain('companyName');
    expect(matchingSource).toContain("const isGenericProfileRole = roleLabel === 'Profile';");
    expect(matchingSource).toContain('const shouldShowRoleBadge = !isGenericProfileRole;');
    expect(matchingSource).toContain("const name = profileName || '';");
    expect(matchingSource).toContain('{title && <ModernHeroTitle>{title}</ModernHeroTitle>}');
    expect(matchingSource).toContain('{shouldShowRoleBadge && <ModernRoleBadge $role={resolvedRole}>{roleLabel}</ModernRoleBadge>}');
  });

  it('renders editor-created Firebase list values without breaking matching', () => {
    // The creation questionnaire stores every editable row as a list. Firebase
    // therefore shows even a single name/surname under child key `0`; matching
    // must treat the last meaningful row as the current approved value.
    expect(getProfileName({
      name: ['Ім’я'],
      surname: ['Прізвище'],
      phone: ['380505990665'],
      userId: '-P-0bnlEAZeWloBJKG2-',
    })).toBe('Ім’я Прізвище');

    expect(getProfileName({
      name: ['', 'Актуальне ім’я'],
      surname: [null, 'Актуальне прізвище'],
    })).toBe('Актуальне ім’я Актуальне прізвище');

    expect(getProfileName({
      name: ['Актуальне ім’я', ''],
      surname: ['Актуальне прізвище', null, '   '],
    })).toBe('Актуальне ім’я Актуальне прізвище');
  });

  it('warns when matching data is still unavailable after five seconds', () => {
    const matchingSource = source();

    expect(matchingSource).toContain("id: 'matching-slow-load'");
    expect(matchingSource).toContain('не вдалося отримати дані протягом 5 секунд');
    expect(matchingSource).toContain('Перевірте мережу, Firebase rules та індекси');
    expect(matchingSource).toContain('}, 5000);');
    expect(matchingSource).toContain('if (!loading || users.length > 0)');
    expect(matchingSource).toContain("toast.dismiss?.('matching-slow-load');");
    expect(matchingSource).toContain('clearTimeout(slowLoadTimer);');
  });

  it('keeps reacted personal creation drafts available to reaction tabs', () => {
    const matchingSource = source();

    expect(matchingSource).toContain('...personalCreateProfiles,');
    expect(matchingSource).toContain('__profileMutationOperation: \'create\'');
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
