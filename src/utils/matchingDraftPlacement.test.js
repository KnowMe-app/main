import {
  DRAFT_FEED_ORDER_FIELD,
  placeOwnDraftsInFeed,
  resolveDraftFeedOrderDate,
  toFeedDateKey,
} from './matchingDraftPlacement';

const card = (userId, lastLogin2) => ({ userId, lastLogin2 });
const draft = (userId, date) => ({ userId, [DRAFT_FEED_ORDER_FIELD]: date });
const ids = list => list.map(item => item.userId);

describe('власна чернетка в стрічці', () => {
  const feed = [card('a', '2026-09-20'), card('b', '2026-09-10'), card('c', '2026-09-01')];

  it('стоїть за датою, а не нагорі: новіші картки йдуть перед нею', () => {
    const result = placeOwnDraftsInFeed({ drafts: [draft('-d', '2026-09-15')], users: feed, hasMore: true });
    expect(ids(result)).toEqual(['a', '-d', 'b', 'c']);
  });

  it('новіша за всю стрічку — перша', () => {
    const result = placeOwnDraftsInFeed({ drafts: [draft('-d', '2026-09-25')], users: feed, hasMore: true });
    expect(ids(result)).toEqual(['-d', 'a', 'b', 'c']);
  });

  it('старша за все завантажене чекає, доки стрічка має сторінки', () => {
    const drafts = [draft('-old', '2026-08-01')];
    expect(ids(placeOwnDraftsInFeed({ drafts, users: feed, hasMore: true }))).toEqual(['a', 'b', 'c']);
    expect(ids(placeOwnDraftsInFeed({ drafts, users: feed, hasMore: false }))).toEqual(['a', 'b', 'c', '-old']);
  });

  it('кілька чернеток розкладає кожну на її місце', () => {
    const drafts = [draft('-x', '2026-09-05'), draft('-y', '2026-09-22')];
    expect(ids(placeOwnDraftsInFeed({ drafts, users: feed, hasMore: true }))).toEqual(['-y', 'a', 'b', '-x', 'c']);
  });

  it('бере дату створення запису, якщо своєї дати стрічки чернетка не має', () => {
    const createdAt = new Date(2026, 8, 12, 15, 0).getTime();
    expect(resolveDraftFeedOrderDate({}, { createdAt })).toBe('2026-09-12');
    expect(resolveDraftFeedOrderDate({ lastLogin2: '2026-09-03' }, { createdAt })).toBe('2026-09-03');
    expect(toFeedDateKey(undefined)).toBe('');
  });
});
