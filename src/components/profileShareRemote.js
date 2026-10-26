import { get, ref, update } from 'firebase/database';
import {
  deleteObject,
  getBytes,
  getDownloadURL,
  ref as storageRef,
  uploadBytes,
} from 'firebase/storage';
import { database, isReactionPermissionDeniedError, storage } from './config';
import {
  PROFILE_SHARES_ROOT,
  PROFILE_SHARE_SLOTS_ROOT,
  buildProfileShareCard,
  buildProfileShareUrl,
  canShareProfileCard,
  profileHasPhoneForShare,
  findFreeProfileShareSlot,
  generateProfileShareToken,
  isProfileShareExpired,
  isSameProfileShareCard,
  listProfileShareSlots,
  normalizeProfileShareOptions,
  resolveProfileShareExpiresAt,
  sameProfileSharePhotoSources,
  selectProfileSharePhotos,
} from '../utils/profileShare';

/*
 * Мережевий бік анкети за посиланням (`utils/profileShare`).
 *
 * Знімок і слот пишуться **одним** записом: правила пускають знімок лише
 * тоді, коли слот власниці показує на його токен, і не дають зняти слот,
 * лишивши знімок, — тож посилання, якого власниця не бачить у своєму
 * переліку (і тому не може відкликати), не буває.
 *
 * Фото копіюються в `profileShares/{token}/` у Storage: гість бере їх за
 * адресою з токеном, яка правил не питає, тож відкликати фото можна лише
 * видаливши файл. Копія видаляється разом із посиланням.
 */

export const PROFILE_SHARE_ERRORS = Object.freeze({
  slotsFull: 'PROFILE_SHARE_SLOTS_FULL',
  incomplete: 'PROFILE_SHARE_INCOMPLETE',
  phoneMissing: 'PROFILE_SHARE_PHONE_MISSING',
  rulesMissing: 'PROFILE_SHARE_RULES_MISSING',
});

const shareError = (code, cause) => {
  const error = new Error(code);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
};

const sniffImageType = bytes => {
  const b = bytes;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45) return 'image/webp';
  return '';
};

const EXTENSIONS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp' };

// Правил Storage під копії ще не викотили: тоді кожне збереження анкети
// качало б усі фото заради відмови на завантаженні. Одна відмова — і до
// перезавантаження вкладки копіювати вже не пробуємо.
let photoUploadsBlocked = false;

const readPhotoBytes = async url => {
  try {
    return new Uint8Array(await getBytes(storageRef(storage, url)));
  } catch (bytesError) {
    // Той самий запасний шлях, що й у `copyProfilePhotosBetweenCards`: getBytes
    // падає на CORS там, де звичайний GET за адресою проходить.
    const response = await fetch(url);
    if (!response.ok) throw bytesError;
    return new Uint8Array(await response.arrayBuffer());
  }
};

/**
 * Копіює фото в теку знімка. Фото, яке не скопіювалось, у знімок не йде
 * (адреси оригіналу знімок не несе), а в `sources` лишаються лише
 * скопійовані — тож наступне оновлення спробує решту знову.
 */
export const copyPhotosToProfileShare = async ({ token, uid, sourceUrls = [] }) => {
  const copies = [];
  const sources = [];
  let failed = 0;
  for (const [index, url] of sourceUrls.entries()) {
    if (photoUploadsBlocked) {
      failed += 1;
      continue;
    }
    try {
      const bytes = await readPhotoBytes(url);
      const contentType = sniffImageType(bytes) || 'image/jpeg';
      // Ім'я нове на кожну копію: правила дозволяють файл лише створити, а
      // не переписати, і старі копії видаляються вже після запису знімка.
      const name = `${index}-${Date.now().toString(36)}.${EXTENSIONS[contentType] || 'jpg'}`;
      const target = storageRef(storage, `${PROFILE_SHARES_ROOT}/${token}/${name}`);
      try {
        await uploadBytes(target, bytes, { contentType, customMetadata: { owner: uid } });
      } catch (uploadError) {
        if (uploadError?.code === 'storage/unauthorized') photoUploadsBlocked = true;
        throw uploadError;
      }
      copies.push(await getDownloadURL(target));
      sources.push(url);
    } catch (error) {
      failed += 1;
      console.warn('[profileShare] фото не скопіювалось', error);
    }
  }
  return { copies, sources, failed };
};

