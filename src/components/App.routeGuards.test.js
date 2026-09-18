const fs = require('fs');
const path = require('path');

const appSource = () => fs.readFileSync(path.join(__dirname, 'App.jsx'), 'utf8');

/**
 * Публічні екрани перелічені поіменно, і перелік цей короткий навмисно: усе
 * інше в застосунку — про конкретних людей. Обидва нічого не читають з бази
 * (форма входу та текст угоди), тож і показувати їх незалогіненому безпечно.
 */
const PUBLIC_ROUTES = ['/login', '/policy'];

// Маршрути, які самі лише перенаправляють: гардити їх нема сенсу, бо вони
// нічого не рендерять — ціль перенаправлення вже за межею.
const REDIRECT_ONLY_ROUTES = ['/my-profile-new'];

const parseRoutes = () => {
  const source = appSource();
  const routesBlock = source.slice(source.indexOf('<Routes>'), source.indexOf('</Routes>'));
  return routesBlock
    .split('<Route ')
    .slice(1)
    .map(chunk => ({
      path: (chunk.match(/path="([^"]+)"/) || [])[1] || '',
      chunk,
    }))
    .filter(route => route.path);
};

describe('App route guards', () => {
  it('каже вголос, коли прав на екран немає', () => {
    // Мовчазний редірект у «Мій профіль» читався як поломка: людина відкривала
    // адресу, а застосунок без слова показував їй її власну анкету.
    const source = appSource();

    expect(source).toContain('if (isUnauthorizedAddRoute) {');
    expect(source).toContain('Немає права на цей екран. Попросіть адміністратора відкрити доступ.');
    // Один тост на всі спроби: інакше повернення «назад» складало б вежу.
    expect(source).toContain("id: 'route-access-denied',");
  });

  it('заводити картки може кожен, хто увійшов', () => {
    // Екран створення більше не реєструється за правом: `canCreateProfiles`
    // лишився стерегти самі лише службові читання цілих вузлів.
    const source = appSource();

    expect(source).toContain('<Route path="/matching/create-profile"');
    expect(source).not.toContain("location.pathname === '/matching/create-profile'");
    expect(source).not.toContain('{canCreateProfiles && <Route');
  });

  it('reads every route in the table', () => {
    const paths = parseRoutes().map(route => route.path);
    expect(paths).toEqual(expect.arrayContaining(['/login', '/matching', '/my-profile', '*']));
  });

  /**
   * Межа входу мусить стояти на маршруті, а не всередині екрана. Поки
   * `/matching` був відкритий кожному, незалогінений читач шареного посилання
   * монтував стрічку без жодного uid: сокет до бази, десятки відмовлених
   * запитів на секунду і вічний скелетон замість відповіді.
   *
   * Новий маршрут без `RequireAuth` ламає саме цей тест — у цьому й сенс:
   * забути гард легше, ніж помітити його відсутність.
   */
  it('guards every route that is not explicitly public', () => {
    const unguarded = parseRoutes()
      .filter(route => !PUBLIC_ROUTES.includes(route.path))
      .filter(route => !REDIRECT_ONLY_ROUTES.includes(route.path))
      .filter(route => !route.chunk.includes('<RequireAuth'))
      .map(route => route.path);

    expect(unguarded).toEqual([]);
  });

  it('leaves the public routes reachable without a session', () => {
    const guardedPublic = parseRoutes()
      .filter(route => PUBLIC_ROUTES.includes(route.path))
      .filter(route => route.chunk.includes('<RequireAuth'))
      .map(route => route.path);

    expect(guardedPublic).toEqual([]);
  });

  // Адмінських маршрутів немає в таблиці, доки права не прочитані, — і «такого
  // маршруту немає» не можна плутати з «ще не знаємо»: інакше посилання на
  // `/edit/...` відкидало б адміністраторку в «Мій профіль» за мить до того, як
  // її права приїхали.
  it('the catch-all waits for the access level before deciding', () => {
    expect(appSource()).toContain("const catchAllStatus = authStatus === 'in' && !isAccessResolved ? 'pending' : authStatus;");
    const catchAll = parseRoutes().find(route => route.path === '*');
    expect(catchAll.chunk).toContain('status={catchAllStatus}');
  });

  // Стан входу питається у Firebase і ставиться до будь-яких очікувань: рівень
  // доступу читається з бази вже після, а межа мусить спрацювати одразу.
  it('resolves the auth status before the access level is read', () => {
    const source = appSource();
    const setStatus = source.indexOf("setAuthStatus(user ? 'in' : 'out');");
    const fetchProfile = source.indexOf('await fetchUserById(user.uid)');
    expect(setStatus).toBeGreaterThan(-1);
    expect(setStatus).toBeLessThan(fetchProfile);
  });

  // Позначка входу в `localStorage` переживала вихід із сесії, і форма входу
  // читала її як «вже увійшли»: редирект на захищений екран, звідти назад — і
  // людина бачила блимання замість форми.
  it('clears the stored session flag when Firebase reports no user', () => {
    expect(appSource()).toContain("localStorage.removeItem('isLoggedIn');");
  });
});
