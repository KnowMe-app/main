import fs from 'fs';
import path from 'path';

describe('My Profile section configuration', () => {
  const source = fs.readFileSync(path.join(__dirname, 'MyProfile.jsx'), 'utf8');
  const personalFieldsMatch = source.match(
    /key: 'personal'[\s\S]*?fields: \[([^\]]+)\]/,
  );
  const personalFields = personalFieldsMatch?.[1]
    .match(/'([^']+)'/g)
    ?.map(field => field.slice(1, -1));
  const accessFields = source.match(
    /key: 'auth'[\s\S]*?fields: \[([^\]]+)\]/,
  )?.[1].match(/'([^']+)'/g)?.map(field => field.slice(1, -1));

  it('places email immediately before phone after profile access is confirmed', () => {
    expect(personalFields).toBeDefined();
    expect(source).toContain("fields.splice(fields.indexOf('phone'), 0, 'email')");

    const confirmedPersonalFields = [...personalFields];
    confirmedPersonalFields.splice(confirmedPersonalFields.indexOf('phone'), 0, 'email');

    expect(confirmedPersonalFields).toEqual(expect.arrayContaining(['email', 'phone']));
    expect(confirmedPersonalFields.indexOf('phone'))
      .toBe(confirmedPersonalFields.indexOf('email') + 1);
    expect(confirmedPersonalFields.slice(0, 5))
      .toEqual(['name', 'surname', 'fathersname', 'email', 'phone']);
  });

  it('keeps email in access and phone in personal data before authorization', () => {
    expect(source).toContain("!isProfileAccessConfirmed ? [{ key: 'auth'");
    expect(accessFields).toContain('email');
    expect(personalFields).toContain('phone');
    expect(personalFields).not.toContain('email');
  });

  // Донорка ооцитів читала «Досвід у сурогатному материнстві» як помилку
  // анкети: це питання до СМ. Донорці ж «Чи розглядаєте участь у програмі СМ»
  // лишається.
  it('не питає донорку без анкети СМ про досвід сурогатного материнства', () => {
    expect(source).toContain("const DONOR_HIDDEN_FIELDS = new Set(['surrogacyExperience']);");
    expect(source).toContain("const donorOnly = rolesList.includes('ed') && !rolesList.includes('sm');");
    expect(source).toContain('.filter(name => !donorOnly || !DONOR_HIDDEN_FIELDS.has(name))');
  });
});
