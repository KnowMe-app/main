import { buildGoogleProfileData, isGoogleSignInCancelled } from './googleAuth';

describe('buildGoogleProfileData', () => {
  it('бере пошту, імʼя й прізвище з профілю Google', () => {
    expect(buildGoogleProfileData(
      { email: 'Iryna@Gmail.com ', displayName: 'Iryna Test' },
      { given_name: 'Iryna', family_name: 'Test' },
    )).toEqual({ email: 'iryna@gmail.com', name: 'Iryna', surname: 'Test' });
  });

  it('без розкладеного профілю кладе displayName в імʼя цілком', () => {
    expect(buildGoogleProfileData({ email: 'a@b.c', displayName: 'Агенція Сонце' })).toEqual({ email: 'a@b.c', name: 'Агенція Сонце' });
  });

  it('порожнього не пише', () => {
    expect(buildGoogleProfileData({}, {})).toEqual({});
  });
});

describe('isGoogleSignInCancelled', () => {
  it('закрите вікно — не помилка', () => {
    expect(isGoogleSignInCancelled({ code: 'auth/popup-closed-by-user' })).toBe(true);
    expect(isGoogleSignInCancelled({ code: 'auth/popup-blocked' })).toBe(false);
  });
});
