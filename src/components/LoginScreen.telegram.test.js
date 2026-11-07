const fs = require('fs');
const path = require('path');

const loginSource = () => fs.readFileSync(path.join(__dirname, 'LoginScreen.jsx'), 'utf8');

/**
 * Вхід через Telegram (на прохання власниці продукту: для донорок і СМ
 * телефон — це Telegram). З 07.11 він — одна з трьох рівних кнопок поруч
 * із Google і поштою (`LoginScreen.google.test.js`).
 */
describe('LoginScreen: вхід через Telegram', () => {
  it('без налаштованого бота форма поштова, з ботом пошта згорнута', () => {
    const source = loginSource();
    expect(source).toContain('const [emailFormOpen, setEmailFormOpen] = useState(!telegramAvailable);');
    expect(source).toContain('const showEmailForm = emailFormOpen;');
  });

  it('кнопка Telegram — звичайне посилання, щоб браузер не блокував вікно', () => {
    const source = loginSource();
    expect(source).toContain('href={buildTelegramLoginLink(telegramNonce)}');
    expect(source).not.toContain('window.open(');
  });

  it('реєстрація через Telegram вимагає згоди й ролі, як і поштою', () => {
    const source = loginSource();
    const handler = source.slice(source.indexOf('const handleTelegramClick ='), source.indexOf('const finishProviderRegistration ='));
    expect(handler).toContain('if (isRegisterMode && !isChecked) {');
    expect(handler).toContain('if (isRegisterMode && !selectedRole) {');
  });

  it('новий акаунт без ролі не відвозиться з форми, доки роль не обрано', () => {
    const source = loginSource();
    expect(source).toContain('setTelegramSignup({ uid, profileData });');
  });

  // Бот заводить акаунт Firebase ще до коду. Спроба, що зірвалась після цього,
  // лишала акаунт без анкети, і наступний вхід ішов як звичайний: номер, яким
  // людина поділилась у боті, не потрапляв в анкету.
  it('реєстрацію доводить анкета, а не прапорець бота «новий акаунт»', () => {
    const source = loginSource();
    expect(source).toContain('const needsRegistration = result.isNew || !(await hasAccountRegistration(uid).catch(() => true));');
    expect(source).toContain('if (needsRegistration) {');
  });

  // Кнопка «Повернутися в KnowMe» з бота відкриває сайт новою вкладкою —
  // спроба мусить бути видна й там, інакше поля для коду немає.
  it('нова вкладка підхоплює спробу, а стара відпускає завершену деінде', () => {
    const source = loginSource();
    expect(source).toContain("window.addEventListener('storage', handleStorage);");
  });

  // Посилання на бота може підсунути чужа людина: без коду, який бот показав
  // власникові Telegram, токен забрав би браузер того, хто посилання згенерував.
  it('вхід завершує код із бота, а не саме очікування', () => {
    const source = loginSource();
    expect(source).toContain("if (result?.status === 'code-required') {");
    expect(source).toContain('pollTelegramLogin(auth.app, attempt.nonce, code)');
    expect(source).toContain('autoComplete="one-time-code"');
  });
});
