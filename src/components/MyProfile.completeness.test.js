import fs from 'fs';
import path from 'path';

// Після публікаційного мінімуму смужка рахує всю анкету: «10 з 10 · 100%»
// казало «готово» про анкету, де пологи, кесарів і «Про себе» ще порожні.
describe('після обовʼязкового смужка рахує всю анкету', () => {
  const source = fs.readFileSync(path.join(__dirname, 'MyProfile.jsx'), 'utf8');

  it('перемикає підпис і відсоток на повноту анкети без соцмереж', () => {
    expect(source).toContain("uiText('Анкету заповнено на {filled} з {total}', language, completeness)");
    expect(source).toContain(".filter(section => section.key !== 'social')");
    expect(source).toContain(".filter(name => fieldsMap.has(name) || CUSTOM_COMPLETENESS_FIELDS.has(name))");
    // День місячних застаріває щомісяця — повноту анкети він не рахує.
    expect(source).toContain(".filter(name => !COMPLETENESS_SKIPPED_FIELDS.has(name));");
    expect(source).toContain("const COMPLETENESS_SKIPPED_FIELDS = new Set(['lastCycle']);");
    expect(source).toContain("const CUSTOM_COMPLETENESS_FIELDS = new Set(['seeking', 'parentVia', 'programs']);");
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
    expect(source).toContain("const NEXT_FIELD_SKIPPED = new Set(['email', 'fathersname', 'region']);");
    expect(source).toContain('...NEXT_FIELD_PRIORITY.filter(name => emptyCompletenessFields.includes(name)),');
  });

  // Дату пологів пропустили всі три СМ 23.10: її «Варто дописати» пропонує
  // завжди, поки порожня, — і до мінімуму, і понад три. День місячних
  // звідти пішов: він міняється щомісяця й публікацію не тримає.
  it('дату пологів пропонує завжди, поки вона порожня, а день місячних — ні', () => {
    expect(source).toContain("const ALWAYS_SUGGESTED_FIELDS = ['lastDelivery'];");
    expect(source).toContain('...pinnedEmptyFields,');
    expect(source).toContain('{nextEmptyFields.length && !editingProgram ? (');
  });

  it('«Де ви готові проходити програму» «Варто дописати» називає першим', () => {
    expect(source).toMatch(/const NEXT_FIELD_PRIORITY = \[\n  'programPlace',/);
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

  // День місячних — у «Готовності до програми», останнім: це подробиця для
  // графіка найближчої програми, а не медичний факт анкети.
  it('перший день циклу — у кінці розділу готовності до програми', () => {
    expect(source).toContain("{ key: 'program', title: '🤝 Готовність до програми', fields: ['programPlace', 'reward', 'surrogacyProgramInterest', 'lastCycle'] },");
    expect(source).toContain("'ownKids', 'lastDelivery', 'csection'] },");
  });
});

describe('підказка до дня місячних', () => {
  const source = fs.readFileSync(path.join(__dirname, 'MyProfile.jsx'), 'utf8');

  it('пояснює, навіщо питаємо', () => {
    expect(source).toContain("? uiText('Це допоможе спрогнозувати дату прийому.', language)");
    expect(source).toContain("const fieldHint = name === 'lastCycle'");
  });
});
