/**
 * Мініатюри фото для стрічки.
 *
 * Рядок стрічки показує фото шириною ~380 px, а качав оригінал — до 2448×3264
 * і до мегабайта на файл: прокрутка чотирьох екранів коштувала ~2 МБ фото
 * проти 25 КБ даних бази. Мініатюра (`PHOTO_THUMB_MAX_DIMENSION` по довшій
 * стороні, до `PHOTO_THUMB_MAX_KB`) лежить поруч з оригіналом —
 * `avatar/{uid}/thumbs/{те саме імʼя}`: правила Storage туди вже пускають
 * власницю й адмінів, тож викочувати нічого не треба.
 *
 * Адреса мініатюри — це інший файл з іншим токеном, тож вивести її з адреси
 * оригіналу не можна: анкета тримає мапу `photoThumbs` (`profileDetails`,
 * ключ — імʼя файлу оригіналу, `buildPhotoThumbKey`). Картка стрічки бере
 * мініатюру головного фото у своє `avatar`, рядок малює мініатюри, а перегляд
 * на весь екран — оригінали. Нема мініатюри — показується оригінал, як і
 * раніше: мапа лише прискорює показ, а не вирішує, що показати.
 */
export const PHOTO_THUMB_FOLDER = 'thumbs';
export const PHOTO_THUMB_MAX_DIMENSION = 720;
export const PHOTO_THUMB_MAX_KB = 160;

const STORAGE_OBJECT_SEGMENT = '/o/';

export const readStoragePathFromUrl = url => {
  const text = String(url || '');
  const index = text.indexOf(STORAGE_OBJECT_SEGMENT);
  if (index < 0) return '';
  const [encodedPath] = text.slice(index + STORAGE_OBJECT_SEGMENT.length).split('?');
  if (!encodedPath) return '';
  try {
    return decodeURIComponent(encodedPath);
  } catch {
    return '';
  }
};

const THUMB_PATH_PATTERN = new RegExp(`^avatar/[^/]+/${PHOTO_THUMB_FOLDER}/`);

export const isPhotoThumbPath = path => THUMB_PATH_PATTERN.test(String(path || ''));

export const isPhotoThumbUrl = url => isPhotoThumbPath(readStoragePathFromUrl(url));

// Мініатюру має лише фото самої анкети (`avatar/{uid}/{файл}`): ліки, копії
// для посилань і самі мініатюри лежать глибше й у стрічку не йдуть.
export const buildPhotoThumbPath = originalPath => {
  const match = /^avatar\/([^/]+)\/([^/]+)$/.exec(String(originalPath || ''));
  return match ? `avatar/${match[1]}/${PHOTO_THUMB_FOLDER}/${match[2]}` : '';
};

// Ключ RTDB не може містити `.`, `#`, `$`, `[`, `]` і `/`, а імʼя файлу
// містить крапку розширення.
export const buildPhotoThumbKey = url => {
  const path = readStoragePathFromUrl(url) || String(url || '');
  const name = path.split('/').pop() || '';
  return name.replace(/[.#$[\]/]/g, '_');
};

export const pickPhotoThumb = (url, thumbs) => {
  if (!url || !thumbs || typeof thumbs !== 'object') return '';
  const key = buildPhotoThumbKey(url);
  const thumb = key ? thumbs[key] : '';
  return typeof thumb === 'string' ? thumb.trim() : '';
};

/** Що показати в рядку замість оригіналу — мініатюру, коли вона є. */
export const resolveFeedPhoto = (url, photoThumbs) => pickPhotoThumb(url, photoThumbs) || url;

/** Мапа без мініатюр фото, яких в анкеті вже немає (`photos`). */
export const prunePhotoThumbs = (thumbs, photos) => {
  if (!thumbs || typeof thumbs !== 'object') return {};
  const keep = new Set((Array.isArray(photos) ? photos : []).map(buildPhotoThumbKey).filter(Boolean));
  return Object.fromEntries(Object.entries(thumbs).filter(([key, value]) => keep.has(key) && typeof value === 'string' && value));
};
