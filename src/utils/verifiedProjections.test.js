// Проєкція з кешу живе понад TTL лише тоді, коли журнал змін синхронізовано, а
// її відбиток — той, що прийшов з бази востаннє. Стара копія, яку стрічка
// поклала б у кеш зі свого стану, такого відбитка не має.
import {
  VERIFIED_PROJECTION_HASH_FIELD,
  __resetCardChangesSessionForTests,
  hashProjection,
  isProjectionVerified,
  rememberVerifiedProjection,
  syncCardChanges,
} from './matchingCardChanges';
import {
  composeCachedCards,
  flushPendingMatchingCacheWrites,
  getCachedMatchingSummaryCards,
  resetMatchingLocalStorageCache,
  setCachedMatchingSummaryCards,
  setProjectionFreshnessCheck,
} from './cardIndex';

const VIEWER = 'viewerUid000000000000000000';
const SEVEN_HOURS = 7 * 60 * 60 * 1000;

const syncTrusted = changed => {
  localStorage.setItem(`km.matchingCardChanges.v1:${VIEWER}`, JSON.stringify({ lastSync: Date.now() - 60_000 }));
  return syncCardChanges({
    viewerId: VIEWER,
    readChangesSince: async () => changed.map(id => ({ id, at: Date.now() - 1000 })),
    forgetCardBodies: () => {},
  });
};

beforeEach(() => {
  __resetCardChangesSessionForTests();
  resetMatchingLocalStorageCache('test');
  localStorage.clear();
  localStorage.setItem('ownerId', VIEWER);
  setProjectionFreshnessCheck((id, card) => isProjectionVerified(VIEWER, id, card));
});

afterEach(() => {
  setProjectionFreshnessCheck(null);
  jest.restoreAllMocks();
});

const verifiedCard = (id, raw) => {
  const hash = hashProjection(raw);
  rememberVerifiedProjection(VIEWER, id, hash);
  return { userId: id, ...raw, __matchingSummary: true, [VERIFIED_PROJECTION_HASH_FIELD]: hash };
};

describe('відбиток проєкції', () => {
  it('однаковий для однакового вмісту, хоч би який порядок ключів', () => {
    expect(hashProjection({ a: 1, b: { c: 2, d: 3 } })).toBe(hashProjection({ b: { d: 3, c: 2 }, a: 1 }));
    expect(hashProjection({ a: 1 })).not.toBe(hashProjection({ a: 2 }));
  });
});

describe('проєкція понад TTL', () => {
  const ageSummary = id => {
    const stored = JSON.parse(localStorage.getItem('matchingSummaryCards'));
    stored.items[id].cachedAt = Date.now() - SEVEN_HOURS;
    localStorage.setItem('matchingSummaryCards', JSON.stringify(stored));
    resetMatchingLocalStorageCache('reload');
    localStorage.setItem('matchingSummaryCards', JSON.stringify(stored));
  };

  it('перевірена й незмінена — з кешу і через сім годин', async () => {
    setCachedMatchingSummaryCards({ a: verifiedCard('a', { name: 'Оксана', rev: 1 }) });
    flushPendingMatchingCacheWrites();
    ageSummary('a');
    await syncTrusted([]);
    expect(getCachedMatchingSummaryCards(['a']).missingIds).toEqual([]);
    expect(composeCachedCards(['a']).missingIds).toEqual([]);
  });

  it('без синхронізації журналу — лише TTL', () => {
    setCachedMatchingSummaryCards({ a: verifiedCard('a', { name: 'Оксана', rev: 1 }) });
    flushPendingMatchingCacheWrites();
    ageSummary('a');
    expect(getCachedMatchingSummaryCards(['a']).missingIds).toEqual(['a']);
  });

  it('журнал назвав картку зміненою — відбиток забуто, проєкція перечитується', async () => {
    setCachedMatchingSummaryCards({ a: verifiedCard('a', { name: 'Оксана', rev: 1 }) });
    flushPendingMatchingCacheWrites();
    ageSummary('a');
    await syncTrusted(['a']);
    expect(getCachedMatchingSummaryCards(['a']).missingIds).toEqual(['a']);
  });

  it('стара копія, покладена в кеш після нового читання, довіри не має', async () => {
    const stale = verifiedCard('a', { name: 'Стара', rev: 1 });
    verifiedCard('a', { name: 'Нова', rev: 2 }); // нове читання з бази — новий відбиток
    setCachedMatchingSummaryCards({ a: stale });
    flushPendingMatchingCacheWrites();
    ageSummary('a');
    await syncTrusted([]);
    expect(getCachedMatchingSummaryCards(['a']).missingIds).toEqual(['a']);
  });

  it('проєкція без відбитка (з памʼяті, а не з бази) — лише TTL', async () => {
    setCachedMatchingSummaryCards({ a: { userId: 'a', name: 'Оксана', __matchingSummary: true } });
    flushPendingMatchingCacheWrites();
    ageSummary('a');
    await syncTrusted([]);
    expect(getCachedMatchingSummaryCards(['a']).missingIds).toEqual(['a']);
  });
});
