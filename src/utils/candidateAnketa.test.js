import { buildCandidateAnketaLink, CANDIDATE_ANKETA_ROLES, markCandidateSignup, readCandidateDraftFields, readCandidateRoleFromSearch, rememberCandidateDraftForExistingAccount, takeCandidateSignup } from './candidateAnketa';
import { readPendingProfileEdits } from './myProfilePendingEdits';

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

describe('вхід кандидатки через Telegram', () => {
  beforeEach(() => localStorage.clear());

  it('позначка живе один раз і годину', () => {
    markCandidateSignup('sm');
    expect(takeCandidateSignup()).toMatchObject({ role: 'sm' });
    expect(takeCandidateSignup()).toBeNull();
    markCandidateSignup('ed');
    expect(takeCandidateSignup(Date.now() + 2 * 60 * 60 * 1000)).toBeNull();
  });

  it('бере з чернетки набране, без входу й ролі', () => {
    localStorage.setItem('myProfileDraft', JSON.stringify({
      name: 'Олена', city: '', userRole: 'sm', email: 'x@y.z', password: 'p', surname: ['Стара', 'Нова'],
    }));
    expect(readCandidateDraftFields()).toEqual({ name: 'Олена', surname: ['Стара', 'Нова'] });
  });

  // Спільне для пошти, Google і Telegram: набране до входу лягає лише в
  // порожні поля наявного акаунта, роль і службове — ніколи.
  it('доливає набране в порожні поля наявного акаунта', () => {
    localStorage.clear();
    rememberCandidateDraftForExistingAccount('uid-existing', { name: 'Олена', city: '' }, {
      name: 'Інше імʼя', city: 'Київ', height: '168', userRole: 'sm', role: 'sm', email: 'a@b.c', __x: '1', weight: '',
    });
    const pending = readPendingProfileEdits('uid-existing');
    expect(Object.keys(pending.fields).sort()).toEqual(['city', 'height']);
    expect(pending.fields.city).toBe('Київ');
  });
});
