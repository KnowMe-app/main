import {
  isProfileFieldPresent,
  rankFieldsByFillStats,
  resolveFieldFillRate,
  splitProfileFormFields,
} from './profileFieldChips';

const field = name => ({ name });

describe('isProfileFieldPresent', () => {
  it('порожній рядок — значення: стерте поле лишається полем', () => {
    expect(isProfileFieldPresent('')).toBe(true);
    expect(isProfileFieldPresent(['168', ''])).toBe(true);
    expect(isProfileFieldPresent(false)).toBe(true);
    expect(isProfileFieldPresent(0)).toBe(true);
  });

  it('відсутнє поле — чіп', () => {
    expect(isProfileFieldPresent(undefined)).toBe(false);
    expect(isProfileFieldPresent(null)).toBe(false);
    expect(isProfileFieldPresent([])).toBe(false);
    expect(isProfileFieldPresent([null])).toBe(false);
    expect(isProfileFieldPresent({})).toBe(false);
  });
});

describe('rankFieldsByFillStats', () => {
  const stats = {
    totals: { all: 100, ed: 50, ag: 5 },
    fields: {
      height: { all: 40, ed: 45 },
      telegram: { all: 70, ed: 10, ag: 5 },
      birth: { all: 60, ed: 30 },
    },
  };

  it('без статистики — порядок форми', () => {
    const fields = [field('a'), field('b')];
    expect(rankFieldsByFillStats(fields, null)).toBe(fields);
  });

  it('частка серед карток тієї самої ролі важить більше за загальну', () => {
    const ranked = rankFieldsByFillStats([field('telegram'), field('birth'), field('height')], stats, ['ed']);
    expect(ranked.map(item => item.name)).toEqual(['height', 'birth', 'telegram']);
  });

  it('рідкісна роль не дає частки — береться загальна', () => {
    expect(resolveFieldFillRate('telegram', stats, ['ag'])).toBeCloseTo(0.7);
    const ranked = rankFieldsByFillStats([field('height'), field('birth'), field('telegram')], stats, ['ag']);
    expect(ranked.map(item => item.name)).toEqual(['telegram', 'birth', 'height']);
  });

  it('поле без статистики стоїть після решти, у порядку форми', () => {
    const ranked = rankFieldsByFillStats([field('x'), field('height'), field('y')], stats, []);
    expect(ranked.map(item => item.name)).toEqual(['height', 'x', 'y']);
  });
});

describe('splitProfileFormFields', () => {
  it('ділить на поля й чіпи; відкрите чіпом і видані екрани — полем', () => {
    const fields = ['name', 'height', 'birth', 'screenAccess', 'city'].map(field);
    const state = { name: 'Оля', height: ['168', ''] };
    const { shown, chips } = splitProfileFormFields(fields, state, { keepShown: new Set(['city']) });
    expect(shown.map(item => item.name)).toEqual(['name', 'height', 'screenAccess', 'city']);
    expect(chips.map(item => item.name)).toEqual(['birth']);
  });
});
