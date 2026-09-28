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

  it('не вимагає ролі до того, як стало ясно, що акаунта немає', () => {
    const source = login();
    const auth = source.slice(source.indexOf('const handleAuth = async'), source.indexOf('// Читача, який уже увійшов'));
    expect(auth).not.toContain('authNotifications.roleRequired()');
    expect(auth).toContain('setRegistrationRoleRequested(true);');
  });

  it('показує вибір ролі лише для реєстрації — з усіх ролей, що знає застосунок', () => {
    const source = login();
    expect(source).toContain('{registrationRoleRequested && (');
    expect(source).toContain('PROFILE_ROLE_OPTIONS.map(option => (');
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