export const deleteProfileSharePhotos = async (urls = []) => {
  await Promise.all((urls || []).filter(Boolean).map(async url => {
    try {
      await deleteObject(storageRef(storage, url));
    } catch (error) {
      // Файлу вже немає або правил Storage ще не викотили: посилання
      // однаково відкликане — сам знімок у базі вже стерто.
      if (error?.code !== 'storage/object-not-found') console.warn('[profileShare] копію фото не видалено', error);
    }
  }));
};

export const readOwnProfileShareSlots = async uid => {
  if (!uid) return [];
  const snapshot = await get(ref(database, `${PROFILE_SHARE_SLOTS_ROOT}/${uid}`));
  return listProfileShareSlots(snapshot.exists() ? snapshot.val() : {});
};

const toSlotMap = slots => Object.fromEntries((slots || []).map(slot => [slot.slot, slot]));

const slotRecordFor = ({ token, role, createdAt, expiresAt, options, sources, copies }) => ({
  token,
  role,
  createdAt,
  ...(expiresAt ? { expiresAt } : {}),
  options: normalizeProfileShareOptions(options),
  ...(sources.length ? { photoSources: sources } : {}),
  ...(copies.length ? { photoCopies: copies } : {}),
});

const shareNodeFor = ({ uid, slot, createdAt, updatedAt, expiresAt, card }) => ({
  owner: uid,
  slot,
  createdAt,
  updatedAt,
  ...(expiresAt ? { expiresAt } : {}),
  card,
});

// Останній записаний знімок кожного посилання — памʼять вкладки: інакше
// кожне збереження анкети спершу перечитувало б усі знімки, щоб дізнатись,
// що переписувати нема чого.
const lastWrittenCards = new Map();

export const createProfileShare = async ({ uid, profile, role, options, expiryDays, slots = [], now = Date.now() }) => {
  const slot = findFreeProfileShareSlot(toSlotMap(slots));
  if (slot === null) throw shareError(PROFILE_SHARE_ERRORS.slotsFull);
  const settings = normalizeProfileShareOptions(options);
  const draft = buildProfileShareCard(profile, { role, options: settings });
  if (!canShareProfileCard(draft)) throw shareError(PROFILE_SHARE_ERRORS.incomplete);
  if (!profileHasPhoneForShare(profile)) throw shareError(PROFILE_SHARE_ERRORS.phoneMissing);

  const token = generateProfileShareToken();
  const photos = await copyPhotosToProfileShare({ token, uid, sourceUrls: selectProfileSharePhotos(profile, settings) });
  const card = buildProfileShareCard(profile, { role, options: settings, photos: photos.copies });
  const expiresAt = resolveProfileShareExpiresAt(expiryDays, now);
  const record = slotRecordFor({ token, role, createdAt: now, expiresAt, options: settings, ...photos });
  try {
    await update(ref(database), {
      [`${PROFILE_SHARES_ROOT}/${token}`]: shareNodeFor({ uid, slot, createdAt: now, updatedAt: now, expiresAt, card }),
      [`${PROFILE_SHARE_SLOTS_ROOT}/${uid}/${slot}`]: record,
    });
  } catch (error) {
    await deleteProfileSharePhotos(photos.copies);
    if (isReactionPermissionDeniedError(error)) throw shareError(PROFILE_SHARE_ERRORS.rulesMissing, error);
    throw error;
  }
  lastWrittenCards.set(token, card);
  return {
    share: { slot, ...record, options: settings },
    url: buildProfileShareUrl(token),
    photosSkipped: photos.failed,
  };
};

const readStoredShareCard = async token => {
  const snapshot = await get(ref(database, `${PROFILE_SHARES_ROOT}/${token}/card`));
  return snapshot.exists() ? snapshot.val() : null;
};

/**
 * Переписує знімок з поточної анкети, коли в ньому щось змінилось. Фото
 * копіюються наново лише тоді, коли змінився їхній перелік.
 *
 * Дві відповіді тут — не оновлення, а відкликання (`removed`):
 * - знімка вже немає (його зняв адмін): правила не дають відновити його тим
 *   самим токеном, і слот, що лишився, прибирається;
 * - з анкети вже нічого показати (імʼя стерли, «Очистити анкету»): посилання
 *   зі старою анкетою після того, як людина її стерла, — саме те, чого вона
 *   не хотіла.
 */
