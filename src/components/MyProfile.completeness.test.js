import fs from 'fs';
import path from 'path';

// Після публікаційного мінімуму смужка рахує всю анкету: «10 з 10 · 100%»
// казало «готово» про анкету, де пологи, кесарів і «Про себе» ще порожні.
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

  // Першими порожніми в порядку форми стоять по батькові й область — і
  // «Варто дописати» вело б до полів, яких у картці майже не видно.
  it('«Варто дописати» називає першими пологи, кесарів і ускладнення', () => {
    expect(source).toContain("'ownKids', 'lastDelivery', 'csection', 'healthComplications', 'surrogacyExperience',");
    expect(source).toContain("const NEXT_FIELD_SKIPPED = new Set(['email', 'fathersname', 'region', 'lastCycle']);");
    expect(source).toContain('...NEXT_FIELD_PRIORITY.filter(name => emptyCompletenessFields.includes(name)),');
  });
});

// Із трьох СМ 23.10 правильної дати останніх пологів не лишила жодна, а
// «Перший день останньої менструації» пропустили всі три.
describe('дати в анкеті донорки й СМ', () => {
  const source = fs.readFileSync(path.join(__dirname, 'MyProfile.jsx'), 'utf8');

  it('останні пологи — поле з власним розбором дати, а не маска', () => {
    expect(source).toContain("if (name === 'lastDelivery') {");
    expect(source).toContain('<LastDeliveryField');
  });

  it('майбутня чи неіснуюча дата не рахується заповненою', () => {
    expect(source).toContain("const PAST_DATE_FIELDS = new Set(['lastDelivery', 'lastCycle']);");
    expect(source).toContain('return !PAST_DATE_FIELDS.has(name) || !readPastDateIssue(value);');
  });

  it('перший день циклу — у кінці медичного розділу, а не першим після крові', () => {
    expect(source).toContain("'ownKids', 'lastDelivery', 'csection', 'reward', 'lastCycle'] },");
  });
});

describe('підказка до дня місячних', () => {
  const source = fs.readFileSync(path.join(__dirname, 'MyProfile.jsx'), 'utf8');

  it('пояснює, навіщо питаємо', () => {
    expect(source).toContain("name === 'lastCycle' ? uiText('Це допоможе спрогнозувати дату прийому.', language)");
  });
});
