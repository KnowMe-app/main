import {
  CARD_LIST_FIELDS,
  CARD_LIST_PRESETS,
  DEFAULT_CARD_LIST_QUERY,
  buildCardListQueryKey,
  cardListKeepsValue,
  describeCardListQuery,
  findCardListPreset,
  isFieldValueMissing,
  normalizeCardListQuery,
  queryFromLegacyListState,
  readFieldDate,
  resolveCardListRange,
} from '../cardListQuery';

const NOW = new Date(2026, 9, 31, 15, 0, 0);
const iso = days => {
  const date = new Date(2026, 9, 31 + days);
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

describe('запит списку', () => {
  it('за замовчуванням — «Кому дзвонити»', () => {
    expect(DEFAULT_CARD_LIST_QUERY).toEqual({ field: 'getInTouch', direction: 'desc', range: 'upToToday', missing: 'exclude' });
    expect(describeCardListQuery(DEFAULT_CARD_LIST_QUERY)).toBe('Кому дзвонити');
  });

  it('невідоме поле, напрямок чи діапазон повертаються до умовчання поля', () => {
    expect(normalizeCardListQuery({ field: 'nope' }).field).toBe('getInTouch');
    expect(normalizeCardListQuery({ field: 'lastAction', range: 'upToToday' }).range).toBe('any');
    expect(normalizeCardListQuery({ field: 'cardKey', direction: 'sideways' }).direction).toBe('asc');
  });

  it('«без значення» лишається лише там, де поле його має', () => {
    expect(normalizeCardListQuery({ field: 'favorite', missing: 'after' }).missing).toBe('exclude');
    expect(normalizeCardListQuery({ field: 'lastAction', missing: 'only' }).missing).toBe('only');
  });

  it('свої дати впорядковуються, а сміття замість дати відкидається', () => {
    expect(normalizeCardListQuery({ field: 'lastLogin', range: { from: '2026-10-20', to: '2026-10-01' } }).range)
      .toEqual({ from: '2026-10-01', to: '2026-10-20' });
    expect(normalizeCardListQuery({ field: 'lastLogin', range: { from: 'вчора' } }).range).toBe('any');
  });

  it('ключ складу не залежить від порядку полів і від умовчань', () => {
    expect(buildCardListQueryKey({ missing: 'exclude', field: 'getInTouch' }))
      .toBe(buildCardListQueryKey(DEFAULT_CARD_LIST_QUERY));
    expect(buildCardListQueryKey({ field: 'getInTouch', direction: 'asc' }))
      .not.toBe(buildCardListQueryKey(DEFAULT_CARD_LIST_QUERY));
  });

  it('довільний запит називається полем, напрямком і діапазоном', () => {
    expect(describeCardListQuery({ field: 'lastAction', direction: 'asc', range: 'last30' })).toBe('Остання дія ↑ · за 30 днів');
    expect(describeCardListQuery({ field: 'feedDate', missing: 'only' })).toBe('Публікація: неопубліковані');
    expect(describeCardListQuery({ field: 'lastAction', missing: 'after' })).toBe('Остання дія ↓ · + без жодної дії');
  });

  it('кожне поле має підпис, тип і джерело', () => {
    CARD_LIST_FIELDS.forEach(field => {
      expect(field.label).toBeTruthy();
      expect(['date', 'timestamp', 'key']).toContain(field.type);
      expect(['ownerValue', 'ownerMap', 'child', 'key']).toContain(field.source.kind);
      expect(field.ranges).toContain(field.defaultRange);
    });
  });
});

describe('діапазони', () => {
  it('«до сьогодні» в даті дзвінка — сьогодні й раніше, без «99» і нотаток', () => {
    const range = resolveCardListRange({ field: 'getInTouch', range: 'upToToday' }, NOW);
    expect(range.bounds).toEqual({ to: iso(0) });
    expect(range.accepts(iso(0))).toBe(true);
    expect(range.accepts(iso(-40))).toBe(true);
    expect(range.accepts(iso(1))).toBe(false);
    expect(range.accepts('2099-99-99')).toBe(false);
    expect(range.accepts('99')).toBe(false);
    // Стара крапкова форма — теж дата.
    expect(range.accepts('01.10.2026')).toBe(true);
  });

  it('«99» — окремий діапазон', () => {
    const range = resolveCardListRange({ field: 'getInTouch', range: 'never' }, NOW);
    expect(range.accepts('2099-99-99')).toBe(true);
    expect(range.accepts(iso(0))).toBe(false);
  });

  it('мітки часу отримують межі в мс від початку дня', () => {
    const range = resolveCardListRange({ field: 'lastAction', range: 'last7' }, NOW);
    expect(range.bounds.from).toBe(new Date(2026, 9, 24).getTime());
    expect(range.accepts(new Date(2026, 9, 30).getTime())).toBe(true);
    expect(range.accepts(new Date(2026, 9, 1).getTime())).toBe(false);
  });

  it('старі вподобання без часу видно в «будь-коли», але не в діапазоні часу', () => {
    expect(resolveCardListRange({ field: 'favorite', range: 'any' }, NOW).accepts(true)).toBe(true);
    expect(resolveCardListRange({ field: 'favorite', range: 'any' }, NOW).accepts('ed')).toBe(true);
    expect(resolveCardListRange({ field: 'favorite', range: 'last7' }, NOW).accepts(true)).toBe(false);
  });
});

describe('картка без значення і вихід картки зі списку', () => {
  it('для дати дзвінка «немає» — це порожньо або не дата, але не «99»', () => {
    expect(isFieldValueMissing('getInTouch', undefined)).toBe(true);
    expect(isFieldValueMissing('getInTouch', '')).toBe(true);
    expect(isFieldValueMissing('getInTouch', 'дзвонила')).toBe(true);
    expect(isFieldValueMissing('getInTouch', '2099-99-99')).toBe(false);
    expect(isFieldValueMissing('getInTouch', iso(0))).toBe(false);
  });

  it('дата дзвінка на тиждень уперед виводить картку з «Кому дзвонити»', () => {
    expect(cardListKeepsValue(DEFAULT_CARD_LIST_QUERY, 'getInTouch', iso(7), NOW)).toBe(false);
    expect(cardListKeepsValue(DEFAULT_CARD_LIST_QUERY, 'getInTouch', iso(0), NOW)).toBe(true);
    // Стерта дата лишає картку лише там, де показують і картки без дати.
    expect(cardListKeepsValue(DEFAULT_CARD_LIST_QUERY, 'getInTouch', '', NOW)).toBe(false);
    expect(cardListKeepsValue({ ...DEFAULT_CARD_LIST_QUERY, missing: 'after' }, 'getInTouch', '', NOW)).toBe(true);
  });

  it('зміна іншого поля карток списку не чіпає', () => {
    expect(cardListKeepsValue({ field: 'lastAction' }, 'getInTouch', iso(7), NOW)).toBe(true);
  });
});

describe('готові запити й колишні режими', () => {
  it('кожен готовий запит упізнається за складом', () => {
    CARD_LIST_PRESETS.forEach(preset => {
      expect(findCardListPreset(preset.query)?.key).toBe(preset.key);
    });
  });

  it.each([
    [{ loadSortMode: 'GITnew' }, 'call'],
    [{ loadSortMode: 'GIT' }, 'call'],
    [{ loadSortMode: 'SearchIdKeyOnly' }, 'call'],
    [{ loadSortMode: 'offline' }, 'call'],
    [{ loadSortMode: 'NoGIT' }, 'callAndUndated'],
    [{ loadSortMode: 'LA' }, 'activity'],
    [{ loadSortMode: 'LA2' }, 'activity'],
    [{ currentFilter: 'FEED_DATE' }, 'feed'],
    [{ currentFilter: 'FAVORITE' }, 'favorites'],
  ])('%p відкривається як «%s»', (legacy, presetKey) => {
    expect(findCardListPreset(queryFromLegacyListState(legacy))?.key).toBe(presetKey);
  });

  it('невідомий стан нічого не вигадує', () => {
    expect(queryFromLegacyListState({ loadSortMode: 'whatever' })).toBeNull();
  });

  it('дата поля читається і з крапкової форми, а неіснуючий день — ні', () => {
    expect(readFieldDate('31.10.2026')).toBe('2026-10-31');
    expect(readFieldDate('2026-02-30')).toBeNull();
  });
});
