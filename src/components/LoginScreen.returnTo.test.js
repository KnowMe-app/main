const fs = require('fs');
const path = require('path');

const loginSource = () => fs.readFileSync(path.join(__dirname, 'LoginScreen.jsx'), 'utf8');

/**
 * Посиланням на конкретний екран діляться в месенджері. Незалогінений читач
 * такого посилання приїжджає сюди через межу входу — і адреса має приїхати
 * разом з ним, інакше після входу він опиняється в «Моєму профілі» й шукає
 * надіслане вручну.
 */
describe('LoginScreen returns the reader to the link they opened', () => {
  it('reads the address from the router state', () => {
    const source = loginSource();
    expect(source).toContain("import { readReturnToFromState } from 'utils/authRedirect';");
    expect(source).toContain('const returnTo = readReturnToFromState(location.state);');
  });

  it('lands on that address after a successful sign-in', () => {
    expect(loginSource()).toContain('navigate(returnTo || MY_PROFILE_ROUTE, { replace: true });');
  });

  /**
   * Про те, чи читач уже увійшов, питаємо Firebase, а не позначку в
   * `localStorage`: позначка переживає протухлу сесію, і вкладка з нею їхала
   * звідси на захищений екран, а той вертав її назад сюди — два редиректи по
   * колу замість форми.
   */
  it('decides "already signed in" by the auth status, not by localStorage', () => {
    const source = loginSource();
    expect(source).toContain("if (authStatus !== 'in') return;");
    expect(source).not.toContain("const loggedIn = localStorage.getItem('isLoggedIn');");
  });
});
