import { toggleFilterOption } from './CheckboxGroup';

const options = [{ val: 'married' }, { val: 'unmarried' }, { val: 'other' }];
const all = { married: true, unmarried: true, other: true };

// Дотик до чіпа — це вибір того, що читача цікавить. Доти дотик до
// «не заміжня» в незайманій групі вимикав саме її, і вибраними лишались усі
// інші — рівно навпаки до того, що людина мала на увазі.
describe('чіп фільтра стрічки обирає, а не вимикає', () => {
  it('з незайманої групи лишає увімкненим саме натиснуте', () => {
    expect(toggleFilterOption({ groupValues: all, options, option: 'unmarried', selectOnly: true }))
      .toEqual({ married: false, unmarried: true, other: false });
  });

  it('далі додає й знімає значення по одному', () => {
    const only = { married: false, unmarried: true, other: false };
    expect(toggleFilterOption({ groupValues: only, options, option: 'married', selectOnly: true }))
      .toEqual({ married: true, unmarried: true, other: false });
  });

  it('зняте останнє повертає групу в незайманий стан, а не в «нічого»', () => {
    const only = { married: false, unmarried: true, other: false };
    expect(toggleFilterOption({ groupValues: only, options, option: 'unmarried', selectOnly: true }))
      .toEqual(all);
  });

  it('не чіпає прихованих значень групи', () => {
    const withHidden = { ...all, ed: true };
    expect(toggleFilterOption({ groupValues: withHidden, options, option: 'other', selectOnly: true }))
      .toEqual({ married: false, unmarried: false, other: true, ed: true });
  });

  it('без прапорця лишається відніманням (картотека адміна)', () => {
    expect(toggleFilterOption({ groupValues: all, options, option: 'unmarried' }))
      .toEqual({ married: true, unmarried: false, other: true });
  });
});
