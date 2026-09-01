import fs from 'fs';
import path from 'path';

import {
  canReadProfileOutsideFeed,
  isCardInMatchingFeed,
  scopeProfileNodesToViewer,
} from '../profileVisibilityScope';

const ADMIN = '0ghb1LphfASV0Y3b6J010v4CDyD2';
const ORDINARY = 'ordinaryViewerUid000000000';
const CARD_ID = 'hiddenProfileId00000000000';

const shownCard = { name: 'Показана', city: 'Київ', feedDate: '2026-08-25' };
const hiddenCard = { name: 'Прихована', city: 'Київ' };
const parts = card => ({
  card,
  details: { surname: 'Приховайло', blood: '3+' },
  contacts: { phone: ['+380990000000'], email: 'hidden@b.c' },
  workflow: { lastAction: 'дзвінок' },
  technical: { lastLogin2: '2026-08-25' },
});

/*
 * Звичайний користувач матчингу — це не тільки адміністратор: акаунт, заведений
 * з екрана входу як агенція, теж має роль, відмінну від `ed`. Саме за нею йому
 * і віддавались деталі й контакти будь-якої анкети — зокрема тієї, якої в
 * стрічці немає. Межа тепер одна для бази і для застосунку: є `feedDate` —
 * анкета показана; немає — максимум, що з неї видно, це картка.
 *
 * Виданий рівень доступу межі не знімає. Спершу її не помічав кожен, чий
 * `accessLevel` містив `matching`, — тобто рівно те, що видають агенції заради
 * самої стрічки. Тепер від межі не залежать двоє: власниця анкети й суперадмін.
 */
describe('поза стрічкою видно саму картку', () => {
  it('ключ стрічки — це і є питання «чи показана»', () => {
    expect(isCardInMatchingFeed(shownCard)).toBe(true);
    expect(isCardInMatchingFeed(hiddenCard)).toBe(false);
    expect(isCardInMatchingFeed({ feedDate: '   ' })).toBe(false);
    expect(isCardInMatchingFeed(null)).toBe(false);
  });

  it('показану анкету звичайний користувач бачить цілком', () => {
    const scoped = scopeProfileNodesToViewer({
      profileId: CARD_ID,
      viewerId: ORDINARY,
      parts: parts(shownCard),
    });

    expect(scoped.cappedToCard).toBe(false);
    expect(scoped.parts.contacts).toEqual({ phone: ['+380990000000'], email: 'hidden@b.c' });
    expect(scoped.parts.details).toEqual({ surname: 'Приховайло', blood: '3+' });
  });

  it('на прихованій лишається сама картка — ні контактів, ні деталей', () => {
    const scoped = scopeProfileNodesToViewer({
      profileId: CARD_ID,
      viewerId: ORDINARY,
      parts: parts(hiddenCard),
      legacy: { phone: ['+380990000000'], surname: 'Приховайло' },
    });

    expect(scoped.cappedToCard).toBe(true);
    expect(scoped.parts.card).toBe(hiddenCard);
    expect(scoped.parts.details).toBeNull();
    expect(scoped.parts.contacts).toBeNull();
    expect(scoped.parts.workflow).toBeNull();
    expect(scoped.parts.technical).toBeNull();
    // Контакти лежать і в legacy-шарі, тож і він знімається — інакше межа
    // трималася б рівно доти, доки анкету не прочитають старим шляхом.
    expect(scoped.legacy).toBeNull();
  });

  it('від межі не залежать лише власниця анкети й суперадмін', () => {
    const outsideFeed = viewer => canReadProfileOutsideFeed({ profileId: CARD_ID, ...viewer });

    expect(outsideFeed({ viewerId: ADMIN })).toBe(true);
    expect(outsideFeed({ viewerId: CARD_ID })).toBe(true);
    expect(outsideFeed({ viewerId: ORDINARY })).toBe(false);
  });

  it('виданий рівень доступу межі не знімає', () => {
    // `matching:view` — це те, що видають агенції, щоб вони взагалі побачили
    // стрічку. Поки цей рівень вважався «службовим доступом», прихована анкета
    // була для них такою ж відкритою, як показана: прізвище, деталі, контакти.
    // Рівень тепер не питається взагалі — ні той, що дає перегляд, ні той, що
    // дає редагування.
    const outsideFeed = accessLevel => canReadProfileOutsideFeed({
      profileId: CARD_ID,
      viewerId: ORDINARY,
      accessLevel,
    });

    expect(outsideFeed('matching:view')).toBe(false);
    expect(outsideFeed('matching:view&write')).toBe(false);
    expect(outsideFeed('add+matching:view&write')).toBe(false);
    expect(outsideFeed('matching+profileContacts:view&write')).toBe(false);
    // Написання рівня довільне — його заводять руками, і в базі трапляється
    // `matching_add_profile_view_write`. Розбирати його більше нема потреби:
    // жодне написання межі не знімає.
    expect(outsideFeed('matching_add_profile_view_write')).toBe(false);
    // Ні відсутність ключа, ні порожній рядок нічого не змінюють — рішення
    // приймається за id читача.
    expect(outsideFeed(null)).toBe(false);
    expect(outsideFeed(undefined)).toBe(false);
    expect(canReadProfileOutsideFeed({ profileId: CARD_ID, viewerId: ADMIN, accessLevel: null })).toBe(true);
    expect(canReadProfileOutsideFeed({ profileId: CARD_ID, viewerId: CARD_ID, accessLevel: null })).toBe(true);
  });

  it('акаунт з рівнем доступу отримує ту саму картку, що й решта', () => {
    const scoped = scopeProfileNodesToViewer({
      profileId: CARD_ID,
      viewerId: ORDINARY,
      parts: parts(hiddenCard),
    });

    expect(scoped.cappedToCard).toBe(true);
    expect(scoped.parts.contacts).toBeNull();
  });

  it('адмінові й власниці анкета лишається цілою', () => {
    [ADMIN, CARD_ID].forEach(viewerId => {
      const scoped = scopeProfileNodesToViewer({
        profileId: CARD_ID,
        viewerId,
        parts: parts(hiddenCard),
      });

      expect(scoped.cappedToCard).toBe(false);
      expect(scoped.parts.contacts).not.toBeNull();
    });
  });
});

