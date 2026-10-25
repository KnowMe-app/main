import fs from 'fs';
import path from 'path';

// Системна «Назад» на Android ховає клавіатуру, лишаючи поле у фокусі. Поки
// стан клавіатури брався з самого фокуса, нижня панель і `publish-dock` після
// цього не поверталися, доки людина не торкнеться чогось іншого.
describe('нижня панель повертається, коли клавіатуру сховали без blur', () => {
  const source = fs.readFileSync(path.join(__dirname, 'PrimaryNavigation.jsx'), 'utf8');
  const hookBody = source.slice(
    source.indexOf('const useKeyboardOpen = enabled => {'),
    source.indexOf("document.documentElement.classList.toggle('km-keyboard-open', open);"),
  );

  it('слухає видиму область, а не лише фокус', () => {
    expect(hookBody).toContain("viewport?.addEventListener('resize', handleViewportResize);");
    expect(hookBody).toContain("viewport?.removeEventListener('resize', handleViewportResize);");
  });

  it('вважає клавіатуру схованою, коли стиснення минуло при полі у фокусі', () => {
    expect(hookBody).toContain('} else if (sawKeyboard && isTypingTarget(document.activeElement)) {');
    expect(hookBody).toContain('dismissed = true;');
    expect(hookBody).toContain('setOpen(isTypingTarget(document.activeElement) && !dismissed)');
  });

  it('новий фокус і повторне стиснення відкривають клавіатуру знову', () => {
    const focusBody = hookBody.slice(hookBody.indexOf('const handleFocusIn = () => {'));
    expect(focusBody.slice(0, focusBody.indexOf('};'))).toContain('dismissed = false;');
    const resizeBody = hookBody.slice(hookBody.indexOf('if (isViewportShrunk()) {'));
    expect(resizeBody.slice(0, resizeBody.indexOf('} else'))).toContain('dismissed = false;');
  });
});
