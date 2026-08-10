import fs from 'fs';
import path from 'path';

describe('ProfileForm technical settings', () => {
  const source = fs.readFileSync(path.join(__dirname, 'ProfileForm.jsx'), 'utf8');

  it('provides an admin boolean control for profile creation access', () => {
    expect(source).toContain("name: 'canCreateProfiles'");
    expect(source).toContain('aria-label="Дозволити створення карток"');
    expect(source).toContain("const value = e.target.value === 'true'");
  });

  it('keeps technical fields admin-only and renders them after regular fields', () => {
    expect(source).toContain("!PROFILE_FORM_TECHNICAL_FIELDS.has(field.name)");
    expect(source).toContain('...normalizedFieldsToRender.filter(field => PROFILE_FORM_TECHNICAL_FIELDS.has(field.name))');
    expect(source).toContain('<TechnicalFieldsSection>');
    expect(source).toContain('border-top: 1px solid var(--km-border)');
  });

  it('keeps the PP parser as the first visible input', () => {
    const parserPosition = source.indexOf('fieldName="ppTechnicalInput"');
    const fieldsLoopPosition = source.indexOf('{sortedFieldsToRender');
    expect(parserPosition).toBeGreaterThan(-1);
    expect(parserPosition).toBeLessThan(fieldsLoopPosition);
  });
});
