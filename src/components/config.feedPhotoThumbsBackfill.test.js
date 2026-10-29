const fs = require('fs');
const path = require('path');

const config = () => fs.readFileSync(path.join(__dirname, 'config.js'), 'utf8');
const sliceBetween = (source, from, to) => source.slice(source.indexOf(from), source.indexOf(to, source.indexOf(from) + from.length));

/**
 * Робота «Мініатюри фото в стрічці» пише правами адміна, а адресу фото бере з
 * `matchingCards/{id}/avatar`, яку пише сама власниця. Без звірки теки картка з
 * адресою чужого фото отримала б мініатюру того фото й свіжу адресу на неї —
 * адмін видав би їй чуже фото. Звірка — до будь-якого читання й запису.
 */
describe('мініатюри старих фото: лише фото з власної теки картки', () => {
  it('кандидат — фото нашого бакета з теки avatar/{id}/ самої картки', () => {
    const resolver = sliceBetween(config(), 'const resolveOwnFeedAvatarPath = (id, avatar) =>', '};');
    expect(resolver).toContain('storagePathFromDownloadUrl(avatar)');
    expect(resolver).toMatch(/path\.startsWith\(`avatar\/\$\{id\}\/`\)/);
    expect(resolver).toContain('buildPhotoThumbPath(path)');
  });

  it('і відбір, і запис беруть шлях лише через цю звірку', () => {
    const job = sliceBetween(config(), 'export const backfillFeedPhotoThumbs = async', '\nexport const ');
    expect(job).toContain('if (resolveOwnFeedAvatarPath(id, avatar)) return true;');
    expect(job).toContain('const path = resolveOwnFeedAvatarPath(id, card.avatar);');
    expect(job).not.toContain('readStoragePathFromUrl(');
  });

  it('зниклий файл іде в звіт окремо, а не помилкою', () => {
    const job = sliceBetween(config(), 'export const backfillFeedPhotoThumbs = async', '\nexport const ');
    expect(job).toContain('if (await isStoragePhotoMissing(path, error)) {');
    expect(job).toContain('report.missing.push({ id, path });');
    // Адреса поза Storage — не «чужа тека».
    expect(job).toContain('if (storagePathFromDownloadUrl(avatar)) {');
    const missing = sliceBetween(config(), 'const isStoragePhotoMissing = async', '\n};');
    expect(missing).toContain("error?.code === 'storage/object-not-found'");
    expect(missing).toContain('await getMetadata(ref(storage, path));');
  });

  it('запасний GET іде лише за адресою того самого файлу нашого бакета', () => {
    const reader = sliceBetween(config(), 'const readStoragePhotoBlob = async (path, url) =>', '\n};');
    expect(reader.indexOf('if (storagePathFromDownloadUrl(url) !== path) throw bytesError;'))
      .toBeLessThan(reader.indexOf('await fetch(url)'));
  });
});
