import {
  FLOW_RECENT_CATEGORIES_LIMIT,
  lastFlowSubgroupFor,
  listFlowRecentShortcuts,
  pushFlowRecentCategory,
  readFlowRecentCategories,
  sortFlowGroupsByRecent,
  sortFlowPathsByRecent,
  sortFlowSubgroupsByRecent,
  writeFlowRecentCategories,
} from './flowRecentCategories';

describe('flowRecentCategories', () => {
  beforeEach(() => localStorage.clear());

  it('ставить шлях першим без дублів і з межею', () => {
    let recent = [];
    recent = pushFlowRecentCategory(recent, 'Дім/Ремонт');
    recent = pushFlowRecentCategory(recent, 'Авто');
    recent = pushFlowRecentCategory(recent, 'Дім/Ремонт');
    expect(recent).toEqual(['Дім/Ремонт', 'Авто']);
    for (let i = 0; i < 50; i += 1) recent = pushFlowRecentCategory(recent, `G${i}`);
    expect(recent).toHaveLength(FLOW_RECENT_CATEGORIES_LIMIT);
    expect(pushFlowRecentCategory(recent, '  ')).toBe(recent);
  });

  it('памʼятає на пристрої окремо для кожного власника', () => {
    writeFlowRecentCategories('a', ['Дім']);
    expect(readFlowRecentCategories('a')).toEqual(['Дім']);
    expect(readFlowRecentCategories('b')).toEqual([]);
    localStorage.setItem('flow-recent-categories:c', '{bad');
    expect(readFlowRecentCategories('c')).toEqual([]);
  });

  it('сортує групи, підгрупи й шляхи: нещодавні нагорі, решта абеткою', () => {
    const recent = ['Дім/Ремонт', 'Авто', 'Дім/Меблі'];
    expect(sortFlowGroupsByRecent(['Авто', 'Їжа', 'Дім', 'Борги'], recent)).toEqual(['Дім', 'Авто', 'Борги', 'Їжа']);
    expect(sortFlowSubgroupsByRecent('Дім', ['Вода', 'Меблі', 'Ремонт'], recent)).toEqual(['Ремонт', 'Меблі', 'Вода']);
    expect(sortFlowPathsByRecent(['Авто', 'Дім', 'Дім/Меблі', 'Дім/Ремонт'], recent))
      .toEqual(['Дім/Ремонт', 'Авто', 'Дім/Меблі', 'Дім']);
  });

  it('повертає останню підгрупу групи', () => {
    const recent = ['Авто', 'Дім/Ремонт', 'Дім'];
    expect(lastFlowSubgroupFor('Дім', recent)).toBe('Ремонт');
    expect(lastFlowSubgroupFor('Авто', recent)).toBe('');
    expect(lastFlowSubgroupFor('Їжа', recent)).toBeNull();
    // Підгрупи вже немає — береться наступний запис про групу.
    expect(lastFlowSubgroupFor('Дім', recent, ['Вода'])).toBe('');
  });

  it('ярлики — лише шляхи, що досі існують', () => {
    expect(listFlowRecentShortcuts(['Старе', 'Дім/Ремонт', 'Авто'], ['Авто', 'Дім/Ремонт'], 1)).toEqual(['Дім/Ремонт']);
  });
});
