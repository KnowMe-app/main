import { buildCandidateAnketaLink, CANDIDATE_ANKETA_ROLES, readCandidateRoleFromSearch } from './candidateAnketa';

describe('посилання на анкету для кандидаток', () => {
  it('пропонує лише донорку й СМ', () => {
    expect(CANDIDATE_ANKETA_ROLES).toEqual(['sm', 'ed']);
  });

  it('читає роль з адреси, зокрема людськими словами', () => {
    expect(readCandidateRoleFromSearch('?role=sm')).toBe('sm');
    expect(readCandidateRoleFromSearch('?role=ED')).toBe('ed');
    expect(readCandidateRoleFromSearch('?role=%D1%81%D0%BC')).toBe('sm');
    expect(readCandidateRoleFromSearch('?role=%D0%B4%D0%BE')).toBe('ed');
    expect(readCandidateRoleFromSearch('?role=donor')).toBe('ed');
  });

  // Агенцію, клініку чи батьків адреса не обирає: їм посилання не надсилають,
  // і чужа роль з адреси не мусить відкривати їм гостьову анкету.
  it('не приймає інших ролей', () => {
    expect(readCandidateRoleFromSearch('?role=ag')).toBe('');
    expect(readCandidateRoleFromSearch('?role=ip')).toBe('');
    expect(readCandidateRoleFromSearch('')).toBe('');
  });

  it('складає посилання', () => {
    expect(buildCandidateAnketaLink('https://knowme.pp.ua/')).toBe('https://knowme.pp.ua/anketa');
    expect(buildCandidateAnketaLink('https://knowme.pp.ua', 'sm')).toBe('https://knowme.pp.ua/anketa?role=sm');
    expect(buildCandidateAnketaLink('https://knowme.pp.ua', 'ag')).toBe('https://knowme.pp.ua/anketa');
  });
});
