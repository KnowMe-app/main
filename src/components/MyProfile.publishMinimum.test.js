const fs = require('fs');
const path = require('path');

/**
 * Донорка й СМ публікуються з мінімумом полів.
 *
 * Обовʼязковими були всі 42 поля анкети донорки — від форми носа до хобі, —
 * а тост називав лише одне з них за раз. Тепер публікацію тримає те, що стоїть
 * у рядку стрічки, плюс телефон, і всі порожні поля названо одразу.
 */
describe('мінімум для публікації особистої анкети', () => {
  const source = fs.readFileSync(path.join(__dirname, 'MyProfile.jsx'), 'utf8');

  it('вимагає лише полів рядка стрічки й телефону', () => {
    const block = source.slice(
      source.indexOf('const PERSON_PUBLISH_REQUIRED_FIELDS = new Set(['),
      source.indexOf('const PERSON_ANKETA_FIELDS'),
    );
    ['name', 'phone', 'birth', 'country', 'city', 'height', 'weight', 'blood', 'maritalStatus']
      .forEach(field => expect(block).toContain(`'${field}'`));
    ['noseShape', 'hobbies', 'profession'].forEach(field => expect(block).not.toContain(`'${field}'`));
    expect(source).toContain(': personRole ? PERSON_OPTIONAL_PROFILE_FIELDS : OPTIONAL_PROFILE_FIELDS;');
  });

  it('називає всі порожні поля, а не перше', () => {
    expect(source).toContain('missingFieldNames.slice(0, MISSING_FIELDS_TOAST_LIMIT).map(resolveRequiredFieldLabel)');
    expect(source).toContain('data-testid="publish-missing"');
  });

  it('тримає головну дію під рукою, поки анкету не опубліковано', () => {
    expect(source).toContain('data-testid="publish-dock"');
    expect(source).toContain('bottom: var(--km-bottom-nav-h, 0px);');
  });
});
