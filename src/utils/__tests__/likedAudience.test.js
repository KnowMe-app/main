import {
  LIKED_AUDIENCE_CARD_FLAG,
  buildLikedAudiencePatch,
  canOfferLikedAudiencePublication,
  isCardSharedWithLikedAudience,
  isLikedAudienceProfile,
  listLikedAudienceViewerIds,
  orderLikedAudienceOwnerIds,
  resolveLikedAudienceKind,
} from '../likedAudience';
import { programStatus } from '../../components/programs/ProgramsEditor';
import {
  buildMatchingCardProjection,
  expandMatchingCard,
  isMatchingCardPublished,
} from '../matchingCardIndex';
import { canOfferProfileContacts, isCardInMatchingFeed, scopeProfileNodesToViewer } from '../profileVisibilityScope';
import { canShowMatchingUser, mergeMatchingCandidateUsers } from '../reactionPriority';

const OWNER = 'donorUidLikedOnly0000000001';
const AGENCY = 'agencyUid00000000000000001';

const likedProfile = {
  name: 'Оксана',
  role: 'ed',
  publish: false,
  publishAudience: 'liked',
  lastLogin2: '2026-10-01',
  blood: '2+',
};

describe('публікація лише для вподобаних — картка стрічки', () => {
  it('ставить feedDate: false і коло читачів, навіть якщо в анкеті є дата', () => {
    const card = buildMatchingCardProjection(OWNER, likedProfile, { existingCard: { feedDate: '2026-10-01' } });
    expect(card.feedDate).toBe(false);
    expect(card.audience).toBe('liked');
    // Повна група крові — лише в опублікованої для всіх картки.
    expect(card.blood).toBeUndefined();
    expect(isMatchingCardPublished(card)).toBe(false);
    expect(isCardInMatchingFeed(card)).toBe(false);
  });

  it('вмикається й для анкети, яку ще не публікували', () => {
    const card = buildMatchingCardProjection(OWNER, likedProfile, { existingCard: null });
    expect(card.feedDate).toBe(false);
    expect(card.audience).toBe('liked');
  });

  it('переживає перебудову з розгорнутої картки — правка сусіднього поля режиму не знімає', () => {
    const card = buildMatchingCardProjection(OWNER, likedProfile, { existingCard: null });
    const expanded = expandMatchingCard(OWNER, card);
    expect(expanded.publish).toBe(false);
    expect(expanded.publishAudience).toBe('liked');
    expect(isCardSharedWithLikedAudience(expanded)).toBe(true);
    const rebuilt = buildMatchingCardProjection(OWNER, { ...expanded, city: 'Київ' }, { existingCard: card });
    expect(rebuilt.feedDate).toBe(false);
    expect(rebuilt.audience).toBe('liked');
  });

  it('публікація для всіх знімає коло, приховування — теж', () => {
    const existingCard = { feedDate: false, audience: 'liked' };
    const published = buildMatchingCardProjection(OWNER, { ...likedProfile, publish: true, publishAudience: null }, { existingCard });
    expect(published.feedDate).toBe('2026-10-01');
    expect(published.audience).toBeUndefined();
    const hidden = buildMatchingCardProjection(OWNER, { ...likedProfile, publishAudience: null }, { existingCard });
    expect(hidden.feedDate).toBe(false);
    expect(hidden.audience).toBeUndefined();
  });

  it('звичайна схована картка розгортається без кола', () => {
    expect(expandMatchingCard(OWNER, { name: 'X', feedDate: false }).publishAudience).toBeUndefined();
    // Коло без `false` поруч — не стан, який пише проєкція, і розгортання його не вигадує.
    expect(expandMatchingCard(OWNER, { name: 'X', feedDate: '2026-10-01', audience: 'liked' }).publishAudience).toBeUndefined();
  });
});

