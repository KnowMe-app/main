import {
  CARD_LIST_COLLECTIONS,
  CARD_LIST_MORE_COLLECTIONS,
  CARD_LIST_PRIMARY_COLLECTIONS,
  buildCardListQueryFromSelection,
  canonicalizeCardListQuery,
  collectionOffersPeriod,
  describeCardListSelection,
  getCardListCollection,
  listCardListPeriods,
  resolveCardListSelection,
} from '../cardListCollections';
import {
  CARD_LIST_PRESETS,
  buildCardListQueryKey,
  getCardListPreset,
  normalizeCardListQuery,
} from '../cardListQuery';

// «Що показати» на `AddNewProfile`. Панель говорила мовою двигуна (поле,
// напрямок, «без значення») і показувала ті самі «Обрані» тричі. Тут колекція
// — одна відповідь на «які картки», і з неї однозначно збирається запит.
describe('колекції «Списку»', () => {
  it('кожна колекція стоїть рівно в одному місці: на виду або в «Ще»', () => {
    const keys = CARD_LIST_COLLECTIONS.map(collection => collection.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect([...CARD_LIST_PRIMARY_COLLECTIONS, ...CARD_LIST_MORE_COLLECTIONS].map(item => item.key).sort())
      .toEqual([...keys].sort());
    expect(CARD_LIST_PRIMARY_COLLECTIONS.map(item => item.label))
      .toEqual(['Кому дзвонити', 'Обрані', 'Стрічка', 'Усі картки']);
  });

  it('кожна колекція пояснює себе одним реченням і має порядок', () => {
    CARD_LIST_COLLECTIONS.forEach(collection => {
      expect(collection.hint).toMatch(/\.$/);
      expect(collection.orders.length).toBeGreaterThan(0);
      collection.orders.forEach(order => expect(order.label).toBeTruthy());
    });
  });

  it('будь-який вибір дає запит, який двигун приймає без змін', () => {
    CARD_LIST_COLLECTIONS.forEach(collection => {
      collection.orders.forEach(order => {
        const periods = listCardListPeriods(collection, order);
        (periods.length ? periods : ['any']).forEach(period => {
          const query = buildCardListQueryFromSelection({ collection: collection.key, order: order.key, period });
          expect(normalizeCardListQuery(query)).toEqual(query);
          // І той самий запит показується тією самою колекцією й порядком.
          expect(resolveCardListSelection(query)).toMatchObject({ collection: collection.key, order: order.key });
        });
      });
    });
  });

  it('стрічка й обрані — ті самі запити, що й раніше', () => {
    expect(buildCardListQueryFromSelection({ collection: 'feed' })).toEqual(getCardListPreset('feed').query);
    expect(buildCardListQueryFromSelection({ collection: 'favorites' })).toEqual(getCardListPreset('favorites').query);
    expect(buildCardListQueryFromSelection({ collection: 'call' })).toEqual(getCardListPreset('call').query);
    expect(buildCardListQueryFromSelection({ collection: 'scheduled' })).toEqual(getCardListPreset('scheduled').query);
    expect(buildCardListQueryFromSelection({ collection: 'undated' })).toEqual(getCardListPreset('undated').query);
    expect(buildCardListQueryFromSelection({ collection: 'call', withMissing: true }))
      .toEqual(getCardListPreset('callAndUndated').query);
  });

  it('«Усі картки» — справді всі: без періоду картки без значення йдуть у кінець', () => {
    expect(buildCardListQueryFromSelection({ collection: 'all', order: 'activity' }))
      .toEqual({ field: 'lastAction', direction: 'desc', range: 'any', missing: 'after' });
    // З періодом карток без значення немає: у жоден період вони не потрапляють.
    expect(buildCardListQueryFromSelection({ collection: 'all', order: 'activity', period: 'last7' }))
      .toEqual({ field: 'lastAction', direction: 'desc', range: 'last7', missing: 'exclude' });
    expect(buildCardListQueryFromSelection({ collection: 'all', order: 'id' }))
      .toEqual({ field: 'cardKey', direction: 'asc', range: 'any', missing: 'exclude' });
  });

  it('період, якого поле порядку не вміє, не пропонується й не застосовується', () => {
    const all = getCardListCollection('all');
    const cycle = all.orders.find(order => order.key === 'cycle');
    expect(listCardListPeriods(all, cycle)).not.toContain('last7');
    expect(buildCardListQueryFromSelection({ collection: 'all', order: 'cycle', period: 'last7' }).range).toBe('any');
    const byId = all.orders.find(order => order.key === 'id');
    expect(collectionOffersPeriod(all, byId)).toBe(false);
  });

  it('свої дати переживають шлях вибір → запит → вибір', () => {
    const period = { from: '2026-10-01', to: '2026-10-20' };
    const query = buildCardListQueryFromSelection({ collection: 'favorites', order: 'oldest', period });
    expect(query.range).toEqual(period);
    expect(resolveCardListSelection(query)).toEqual({ collection: 'favorites', order: 'oldest', period, withMissing: false });
  });

  it('кожен колишній готовий запит знаходить свою колекцію', () => {
    const expected = {
      call: 'call',
      activity: 'all',
      feed: 'feed',
      favorites: 'favorites',
      scheduled: 'scheduled',
      callAndUndated: 'call',
      undated: 'undated',
      dislikes: 'dislikes',
      registered: 'all',
      logins: 'all',
    };
    CARD_LIST_PRESETS.forEach(preset => {
      expect(resolveCardListSelection(preset.query).collection).toBe(expected[preset.key]);
    });
    expect(resolveCardListSelection(getCardListPreset('callAndUndated').query).withMissing).toBe(true);
    expect(resolveCardListSelection(getCardListPreset('logins').query).order).toBe('login');
  });

  it('запит поза колекціями стає найближчим вибором', () => {
    // «Останній вхід від давніших» колекції не має — лишається поле.
    expect(canonicalizeCardListQuery({ field: 'lastLogin', direction: 'asc', range: 'any', missing: 'exclude' }))
      .toEqual({ field: 'lastLogin', direction: 'desc', range: 'any', missing: 'after' });
    // Те, що вже в колекції, не міняється.
    const feed = getCardListPreset('feed').query;
    expect(buildCardListQueryKey(canonicalizeCardListQuery(feed))).toBe(buildCardListQueryKey(feed));
  });

  it('список словами називає порядок і період лише там, де був вибір', () => {
    expect(describeCardListSelection({ collection: 'call' })).toBe('Кому дзвонити · Спершу сьогоднішні');
    expect(describeCardListSelection({ collection: 'favorites', order: 'oldest', period: 'last30' }))
      .toBe('Обрані · Давно вподобані · за 30 днів');
    expect(describeCardListSelection({ collection: 'undated' })).toBe('Без дати дзвінка');
    expect(describeCardListSelection({ collection: 'call', withMissing: true }))
      .toBe('Кому дзвонити · Спершу сьогоднішні · + без дати');
  });
});
