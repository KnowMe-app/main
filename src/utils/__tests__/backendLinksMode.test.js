import { PROFILE_FORM_EXTENDED_MODE_KEY, readBackendLinksEnabled } from '../backendLinksMode';

/**
 * Тумблер вмикають на одній сторінці, а читають на інших. Тест тримає обидва
 * кінці: ключ саме той, що вже лежить у браузерах адміністраторок (міняти його
 * означає мовчки вимкнути стрілки всім), і читання не падає там, де
 * `localStorage` недоступний.
 */
describe('режим стрілок у бекенд', () => {
  const original = Object.getOwnPropertyDescriptor(window, 'localStorage');

  const stubLocalStorage = getItem => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: { getItem },
    });
  };

  afterEach(() => {
    if (original) Object.defineProperty(window, 'localStorage', original);
  });

  it('лишає ключ, під яким вибір уже збережений у браузерах', () => {
    expect(PROFILE_FORM_EXTENDED_MODE_KEY).toBe('profileFormExtendedMode');
  });

  it('вмикається лише на явному "true"', () => {
    stubLocalStorage(() => 'true');
    expect(readBackendLinksEnabled()).toBe(true);

    stubLocalStorage(() => null);
    expect(readBackendLinksEnabled()).toBe(false);

    stubLocalStorage(() => '1');
    expect(readBackendLinksEnabled()).toBe(false);
  });

  it('відповідає «вимкнено», а не падає, коли сховище недоступне', () => {
    stubLocalStorage(() => {
      throw new Error('SecurityError');
    });
    expect(readBackendLinksEnabled()).toBe(false);
  });
});