describe('публікація лише для вподобаних — межа показу', () => {
  const card = expandMatchingCard(OWNER, buildMatchingCardProjection(OWNER, likedProfile, { existingCard: null }));

  it('без доведеного членства картка схована, як і звичайна схована', () => {
    expect(canShowMatchingUser(card)).toBe(false);
    expect(canOfferProfileContacts({ card, viewerId: AGENCY, accessLevel: '' })).toBe(false);
    const scoped = scopeProfileNodesToViewer({
      profileId: OWNER,
      viewerId: AGENCY,
      parts: { card, details: { surname: 'Коваль' }, contacts: { phone: '+380' } },
    });
    expect(scoped.cappedToCard).toBe(true);
    expect(scoped.parts.contacts).toBeNull();
  });

  it('читач у колі бачить картку й контакти', () => {
    const shared = { ...card, [LIKED_AUDIENCE_CARD_FLAG]: true };
    expect(canShowMatchingUser(shared)).toBe(true);
    expect(canOfferProfileContacts({ card: shared, viewerId: AGENCY, accessLevel: '' })).toBe(true);
    const scoped = scopeProfileNodesToViewer({
      profileId: OWNER,
      viewerId: AGENCY,
      sharedWithViewer: true,
      parts: { card, details: { surname: 'Коваль' }, contacts: { phone: '+380' } },
    });
    expect(scoped.cappedToCard).toBe(false);
    expect(scoped.parts.contacts).toEqual({ phone: '+380' });
  });

  it('стає головою деки читача й переживає злиття з тією самою карткою з інших джерел', () => {
    const shared = { ...card, [LIKED_AUDIENCE_CARD_FLAG]: true };
    const feedCard = { userId: 'feedCard000000000000000001', publish: true, lastLogin2: '2026-10-10', role: 'ed' };
    const deck = mergeMatchingCandidateUsers({
      users: [feedCard, { ...card }],
      likedAudienceUsers: [shared],
      viewerRole: 'ag',
      viewerId: AGENCY,
    });
    expect(deck.map(user => user.userId)).toEqual([OWNER, feedCard.userId]);
    expect(deck[0][LIKED_AUDIENCE_CARD_FLAG]).toBe(true);
  });

  it('реакція читача прибирає її з деки, як і будь-яку іншу картку', () => {
    const shared = { ...card, [LIKED_AUDIENCE_CARD_FLAG]: true };
    const deck = mergeMatchingCandidateUsers({
      users: [],
      likedAudienceUsers: [shared],
      dislikeUsers: { [OWNER]: Date.now() },
      viewerRole: 'ag',
      viewerId: AGENCY,
    });
    expect(deck).toEqual([]);
  });
});

describe('публікація лише для вподобаних — допоміжні', () => {
  it('режим пропонується кожній ролі матчингу — і донорці, і агенції, клініці, батькам', () => {
    ['ed', 'sm', 'ag', 'cl', 'ip', 'pp'].forEach(role => {
      expect(canOfferLikedAudiencePublication([role])).toBe(true);
    });
    expect(canOfferLikedAudiencePublication(['ed', 'ag'])).toBe(true);
    expect(canOfferLikedAudiencePublication(['unknown'])).toBe(false);
    expect(canOfferLikedAudiencePublication([])).toBe(false);
  });

  it('слова режиму — свої для донорки й СМ і для агенції, клініки, батьків', () => {
    expect(resolveLikedAudienceKind(['ed'])).toBe('person');
    expect(resolveLikedAudienceKind(['ed', 'sm'])).toBe('person');
    expect(resolveLikedAudienceKind(['ag'])).toBe('organisation');
    expect(resolveLikedAudienceKind(['ip'])).toBe('organisation');
    expect(resolveLikedAudienceKind(['ed', 'ag'])).toBe('organisation');
  });

  it('програми агенції в цьому режимі підписані «Лише обраним», а не «Опублікована»', () => {
    const program = { id: 'p1', type: 'ed', location: 'Київ' };
    expect(programStatus(program, { profilePublished: true, profileSharedWithLiked: true }).label).toBe('Лише обраним');
    expect(programStatus(program, { profilePublished: true }).label).toBe('Опублікована');
  });

  it('читає рішення й з історії версій', () => {
    expect(isLikedAudienceProfile({ publishAudience: 'liked' })).toBe(true);
    expect(isLikedAudienceProfile({ publishAudience: ['liked', ''] })).toBe(false);
    expect(isLikedAudienceProfile({ publishAudience: null })).toBe(false);
  });

  it('обернений перелік: увімкнення пише час вподобання, вимкнення знімає', () => {
    const favorites = { [AGENCY]: 1760000000000, clinicUid0000000000000000001: 'ed', ignored0000000000000000001: false, [OWNER]: 1 };
    expect(listLikedAudienceViewerIds(favorites, OWNER)).toEqual([AGENCY, 'clinicUid0000000000000000001']);
    expect(buildLikedAudiencePatch({ ownerId: OWNER, favorites, enabled: true, now: 42 })).toEqual({
      [`multiData/likedAudience/${AGENCY}/${OWNER}`]: 1760000000000,
      [`multiData/likedAudience/clinicUid0000000000000000001/${OWNER}`]: 42,
    });
    expect(buildLikedAudiencePatch({ ownerId: OWNER, favorites, enabled: false })).toEqual({
      [`multiData/likedAudience/${AGENCY}/${OWNER}`]: null,
      [`multiData/likedAudience/clinicUid0000000000000000001/${OWNER}`]: null,
    });
    expect(buildLikedAudiencePatch({ ownerId: '', favorites, enabled: true })).toEqual({});
  });

  it('власниці в переліку читача — свіжіше вподобання першим', () => {
    expect(orderLikedAudienceOwnerIds({ a: 1, b: 3, c: 2, 'bad/id': 5, d: 0 })).toEqual(['b', 'c', 'a']);
  });
});
