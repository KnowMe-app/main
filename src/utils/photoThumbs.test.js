import {
  buildPhotoThumbKey,
  buildPhotoThumbPath,
  isPhotoThumbUrl,
  pickPhotoThumb,
  prunePhotoThumbs,
  readStoragePathFromUrl,
  resolveFeedPhoto,
} from './photoThumbs';

const storageUrl = path => `https://firebasestorage.googleapis.com/v0/b/demo.appspot.com/o/${encodeURIComponent(path)}?alt=media&token=t-${path.length}`;

describe('мініатюри фото стрічки', () => {
  const original = storageUrl('avatar/uid1/1700-abc.jpg');
  const thumb = storageUrl('avatar/uid1/thumbs/1700-abc.jpg');

  it('читає шлях файлу з адреси Storage', () => {
    expect(readStoragePathFromUrl(original)).toBe('avatar/uid1/1700-abc.jpg');
    expect(readStoragePathFromUrl('https://example.com/photo.jpg')).toBe('');
    expect(isPhotoThumbUrl(thumb)).toBe(true);
    expect(isPhotoThumbUrl(original)).toBe(false);
  });

  // Мініатюру має лише фото самої анкети: ліки, копії для посилань і самі
  // мініатюри лежать глибше.
  it('кладе мініатюру поруч з оригіналом, і лише для фото анкети', () => {
    expect(buildPhotoThumbPath('avatar/uid1/1700-abc.jpg')).toBe('avatar/uid1/thumbs/1700-abc.jpg');
    expect(buildPhotoThumbPath('avatar/uid1/thumbs/1700-abc.jpg')).toBe('');
    expect(buildPhotoThumbPath('avatar/uid1/medications/x.jpg')).toBe('');
    expect(buildPhotoThumbPath('profileShares/token/1.jpg')).toBe('');
  });

  it('ключ мапи — імʼя файлу без символів, яких RTDB не приймає', () => {
    expect(buildPhotoThumbKey(original)).toBe('1700-abc_jpg');
    expect(buildPhotoThumbKey(storageUrl('avatar/uid1/a.b#c$d[e].png'))).toBe('a_b_c_d_e__png');
  });

  it('рядок бере мініатюру, коли вона є, і оригінал — коли ні', () => {
    const thumbs = { '1700-abc_jpg': thumb };
    expect(pickPhotoThumb(original, thumbs)).toBe(thumb);
    expect(resolveFeedPhoto(original, thumbs)).toBe(thumb);
    expect(resolveFeedPhoto(original, {})).toBe(original);
    expect(resolveFeedPhoto(original, null)).toBe(original);
  });

  it('мапа тримає лише мініатюри фото, які ще є в анкеті', () => {
    const other = storageUrl('avatar/uid1/1800-def.jpg');
    const thumbs = { '1700-abc_jpg': thumb, '1800-def_jpg': 'x', gone_jpg: 'y', '1900_jpg': '' };
    expect(prunePhotoThumbs(thumbs, [original, other])).toEqual({ '1700-abc_jpg': thumb, '1800-def_jpg': 'x' });
    expect(prunePhotoThumbs(thumbs, [])).toEqual({});
    expect(prunePhotoThumbs(null, [original])).toEqual({});
  });
});