describe('межу тримає той, хто складає анкету', () => {
  const configSource = fs.readFileSync(
    path.join(__dirname, '..', '..', 'components', 'config.js'),
    'utf8',
  );

  it('readProfileFromNodes зводить прочитане до дозволеного', () => {
    const body = configSource.slice(
      configSource.indexOf('export const readProfileFromNodes = async'),
      configSource.indexOf('export const fetchUsersByIds'),
    );

    // Один шлях складання анкети — одна межа: сюди сходяться і стрічка, і
    // пошук, і реакції, і гідратація за фільтрами.
    expect(body).toContain('const scoped = scopeProfileNodesToViewer({');
    // Рівень доступу в це рішення не входить взагалі — ні прочитаний, ні
    // збережений: поза стрічкою анкету читають власниця й суперадмін, а їх
    // упізнають за id. Тож ані читання рівня, ані передачі його в межу тут
    // більше немає (згадка в коментарі — це пояснення, а не виклик).
    expect(body).not.toContain('resolveViewerAccessLevel');
    expect(body).not.toContain('accessLevel,');
    expect(body).not.toContain('accessLevel:');
    expect(body).toContain('legacy: legacyFieldsNodesDoNotOwn(scoped.legacy, parts),');
  });

  it('кеш пристрою не переживає цю межу', () => {
    const cardIndexSource = fs.readFileSync(path.join(__dirname, '..', 'cardIndex.js'), 'utf8');
    // Анкети, складені до неї, лежать у localStorage разом із контактами, —
    // тож зміна версії їх і прибирає.
    expect(cardIndexSource).toContain('export const CARDS_CACHE_VERSION = 6;');
    expect(cardIndexSource).toContain('value.ownerId !== getCardsCacheOwnerId()');
    // А нові туди не потрапляють: право на контакти тримається на `feedDate`,
    // і воно протухає без відома браузера.
    expect(cardIndexSource).toContain('if (!keepContacts && CONTACT_CACHE_KEYS.has(key)) return acc;');
  });

  it('читач, чиє право на контакти тримається на стрічці, не лишає їх у кеші', () => {
    const { sanitizeMatchingCardForCache } = require('../cardIndex');
    const card = {
      userId: CARD_ID,
      name: 'Показана',
      city: 'Київ',
      phone: ['+380990000000'],
      email: 'hidden@b.c',
      telegram: '@hidden',
    };

    localStorage.setItem('ownerId', ORDINARY);
    localStorage.setItem('accessLevel', '');
    const withoutContacts = { userId: CARD_ID, name: 'Показана', city: 'Київ' };
    expect(sanitizeMatchingCardForCache(card)).toEqual(withoutContacts);

    // Виданий рівень доступу контактів у кеші більше не тримає: право на них
    // однаково протухає разом із `feedDate`, а браузер про це не дізнається.
    localStorage.setItem('accessLevel', 'matching:view&write');
    expect(sanitizeMatchingCardForCache(card)).toEqual(withoutContacts);

    // Власниця анкети: id збігається з анкетою, і рівень тут ні до чого.
    localStorage.setItem('ownerId', CARD_ID);
    localStorage.setItem('accessLevel', '');
    expect(sanitizeMatchingCardForCache(card)).toEqual(card);

    // Суперадмін — той, хто веде анкету до публікації.
    localStorage.setItem('ownerId', ADMIN);
    expect(sanitizeMatchingCardForCache(card)).toEqual(card);

    localStorage.removeItem('ownerId');
    localStorage.removeItem('accessLevel');
  });
});
