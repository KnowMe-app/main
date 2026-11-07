const fs = require('fs');
const path = require('path');

const loginSource = () => fs.readFileSync(path.join(__dirname, 'LoginScreen.jsx'), 'utf8');

/**
 * Три рівні способи входу: Telegram, Google, пошта (07.11). Не всі хочуть
 * ділитися номером телефону, а пошта посиланням «Немає Telegram?» під синьою
 * кнопкою читалась як «інакше не можна».
 */
describe('LoginScreen: вхід через Google і рівні кнопки', () => {
  it('усі три способи — та сама кнопка', () => {
    const source = loginSource();
    expect(source).toContain('data-testid="login-telegram"');
    expect(source).toContain('data-testid="login-google"');
    expect(source).toContain('data-testid="login-email-toggle"');
    expect(source.match(/<AuthMethodButton\b/g)).toHaveLength(3);
  });

  it('Google — вікном, а не переходом на домен Firebase', () => {
    const source = loginSource();
    expect(source).toContain('signInWithPopup(auth, createGoogleAuthProvider())');
    expect(source).not.toContain('signInWithRedirect');
  });

  it('реєстрація через Google вимагає згоди й ролі, як і решта', () => {
    const source = loginSource();
    const handler = source.slice(source.indexOf('const handleGoogleClick ='), source.indexOf('const handleTelegramCodeSubmit ='));
    expect(handler).toContain('if (isRegisterMode && !isChecked) {');
    expect(handler).toContain('if (isRegisterMode && !selectedRole) {');
    // Реєстрацію доводить анкета, а не прапорець Firebase «новий акаунт».
    expect(handler).toContain('const needsRegistration = isNew || !(await hasAccountRegistration(uid).catch(() => true));');
    expect(handler).toContain('setTelegramSignup({ uid, profileData });');
  });
});

// Анімація розгортання на всю програму одна (`Collapsible`), і форма входу
// нею користується: доти поля пошти й блок ролей вистрибували.
describe('LoginScreen: розгортання тією ж анімацією, що й застосунок', () => {
  it('пошта, вкладка реєстрації й очікування Telegram — у Collapsible', () => {
    const source = loginSource();
    expect(source).toContain("import Collapsible from './Collapsible';");
    expect(source).toContain('<Collapsible open={showEmailForm} id="login-email-form">');
    expect(source).toContain('<Collapsible open={isRegisterMode}>');
    expect(source).toContain('<Collapsible open={telegramAvailable && Boolean(telegramAttempt)}>');
    expect(source).not.toContain('{showEmailForm && (');
  });
});
