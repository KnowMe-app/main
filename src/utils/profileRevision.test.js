// Версія анкети (`rev` у картці стрічки): ставить її писач картки після запису
// вузлів, а кеш повної анкети звіряється з нею замість годинника.

import {
  composeCachedCards,
  flushPendingMatchingCacheWrites,
  getCachedProfileBody,
  getCompleteCachedProfile,
  resetMatchingLocalStorageCache,
  saveCards,
  setCachedMatchingSummaryCards,
  CARDS_CACHE_VERSION,
  PROFILE_REVISION_MAX_AGE_MS,
} from './cardIndex';
import { buildMatchingCardProjection, readCardRevision } from './matchingCardIndex';
import { MATCHING_CARD_ALLOWED_FIELDS, resolveFieldOwnerNode } from './profileNodeSchema';

const OWNER = 'ownerUid0000000000000000000';
const SEVEN_HOURS = 7 * 60 * 60 * 1000;

const fullCard = (overrides = {}) => ({
  userId: OWNER,
  name: 'Оксана',
  surname: 'Коваленко',
  phone: '+380990000000',
  cacheVersion: CARDS_CACHE_VERSION,
  cachedAt: Date.now(),
  ...overrides,
});

beforeEach(() => {
  resetMatchingLocalStorageCache('test');
  localStorage.clear();
  // Власна анкета: кеш має право тримати її з контактами.
  localStorage.setItem('ownerId', OWNER);
});

describe('версія в картці стрічки', () => {
  it('картка її приймає, а роутер записів анкети — ні', () => {
    expect(MATCHING_CARD_ALLOWED_FIELDS).toContain('rev');
    expect(resolveFieldOwnerNode('rev')).toBeNull();
  });

  it('перебудова картки переносить версію з попередньої', () => {
    const projection = buildMatchingCardProjection(OWNER, { name: 'Оксана' }, { existingCard: { name: 'Оксана', rev: 1762770000000 } });
    expect(readCardRevision(projection)).toBe(1762770000000);
  });

  it('без версії картка її не вигадує', () => {
    expect(readCardRevision(buildMatchingCardProjection(OWNER, { name: 'Оксана' }, { existingCard: null }))).toBe(0);
  });
});

describe('кеш повної анкети звіряється з версією', () => {
  it('та сама версія — анкета з кешу й понад TTL', () => {
    saveCards({ [OWNER]: fullCard({ rev: 100, cachedAt: Date.now() - SEVEN_HOURS }) });
    expect(getCompleteCachedProfile(OWNER)).toBeNull();
    expect(getCompleteCachedProfile(OWNER, { revision: 100 })).toMatchObject({ surname: 'Коваленко' });
    expect(getCachedProfileBody(OWNER, { revision: 100 })).toMatchObject({ surname: 'Коваленко' });
  });

  it('навіть тієї самої версії анкета не живе в кеші понад тиждень', () => {
    saveCards({ [OWNER]: fullCard({ rev: 100, cachedAt: Date.now() - PROFILE_REVISION_MAX_AGE_MS - 1000 }) });
    expect(getCompleteCachedProfile(OWNER, { revision: 100 })).toBeNull();
    expect(getCachedProfileBody(OWNER, { revision: 100 })).toBeNull();
  });

  it('інша версія — анкету правили, кеш не відповідає навіть у межах TTL', () => {
    saveCards({ [OWNER]: fullCard({ rev: 100 }) });
    expect(getCompleteCachedProfile(OWNER)).not.toBeNull();
    expect(getCompleteCachedProfile(OWNER, { revision: 200 })).toBeNull();
    expect(getCachedProfileBody(OWNER, { revision: 200 })).toBeNull();
  });

  it('анкета без версії (кешована до неї) на відомій версії перечитується', () => {
    saveCards({ [OWNER]: fullCard() });
    expect(getCompleteCachedProfile(OWNER, { revision: 100 })).toBeNull();
  });

  it('складання списку бере проєкцію, коли повна анкета старша за версією', () => {
    saveCards({ [OWNER]: fullCard({ rev: 100, cachedAt: Date.now() }) });
    setCachedMatchingSummaryCards({ [OWNER]: { userId: OWNER, name: 'Оксана Нова', rev: 200, __matchingSummary: true } });
    flushPendingMatchingCacheWrites();
    const { cards } = composeCachedCards([OWNER]);
    expect(cards[OWNER].name).toBe('Оксана Нова');
  });

  it('на тій самій версії лишається повна анкета', () => {
    setCachedMatchingSummaryCards({ [OWNER]: { userId: OWNER, name: 'Оксана', rev: 100, __matchingSummary: true } });
    saveCards({ [OWNER]: fullCard({ rev: 100, cachedAt: Date.now() + 1 }) });
    const { cards } = composeCachedCards([OWNER]);
    expect(cards[OWNER].surname).toBe('Коваленко');
  });
});
