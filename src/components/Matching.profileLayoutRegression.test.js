import fs from 'fs';
import path from 'path';
import { getProfileName } from './profileLayoutConfig';

describe('Matching redesigned profile regressions', () => {
  const source = () => fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');

  it('renders contacts through actionable links instead of generic profile chips', () => {
    const matchingSource = source();

    expect(matchingSource).toContain('const ProfileContactLinks = ({ user, role, language }) =>');
    expect(matchingSource).toContain("section.variant === 'contacts'");
    expect(matchingSource).toContain('<ProfileContactLinks user={user} role={resolvedRole} language={language} />');
    // Напис під замком тепер іде мовою інтерфейсу, тож перевіряється сам слот,
    // а не англійський рядок у ньому.
    expect(matchingSource).toContain("{profileUiText('showContacts', language)}");
    // Згорнутий рядок показує ще й значки тих каналів, які в анкеті заповнені,
    // — інакше він нічого не повідомляє, поки його не розгорнули.
    expect(matchingSource).toContain('<ModernContactHints aria-hidden="true">');
    expect(matchingSource).toContain('const contactHintIcons = getContactEntries(user)');
    expect(matchingSource).toContain('href={entry.href}');
    // Самі будівники швидких кнопок переїхали в спільний набір значків
    // (`contactIcons`) — той самий і для картки, і для рядка стрічки, — але
    // будуються вони так само з номера.
    const iconsSource = fs.readFileSync(path.join(__dirname, 'contactIcons.jsx'), 'utf8');
    expect(iconsSource).toContain('CONTACT_LINK_BUILDERS.telegramFromPhone');
    expect(iconsSource).toContain('CONTACT_LINK_BUILDERS.viberFromPhone');
    expect(iconsSource).toContain('CONTACT_LINK_BUILDERS.whatsappFromPhone');
    expect(matchingSource).toContain("import { CONTACT_ICONS, PHONE_QUICK_LINKS, getContactIcon, isExternalContact } from './contactIcons';");
  });

  it('тримає блок контактів у двох рядках: номер з кнопками і решта іконками', () => {
    const matchingSource = source();

    // Кнопки месенджерів будуються з номера, тож і стоять біля номера — а не
    // трьома порожніми рядками після всіх контактів.
    expect(matchingSource).toContain('<ContactPrimaryRow key={');
    expect(matchingSource).toContain('PHONE_QUICK_LINKS.map(({ key, Icon, label, build })');
    // Повністю читається лише телефон; решта — іконки, значення яких лишається
    // в підказці, а не займає рядок.
    expect(matchingSource).toContain('const others = entries.filter(entry => entry.key !== \'phone\');');
    expect(matchingSource).toContain('<ContactIconRow $standalone>');
    expect(matchingSource).toContain('title={label}');
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
    // Роль без назви впізнається за кодом, а не за написом: напис залежить від
    // мови інтерфейсу, і порівняння з англійським рядком мовчки ламало б бейдж
    // під українською.
    expect(matchingSource).toContain("const isGenericProfileRole = resolvedRole === 'other';");
    expect(matchingSource).toContain('const shouldShowRoleBadge = !isGenericProfileRole && Boolean(roleCode);');
    expect(matchingSource).toContain("const name = profileName || '';");
    expect(matchingSource).toContain('{title && <ModernHeroTitle>{title}</ModernHeroTitle>}');
    expect(matchingSource).toContain('{shouldShowRoleBadge && <ModernRoleBadge $role={resolvedRole}>{roleCode}</ModernRoleBadge>}');
  });

  it('renders editor-created Firebase list values without breaking matching', () => {
    // The creation questionnaire stores every editable row as a list. Firebase
    // therefore shows even a single name/surname under child key `0`; matching
    // reads the last row of that list as the current value.
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

    // `null` — це пропущений індекс, яким SDK добиває дірки в даних бази, тож
    // на ньому береться попередня версія.
    expect(getProfileName({
      name: ['Актуальне ім’я', null],
      surname: ['Актуальне прізвище', null],
    })).toBe('Актуальне ім’я Актуальне прізвище');

    // А порожній рядок в останній версії — це стирання, і воно тут раніше не
    // діяло: людина прибирала прізвище, бачила в себе порожнє поле, а картка
    // показувала попередній запис. Останнє слово за останньою версією.
    expect(getProfileName({
      name: ['Ім’я', ''],
      surname: ['Прізвище', ''],
    })).toBe('');
  });

  it('warns when matching data is still unavailable after five seconds', () => {
    const matchingSource = source();

    expect(matchingSource).toContain("id: 'matching-slow-load'");
    expect(matchingSource).toContain('не вдалося отримати дані протягом 5 секунд');
    expect(matchingSource).toContain('Перевірте мережу, Firebase rules та індекси');
    expect(matchingSource).toContain('}, 5000);');
    expect(matchingSource).toContain("toast.dismiss('matching-slow-load');");
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

  /*
   * Відкрита картка читає відгуки сама (ефект на `detailOpen`), тож доріжка
   * публічної нотатки не кличе їх перевіряти, а про порожню відповідь каже
   * словом. Мовчати не можна: поле для власного запису стоїть у доріжці
   * завжди, тож «ще не читали» й «прочитали, відгуків немає» виглядали б
   * однаково — порожнім місцем під плейсхолдером.
   */
  it('каже у відкритій картці, чим скінчилось читання відгуків', () => {
    const matchingSource = source();

    expect(matchingSource).toContain('<ReviewsStateNote>{publicCommentStatus}</ReviewsStateNote>');
    expect(matchingSource).toContain('publicCommentStatus={describeReviewsState({');
    // Блок знає, що читати його вже не просять: плейсхолдер лишається самою
    // роботою, а стрілка до значка в ряду рішень зникає разом із закликом.
    expect(matchingSource).toContain('preloaded\n                          profileId={user.userId}');
  });

  /*
   * Розкладка відкритої картки на один екран: порожня смуга фото не займає
   * пів екрана, а смужка дій — рівно рядок кнопок.
   */
  it('не віддає екран порожньому фото й не роздуває смужку дій', () => {
    const matchingSource = source();
    const styledSource = fs.readFileSync(path.join(__dirname, 'Matching.styled.jsx'), 'utf8');

    // Без знімка смуга вузька — портретні 4/5 лишаються там, де є що
    // показувати.
    expect(matchingSource).toContain('$empty={!activeHeroPhoto}');
    expect(styledSource).toContain('($empty ? css`');
    // Монограма читається: біла по кремовому градієнту світлої теми не
    // читалась узагалі, тож смуга й виглядала просто порожньою.
    expect(styledSource).toContain('color: var(--matching-role-accent);');
    // Смужка дій має висоту своїх кнопок, а не власний мінімум у 80 px.
    expect(styledSource).toContain('min-height: 0;\n  box-sizing: border-box;');
    // І жолоба смужки прокрутки, який різав фото світлою полосою праворуч,
    // у картці немає.
    expect(styledSource).not.toContain('scrollbar-width: thin;');
  });

  /*
   * Безпечна зона — про край вікна, а смужка дій до нього не дотикається:
   * вона лежить усередині картки, під якою йде сторінка. Firefox для Android
   * віддає в цій змінній висоту своєї нижньої панелі, тож смужка там набирала
   * майже вдвічі більше за власні кнопки й накривала нотатки, а Chrome із
   * Samsung віддавали нуль — і те саме правило виглядало правильним.
   */
  it('не додає до смужки дій відступу на безпечну зону', () => {
    const styledSource = fs.readFileSync(path.join(__dirname, 'Matching.styled.jsx'), 'utf8');
    const rail = styledSource.slice(
      styledSource.indexOf('export const ModernActionRail'),
      styledSource.indexOf('export const ModernSwipeHint'),
    );

    expect(rail).toContain('padding: 9px 54px;');
    expect(rail).not.toContain('env(safe-area-inset-bottom');
  });

  /*
   * Блок із пропорцією і автоматичною шириною Chromium стискає **по обох**
   * боках, щойно спрацювала стеля висоти: фото сідало під пропорцію й
   * відходило від правого краю картки світлою смугою. У рядку стрічки стеля
   * спрацьовує завжди, у відкритій картці — лише на низькому екрані, тож на
   * око це виглядало як «у списку фото зміщене, а у відкритій картці ні».
   */
  it('тримає ширину фото заданою там, де висоту обмежує стеля', () => {
    const styledSource = fs.readFileSync(path.join(__dirname, 'Matching.styled.jsx'), 'utf8');
    const rowStyled = fs.readFileSync(path.join(__dirname, 'MatchingHiddenList.styled.jsx'), 'utf8');
    const photo = rowStyled.slice(rowStyled.indexOf('export const Photo'), rowStyled.indexOf('export const PhotoRoleBadge'));

    // Рядок стрічки: фото виходить за відступ картки, тож і ширина на два
    // відступи більша — інакше стеля 58vh сідала б і на неї.
    expect(photo).toContain('width: calc(100% + ${CARD_PADDING} * 2);');
    expect(photo).toContain('max-height: 58vh;');
    // Відкрита картка: та сама пара правил, та сама причина.
    expect(styledSource).toContain('width: 100%;\n    aspect-ratio: 4 / 5;');
  });

  /*
   * Ряд кнопок шапки не прокручується: вузол з overflow обрізає тінь кожного
   * свого нащадка своєю ж рамкою, а тіней там три — виходила суцільна сіра
   * пляма з різкими краями рівно по межах ряду, тобто квадрат, якого ніхто не
   * малював.
   */
  it('не обрізає тіней кнопок шапки прокруткою', () => {
    const styledSource = fs.readFileSync(path.join(__dirname, 'Matching.styled.jsx'), 'utf8');
    const actions = styledSource.slice(
      styledSource.indexOf('export const TopActions'),
      styledSource.indexOf('export const TopActionGroup'),
    );

    expect(actions).not.toContain('overflow');
    expect(actions).toContain('flex: 0 0 auto;');
  });
});
