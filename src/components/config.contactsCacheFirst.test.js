const fs = require('fs');
const path = require('path');

const config = () => fs.readFileSync(path.join(__dirname, 'config.js'), 'utf8');
const sliceBetween = (source, from, to) => source.slice(source.indexOf(from), source.indexOf(to, source.indexOf(from)));

/**
 * Контакти показаної картки — спершу з кеша, а з бекенду лише вузол контактів.
 *
 * Анкета показаної картки здебільшого вже лежить у кеші, і бракує в ній самих
 * контактів. Читати заради них пʼять вузлів анкети заново — рівно той трафік,
 * від якого стрічку відмивали.
 */
describe('контакти: спершу кеш, точкове читання', () => {
  it('readProfileContacts питає лише картку й profileContacts, і межу ставить до запиту', () => {
    const reader = sliceBetween(config(), 'export const readProfileContacts = userId =>', '/**\n * Прочитати анкети за id.');
    expect(reader).toMatch(/get\(ref2\(database, `\$\{PROFILE_NODES\.profileContacts\}\/\$\{id\}`\)\)/);
    expect(reader).not.toContain('PROFILE_NODES.profileDetails');
    expect(reader).not.toContain('PROFILE_NODES.profileWorkflow');
    // Свіжа картка — до контактів, і лише для читача без права поза стрічкою.
    expect(reader.indexOf('isCardInMatchingFeed(card)')).toBeLessThan(reader.indexOf('PROFILE_NODES.profileContacts'));
    expect(reader).toContain('profileContactsMemo.get(id)');
  });

  // Загальне правило кеша матчингу: свіжа відповідь (і контакти, і «закрито»)
  // — з памʼяті пристрою, а в памʼять лягає лише справжня відповідь бази.
  it('readProfileContacts бере свіжу відповідь з пристрою і кладе туди лише справжню', () => {
    const reader = sliceBetween(config(), 'export const readProfileContacts = userId =>', '/**\n * Прочитати анкети за id.');
    expect(reader.indexOf('readFreshProfileContacts(viewerId, id)')).toBeLessThan(reader.indexOf('resolveViewerAccessLevel()'));
    expect(reader).toContain('if (cacheable) writeProfileContacts(viewerId, id, result);');
    expect(reader).toMatch(/catch \(error\) \{\n\s+cacheable = false;/);
  });

  it('правка контактів картки знімає її запис з памʼяті пристрою', () => {
    const writer = sliceBetween(config(), 'const fanOutProfileNodes = async', 'const byNode = paths.reduce(');
    expect(writer).toContain('forgetProfileContacts(String(userId || \'\'));');
  });

  it('fetchUsersByIds бере кешоване тіло раніше, ніж читати анкету цілком', () => {
    const fetcher = sliceBetween(config(), 'export const fetchUsersByIds = async', 'const snaps = await Promise.all(');
    expect(fetcher).toContain('getCachedProfileBody(id)');
    expect(fetcher).toContain('await readProfileContacts(id)');
    // Зібране з кеша назад у кеш не кладеться — інакше старе тіло жило б ще TTL.
    expect(fetcher).not.toContain('updateCard(id, contacts)');
    expect(fetcher).toContain('profilesBuiltFromCache.add(profile)');
  });

  it('дотик до контакту рахується записом без читання', () => {
    const writer = sliceBetween(config(), 'export const recordContactAction = async', '// Історія пошуку');
    expect(writer).toContain('count: increment(1)');
    expect(writer).toMatch(/\[`channels\/\$\{key\}`\]: increment\(1\)/);
    expect(writer).not.toMatch(/\bget\(|runTransaction/);
  });
});
