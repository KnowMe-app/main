import fs from 'fs';
import path from 'path';
import { getProfileName } from './profileLayoutConfig';

describe('Matching redesigned profile regressions', () => {
  const source = () => fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');

  it('builds the phone quick links from the shared icon set', () => {
    // Будівники швидких кнопок — у спільному наборі значків (`contactIcons`).
    const iconsSource = fs.readFileSync(path.join(__dirname, 'contactIcons.jsx'), 'utf8');
    expect(iconsSource).toContain('CONTACT_LINK_BUILDERS.telegramFromPhone');
    expect(iconsSource).toContain('CONTACT_LINK_BUILDERS.viberFromPhone');
    expect(iconsSource).toContain('CONTACT_LINK_BUILDERS.whatsappFromPhone');
  });

  // Контакти — один рядок значків: трубка (дзвінок), месенджери з того самого
  // номера, далі решта каналів. Номера текстом немає.
  it('тримає блок контактів одним рядком значків', () => {
    const rowSource = fs.readFileSync(path.join(__dirname, 'ProfileRow.jsx'), 'utf8');
    const links = rowSource.slice(rowSource.indexOf('export const ContactLinks'), rowSource.indexOf('const COMMENT_SAVE_DEBOUNCE_MS'));
    expect(links).toContain('PHONE_QUICK_LINKS.filter(link => !ownChannels.has(link.key))');
    expect(links).toContain('phoneQuickLinks.map(({ key, Icon, label, build })');
    expect(links.match(/<S\.ContactIconRow>/g)).toHaveLength(1);
    expect(links).not.toContain('<span>{displayValue}</span>');
    // Підпис «Подзвонити» — лише головна дія картки організації (`primaryLabel`).
    expect(links.match(/<span>\{uiText\('Подзвонити', language\)\}<\/span>/g)).toHaveLength(1);
    expect(links).toContain("{primaryLabel && phones[0] === entry ? <span>{uiText('Подзвонити', language)}</span> : null}");
  });

  it('hides VK contacts from matching cards for every viewer, including admins', () => {
    const rowSource = fs.readFileSync(path.join(__dirname, 'ProfileRow.jsx'), 'utf8');
    expect(rowSource).toContain("getContactEntries(user).filter(entry => entry.key !== 'vk')");
  });

  it('builds matching profile names only from approved identity fields', () => {
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

  /*
   * Блок із пропорцією і автоматичною шириною Chromium стискає **по обох**
   * боках, щойно спрацювала стеля висоти: фото сідало під пропорцію й
   * відходило від правого краю картки світлою смугою. У рядку стрічки стеля
   * спрацьовує завжди, тож фото в списку виглядало зміщеним.
   */
  it('тримає ширину фото заданою там, де висоту обмежує стеля', () => {
    const rowStyled = fs.readFileSync(path.join(__dirname, 'MatchingHiddenList.styled.jsx'), 'utf8');
    const photo = rowStyled.slice(rowStyled.indexOf('export const Photo'), rowStyled.indexOf('export const PhotoRoleBadge'));

    // Рядок стрічки: фото виходить за відступ картки, тож і ширина на два
    // відступи більша — інакше стеля висоти сідала б і на неї.
    // Подвоєну довжину записуємо готовим значенням: множення одиниць у calc()
    // не підтримують старі браузери з production Browserslist.
    expect(photo).toContain('width: calc(100% + 22px);');
    expect(photo).not.toMatch(/CARD_PADDING\} \* 2/);
    expect(photo).toContain('max-height: min(40vh, 320px);');
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
