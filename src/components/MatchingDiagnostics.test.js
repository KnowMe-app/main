import { buildPhoneIndex, collectProfileIssues, normalizePhoneDigits } from './MatchingDiagnostics';

const thisYear = new Date().getFullYear();
// The helper picks a day already past this year, so the computed age is exact.
const birthFor = age => `15.01.${thisYear - age}`;

describe('matching admin diagnostics', () => {
  it('reports a profile with no photo', () => {
    expect(collectProfileIssues({ userId: 'a', birth: birthFor(30), phone: '380501112233' }))
      .toContain('немає жодного фото');
  });

  it('reports a missing birth date', () => {
    expect(collectProfileIssues({ userId: 'a', photos: ['p.jpg'], phone: '380501112233' }))
      .toContain('немає дати народження');
  });

  it('reports an age field that disagrees with the birth date', () => {
    const issues = collectProfileIssues({
      userId: 'a', photos: ['p.jpg'], phone: '380501112233', birth: birthFor(30), age: '41',
    });
    expect(issues.some(issue => issue.startsWith('вік 41 ≠ 30'))).toBe(true);
  });

  it('accepts an age field that matches the birth date', () => {
    const issues = collectProfileIssues({
      userId: 'a', photos: ['p.jpg'], phone: '380501112233', birth: birthFor(30), age: '30',
    });
    expect(issues).toEqual([]);
  });

  it('reports a BMI outside the ±0.5 tolerance and accepts one inside it', () => {
    const base = { userId: 'a', photos: ['p.jpg'], phone: '380501112233', birth: birthFor(30), height: '170', weight: '60' };
    // 60 / 1.7^2 = 20.76
    expect(collectProfileIssues({ ...base, bmi: '20.9' })).toEqual([]);
    expect(collectProfileIssues({ ...base, bmi: '25' })
      .some(issue => issue.startsWith('BMI 25 ≠'))).toBe(true);
  });

  it('reports a profile with no contact at all', () => {
    expect(collectProfileIssues({ userId: 'a', photos: ['p.jpg'], birth: birthFor(30) }))
      .toContain('немає жодного контакту');
  });

  it('reports a phone shared with another profile in the set', () => {
    const users = [
      { userId: 'a', photos: ['p.jpg'], birth: birthFor(30), phone: '+38 (050) 111-22-33' },
      { userId: 'b', photos: ['p.jpg'], birth: birthFor(30), phone: '380501112233' },
      { userId: 'c', photos: ['p.jpg'], birth: birthFor(30), phone: '380509998877' },
    ];
    const phoneIndex = buildPhoneIndex(users);
    expect(collectProfileIssues(users[0], { phoneIndex })).toContain('телефон дублює інший профіль');
    expect(collectProfileIssues(users[1], { phoneIndex })).toContain('телефон дублює інший профіль');
    expect(collectProfileIssues(users[2], { phoneIndex })).toEqual([]);
  });

  it('reports a row that the active filter should have excluded', () => {
    const user = { userId: 'a', photos: ['p.jpg'], birth: birthFor(30), phone: '380501112233' };
    expect(collectProfileIssues(user, { failsActiveFilter: true }))
      .toContain('не проходить активний фільтр, але у видачі');
  });

  it('normalises phone digits so formatting differences still collide', () => {
    expect(normalizePhoneDigits('+38 (050) 111-22-33')).toBe('380501112233');
    expect(normalizePhoneDigits('0501112233')).toBe('501112233');
    expect(normalizePhoneDigits('')).toBe('');
  });
});
