const fs = require('fs');
const path = require('path');

const read = name => fs.readFileSync(path.join(__dirname, name), 'utf8');

/**
 * Вхід не питає й не пише роль.
 *
 * Форма щоразу вимагала обрати роль (з п'яти лише «донорка» чи «агенція») і
 * клала її в анкету: батьки після кожного входу ставали донорками чи
 * агенціями, а «Мій профіль» показував роль з останнього входу.
 */
describe('роль на екрані входу', () => {
  const login = () => read('LoginScreen.jsx');

  it('вхід у наявний акаунт пише сесію без ролі', () => {
    const source = login();
    const handler = source.slice(source.indexOf('const handleLogin = async'), source.indexOf('const handleRegistration = async'));
    expect(handler).toContain('buildAuthLoginPayload({');
    expect(handler).not.toContain('userRole');
  });

  // Вхід і реєстрація — дві вкладки. Ролі досі зʼявлялись лише після невдалої
  // спроби з новою поштою, разом із тостом «Акаунта ще немає»: перший крок
  // новачка виглядав як помилка.
  it('вимагає ролі лише на вкладці «Створити акаунт»', () => {
    const source = login();
    const auth = source.slice(source.indexOf('const handleAuth = async'), source.indexOf('// Читача, який уже увійшов'));
    expect(auth).not.toContain('authNotifications.roleRequired()');
    expect(auth).toContain('if (isRegisterMode && !selectedRole) {');
  });

  it('показує вибір ролі лише для реєстрації — з усіх ролей, що знає застосунок, і з поясненням', () => {
    const source = login();
    expect(source).toContain('{isRegisterMode && (');
    expect(source).toContain('PROFILE_ROLE_OPTIONS.map(option => (');
    expect(source).toContain('ROLE_DESCRIPTIONS[option.value]');
  });

  // Вкладка «Увійти» нікого не реєструє: одруківка в пошті наявного акаунта
  // вела в другу реєстрацію.
  it('вкладка «Увійти» не реєструє, а пропонує створити акаунт', () => {
    const source = login();
    const auth = source.slice(source.indexOf('const handleAuth = async'), source.indexOf('// Читача, який уже увійшов'));
    const loginBranch = auth.slice(auth.indexOf('} else {\n        const signedIn'));
    expect(loginBranch).not.toContain('handleRegistration(');
    expect(loginBranch).toContain('setLoginFailedUnknownEmail(true)');
  });

  it('наявний акаунт, який перевірка пошти не впізнала, веде у вхід, а не в другу реєстрацію', () => {
    expect(login()).toContain("if (error.code === 'auth/email-already-in-use') {");
  });
});

describe('роль у «Моєму профілі»', () => {
  it('показує роль з картки — ту саму, за якою гортає стрічка', () => {
    const source = read('MyProfile.jsx');
    expect(source).toContain('fetchProfileCardRole(uid).catch(() => null)');
    expect(source).toContain('const currentCardRole = resolveViewerCurrentRole(cardRole);');
  });

  it('зміна ролі доїжджає й у Firestore, звідки форма читає анкету', () => {
    const config = read('config.js');
    const writer = config.slice(config.indexOf('export const updateProfileRole ='), config.indexOf('export const updateDataInRealtimeDB ='));
    expect(writer).toContain("updateDataInFiresoreDB(id, { userRole: role, role }, 'check')");
  });
});
