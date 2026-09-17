import {
  LOGIN_ROUTE,
  buildReturnToFromLocation,
  readReturnToFromState,
  sanitizeReturnTo,
} from './authRedirect';

describe('sanitizeReturnTo', () => {
  it('keeps an internal path with its query and hash', () => {
    expect(sanitizeReturnTo('/matching')).toBe('/matching');
    expect(sanitizeReturnTo('/matching?q=%D0%9E%D0%BA%D1%81%D0%B0%D0%BD%D0%B0')).toBe('/matching?q=%D0%9E%D0%BA%D1%81%D0%B0%D0%BD%D0%B0');
    expect(sanitizeReturnTo('/edit/abc#notes')).toBe('/edit/abc#notes');
  });

  // Адреса приходить із рядка браузера, тобто ззовні. Протокол-відносне
  // посилання виглядає як шлях, а веде на чужий сайт — і людина, яка щойно
  // ввела пароль, опинилась би там одразу після входу.
  it('refuses anything that can leave the app', () => {
    expect(sanitizeReturnTo('//evil.example/steal')).toBe('');
    expect(sanitizeReturnTo('/\\evil.example')).toBe('');
    expect(sanitizeReturnTo('https://evil.example')).toBe('');
    expect(sanitizeReturnTo('javascript:alert(1)')).toBe('');
    expect(sanitizeReturnTo('matching')).toBe('');
  });

  it('refuses non-strings and empties', () => {
    expect(sanitizeReturnTo(undefined)).toBe('');
    expect(sanitizeReturnTo(null)).toBe('');
    expect(sanitizeReturnTo(42)).toBe('');
    expect(sanitizeReturnTo('   ')).toBe('');
  });

  // Повернути на форму входу після входу — це той самий екран удруге.
  it('refuses the login route itself', () => {
    expect(sanitizeReturnTo(LOGIN_ROUTE)).toBe('');
    expect(sanitizeReturnTo(`${LOGIN_ROUTE}?next=/matching`)).toBe('');
  });
});

describe('buildReturnToFromLocation', () => {
  it('joins pathname, search and hash', () => {
    expect(buildReturnToFromLocation({ pathname: '/matching', search: '?q=1', hash: '#top' })).toBe('/matching?q=1#top');
  });

  it('survives a partial or missing location', () => {
    expect(buildReturnToFromLocation({ pathname: '/matching' })).toBe('/matching');
    expect(buildReturnToFromLocation(null)).toBe('');
    expect(buildReturnToFromLocation({})).toBe('');
  });
});

describe('readReturnToFromState', () => {
  it('reads the router state and sanitizes it', () => {
    expect(readReturnToFromState({ returnTo: '/matching' })).toBe('/matching');
    expect(readReturnToFromState({ returnTo: '//evil.example' })).toBe('');
    expect(readReturnToFromState(null)).toBe('');
    expect(readReturnToFromState({})).toBe('');
  });
});
