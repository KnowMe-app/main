const fs = require('fs');
const path = require('path');

const loginSource = () => fs.readFileSync(path.join(__dirname, 'LoginScreen.jsx'), 'utf8');

/**
 * Telegram — основний вхід (на прохання власниці продукту: для донорок і СМ
 * телефон — це Telegram, а пошта — ділове листування). Пошта лишається
 * запасом під «Немає Telegram?».
 */
describe('LoginScreen: вхід через Telegram', () => {
  it('без налаштованого бота форма поштова, з ботом пошта згорнута', () => {
    const source = loginSource();
    expect(source).toContain('const [emailFormOpen, setEmailFormOpen] = useState(!telegramAvailable);');
    expect(source).toContain('const showEmailForm = !telegramAvailable || emailFormOpen;');
  });

  it('кнопка Telegram — звичайне посилання, щоб браузер не блокував вікно', () => {
    const source = loginSource();
    expect(source).toContain('href={buildTelegramLoginLink(telegramNonce)}');
    expect(source).not.toContain('window.open(');
  });

  it('реєстрація через Telegram вимагає згоди й ролі, як і поштою', () => {
    const source = loginSource();
    const handler = source.slice(source.indexOf('const handleTelegramClick ='), source.indexOf('const finishTelegramRegistration ='));
    expect(handler).toContain('if (isRegisterMode && !isChecked) {');
    expect(handler).toContain('if (isRegisterMode && !selectedRole) {');
  });

  it('новий акаунт без ролі не відвозиться з форми, доки роль не обрано', () => {
    const source = loginSource();
    expect(source).toContain('setTelegramSignup({ uid, profileData });');
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
