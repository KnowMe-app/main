import {
  buildProgramFilter,
  cardFitsProgramFilter,
  evaluateCardForProgram,
  readStoredProgramFilter,
  refreshProgramFilterSnapshot,
  storeProgramFilter,
} from './programCandidateFilter';
import { applyMatchingSearchKeyFilters } from './matchingDataProvider';
import { normalizeProgram } from './donorPrograms';
import { resolveCardAboutShort } from './matchingCardIndex';

const program = { id: 'p1', type: 'ed', requirements: { ageFrom: 20, ageTo: 30, rh: '+' } };
const filter = buildProgramFilter(program, 'Донор ооцитів · Київ');
const yearsAgo = years => `${new Date().getFullYear() - years}-01-01`;

describe('кандидатки під програму', () => {
  it('лишає анкети типу програми, що не порушують вимог', () => {
    expect(cardFitsProgramFilter({ role: 'ed', birth: yearsAgo(25), rh: '+' }, filter)).toBe(true);
    // Інший тип анкети — не кандидатка цієї програми.
    expect(cardFitsProgramFilter({ role: 'sm', birth: yearsAgo(25), rh: '+' }, filter)).toBe(false);
    // Порушена вимога — відсіює.
    expect(cardFitsProgramFilter({ role: 'ed', birth: yearsAgo(36), rh: '+' }, filter)).toBe(false);
    expect(cardFitsProgramFilter({ role: 'ed', birth: yearsAgo(25), rh: '-' }, filter)).toBe(false);
  });

  it('невідоме не відсіює, а каже, чого не вказано', () => {
    const card = { role: 'ed', birth: yearsAgo(25) };
    expect(cardFitsProgramFilter(card, filter)).toBe(true);
    const result = evaluateCardForProgram(card, filter);
    expect(result.uncertain).toBe(true);
    expect(result.checks.find(check => check.key === 'rh').ok).toBeNull();
  });

  it('фільтр стрічки звужує деку тим самим правилом', () => {
    const users = [
      { userId: 'a', role: 'ed', birth: yearsAgo(25), rh: '+' },
      { userId: 'b', role: 'ed', birth: yearsAgo(40), rh: '+' },
      { userId: 'c', role: 'ag' },
    ];
    expect(applyMatchingSearchKeyFilters(users, { program: filter }).map(user => user.userId)).toEqual(['a']);
    expect(applyMatchingSearchKeyFilters(users, {}).map(user => user.userId)).toEqual(['a', 'b', 'c']);
  });

  it('знімок оновлюється з програмою, а прибрана програма знімає фільтр', () => {
    expect(refreshProgramFilterSnapshot(filter, [program], () => filter.label)).toBe(filter);
    const changed = { ...program, requirements: { ageTo: 28 } };
    expect(refreshProgramFilterSnapshot(filter, [changed], () => filter.label).requirements).toEqual({ ageTo: 28 });
    expect(refreshProgramFilterSnapshot(filter, [{ ...program, id: 'other' }])).toBeNull();
  });

  it('памʼятається між перезавантаженнями', () => {
    storeProgramFilter(filter);
    expect(readStoredProgramFilter()).toEqual(filter);
    storeProgramFilter(null);
    expect(readStoredProgramFilter()).toBeNull();
  });
});

describe('кроки програми', () => {
  it('нормалізація лишає текст і тривалість, обрізає зайве', () => {
    const normalized = normalizeProgram({
      type: 'ed',
      steps: [{ text: ' Обстеження ', duration: '1–2 дні' }, { text: '' }, 'Пункція', ...Array(10).fill({ text: 'x' })],
    }, 'p');
    expect(normalized.steps.slice(0, 2)).toEqual([{ text: 'Обстеження', duration: '1–2 дні' }, { text: 'Пункція' }]);
    expect(normalized.steps).toHaveLength(6);
  });
});

describe('«Про нас» батьків у картці стрічки', () => {
  it('лише опублікованим батькам і скорочено', () => {
    expect(resolveCardAboutShort('Ми разом 9 років', ['ip'], '2026-11-15')).toBe('Ми разом 9 років');
    expect(resolveCardAboutShort('Ми разом 9 років', ['ip'], false)).toBeUndefined();
    expect(resolveCardAboutShort('Ми разом 9 років', ['ed'], '2026-11-15')).toBeUndefined();
    const long = resolveCardAboutShort('слово '.repeat(60), ['ip'], '2026-11-15');
    expect(long.length).toBeLessThanOrEqual(180);
    expect(long.endsWith('…')).toBe(true);
  });
});

describe('«Написати про цю програму» — лише безпечні посилання', () => {
  // eslint-disable-next-line global-require
  const { resolveProgramInquiryLink, isSafeInquiryHref } = require('./programInquiry');

  // Схема складається з частин: лінтер вважає рядок `javascript:` eval-ом.
  const scriptUrl = `${'java'}${'script'}:alert(1)`;

  it('не бере посилань з небезпечною схемою', () => {
    expect(isSafeInquiryHref(scriptUrl)).toBe(false);
    expect(isSafeInquiryHref('data:text/html,x')).toBe(false);
    expect(isSafeInquiryHref('https://t.me/agency')).toBe(true);
    expect(resolveProgramInquiryLink([{ key: 'otherLink', href: scriptUrl }], 'x')).toBeNull();
    expect(resolveProgramInquiryLink([{ key: 'telegram', href: scriptUrl }, { key: 'website', href: 'https://a.ua' }], 'x').href).toBe('https://a.ua');
  });

  it('пошта — лише адреса, без дописаних полів', () => {
    expect(resolveProgramInquiryLink([{ key: 'email', value: 'a@b.ua?cc=x@y.ua' }], 'x')).toBeNull();
    expect(resolveProgramInquiryLink([{ key: 'email', value: 'a@b.ua' }], 'x').href).toBe('mailto:a@b.ua?body=x');
  });
});
