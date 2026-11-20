const fs = require('fs');
const path = require('path');

const matchingSource = () => fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');

// «Зберегти контакт» у згорнутому рядку брав імʼя з проєкції стрічки, де
// прізвище — лише ініціал, і в телефон лягало «KM Дікая Л.», хоча той самий
// читач у розгорнутому рядку бачив прізвище повністю (20.11).
describe('контакт у телефон бере імʼя з повної анкети', () => {
  const source = matchingSource();
  const start = source.indexOf('const handleRowSaveContact = React.useCallback(');
  const handler = source.slice(start, source.indexOf('}, [ensureFullProfile, handleRowContactAction, language]);', start));

  it('спершу дочитує повну анкету, з межею очікування', () => {
    expect(start).toBeGreaterThan(-1);
    expect(handler).toContain('ensureFullProfile(user)');
    expect(handler).toContain('SAVE_CONTACT_PROFILE_WAIT_MS');
  });

  it('складає імʼя з анкети поверх проєкції, а не з самої проєкції', () => {
    expect(handler).toContain('buildContactCardName(fullProfile ? { ...user, ...fullProfile } : user)');
    expect(handler).not.toMatch(/const name = buildContactCardName\(user\);/);
  });
});
