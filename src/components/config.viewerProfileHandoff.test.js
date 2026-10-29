const fs = require('fs');
const path = require('path');

const read = name => fs.readFileSync(path.join(__dirname, name), 'utf8');
const sliceBetween = (source, from, to) => source.slice(source.indexOf(from), source.indexOf(to, source.indexOf(from) + from.length));

/**
 * Перше відкриття дня приходить і з протухлою власною анкетою, і з записом дати
 * входу. Обидва читали ті самі вузли поспіль; тепер запис дати бере за основу
 * картки читання, яке `loadViewerProfile` щойно зробив з бази.
 */
describe('дата входу не перечитує анкету, яку щойно прочитали', () => {
  it('віддається лише читання з бази, а не кеш', () => {
    const loader = sliceBetween(read('config.js'), 'export const loadViewerProfile = async', '\n};');
    const cacheReturn = loader.indexOf('if (cached) return');
    const register = loader.indexOf('viewerProfileNetworkReads.set(uid, { pending, startedAt: Date.now() });');
    expect(cacheReturn).toBeGreaterThan(-1);
    expect(register).toBeGreaterThan(cacheReturn);
  });

  it('один раз і лише щойно розпочате', () => {
    const take = sliceBetween(read('config.js'), 'export const takeFreshViewerProfileRead = async', '\n};');
    expect(take).toContain('viewerProfileNetworkReads.delete(uid);');
    expect(take).toContain('now - entry.startedAt > VIEWER_PROFILE_HANDOFF_MS');
    expect(take).toContain('cloneFetchedProfile(await entry.pending)');
  });

  it('перебудова картки читає вузли, лише коли основи немає', () => {
    const config = read('config.js');
    const refresh = sliceBetween(config, 'const runMatchingCardRefresh = async', '// Проєкція стрічки');
    expect(refresh).toContain('(storedProfile || await readProfileForMatchingCard(id))');
    expect(refresh).toContain('{ ...(stored || {}), ...payload }');
    // Відкладений прогін іде після чужого запису й мусить перечитати сам.
    const queue = sliceBetween(config, 'const refreshMatchingCardAfterProfileWrite = async', '\n};');
    expect(queue).toContain('active.pending = { payload, condition };');
  });

  it('стрічка передає писачу дати саме це читання', () => {
    const matching = read('Matching.jsx');
    const sync = matching.indexOf('syncAccessProfile();');
    const write = matching.indexOf('Promise.resolve(takeFreshViewerProfileRead(user.uid))');
    // Читання реєструється синхронно всередині `syncAccessProfile()`, тож
    // запис дати мусить стояти після його виклику.
    expect(sync).toBeGreaterThan(-1);
    expect(write).toBeGreaterThan(sync);
    expect(matching).toContain("'update',\n            { storedProfile },");
  });
});