export const refreshProfileShare = async ({ uid, profile, share, now = Date.now() }) => {
  if (!share?.token || isProfileShareExpired(share, now)) return { changed: false, share };
  const settings = normalizeProfileShareOptions(share.options);
  if (!canShareProfileCard(buildProfileShareCard(profile, { role: share.role, options: settings }))) {
    await revokeProfileShare({ uid, share });
    return { changed: true, removed: true, share };
  }

  if (!lastWrittenCards.has(share.token)) {
    lastWrittenCards.set(share.token, await readStoredShareCard(share.token));
  }
  if (!lastWrittenCards.get(share.token)) {
    await revokeProfileShare({ uid, share });
    return { changed: true, removed: true, share };
  }

  const wantedSources = selectProfileSharePhotos(profile, settings);
  const keepPhotos = sameProfileSharePhotoSources(wantedSources, share.photoSources);
  const photos = keepPhotos
    ? { copies: share.photoCopies || [], sources: share.photoSources || [], failed: 0 }
    : await copyPhotosToProfileShare({ token: share.token, uid, sourceUrls: wantedSources });
  const card = buildProfileShareCard(profile, { role: share.role, options: settings, photos: photos.copies });
  if (keepPhotos && isSameProfileShareCard(lastWrittenCards.get(share.token), card)) {
    return { changed: false, share };
  }

  const record = slotRecordFor({ ...share, options: settings, ...photos });
  try {
    await update(ref(database), {
      [`${PROFILE_SHARES_ROOT}/${share.token}`]: shareNodeFor({
        uid, slot: share.slot, createdAt: share.createdAt, updatedAt: now, expiresAt: share.expiresAt, card,
      }),
      [`${PROFILE_SHARE_SLOTS_ROOT}/${uid}/${share.slot}`]: record,
    });
  } catch (error) {
    if (!keepPhotos) await deleteProfileSharePhotos(photos.copies);
    // Знімок зняли вже після того, як вкладка його прочитала.
    if (isReactionPermissionDeniedError(error) && !(await readStoredShareCard(share.token))) {
      await revokeProfileShare({ uid, share });
      return { changed: true, removed: true, share };
    }
    throw error;
  }
  lastWrittenCards.set(share.token, card);
  if (!keepPhotos) {
    const kept = new Set(photos.copies);
    await deleteProfileSharePhotos((share.photoCopies || []).filter(url => !kept.has(url)));
  }
  return { changed: true, share: { slot: share.slot, ...record, options: settings } };
};

export const revokeProfileShare = async ({ uid, share }) => {
  await update(ref(database), {
    [`${PROFILE_SHARES_ROOT}/${share.token}`]: null,
    [`${PROFILE_SHARE_SLOTS_ROOT}/${uid}/${share.slot}`]: null,
  });
  lastWrittenCards.delete(share.token);
  await deleteProfileSharePhotos(share.photoCopies);
};

/** Посилання, строк яких минув, прибираються разом з копіями фото. */
export const removeExpiredProfileShares = async ({ uid, shares = [], now = Date.now() }) => {
  const expired = shares.filter(share => isProfileShareExpired(share, now));
  for (const share of expired) {
    try {
      await revokeProfileShare({ uid, share });
    } catch (error) {
      console.warn('[profileShare] прострочене посилання не прибрано', error);
    }
  }
  return shares.filter(share => !expired.includes(share));
};

/**
 * Картка для гостя: `ok` з карткою, `missing` — токена немає, його відкликали
 * або минув строк (правило відмовляє, і відрізняти ці випадки гостеві нема
 * потреби), `error` — мережа.
 */
export const readSharedProfileCard = async token => {
  try {
    const snapshot = await get(ref(database, `${PROFILE_SHARES_ROOT}/${token}/card`));
    return snapshot.exists() ? { status: 'ok', card: snapshot.val() } : { status: 'missing' };
  } catch (error) {
    if (isReactionPermissionDeniedError(error)) return { status: 'missing' };
    return { status: 'error', error };
  }
};
