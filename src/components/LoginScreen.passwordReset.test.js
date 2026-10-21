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
    expect(source).toContain('await sendPasswordResetEmail(auth, normalizedEmail);');
    expect(source).toContain('Забули пароль?');
  });

  it('не каже, чи існує акаунт з такою поштою', () => {
    const handler = source.slice(source.indexOf('const handlePasswordReset = async'), source.indexOf('const handleAuth = async'));
    expect(handler).toContain("if (error.code === 'auth/user-not-found') {\n        authNotifications.passwordResetSent(normalizedEmail);");
  });

  it('вимагає згоди лише при реєстрації', () => {
    expect(source).toContain('if (isRegisterMode && !isChecked) {');
    expect(source).toContain('{isRegisterMode && (\n            <CheckboxContainer>');
  });

  it('дає подивитись набраний пароль', () => {
    expect(source).toContain("type={showPassword ? 'text' : 'password'}");
  });
});
