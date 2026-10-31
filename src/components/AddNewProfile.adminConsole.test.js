import fs from 'fs';
import path from 'path';
import { CARD_LIST_PRIMARY_PRESETS, getCardListField, getCardListPreset } from 'utils/cardListQuery';
import { MATCHING_CARD_ORDER_FIELD } from 'utils/matchingCardIndex';

// Адмінська панель на `AddNewProfile`.
//
// Кнопки тут стояли одним килимом однакових прямокутників, і дві з них робили
// протилежні за ціною речі поруч без жодної різниці на вигляд («Очистити кеш»
// і «Картки», тобто перебудова вузла на всю колекцію). Тест стереже саме те, що
// коштувало розбору: групи лишились групами, дві нові добірки ведуть туди, куди
// обіцяють, а «Стрічка» гортається тим самим полем і межами, що й `/matching`.
describe('AddNewProfile admin console', () => {
  const source = fs.readFileSync(path.join(__dirname, 'AddNewProfile.jsx'), 'utf8');

  it('розкладає панель по групах, а не одним рядом кнопок', () => {
    expect(source).toContain('<ConsolePanel>');
    // Плаский контейнер кнопок пішов разом зі своїм стилем.
    expect(source).not.toContain('<ButtonsContainer>');

    ['Дублікати', 'Дані', 'Сервіс', 'Обслуговування бази'].forEach(group => {
      expect(source).toMatch(new RegExp(`<ToolGroupTitle(?: \\$danger)?>\\s+${group}\\s`));
    });
  });

  it('добірки стоять на виду, а не в панелі, яку треба розгортати', () => {
    // Що показати — щоденна робота; у згорнутих «Інструментах» лишається
    // рідкісне й небезпечне, і вони стартують згорнутими.
    const listPanel = source.slice(source.indexOf('<ListPanel>'), source.indexOf('</ListPanel>'));
    // Готові запити «Списку» малюються з одного переліку, а не кнопкою на
    // кожен завантажувач.
    expect(listPanel).toContain('CARD_LIST_PRIMARY_PRESETS.map(');
    expect(CARD_LIST_PRIMARY_PRESETS.map(preset => preset.label))
      .toEqual(['Кому дзвонити', 'Остання дія', 'Стрічка', 'Обрані']);
    ['Цикл', 'Доповнення', "'Хто шукав'", 'Сортування:', '↻ Оновити'].forEach(label => {
      expect(listPanel).toContain(label);
    });
    expect(source.indexOf('</ListPanel>')).toBeLessThan(source.indexOf('<ConsolePanel>'));
    expect(source).toContain("return localStorage.getItem(ADMIN_CONSOLE_OPEN_KEY) === 'true';");
  });

  it('пошук обирає глибину, а не два десятки полів', () => {
    // Ключ `searchId` — саме значення, поле розпізнає `SearchBar`, тож чіпи
    // полів лише ховали знайдене. Поля ввімкнені завжди.
    expect(source).not.toContain('SEARCH_SCOPE_BLOCKS');
    expect(source).toContain("exact: { searchId: true, partialUserId: true, searchKey: false, equalToAllCards: false, broadTextSearch: false },");
    expect(source).toContain("full: { searchId: true, partialUserId: true, searchKey: true, equalToAllCards: true, broadTextSearch: true },");
    expect(source).toContain('return buildEnabledSearchKeys(resolveSearchDepth(parsed));');
  });

  it('«Стрічка» — запит «Списку» за полем і межами стрічки matching', () => {
    // Окремий завантажувач стрічки (`loadMoreUsersFeedDate`) з власним
    // курсором пішов: «Стрічка» — це той самий двигун за полем, за яким
    // гортає `/matching`, з тими самими межами (`startAt('')`,
    // `endAt(сьогодні)`). Що й порядок той самий, стереже
    // `config.cardListBackend.test.js` проти справжнього `fetchMatchingCardsPage`.
    const feed = getCardListPreset('feed');
    expect(feed.query).toEqual({ field: 'feedDate', direction: 'desc', range: 'upToToday', missing: 'exclude' });
    expect(getCardListField('feedDate').source).toEqual({ kind: 'child', path: 'matchingCards', child: MATCHING_CARD_ORDER_FIELD });
    expect(source).not.toContain('loadMoreUsersFeedDate');
    expect(source).not.toContain('FEED_DATE_FILTER');
  });

  it('усі готові списки — один двигун, а черга доповнень — окрема добірка', () => {
    expect(source).toContain('onClick={() => openCardList(preset.query)}');
    expect(source).not.toContain('loadNextReactionBatch');
    expect(source).not.toContain('startReactionPaging');

    expect(source).toContain("const OVERLAY_REVIEW_FILTER = 'OVERLAY_REVIEW';");
    expect(source).toContain('onClick={() => openCardCollection(OVERLAY_REVIEW_FILTER)}');
    expect(source).toContain('if (currentFilter === OVERLAY_REVIEW_FILTER) {');
  });

  it('черга доповнень — адмінська й показується замість списку анкет', () => {
    expect(source).toContain('<OverlayReviewQueue onOpenCard={handleOpenProfileById} />');
    // Інакше під чергою малювався б ще й порожній `UsersList` зі своєю пагінацією.
    expect(source).toContain('{!userNotFound && currentFilter !== OVERLAY_REVIEW_FILTER && (');
  });

  it('екрана міграції users/newUsers більше немає', () => {
    // Міграцію завершено, а з колекцією `users` застосунок більше не працює
    // взагалі — тож і входу в окремий екран міграції (`/rtdb-migration`) нема.
    expect(source).not.toContain("navigate('/rtdb-migration')");
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
