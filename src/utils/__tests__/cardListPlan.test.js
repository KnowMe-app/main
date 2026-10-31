import {
  CARD_LIST_PRESETS,
  DEFAULT_CARD_LIST_PLAN,
  applyCardListPreset,
  buildCardListPlanKey,
  describeCardListPlan,
  normalizeCardListPlan,
  planAcceptsGetInTouch,
  planFromLegacyLoadSortMode,
  resolveLastActionLowerBound,
} from '../cardListPlan';
import { classifyGetInTouchMark } from '../reactionCategory';

const isoDaysFromToday = shift => {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + shift);
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

describe('стан позначки getInTouch', () => {
  it('ділить позначки так само, як фільтр реакцій', () => {
    expect(classifyGetInTouchMark(isoDaysFromToday(0))).toBe('due');
    expect(classifyGetInTouchMark(isoDaysFromToday(-30))).toBe('due');
    expect(classifyGetInTouchMark(isoDaysFromToday(1))).toBe('future');
    expect(classifyGetInTouchMark('2099-99-99')).toBe('never');
    expect(classifyGetInTouchMark('99.99.9999')).toBe('never');
    expect(classifyGetInTouchMark('')).toBe('undated');
    expect(classifyGetInTouchMark(undefined)).toBe('undated');
    expect(classifyGetInTouchMark('99')).toBe('undated');
    expect(classifyGetInTouchMark('2026-13-40')).toBe('undated');
  });
});

describe('план списку', () => {
  it('умовчання — «Кому дзвонити» з індексом, кешем і сторінкою наперед', () => {
    expect(normalizeCardListPlan(undefined)).toEqual(DEFAULT_CARD_LIST_PLAN);
    expect(describeCardListPlan(DEFAULT_CARD_LIST_PLAN)).toBe('Кому дзвонити');
  });

  it('порожній набір станів повертається до умовчання, а не обходить базу заради нічого', () => {
    const plan = normalizeCardListPlan({ segments: { due: false, future: false, undated: false, never: false } });
    expect(plan.segments).toEqual(DEFAULT_CARD_LIST_PLAN.segments);
  });

  it('пресет ставить склад і порядок, а як вантажити лишає адмінові', () => {
    const custom = normalizeCardListPlan({ ...DEFAULT_CARD_LIST_PLAN, indexPrefilter: false, cacheFirst: false });
    const activity = applyCardListPreset(custom, 'activity');

    expect(activity.byLastAction).toBe(true);
    expect(Object.values(activity.segments).every(Boolean)).toBe(true);
    expect(activity.indexPrefilter).toBe(false);
    expect(activity.cacheFirst).toBe(false);
    expect(describeCardListPlan(activity)).toBe('Остання дія');
  });

  it('довільний набір називається станами', () => {
    const plan = normalizeCardListPlan({ segments: { due: true, future: true } });
    expect(describeCardListPlan(plan)).toBe('Кому дзвонити + Заплановані');
    expect(describeCardListPlan({ ...plan, byLastAction: true, fromFiles: true }))
      .toBe('Кому дзвонити + Заплановані · за останньою дією · JSON');
  });

  it('ключ результату не залежить від того, як вантажити', () => {
    const base = normalizeCardListPlan({ segments: { due: true, undated: true } });
    expect(buildCardListPlanKey({ ...base, cacheFirst: false, prefetch: false, indexPrefilter: false }))
      .toBe(buildCardListPlanKey(base));
    expect(buildCardListPlanKey({ ...base, byLastAction: true })).not.toBe(buildCardListPlanKey(base));
  });

  it('картка належить списку за станом своєї позначки', () => {
    expect(planAcceptsGetInTouch(DEFAULT_CARD_LIST_PLAN, isoDaysFromToday(0))).toBe(true);
    expect(planAcceptsGetInTouch(DEFAULT_CARD_LIST_PLAN, isoDaysFromToday(3))).toBe(false);
    expect(planAcceptsGetInTouch({ segments: { due: true, future: true } }, isoDaysFromToday(3))).toBe(true);
  });
});

describe('колишні режими', () => {
  it.each([
    ['GITnew', 'call'],
    ['GIT', 'call'],
    ['SearchIdKeyOnly', 'call'],
    ['NoGIT', 'notScheduled'],
    ['LA', 'activity'],
    ['LA2', 'activity'],
  ])('%s відкривається як «%s»', (mode, presetKey) => {
    const preset = CARD_LIST_PRESETS.find(item => item.key === presetKey);
    const plan = planFromLegacyLoadSortMode(mode);
    expect(plan.segments).toEqual(normalizeCardListPlan(preset.plan).segments);
    expect(plan.byLastAction).toBe(Boolean(preset.plan.byLastAction));
    expect(plan.fromFiles).toBe(false);
  });

  it('офлайн-режим — «Кому дзвонити» з переліком із файлів', () => {
    expect(planFromLegacyLoadSortMode('offline')).toMatchObject({ fromFiles: true, segments: { due: true } });
    expect(planFromLegacyLoadSortMode('ofline')).toMatchObject({ fromFiles: true });
  });

  it('невідомий режим нічого не вигадує', () => {
    expect(planFromLegacyLoadSortMode('whatever')).toBeNull();
  });
});

describe('межа запиту за останньою дією', () => {
  const now = new Date(2026, 9, 31, 15, 0, 0);
  const startOfDaysAgo = days => new Date(2026, 9, 31 - days).getTime();

  it('незайманий фільтр межі не ставить', () => {
    expect(resolveLastActionLowerBound(undefined, now)).toBeNull();
    expect(resolveLastActionLowerBound({ today: true, last7days: true, no: true }, now)).toBeNull();
  });

  it('найширший обраний діапазон стає межею запиту', () => {
    expect(resolveLastActionLowerBound({ today: true, last7days: true, last30days: false, no: false }, now))
      .toBe(startOfDaysAgo(7));
    expect(resolveLastActionLowerBound({ yesterday: true, today: false, no: false }, now)).toBe(startOfDaysAgo(1));
  });

  it('«порожньо» й «невідомий формат» у межу не вкладаються', () => {
    expect(resolveLastActionLowerBound({ today: true, no: true, last7days: false }, now)).toBeNull();
    expect(resolveLastActionLowerBound({ today: true, '?': true, last7days: false }, now)).toBeNull();
  });
});
