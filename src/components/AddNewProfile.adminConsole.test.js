import fs from 'fs';
import path from 'path';

// Адмінська панель на `AddNewProfile`.
//
// Кнопки тут стояли одним килимом однакових прямокутників, і дві з них робили
// протилежні за ціною речі поруч без жодної різниці на вигляд («Очистити кеш»
// і «Картки», тобто перебудова вузла на всю колекцію). Тест стереже саме те, що
// коштувало розбору: групи лишились групами, дві нові добірки ведуть туди, куди
// обіцяють, а порядок стрічки береться зі стрічки, а не збирається тут удруге.
describe('AddNewProfile admin console', () => {
  const source = fs.readFileSync(path.join(__dirname, 'AddNewProfile.jsx'), 'utf8');

  it('розкладає панель по групах, а не одним рядом кнопок', () => {
    expect(source).toContain('<ConsolePanel>');
    // Плаский контейнер кнопок пішов разом зі своїм стилем.
    expect(source).not.toContain('<ButtonsContainer>');

    ['Список', 'Добірки', 'Індексація', 'Дані', 'Сервіс'].forEach(group => {
      expect(source).toMatch(new RegExp(`<ToolGroupTitle>\\s+${group}\\s`));
    });
  });

  it('порядок стрічки бере та сама сторінка, що й matching', () => {
    const loaderBody = source.slice(
      source.indexOf('const loadMoreUsersFeedDate ='),
      source.indexOf('const loadMoreUsers21 ='),
    );

    // Збіг порядку з `/matching` тримає спільний код, а не домовленість: своя
    // сортувалка тут розійшлася б зі стрічкою при першій же зміні в ній.
    expect(loaderBody).toContain('fetchMatchingCardsPage({ limit: PAGE_SIZE, cursor })');
    // Курсор — у ref: ефект перезавантаження читає стан зі старого замикання,
    // і сторінка почалася б із середини стрічки.
    expect(loaderBody).toContain('const cursor = feedCursorRef.current;');
    expect(loaderBody).toContain('feedCursorRef.current = page?.lastKey || null;');
    // Порядок сторінки — це і є відповідь, а мапа з `fetchUsersByIds` його не несе.
    expect(loaderBody).toContain('const orderedUsers = pageIds.reduce(');
  });

  it('обидві нові добірки мають кнопку й окрему гілку завантаження', () => {
    expect(source).toContain("const FEED_DATE_FILTER = 'FEED_DATE';");
    expect(source).toContain("const OVERLAY_REVIEW_FILTER = 'OVERLAY_REVIEW';");

    expect(source).toContain('onClick={() => openCardCollection(FEED_DATE_FILTER)}');
    expect(source).toContain('onClick={() => openCardCollection(OVERLAY_REVIEW_FILTER)}');

    expect(source).toContain('if (currentFilter === FEED_DATE_FILTER) {');
    expect(source).toContain('if (currentFilter === OVERLAY_REVIEW_FILTER) {');
    // Сторінка стрічки догортується тим самим лічильником сторінок, що й решта.
    expect(source).toContain(': currentFilter === FEED_DATE_FILTER\n          ? await loadMoreUsersFeedDate()');
  });

  it('черга доповнень — адмінська й показується замість списку анкет', () => {
    expect(source).toContain('<OverlayReviewQueue onOpenCard={handleOpenProfileById} />');
    // Інакше під чергою малювався б ще й порожній `UsersList` зі своєю пагінацією.
    expect(source).toContain('{!userNotFound && currentFilter !== OVERLAY_REVIEW_FILTER && (');
  });

  it('окреме меню міграції доступне з тієї ж панелі', () => {
    // Міграція лишається окремим екраном (`/rtdb-migration`), але вхід у неї
    // стоїть поруч з рештою робіт над даними: доти її знав лише той, хто
    // памʼятав про меню «⋮».
    expect(source).toContain("onClick={() => navigate('/rtdb-migration')}");
  });

  it('роботи індексації згруповані за тим, що вони роблять', () => {
    const groupsBody = source.slice(
      source.indexOf('const INDEX_JOB_GROUPS = ['),
      source.indexOf('const ADMIN_CONSOLE_OPEN_KEY'),
    );

    expect(groupsBody).toContain("title: 'Локально, з JSON'");
    expect(groupsBody).toContain("note: 'нічого не пише в базу'");
    expect(groupsBody).toContain("title: 'На бекенді'");
    expect(groupsBody).toContain("note: 'переписує вузол цілком'");

    // Жодна робота не загубилась при перекладанні зі старого стовпчика.
    ['searchLocalIdAndKey', 'searchLocalImtHeightWeight', 'searchKeyUsersAll', 'searchKeySetReindex', 'stimulationShortcuts']
      .forEach(job => expect(groupsBody).toContain(`key: '${job}'`));
  });
});
