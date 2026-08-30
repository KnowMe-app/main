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
    expect(isCardInMatchingFeed({ feedDate: '   ' })).toBe(false);
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

  it('поки права не прочитані, межу тримає сама база', () => {
    // `null` — це «застосунок ще не знає», а не «прав немає»: ключ зникає на
    // виході і повертається лише після читання власної анкети. Урізати наосліп
    // означало б у перші секунди після входу показати службовому читачеві
    // проєкцію замість анкети, яку він веде; відмову ж, якої він не мав би
    // отримати, однаково скаже база.
    expect(canReadProfileOutsideFeed({ profileId: CARD_ID, viewerId: ORDINARY, accessLevel: null })).toBe(true);
    expect(canReadProfileOutsideFeed({ profileId: CARD_ID, viewerId: ORDINARY })).toBe(true);
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
    expect(body).toContain('accessLevel: readStoredAccessLevel(),');
    expect(body).toContain('legacy: legacyFieldsNodesDoNotOwn(scoped.legacy, parts),');
  });

  it('кеш пристрою не переживає цю межу', () => {
    const cardIndexSource = fs.readFileSync(path.join(__dirname, '..', 'cardIndex.js'), 'utf8');
    // Анкети, складені до неї, лежать у localStorage разом із контактами.
    expect(cardIndexSource).toContain('export const CARDS_CACHE_VERSION = 3;');
  });
});
