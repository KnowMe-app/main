const fs = require('fs');
const path = require('path');

const config = () => fs.readFileSync(path.join(__dirname, 'config.js'), 'utf8');
const sliceBetween = (source, from, to) => source.slice(source.indexOf(from), source.indexOf(to, source.indexOf(from) + from.length));

/**
 * Шари кеша матчингу на шість годин (`utils/matchingCachePolicy`) тримають
 * правду лише тому, що кожен власний запис їх або правує, або забуває. Новий
 * писач повз це поверне стару поломку: свій щойно написаний відгук чи
 * памʼятка, яких після перезавантаження не видно аж до кінця TTL.
 */
describe('власні записи тримають кеші матчингу правдивими', () => {
  it('кожен запис публічного відгуку забуває кеш картки до запиту', () => {
    const source = config();
    [
      'export const addPublicProfileComment = async',
      'export const addPublicProfileCommentAs = async',
      'export const updatePublicProfileComment = async',
      'export const deletePublicProfileComment = async',
    ].forEach(header => {
      const body = sliceBetween(source, header, '\nexport const ');
      expect(body).toContain('forgetCachedPublicReviews(profileId);');
      expect(body.indexOf('forgetCachedPublicReviews(profileId);')).toBeLessThan(body.indexOf('await '));
    });
  });

  it('памʼятка лягає в кеш нотаток після запису', () => {
    const source = config();
    ['export const setUserComment = async', 'export const updateCommentByOwner = async', 'export const deleteCommentByOwner = async']
      .forEach(header => {
        expect(sliceBetween(source, header, '\nexport const ')).toContain('rememberCommentWrite(');
      });
  });

  it('дата «Відкласти» правує кеш дат лише після вдалого запису', () => {
    const body = sliceBetween(config(), 'export const setOwnerGetInTouch = async', '\nexport const ');
    expect(body.indexOf('await setOwnerValue(')).toBeLessThan(body.indexOf('postponeDatesStore.patch('));
    expect(body).toContain('if (saved)');
  });

  // Призупинене зʼєднання не відмовляє, а чекає: читання без цього висіло б,
  // доки людина не торкнеться екрана.
  it('кожне читання бази спершу просить зʼєднання', () => {
    const wrapper = sliceBetween(config(), 'const get = (...args) =>', '};');
    expect(wrapper).toContain('noteRealtimeDemand();');
  });
});
