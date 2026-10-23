import fs from 'fs';
import path from 'path';

// Смужка «Для публікації заповнено 10 з 10 · 100%» казала СМ, що анкету
// завершено, і пологи, ускладнення, досвід та «Про себе» лишались порожніми.
describe('після обовʼязкового смужка рахує всю анкету', () => {
  const source = fs.readFileSync(path.join(__dirname, 'MyProfile.jsx'), 'utf8');

  it('перемикає підпис і відсоток на повноту анкети без соцмереж', () => {
    expect(source).toContain("uiText('Анкету заповнено на {filled} з {total}', language, completeness)");
    expect(source).toContain(".filter(section => !section.custom && section.key !== 'social')");
    expect(source).toContain('data-testid="profile-next-fields"');
  });

  it('ставить «Про себе» перед соцмережами', () => {
    expect(source.indexOf("{ key: 'lifestyle', title: '🌿 Спосіб життя'"))
      .toBeLessThan(source.indexOf("{ key: 'social', title: '📱 Соцмережі'"));
  });
});
