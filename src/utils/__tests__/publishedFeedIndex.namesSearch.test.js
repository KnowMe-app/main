import { parsePublishedFeedIndex, searchPublishedIndexByName } from 'utils/publishedFeedIndex';

describe('searchPublishedIndexByName', () => {
  const index = parsePublishedFeedIndex({
    _built: 1,
    a: { d: '2026-11-01', r: 'ed', n: 'олена' },
    b: { d: '2026-11-10', r: 'ag', n: 'surrohelp|surrohelp kyiv' },
    c: { d: '2026-11-05', r: 'ed', n: 'ольга' },
    d: { d: '2026-11-12', r: 'ed' },
  });

  it('частина імені знаходить опубліковані, новіші першими', () => {
    expect(searchPublishedIndexByName(index, ['Ол'])).toEqual(['c', 'a']);
    expect(searchPublishedIndexByName(index, ['Олен'])).toEqual(['a']);
  });

  it('назва агенції й слово всередині неї', () => {
    expect(searchPublishedIndexByName(index, ['surro'])).toEqual(['b']);
    expect(searchPublishedIndexByName(index, ['kyiv'])).toEqual(['b']);
  });

  it('варіанти написання й коротке набране', () => {
    expect(searchPublishedIndexByName(index, ['olga', 'ольга'])).toEqual(['c']);
    expect(searchPublishedIndexByName(index, ['о'])).toEqual([]);
    expect(searchPublishedIndexByName(null, ['ольга'])).toEqual([]);
  });

  it('старий перелік без імен не ламається', () => {
    expect(index.entries.get('d').names).toEqual([]);
  });
});
