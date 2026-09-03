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
 */
describe('поза стрічкою видно саму картку', () => {
  it('ключ стрічки — це і є питання «чи показана»', () => {
    expect(isCardInMatchingFeed(shownCard)).toBe(true);
    expect(isCardInMatchingFeed(hiddenCard)).toBe(false);
    expect(isCardInMatchingFeed({ feedDate: false })).toBe(false);
    expect(isCardInMatchingFeed({ feedDate: '   ' })).toBe(false);
    expect(isCardInMatchingFeed({ feedDate: 'not-a-date' })).toBe(false);
    expect(isCardInMatchingFeed(null)).toBe(false);
  });

  it('показану анкету звичайний користувач бачить цілком', () => {
    const scoped = scopeProfileNodesToViewer({
      profileId: CARD_ID,
      viewerId: ORDINARY,
      accessLevel: '',
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
      accessLevel: '',
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

  it('службовий доступ, власниця анкети й суперадмін від межі не залежать', () => {
    const outsideFeed = viewer => canReadProfileOutsideFeed({ profileId: CARD_ID, ...viewer });

    expect(outsideFeed({ viewerId: ADMIN, accessLevel: '' })).toBe(true);
    expect(outsideFeed({ viewerId: ORDINARY, accessLevel: 'matching:view' })).toBe(true);
    expect(outsideFeed({ viewerId: ORDINARY, accessLevel: 'add+matching:view&write' })).toBe(true);
    expect(outsideFeed({ viewerId: CARD_ID, accessLevel: '' })).toBe(true);
    expect(outsideFeed({ viewerId: ORDINARY, accessLevel: '' })).toBe(false);
    expect(outsideFeed({ viewerId: ORDINARY, accessLevel: 'addNewProfile:view&write' })).toBe(false);
  });

  it('непрочитані права — не дозвіл', () => {
    // Ключ доступу зʼявляється лише після мережевого круга (читання власної
    // анкети), і доти його значення — `null`. Поки `null` означав «вирішить
    // база», у цьому вікні жила ціла діра: на холодному відкритті `/matching`
    // пошук встигав прочитати приховану анкету повністю, покласти її в кеш
    // карток — і показувати звідти ще годинами, вже після того, як права
    // стали відомі. Хто справді має право, того назве прочитаний рівень
    // (`resolveViewerAccessLevel`), а не його відсутність.
    expect(canReadProfileOutsideFeed({ profileId: CARD_ID, viewerId: ORDINARY, accessLevel: null })).toBe(false);
    expect(canReadProfileOutsideFeed({ profileId: CARD_ID, viewerId: ORDINARY })).toBe(false);
    // Власниця анкети й адмін цього круга не чекають: їх упізнають за id.
    expect(canReadProfileOutsideFeed({ profileId: CARD_ID, viewerId: CARD_ID, accessLevel: null })).toBe(true);
    expect(canReadProfileOutsideFeed({ profileId: CARD_ID, viewerId: ADMIN, accessLevel: null })).toBe(true);
  });

  it('їм анкета лишається цілою', () => {
    const scoped = scopeProfileNodesToViewer({
      profileId: CARD_ID,
      viewerId: ORDINARY,
      accessLevel: 'matching:view',
      parts: parts(hiddenCard),
    });

    expect(scoped.cappedToCard).toBe(false);
    expect(scoped.parts.contacts).not.toBeNull();
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
    // Рівень доступу саме читається, а не береться з localStorage наосліп:
    // ключа там немає до першого читання власної анкети.
    expect(body).toContain('resolveViewerAccessLevel(),');
    expect(body).toContain('accessLevel,');
    expect(body).toContain('legacy: legacyFieldsNodesDoNotOwn(scoped.legacy, parts),');
  });

  it('кеш пристрою не переживає цю межу', () => {
    const cardIndexSource = fs.readFileSync(path.join(__dirname, '..', 'cardIndex.js'), 'utf8');
    // Анкети, складені до неї, лежать у localStorage разом із контактами, —
    // тож зміна версії їх і прибирає.
    expect(cardIndexSource).toContain('export const CARDS_CACHE_VERSION = 5;');
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
    expect(sanitizeMatchingCardForCache(card)).toEqual({
      userId: CARD_ID,
      name: 'Показана',
      city: 'Київ',
    });

    // Службовий читач веде анкету незалежно від стрічки — його кеш лишається
    // повним.
    localStorage.setItem('accessLevel', 'matching:view&write');
    expect(sanitizeMatchingCardForCache(card)).toEqual(card);

    // Так само власниця анкети: id збігається з анкетою, і рівень тут ні до чого.
    localStorage.setItem('ownerId', CARD_ID);
    localStorage.setItem('accessLevel', '');
    expect(sanitizeMatchingCardForCache(card)).toEqual(card);

    localStorage.removeItem('ownerId');
    localStorage.removeItem('accessLevel');
  });
});
