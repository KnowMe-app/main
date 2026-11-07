const fs = require('fs');
const path = require('path');

const read = name => fs.readFileSync(path.join(__dirname, name), 'utf8');

/**
 * Відновлення пароля й згода на вході.
 *
 * Відновлення не було взагалі: хто забув пароль, втрачав анкету й заводив
 * дубль на іншу пошту. А галочку згоди вимагали на кожному вході, хоч згоду
 * вже дано при реєстрації.
 */
describe('вхід: пароль і згода', () => {
  const source = read('LoginScreen.jsx');

  it('надсилає лист для зміни пароля з вкладки «Увійти»', () => {
    expect(source).toContain('await requestPasswordResetEmail(normalizedEmail, { auth, language });');
    expect(source).toContain('Забули пароль?');
  });

  it('не каже, чи існує акаунт з такою поштою', () => {
    const handler = source.slice(source.indexOf('const handlePasswordReset = async'), source.indexOf('const handleAuth = async'));
    expect(handler).toContain("if (error.code === 'auth/user-not-found') {\n        authNotifications.passwordResetSent(normalizedEmail);");
  });

  it('вимагає згоди лише при реєстрації', () => {
    expect(source).toContain('if (isRegisterMode && !isChecked) {');
    // Галочка стоїть у тому ж блоці вкладки «Створити акаунт», що й ролі.
    const registerBlock = source.slice(source.indexOf('<Collapsible open={isRegisterMode}>'));
    expect(registerBlock.slice(0, registerBlock.indexOf('</Collapsible>'))).toContain('<CheckboxContainer>');
  });

  it('дає подивитись набраний пароль', () => {
    expect(source).toContain("type={showPassword ? 'text' : 'password'}");
  });
});
