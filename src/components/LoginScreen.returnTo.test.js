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
    // Без адреси, з якої прийшли, опублікована анкета веде в стрічку, а решта —
    // у «Мій профіль» (`resolveLandingRoute`); адреса завжди важить більше.
    expect(loginSource()).toContain('const target = returnTo || (registered ? MY_PROFILE_ROUTE : await resolveLandingRoute(auth.currentUser?.uid));');
    expect(loginSource()).toContain('.then(profile => (profile?.publish === true ? MATCHING_ROUTE : MY_PROFILE_ROUTE))');
  });

  it('never keeps the sign-in spinner waiting on the database', () => {
    // Запис RTDB чекає підтвердження сервера, а читання без звʼязку висить:
    // вхід, який Firebase уже прийняв, стояв під спінером без кінця. Дата
    // входу пишеться у фоні, а вибір екрана має стелю часу.
    const source = loginSource();
    expect(source).toContain("void persistAccountProfile(userCredential.user.uid, uploadedInfo, 'update')");
    expect(source).not.toContain("await persistAccountProfile(userCredential.user.uid, uploadedInfo, 'update')");
    expect(source).toContain('return await Promise.race([read, timeout]);');
  });

  /**
   * Про те, чи читач уже увійшов, питаємо Firebase, а не позначку в
   * `localStorage`: позначка переживає протухлу сесію, і вкладка з нею їхала
   * звідси на захищений екран, а той вертав її назад сюди — два редиректи по
   * колу замість форми.
   */
  it('decides "already signed in" by the auth status, not by localStorage', () => {
    const source = loginSource();
    expect(source).toContain("if (authStatus !== 'in' || authFlowInProgressRef.current) return undefined;");
    // Реєстрація: Firebase каже «увійшов» до запису анкети, і ефект не мусить
    // відвозити в «Мій профіль», поки роль ще не в картці.
    expect(source).toContain('authFlowInProgressRef.current = true;\n    try {');
    expect(source).not.toContain("const loggedIn = localStorage.getItem('isLoggedIn');");
  });
});
