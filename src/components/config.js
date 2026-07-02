import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { collection, doc, getDoc as firebaseGetDoc, getDocs as firebaseGetDocs, getFirestore, setDoc, updateDoc, deleteField } from 'firebase/firestore';
import { getDownloadURL as firebaseGetDownloadURL, getStorage, uploadBytes, ref, deleteObject, listAll as firebaseListAll } from 'firebase/storage';
import {
  getDatabase,
  ref as ref2,
  get as firebaseGet,
  remove,
  set,
  update,
  push,
  orderByChild,
  query,
  orderByKey,
  startAfter,
  limitToFirst,
  limitToLast,
  startAt,
  endAt,
  endBefore,
  equalTo,
} from 'firebase/database';
import { PAGE_SIZE, BATCH_SIZE, MEDICATION_SCHEDULE_CLEANUP_DAY_LIMIT } from './constants';
import { filterOutMedicationPhotos } from '../utils/photoFilters';
import { convertDriveLinkToImage } from '../utils/convertDriveLinkToImage';
import { getCurrentDate } from './foramtDate';
import toast from 'react-hot-toast';
import { getCard, incrementMatchingLoadStat, removeCard, setIdsForQuery, normalizeQueryKey } from '../utils/cardIndex';
import { updateCard } from '../utils/cardsStorage';
import { parseUkTriggerQuery } from '../utils/parseUkTrigger';
import { getCacheKey } from '../utils/cache';
import { getReactionCategory, isGetInTouchDateOnOrBeforeToday } from 'utils/reactionCategory';
import { buildSearchIndexCandidates, encodeKey } from '../utils/searchIndexCandidates';
import { getSubmittedSearchIndexKeys } from '../utils/searchIndexSync';
import {
  SEARCH_ID_INDEXED_FIELDS,
  buildSearchIdCandidateKeys,
  buildSearchIdRecordKey,
  getEqualToCandidates,
  makeSearchKeyValue,
  normalizeSearchIdInput,
  normalizeSearchDateComparableValue,
  shouldSkipBroadFallbackForExactSearchId,
} from '../utils/searchKeyUtils';
import { resolveEqualToSearchKeys } from '../utils/searchKeyCheckboxFilters';
import { searchByIndexOn } from './searchByIndexOn';
import { withAdminDownloadToast } from '../utils/backendDownloadToast';

const isDev = process.env.NODE_ENV === 'development';

const firebaseConfig = {
  apiKey: process.env.REACT_APP_API_KEY,
  authDomain: process.env.REACT_APP_AUTH_DOMAIN,
  databaseURL: process.env.REACT_APP_DATABASE_URL,
  projectId: process.env.REACT_APP_PROJECT_ID,
  storageBucket: process.env.REACT_APP_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_APP_ID,
};

// Ініціалізація Firebase
const app = initializeApp(firebaseConfig);

// Ініціалізація сервісів
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const database = getDatabase(app);

const getCurrentAdminUid = () => auth.currentUser?.uid;

if (typeof window !== 'undefined') {
  window.__getBackendDownloadToastUid = getCurrentAdminUid;
}

const get = (...args) => {
  incrementMatchingLoadStat('rtdbReads');
  return withAdminDownloadToast(firebaseGet(...args), {
    getUid: getCurrentAdminUid,
    operation: 'get',
    source: 'config',
    path: args[0],
  });
};

const getDoc = (...args) =>
  withAdminDownloadToast(firebaseGetDoc(...args), {
    getUid: getCurrentAdminUid,
    operation: 'getDoc',
    source: 'config',
    path: args[0],
  });

const getDocs = (...args) =>
  withAdminDownloadToast(firebaseGetDocs(...args), {
    getUid: getCurrentAdminUid,
    operation: 'getDocs',
    source: 'config',
    path: args[0],
  });

const listAll = (...args) => {
  incrementMatchingLoadStat('storageListAllCalls');
  return withAdminDownloadToast(firebaseListAll(...args), {
    getUid: getCurrentAdminUid,
    operation: 'listAll',
    source: 'config',
    path: args[0],
  });
};

const getDownloadURL = (...args) => {
  incrementMatchingLoadStat('storageDownloadUrlCalls');
  return withAdminDownloadToast(firebaseGetDownloadURL(...args), {
    getUid: getCurrentAdminUid,
    operation: 'Storage URL metadata',
    source: 'config',
    path: args[0],
  });
};

export { PAGE_SIZE, BATCH_SIZE, MEDICATION_SCHEDULE_CLEANUP_DAY_LIMIT } from './constants';

const keysToCheck = [...SEARCH_ID_INDEXED_FIELDS];
const SEARCH_KEY_INDEX_ROOT = 'searchKey';
const SEARCH_KEY_USERS_INDEX_ROOT = `${SEARCH_KEY_INDEX_ROOT}/users`;
const BLOOD_SEARCH_KEY_INDEX = 'blood';
const MARITAL_STATUS_SEARCH_KEY_INDEX = 'maritalStatus';
const CONTACT_SEARCH_KEY_INDEX = 'contact';
const AGE_SEARCH_KEY_INDEX = 'age';
const IMT_SEARCH_KEY_INDEX = 'imt';
const HEIGHT_SEARCH_KEY_INDEX = 'height';
const WEIGHT_SEARCH_KEY_INDEX = 'weight';
const CSECTION_SEARCH_KEY_INDEX = 'csection';
const ROLE_SEARCH_KEY_INDEX = 'role';
const USER_ID_SEARCH_KEY_INDEX = 'userId';
const REACTION_SEARCH_KEY_INDEX = 'reaction';
const FIELD_COUNT_SEARCH_KEY_INDEX = 'fields';
const LAST_ACTION_SEARCH_KEY_INDEX = 'lastAction';
const GET_IN_TOUCH_SEARCH_KEY_INDEX = 'getInTouch';
const SEARCH_KEY_BATCH_UPLOAD_SIZE = 100;
const SEARCH_INDEX_COLLECTION_CACHE_PREFIX = 'search-index:collection:v1:';
const SEARCH_INDEX_COLLECTION_CACHE_TTL_MS = 60 * 60 * 1000;
const SEARCH_KEY_INDEX_TYPES = {
  blood: BLOOD_SEARCH_KEY_INDEX,
  maritalStatus: MARITAL_STATUS_SEARCH_KEY_INDEX,
  csection: CSECTION_SEARCH_KEY_INDEX,
  contact: CONTACT_SEARCH_KEY_INDEX,
  role: ROLE_SEARCH_KEY_INDEX,
  userId: USER_ID_SEARCH_KEY_INDEX,
  age: AGE_SEARCH_KEY_INDEX,
  imtHeightWeight: IMT_SEARCH_KEY_INDEX,
  reaction: REACTION_SEARCH_KEY_INDEX,
  fieldCount: FIELD_COUNT_SEARCH_KEY_INDEX,
  lastAction: LAST_ACTION_SEARCH_KEY_INDEX,
  getInTouch: GET_IN_TOUCH_SEARCH_KEY_INDEX,
};

const getSearchIndexCacheStorage = () => {
  if (typeof window === 'undefined') return null;
  if (!window.localStorage) return null;
  return window.localStorage;
};

const getSearchIndexCollectionCacheKey = collection =>
  `${SEARCH_INDEX_COLLECTION_CACHE_PREFIX}${String(collection || '').trim()}`;

const readCachedIndexCollection = (collection, maxAgeMs = SEARCH_INDEX_COLLECTION_CACHE_TTL_MS) => {
  const storage = getSearchIndexCacheStorage();
  const cacheKey = getSearchIndexCollectionCacheKey(collection);
  if (!storage || !cacheKey) return null;

  try {
    const raw = storage.getItem(cacheKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (!Number.isFinite(parsed.cachedAtMs)) return null;
    if (Date.now() - parsed.cachedAtMs > maxAgeMs) return null;
    if (!parsed.data || typeof parsed.data !== 'object') return null;
    return parsed.data;
  } catch (error) {
    if (isDev) console.error(`Unable to read cached index collection "${collection}"`, error);
    return null;
  }
};

const writeCachedIndexCollection = (collection, data) => {
  const storage = getSearchIndexCacheStorage();
  const cacheKey = getSearchIndexCollectionCacheKey(collection);
  if (!storage || !cacheKey || !data || typeof data !== 'object') return;

  try {
    storage.setItem(
      cacheKey,
      JSON.stringify({
        cachedAtMs: Date.now(),
        data,
      })
    );
  } catch (error) {
    if (isDev) console.error(`Unable to write cached index collection "${collection}"`, error);
  }
};

const loadCollectionWithIndexCache = async (collection, options = {}) => {
  const { forceRefresh = false, maxAgeMs = SEARCH_INDEX_COLLECTION_CACHE_TTL_MS } = options;
  if (!collection) return null;

  if (!forceRefresh) {
    const cached = readCachedIndexCollection(collection, maxAgeMs);
    if (cached) return cached;
  }

  const snapshot = await get(ref2(database, collection));
  if (!snapshot.exists()) return null;

  const data = snapshot.val() || {};
  writeCachedIndexCollection(collection, data);
  return data;
};

const collectUserIdsBySearchIdKeys = async (searchKeys, options = {}) => {
  const uniqueIds = new Set();
  const { includePrefixMatches = true } = options;
  const addIds = value => {
    const ids = Array.isArray(value) ? value : [value];

    ids.forEach(id => {
      if (id) {
        uniqueIds.add(id);
      }
    });
  };

  const uniqueSearchKeys = [...new Set(searchKeys)];

  await Promise.all(
    uniqueSearchKeys.map(async searchKey => {
      const searchEntrySnapshot = await get(ref2(database, `searchId/${searchKey}`));
      if (!searchEntrySnapshot.exists()) return;

      addIds(searchEntrySnapshot.val());
    })
  );

  if (includePrefixMatches) {
    await Promise.all(
      uniqueSearchKeys.map(async searchKey => {
        const prefixMatchesSnapshot = await get(
          query(
            ref2(database, 'searchId'),
            orderByKey(),
            startAt(searchKey),
            endAt(`${searchKey}\uf8ff`),
          )
        );

        if (!prefixMatchesSnapshot.exists()) return;

        prefixMatchesSnapshot.forEach(matchSnapshot => {
          addIds(matchSnapshot.val());
        });
      })
    );
  }

  return [...uniqueIds];
};



const PDF_SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png'];
const MAX_COMPRESSED_IMAGE_DIMENSION = 2400;
const MIN_JPEG_QUALITY = 0.1;
const JPEG_QUALITY_STEP = 0.07;
const DOWNSCALE_STEP = 0.85;

const shouldKeepOriginalUpload = (photo, disableCompression, maxSizeKB) => {
  if (!photo) return false;
  if (disableCompression) return true;
  const type = String(photo.type || '').toLowerCase();
  return photo.size <= maxSizeKB * 1024 && PDF_SUPPORTED_IMAGE_TYPES.includes(type);
};

const generateUploadFileId = () => {
  const randomSuffix = Math.random().toString(36).slice(2, 10);
  return `${Date.now()}-${randomSuffix}`;
};

export const getUrlofUploadedAvatar = async (photo, userId, options = {}) => {
  const { disableCompression = false, maxSizeKB = 1024 } = options;
  const file = shouldKeepOriginalUpload(photo, disableCompression, maxSizeKB)
    ? photo
    : await getFileBlob(await compressPhoto(photo, maxSizeKB));

  const uniqueId = generateUploadFileId(); // генеруємо унікальне ім"я для фото
  const fileName = `${uniqueId}.jpg`; // Використовуємо унікальне ім'я для файлу
  const pathSegments = ['avatar', userId];
  if (options?.subfolder) {
    pathSegments.push(options.subfolder);
  }
  pathSegments.push(fileName);
  const filePath = pathSegments.join('/');
  const linkToFile = ref(storage, filePath); // створюємо посилання на місце збереження фото в Firebase
  await uploadBytes(linkToFile, file); // завантажуємо фото
  const url = await getDownloadURL(linkToFile); // отримуємо URL-адресу завантаженого фото
  return url;
};

const getFileBlob = file => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      resolve(new Blob([reader.result], { type: file.type }));
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
};

const compressPhoto = (file, maxSizeKB) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = event => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const maxSizeBytes = maxSizeKB * 1024;
        const maxSourceDimension = Math.max(img.width, img.height);
        let scale = maxSourceDimension > MAX_COMPRESSED_IMAGE_DIMENSION
          ? MAX_COMPRESSED_IMAGE_DIMENSION / maxSourceDimension
          : 1;

        const renderAtScale = nextScale => {
          const targetWidth = Math.max(1, Math.round(img.width * nextScale));
          const targetHeight = Math.max(1, Math.round(img.height * nextScale));
          canvas.width = targetWidth;
          canvas.height = targetHeight;
          ctx.clearRect(0, 0, targetWidth, targetHeight);
          ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
        };

        const encodeAtCurrentScale = () => {
          let quality = 0.92;
          let compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
          let compressedFile = dataURLToFile(compressedDataUrl);

          while (compressedFile.size > maxSizeBytes && quality > MIN_JPEG_QUALITY) {
            quality = Math.max(quality - JPEG_QUALITY_STEP, MIN_JPEG_QUALITY);
            compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
            compressedFile = dataURLToFile(compressedDataUrl);
          }

          return compressedFile;
        };

        renderAtScale(scale);
        let compressedFile = encodeAtCurrentScale();

        while (compressedFile.size > maxSizeBytes && scale > 0.15) {
          scale *= DOWNSCALE_STEP;
          renderAtScale(scale);
          compressedFile = encodeAtCurrentScale();
        }

        if (compressedFile.size > maxSizeBytes) {
          reject(new Error('Не вдалося стиснути фото до дозволеного розміру'));
          return;
        }

        resolve(compressedFile);
      };
      img.onerror = reject;
      img.src = event.target.result; // Завантажуємо фото в об'єкт Image
    };
    reader.onerror = reject;
    reader.readAsDataURL(file); // Читаємо файл як Data URL для canvas
  });
};

// Функція для перетворення dataURL на файл
const dataURLToFile = dataUrl => {
  const arr = dataUrl.split(',');
  const mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new File([u8arr], 'compressed.jpg', { type: mime });
};

export const fetchUserData = async userId => {
  const userRef = doc(db, 'users', userId);
  const docSnap = await getDoc(userRef);
  const existingData = docSnap.data();
  return { existingData, userRef };
};

export const fetchUsersCollection = async () => {
  //отримує дані як масив
  const usersCollection = collection(db, 'users');
  const querySnapshot = await getDocs(usersCollection);
  const database = querySnapshot.docs.map(doc => doc.data());
  // console.log('userDataArray!!!!!!! :>> ', userDataArray);
  return database;
};

export const fetchUsersCollectionInRTDB = async () => {
  //отримує дані як об"єкт, перероблюємо потім в масив
  const usersRef = ref2(database, 'users');
  // Отримання даних один раз
  const snapshot = await get(usersRef);
  if (snapshot.exists()) {
    const data = snapshot.val();
    // Перетворюємо об'єкт у масив
    const dataArray = Object.keys(data).map(key => data[key]);
    return dataArray;
  } else {
    return []; // Повертаємо пустий масив, якщо немає даних
  }
};

export const fetchAllUsers = async () => {
  const [usersSnap, newUsersSnap] = await Promise.all([
    get(ref2(database, 'users')),
    get(ref2(database, 'newUsers')),
  ]);
  const usersData = usersSnap.exists() ? usersSnap.val() : {};
  const newUsersData = newUsersSnap.exists() ? newUsersSnap.val() : {};
  const ids = new Set([
    ...Object.keys(usersData),
    ...Object.keys(newUsersData),
  ]);
  const allIds = [];
  ids.forEach(id => {
    const merged = { ...(usersData[id] || {}), ...(newUsersData[id] || {}) };
    updateCard(id, merged);
    allIds.push(id);
    Object.entries(merged).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      const cacheKey = getCacheKey(
        'search',
        normalizeQueryKey(`${key}=${value}`),
      );
      setIdsForQuery(cacheKey, [id]);
    });
  });
  setIdsForQuery('allUsers', allIds);
};

export const cacheFilteredUsers = async (
  filterForload,
  filterSettings = {},
  favoriteUsers = {},
  cacheKey,
  options = {},
) => {
  const usersObj = await fetchAllFilteredUsers(
    filterForload,
    filterSettings,
    favoriteUsers,
    options,
  );
  const ids = [];
  Object.entries(usersObj).forEach(([id, data]) => {
    updateCard(id, data);
    ids.push(id);
    Object.entries(data).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      const keyCache = getCacheKey(
        'search',
        normalizeQueryKey(`${key}=${value}`),
      );
      setIdsForQuery(keyCache, [id]);
    });
  });
  if (cacheKey) setIdsForQuery(cacheKey, ids);
  return ids;
};

export const fetchLatestUsers = async (limit = 9, lastKey) => {
  const usersRef = ref2(database, 'users');
  const realLimit = limit + 1;
  const q =
    lastKey !== undefined ? query(usersRef, orderByKey(), endBefore(lastKey), limitToLast(realLimit)) : query(usersRef, orderByKey(), limitToLast(realLimit));

  const snapshot = await get(q);
  if (!snapshot.exists()) {
    return { users: [], lastKey: null, hasMore: false };
  }

  let entries = Object.entries(snapshot.val()).sort((a, b) => b[0].localeCompare(a[0]));

  const hasMore = entries.length > limit;
  if (hasMore) {
    entries = entries.slice(0, limit);
  }
  const lastEntry = entries[entries.length - 1];

  return {
    users: entries.map(([id, data]) => ({ userId: id, ...data })),
    lastKey: lastEntry ? lastEntry[0] : null,
    hasMore,
  };
};

export const fetchUsersByLastLogin2 = async (limit = 9, lastDate) => {
  const usersRef = ref2(database, 'users');
  const realLimit = limit + 1;
  const { todayDash } = getCurrentDate();
  const cursor =
    typeof lastDate === 'object' && lastDate !== null
      ? { date: lastDate.date || '', userId: lastDate.userId || '' }
      : { date: lastDate || '', userId: '' };

  let fetchLimit = realLimit;
  let entries = [];
  let snapshotSize = 0;

  while (entries.length < realLimit && fetchLimit <= 5000) {
    const q =
      cursor.date
        ? query(usersRef, orderByChild('lastLogin2'), endAt(cursor.date), limitToLast(fetchLimit))
        : query(usersRef, orderByChild('lastLogin2'), endAt(todayDash), limitToLast(fetchLimit));

    const snapshot = await get(q);
    if (!snapshot.exists()) {
      return { users: [], lastKey: null, hasMore: false };
    }

    entries = Object.entries(snapshot.val()).sort((a, b) => {
      const bDate = b[1].lastLogin2 || '';
      const aDate = a[1].lastLogin2 || '';
      const byDate = bDate.localeCompare(aDate);
      if (byDate !== 0) return byDate;
      return b[0].localeCompare(a[0]);
    });

    if (cursor.date) {
      entries = entries.filter(([id, data]) => {
        const date = data.lastLogin2 || '';
        if (date < cursor.date) return true;
        if (date > cursor.date) return false;
        return cursor.userId ? id.localeCompare(cursor.userId) < 0 : false;
      });
    }

    snapshotSize = Object.keys(snapshot.val()).length;
    if (entries.length >= realLimit || snapshotSize < fetchLimit) break;
    fetchLimit *= 2;
  }

  const hasMore = entries.length > limit;
  if (hasMore) entries = entries.slice(0, limit);
  const lastEntry = entries[entries.length - 1];

  return {
    users: entries.map(([id, data]) => ({ userId: id, ...data })),
    lastKey: lastEntry
      ? { date: lastEntry[1].lastLogin2 || '', userId: lastEntry[0] }
      : null,
    hasMore,
  };
};

// Favorites are stored per owner so multiple users can have their own lists
// Add userId to the current owner's favorites list
export const addFavoriteUser = async (userId, ownerId) => {
  try {
    const owner = auth.currentUser;
    if (!owner) return;
    await set(ref2(database, `multiData/favorites/${ownerId || owner.uid}/${userId}`), true);
  } catch (error) {
    console.error('Error adding favorite user:', error);
  }
};

export const removeFavoriteUser = async (userId, ownerId) => {
  try {
    const owner = auth.currentUser;
    if (!owner) return;
    await remove(ref2(database, `multiData/favorites/${ownerId || owner.uid}/${userId}`));
  } catch (error) {
    console.error('Error removing favorite user:', error);
  }
};

export const addDislikeUser = async (userId, ownerId) => {
  try {
    const owner = auth.currentUser;
    if (!owner) return;
    await set(ref2(database, `multiData/dislikes/${ownerId || owner.uid}/${userId}`), true);
  } catch (error) {
    console.error('Error adding dislike user:', error);
  }
};

export const addContactViewUser = async (userId, ownerId) => {
  try {
    const owner = auth.currentUser;
    if (!owner) return;
    await set(ref2(database, `multiData/contactViews/${ownerId || owner.uid}/${userId}`), true);
  } catch (error) {
    console.error('Error adding contact view user:', error);
  }
};

export const addMatchingSearchQuery = async (searchQuery, ownerId) => {
  try {
    const owner = auth.currentUser;
    if (!owner) return;

    const normalizedQuery = String(searchQuery || '').trim();
    if (!normalizedQuery) return;

    const queryRef = push(ref2(database, `multiData/searchQueries/${ownerId || owner.uid}`));
    await set(queryRef, normalizedQuery);
  } catch (error) {
    console.error('Error adding matching search query:', error);
  }
};

export const removeDislikeUser = async (userId, ownerId) => {
  try {
    const owner = auth.currentUser;
    if (!owner) return;
    await remove(ref2(database, `multiData/dislikes/${ownerId || owner.uid}/${userId}`));
  } catch (error) {
    console.error('Error removing dislike user:', error);
  }
};

// Retrieve favorites for a specific owner
export const fetchFavoriteUsers = async ownerId => {
  try {
    const favRef = ref2(database, `multiData/favorites/${ownerId}`);
    const snap = await get(favRef);
    return snap.exists() ? snap.val() : {};
  } catch (error) {
    console.error('Error fetching favorite users:', error);
    return {};
  }
};

// Load full user records for all favorites of the given owner
export const fetchFavoriteUsersData = async ownerId => {
  try {
    const favoriteIds = await fetchFavoriteUsers(ownerId);
    const ids = Object.keys(favoriteIds || {});
    const results = await Promise.all(ids.map(id => fetchUserById(id)));
    const data = {};
    results.forEach((user, idx) => {
      if (user) data[ids[idx]] = user;
    });
    return data;
  } catch (error) {
    console.error('Error fetching favorite users data:', error);
    return {};
  }
};

export const getMedicationScheduleRef = (ownerId, userId) => {
  if (!ownerId || !userId) return null;
  return ref2(database, `multiData/stimulation/${ownerId}/${userId}`);
};

export const fetchMedicationSchedule = async (ownerId, userId) => {
  try {
    const scheduleRef = getMedicationScheduleRef(ownerId, userId);
    if (!scheduleRef) return null;
    const snapshot = await get(scheduleRef);
    return snapshot.exists() ? snapshot.val() : null;
  } catch (error) {
    console.error('Error fetching medication schedule:', error);
    return null;
  }
};

export const saveMedicationSchedule = async (ownerId, userId, data) => {
  try {
    const scheduleRef = getMedicationScheduleRef(ownerId, userId);
    if (!scheduleRef) return;
    await set(scheduleRef, data ?? null);
  } catch (error) {
    console.error('Error saving medication schedule:', error);
    throw error;
  }
};

export const deleteMedicationSchedule = async (ownerId, userId) => {
  const scheduleRef = getMedicationScheduleRef(ownerId, userId);
  if (!scheduleRef) {
    throw new Error('Missing ownerId or userId for medication schedule deletion');
  }

  try {
    await remove(scheduleRef);
  } catch (error) {
    console.error('Error deleting medication schedule:', error);
    throw error;
  }
};

export const clearMedicationScheduleAfterDay = async (
  ownerId,
  userId,
  dayLimit = MEDICATION_SCHEDULE_CLEANUP_DAY_LIMIT,
) => {
  const scheduleRef = getMedicationScheduleRef(ownerId, userId);
  if (!scheduleRef) {
    throw new Error('Missing ownerId or userId for medication schedule clearing');
  }

  const extractRows = rows => {
    if (Array.isArray(rows)) {
      return { list: rows, type: 'array' };
    }

    if (rows && typeof rows === 'object') {
      const keys = Object.keys(rows).sort((a, b) => {
        const numA = Number(a);
        const numB = Number(b);
        const hasNumA = Number.isFinite(numA);
        const hasNumB = Number.isFinite(numB);

        if (hasNumA && hasNumB) {
          return numA - numB;
        }

        if (hasNumA) return -1;
        if (hasNumB) return 1;

        return a.localeCompare(b);
      });

      return { list: keys.map(key => rows[key]), type: 'object', keys };
    }

    return { list: [], type: 'array' };
  };

  const cloneRow = row => {
    if (!row || typeof row !== 'object') {
      return row;
    }

    const base = { ...row };
    if (row.values && typeof row.values === 'object') {
      base.values = { ...row.values };
    }
    return base;
  };

  const parseRowDate = value => {
    if (typeof value !== 'string' || value.length < 10) {
      return null;
    }

    const isoCandidate = value.slice(0, 10);
    const [year, month, day] = isoCandidate.split('-').map(Number);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
      return null;
    }

    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (
      parsed.getUTCFullYear() !== year ||
      parsed.getUTCMonth() !== month - 1 ||
      parsed.getUTCDate() !== day
    ) {
      return null;
    }

    return parsed;
  };

  try {
    const snapshot = await get(scheduleRef);
    if (!snapshot.exists()) {
      return false;
    }

    const schedule = snapshot.val();
    if (!schedule || typeof schedule !== 'object') {
      return false;
    }

    const { list: rowsList, type, keys = [] } = extractRows(schedule.rows);
    if (rowsList.length <= dayLimit) {
      return false;
    }

    const today = new Date();
    const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    const lastNonFutureRowIndex = rowsList.reduce((lastIndex, row, index) => {
      const rowDate = parseRowDate(row?.date);
      if (!rowDate) return lastIndex;
      return rowDate <= todayUtc ? index : lastIndex;
    }, -1);

    const keepCount = Math.max(dayLimit, lastNonFutureRowIndex + 1);
    if (rowsList.length <= keepCount) {
      return false;
    }

    const trimmedList = rowsList.slice(0, keepCount).map(cloneRow);

    let trimmedRows;
    if (type === 'array') {
      trimmedRows = trimmedList;
    } else {
      trimmedRows = {};
      trimmedList.forEach((row, index) => {
        const key = keys[index] ?? String(index);
        trimmedRows[key] = row;
      });
    }

    const updatedSchedule = {
      ...schedule,
      rows: trimmedRows,
      updatedAt: Date.now(),
    };

    await set(scheduleRef, updatedSchedule);
    return true;
  } catch (error) {
    console.error('Error clearing medication schedule after day limit:', error);
    throw error;
  }
};

export const fetchDislikeUsers = async ownerId => {
  try {
    const refPath = ref2(database, `multiData/dislikes/${ownerId}`);
    const snap = await get(refPath);
    return snap.exists() ? snap.val() : {};
  } catch (error) {
    console.error('Error fetching dislike users:', error);
    return {};
  }
};

export const fetchDislikeUsersData = async ownerId => {
  try {
    const dislikeIds = await fetchDislikeUsers(ownerId);
    const ids = Object.keys(dislikeIds || {});
    const results = await Promise.all(ids.map(id => fetchUserById(id)));
    const data = {};
    results.forEach((user, idx) => {
      if (user) data[ids[idx]] = user;
    });
    return data;
  } catch (error) {
    console.error('Error fetching dislike users data:', error);
    return {};
  }
};

const getStimulationShortcutsPath = ownerId =>
  `multiData/stimulationShortcuts/${ownerId}`;

export const fetchStimulationShortcutIds = async ownerId => {
  if (!ownerId) return [];
  try {
    const shortcutRef = ref2(database, getStimulationShortcutsPath(ownerId));
    const snapshot = await get(shortcutRef);
    if (!snapshot.exists()) return [];
    return Object.keys(snapshot.val()).filter(Boolean);
  } catch (error) {
    console.error('Error fetching stimulation shortcuts:', error);
    return [];
  }
};

export const addStimulationShortcutId = async (ownerId, userId) => {
  if (!ownerId || !userId) return;
  try {
    await set(
      ref2(database, `${getStimulationShortcutsPath(ownerId)}/${userId}`),
      true,
    );
  } catch (error) {
    console.error('Error adding stimulation shortcut:', error);
  }
};

export const removeStimulationShortcutId = async (ownerId, userId) => {
  if (!ownerId || !userId) return;
  try {
    await remove(
      ref2(database, `${getStimulationShortcutsPath(ownerId)}/${userId}`),
    );
  } catch (error) {
    console.error('Error removing stimulation shortcut:', error);
  }
};

export const replaceStimulationShortcutIds = async (ownerId, ids) => {
  if (!ownerId) return;
  const shortcutPath = getStimulationShortcutsPath(ownerId);
  const shortcutRef = ref2(database, shortcutPath);
  try {
    const normalizedIds = Array.isArray(ids)
      ? Array.from(new Set(ids.filter(Boolean).map(String)))
      : [];

    if (normalizedIds.length === 0) {
      await remove(shortcutRef);
      return;
    }

    const existingSnapshot = await get(shortcutRef);
    const existingIds = existingSnapshot.exists() ? existingSnapshot.val() : {};
    const normalizedSet = new Set(normalizedIds);

    const updates = {};

    Object.keys(existingIds).forEach(id => {
      if (!normalizedSet.has(id)) {
        updates[id] = null;
      }
    });

    normalizedIds.forEach(id => {
      updates[id] = true;
    });

    if (Object.keys(updates).length === 0) {
      // No changes required but ensure the structure matches the per-user writes
      return;
    }

    await update(ref2(database, shortcutPath), updates);
  } catch (error) {
    console.error('Error replacing stimulation shortcuts:', error);
    throw error;
  }
};

export const fetchCycleUsersData = async (
  statuses = ['stimulation', 'pregnant'],
) => {
  try {
    const list = Array.isArray(statuses) ? statuses : [statuses];
    const normalizedStatuses = Array.from(
      new Set(
        list
          .filter(status => typeof status === 'string')
          .map(status => status.trim())
          .filter(Boolean),
      ),
    );

    if (normalizedStatuses.length === 0) {
      return {};
    }

    const idSet = new Set();

    await Promise.all(
      ['newUsers', 'users'].map(path =>
        Promise.all(
          normalizedStatuses.map(async status => {
            const q = query(
              ref2(database, path),
              orderByChild('cycleStatus'),
              equalTo(status),
            );
            const snap = await get(q);
            if (snap.exists()) {
              Object.keys(snap.val()).forEach(id => idSet.add(id));
            }
          }),
        ),
      ),
    );

    if (idSet.size === 0) {
      return {};
    }

    const ids = Array.from(idSet);
    const records = await Promise.all(ids.map(id => fetchUserById(id)));

    const data = {};
    records.forEach((user, index) => {
      if (!user) return;
      const key = user.userId || ids[index];
      data[key] = user;
    });

    return data;
  } catch (error) {
    console.error('Error fetching cycle users data:', error);
    return {};
  }
};

export const setUserComment = async (cardId, text, ownerId) => {
  try {
    const user = auth.currentUser;
    if (!user) {
      throw new Error('User not authenticated');
    }
    if (!cardId || typeof text !== 'string') {
      throw new Error('cardId і text обовʼязкові');
    }
    const commentsOwnerId = ownerId || user.uid;
    const commentsRef = ref2(database, `multiData/comments/${commentsOwnerId}`);
    const q = query(commentsRef, orderByChild('cardId'), equalTo(cardId));
    const snap = await get(q);
    const lastAction = Date.now();
    if (snap.exists()) {
      const key = Object.keys(snap.val())[0];
      await set(ref2(database, `multiData/comments/${commentsOwnerId}/${key}`), {
        cardId,
        text,
        authorId: commentsOwnerId,
        lastAction,
      });
      return { commentId: key, lastAction };
    }
    const newRef = push(commentsRef);
    await set(newRef, { cardId, text, authorId: commentsOwnerId, lastAction });
    return { commentId: newRef.key, lastAction };
  } catch (error) {
    console.error('Error setting comment:', error);
    return null;
  }
};

export const updateCommentByOwner = async ({ ownerId, commentId, cardId, text }) => {
  try {
    const user = auth.currentUser;
    if (!user) {
      throw new Error('User not authenticated');
    }
    if (!ownerId || !commentId || !cardId || typeof text !== 'string') {
      throw new Error('ownerId, commentId, cardId і text обовʼязкові');
    }
    const lastAction = Date.now();
    await set(ref2(database, `multiData/comments/${ownerId}/${commentId}`), {
      cardId,
      text,
      authorId: ownerId,
      lastAction,
    });
    return { commentId, lastAction, ownerId };
  } catch (error) {
    console.error('Error updating comment by owner:', error);
    return null;
  }
};

export const deleteCommentByOwner = async ({ ownerId, commentId }) => {
  try {
    const user = auth.currentUser;
    if (!user) {
      throw new Error('User not authenticated');
    }
    if (!ownerId || !commentId) {
      throw new Error('ownerId і commentId обовʼязкові');
    }
    await remove(ref2(database, `multiData/comments/${ownerId}/${commentId}`));
    return true;
  } catch (error) {
    console.error('Error deleting comment by owner:', error);
    return false;
  }
};

export const fetchUserComment = async (ownerId, cardId) => {
  try {
    const q = query(
      ref2(database, `multiData/comments/${ownerId}`),
      orderByChild('cardId'),
      equalTo(cardId)
    );
    const snap = await get(q);
    if (!snap.exists()) return [];
    return Object.entries(snap.val()).map(([commentId, value]) => ({
      commentId,
      cardId: value.cardId,
      text: value.text,
      lastAction: value.lastAction || 0,
    }));
  } catch (error) {
    console.error('Error fetching comment:', error);
    return [];
  }
};

export const fetchUserComments = async (ownerId, cardIds = []) => {
  try {
    incrementMatchingLoadStat('commentsReads', Array.isArray(cardIds) ? cardIds.length : 0);
    const commentsRef = ref2(database, `multiData/comments/${ownerId}`);
    const snaps = await Promise.all(
      cardIds.map(cardId =>
        get(query(commentsRef, orderByChild('cardId'), equalTo(cardId)))
      )
    );
    const result = {};
    snaps.forEach((snap, idx) => {
      if (snap.exists()) {
        const arr = Object.entries(snap.val()).map(([commentId, val]) => ({
          commentId,
          text: val.text || '',
          lastAction: val.lastAction || 0,
        }));
        result[cardIds[idx]] = arr;
      }
    });
    return result;
  } catch (error) {
    console.error('Error fetching comments:', error);
    return {};
  }
};

export const fetchAllCommentsByCardId = async cardId => {
  try {
    if (!cardId) return [];
    const snap = await get(ref2(database, 'multiData/comments'));
    if (!snap.exists()) return [];

    const normalizedCardId = String(cardId).trim().toLowerCase();
    const result = [];

    Object.entries(snap.val() || {}).forEach(([ownerId, ownerComments]) => {
      if (!ownerComments || typeof ownerComments !== 'object') return;
      Object.entries(ownerComments).forEach(([commentId, value]) => {
        if (!value || typeof value !== 'object') return;
        const candidateCardId = String(value.cardId || '').trim().toLowerCase();
        if (candidateCardId !== normalizedCardId) return;
        const text = String(value.text || '').trim();
        if (!text) return;
        result.push({
          ownerId,
          commentId,
          cardId: value.cardId || cardId,
          text,
          authorId: value.authorId || ownerId,
          lastAction: value.lastAction || 0,
        });
      });
    });

    return result;
  } catch (error) {
    console.error('Error fetching all comments by cardId:', error);
    return [];
  }
};

const buildFlowRef = ownerId => ref2(database, `multiData/flow/${ownerId}`);
const sanitizeFlowPathPart = value =>
  String(value || '')
    .trim()
    .replace(/[.#$[\]/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const buildFlowEntryPath = ({ groupPath, date, amount, description = '' }) => {
  const sanitizedSegments = String(groupPath)
    .split('/')
    .map(sanitizeFlowPathPart)
    .filter(Boolean);

  if (sanitizedSegments.length === 0) return '';

  const safeAmount = sanitizeFlowPathPart(amount);
  const safeDescription = sanitizeFlowPathPart(description);
  const entryKey = `${safeAmount}_${safeDescription}`.trim();
  return [...sanitizedSegments, date, entryKey].join('/');
};

const buildFlowDatePath = ({ groupPath, date }) => {
  const sanitizedSegments = String(groupPath)
    .split('/')
    .map(sanitizeFlowPathPart)
    .filter(Boolean);

  if (sanitizedSegments.length === 0 || !date) return '';
  return [...sanitizedSegments, date].join('/');
};

const buildFlowGroupPath = groupPath => {
  const sanitizedSegments = String(groupPath)
    .split('/')
    .map(sanitizeFlowPathPart)
    .filter(Boolean);

  if (sanitizedSegments.length === 0) return '';
  return sanitizedSegments.join('/');
};

const sanitizeFlowValuePart = value =>
  String(value || '')
    .trim()
    .replace(/[#$[\]/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeFlowStoredAmount = value => sanitizeFlowValuePart(String(value || '').replace(/,/g, '.'));

const buildFlowEntryValue = ({ amount, description = '' }) => {
  const safeAmount = normalizeFlowStoredAmount(amount);
  const safeDescription = sanitizeFlowValuePart(description);
  return `${safeAmount}_${safeDescription}`;
};

const generateFlowEntryId = () => `${Date.now()}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;

export const fetchFlowData = async ownerId => {
  if (!ownerId) return {};
  const snapshot = await get(buildFlowRef(ownerId));
  return snapshot.exists() ? snapshot.val() : {};
};

const MONOBANK_API_URL = 'https://api.monobank.ua/bank/currency';
const NBU_ARCHIVE_API_URL = 'https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange';
const UAH_CURRENCY_CODE = 980;
const USD_CURRENCY_CODE = 840;
const EUR_CURRENCY_CODE = 978;
const FLOW_MONOBANK_CACHE_KEY = 'flow:monobank-uah-rates:v2';
const FLOW_NBU_DAILY_CACHE_PREFIX = 'flow:nbu-uah-rates:';
const FLOW_MONOBANK_CACHE_TTL_MS = 60 * 60 * 1000;

const getFlowRatesCacheStorage = () => {
  if (typeof window === 'undefined') return null;
  if (!window.localStorage) return null;
  return window.localStorage;
};

const readFlowRatesCache = () => {
  const storage = getFlowRatesCacheStorage();
  if (!storage) return null;

  try {
    const raw = storage.getItem(FLOW_MONOBANK_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch (error) {
    console.error('Unable to read Flow Monobank cache', error);
    return null;
  }
};

const writeFlowRatesCache = payload => {
  const storage = getFlowRatesCacheStorage();
  if (!storage) return;

  try {
    storage.setItem(FLOW_MONOBANK_CACHE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.error('Unable to write Flow Monobank cache', error);
  }
};

const isValidFlowDateYmd = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
const toNbuDateParam = dateYmd => String(dateYmd || '').replace(/-/g, '');
const getFlowDailyRatesCacheKey = dateYmd => `${FLOW_NBU_DAILY_CACHE_PREFIX}${dateYmd}`;

const parseMonobankPairRates = pair => {
  if (!pair || typeof pair !== 'object') return null;
  const cross = Number(pair.rateCross);
  const buy = Number(pair.rateBuy);
  const sell = Number(pair.rateSell);
  const result = {};

  if (Number.isFinite(cross) && cross > 0) {
    result.cross = cross;
  }
  if (Number.isFinite(buy) && buy > 0) {
    result.buy = buy;
  }
  if (Number.isFinite(sell) && sell > 0) {
    result.sell = sell;
  }
  if (Number.isFinite(result.buy) && Number.isFinite(result.sell)) {
    result.mid = (result.buy + result.sell) / 2;
  } else if (Number.isFinite(result.cross)) {
    result.mid = result.cross;
  } else if (Number.isFinite(result.sell)) {
    result.mid = result.sell;
  } else if (Number.isFinite(result.buy)) {
    result.mid = result.buy;
  }

  if (!Number.isFinite(result.mid)) return null;
  return result;
};

const resolvePreferredMonobankRate = rates => {
  if (!rates) return null;
  if (Number.isFinite(rates.cross) && rates.cross > 0) return { value: rates.cross, source: 'cross' };
  if (Number.isFinite(rates.mid) && rates.mid > 0) return { value: rates.mid, source: 'mid' };
  if (Number.isFinite(rates.sell) && rates.sell > 0) return { value: rates.sell, source: 'sell' };
  if (Number.isFinite(rates.buy) && rates.buy > 0) return { value: rates.buy, source: 'buy' };
  return null;
};

const invertMonobankRates = rates => {
  if (!rates) return null;
  return Object.entries(rates).reduce((acc, [key, value]) => {
    if (Number.isFinite(value) && value > 0) {
      acc[key] = 1 / value;
    }
    return acc;
  }, {});
};

const parseMonobankPairDate = pair => {
  const unixSeconds = Number(pair?.date);
  if (!Number.isFinite(unixSeconds) || unixSeconds <= 0) return null;
  return new Date(unixSeconds * 1000).toISOString();
};

const findMonobankRateToUah = (pairs, sourceCode) => {
  const directPair = pairs.find(
    pair => Number(pair?.currencyCodeA) === sourceCode && Number(pair?.currencyCodeB) === UAH_CURRENCY_CODE
  );
  const directRates = parseMonobankPairRates(directPair);
  const directRate = resolvePreferredMonobankRate(directRates);
  if (Number.isFinite(directRate?.value) && directRate.value > 0) {
    return {
      value: directRate.value,
      source: directRate.source,
      pairDate: parseMonobankPairDate(directPair),
      rates: directRates,
    };
  }

  const reversePair = pairs.find(
    pair => Number(pair?.currencyCodeA) === UAH_CURRENCY_CODE && Number(pair?.currencyCodeB) === sourceCode
  );
  const reverseRates = invertMonobankRates(parseMonobankPairRates(reversePair));
  const reverseRate = resolvePreferredMonobankRate(reverseRates);
  if (Number.isFinite(reverseRate?.value) && reverseRate.value > 0) {
    return {
      value: reverseRate.value,
      source: reverseRate.source === 'mid' ? 'mid-inverted' : `${reverseRate.source}-inverted`,
      pairDate: parseMonobankPairDate(reversePair),
      rates: reverseRates,
    };
  }

  return null;
};

export const fetchMonobankUahExchangeRates = async () => {
  const now = Date.now();
  const cached = readFlowRatesCache();
  if (
    cached &&
    Number.isFinite(cached?.usd) &&
    Number.isFinite(cached?.eur) &&
    Number.isFinite(cached?.cachedAtMs) &&
    now - cached.cachedAtMs < FLOW_MONOBANK_CACHE_TTL_MS
  ) {
    return {
      usd: cached.usd,
      eur: cached.eur,
      fetchedAt: cached.fetchedAt || new Date(cached.cachedAtMs).toISOString(),
      rateDate: cached.rateDate || cached.fetchedAt || new Date(cached.cachedAtMs).toISOString(),
      provider: 'monobank',
      rateType: cached.rateType || 'mid',
      usdRates: cached.usdRates || null,
      eurRates: cached.eurRates || null,
      cache: 'localStorage',
    };
  }

  const response = await fetch(MONOBANK_API_URL);
  if (!response.ok) {
    throw new Error(`Monobank currency request failed with status ${response.status}`);
  }

  const rates = await response.json();
  if (!Array.isArray(rates)) {
    throw new Error('Monobank currency response is not an array');
  }

  const usdRate = findMonobankRateToUah(rates, USD_CURRENCY_CODE);
  const eurRate = findMonobankRateToUah(rates, EUR_CURRENCY_CODE);

  if (!Number.isFinite(usdRate?.value) || !Number.isFinite(eurRate?.value)) {
    throw new Error('Monobank currency response does not contain USD/UAH or EUR/UAH rates');
  }

  const fetchedAt = new Date().toISOString();
  const rateDate = [usdRate.pairDate, eurRate.pairDate].filter(Boolean).sort()[0] || fetchedAt;
  const result = {
    usd: usdRate.value,
    eur: eurRate.value,
    fetchedAt,
    rateDate,
    provider: 'monobank',
    rateType: `${usdRate.source}/${eurRate.source}`,
    usdRates: usdRate.rates,
    eurRates: eurRate.rates,
    cache: 'network',
  };

  writeFlowRatesCache({
    ...result,
    cachedAtMs: now,
  });

  return result;
};

const fetchNbuRateToUahByDate = async (currencyCode, dateYmd) => {
  if (!currencyCode || !isValidFlowDateYmd(dateYmd)) return null;
  const dateParam = toNbuDateParam(dateYmd);
  const url = `${NBU_ARCHIVE_API_URL}?valcode=${encodeURIComponent(currencyCode)}&date=${dateParam}&json`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`NBU currency request failed with status ${response.status}`);
  }

  const payload = await response.json();
  const row = Array.isArray(payload) ? payload[0] : null;
  const rate = Number(row?.rate);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error(`NBU response does not contain ${currencyCode}/UAH rate for ${dateYmd}`);
  }

  return {
    value: rate,
    rateDate: row?.exchangedate || dateYmd,
  };
};

export const fetchNbuUahExchangeRatesByDate = async dateYmd => {
  if (!isValidFlowDateYmd(dateYmd)) return null;
  const storage = getFlowRatesCacheStorage();
  const cacheKey = getFlowDailyRatesCacheKey(dateYmd);

  if (storage) {
    try {
      const cachedRaw = storage.getItem(cacheKey);
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw);
        if (Number.isFinite(cached?.usd) && Number.isFinite(cached?.eur)) {
          return {
            ...cached,
            cache: 'localStorage',
          };
        }
      }
    } catch (error) {
      console.error('Unable to read Flow NBU cache', error);
    }
  }

  const [usdRate, eurRate] = await Promise.all([
    fetchNbuRateToUahByDate('USD', dateYmd),
    fetchNbuRateToUahByDate('EUR', dateYmd),
  ]);

  const result = {
    usd: usdRate?.value,
    eur: eurRate?.value,
    fetchedAt: new Date().toISOString(),
    rateDate: dateYmd,
    provider: 'nbu',
    rateType: 'official',
    cache: 'network',
  };

  if (storage) {
    try {
      storage.setItem(cacheKey, JSON.stringify(result));
    } catch (error) {
      console.error('Unable to write Flow NBU cache', error);
    }
  }

  return result;
};


const isUsableFlowRate = value => Number.isFinite(value) && value > 0;

const normalizeFlowCustomUsdRate = value => {
  const parsed = Number(String(value || '').trim().replace(',', '.'));
  return isUsableFlowRate(parsed) ? parsed : null;
};

const applyFlowCustomUsdRate = (rates, customUsdRate) => {
  const normalizedCustomUsdRate = normalizeFlowCustomUsdRate(customUsdRate);
  if (!normalizedCustomUsdRate) return rates || null;
  return {
    ...(rates || {}),
    usd: normalizedCustomUsdRate,
    customUsdRate: normalizedCustomUsdRate,
  };
};

const getRateVariantsForCurrency = (rates, currencyKey) => {
  if (!rates || typeof rates !== 'object') return [];
  const variants = [];
  const direct = Number(rates[currencyKey]);
  if (isUsableFlowRate(direct)) variants.push({ value: direct, source: 'default' });

  const detailedRates = rates[`${currencyKey}Rates`];
  if (detailedRates && typeof detailedRates === 'object') {
    ['buy', 'sell', 'mid', 'cross'].forEach(source => {
      const value = Number(detailedRates[source]);
      if (isUsableFlowRate(value)) variants.push({ value, source });
    });
  }

  return variants;
};

const selectRateVariant = (rates, currencyKey, exchangeRateMode = 'current') => {
  const variants = getRateVariantsForCurrency(rates, currencyKey);
  if (variants.length === 0) return null;
  const mode = String(exchangeRateMode || 'current');
  const bySource = source => variants.find(item => item.source === source)?.value;

  if (mode === 'buy') return bySource('buy') || bySource('mid') || variants[0].value;
  if (mode === 'sell') return bySource('sell') || bySource('mid') || variants[0].value;
  if (mode === 'average' || mode === 'interbank') {
    return bySource('cross') || bySource('mid') || variants[0].value;
  }
  if (mode === 'highest') return Math.max(...variants.map(item => item.value));
  if (mode === 'lowest') return Math.min(...variants.map(item => item.value));

  return variants[0].value;
};

export const resolveFlowExchangeRatesForMode = (rates, exchangeRateMode = 'current') => {
  if (!rates || typeof rates !== 'object') return null;
  const usd = selectRateVariant(rates, 'usd', exchangeRateMode);
  const eur = selectRateVariant(rates, 'eur', exchangeRateMode);
  if (!isUsableFlowRate(usd) && !isUsableFlowRate(eur)) return null;
  return {
    ...rates,
    usd,
    eur,
    selectedRateMode: exchangeRateMode || 'current',
  };
};

export const fetchFlowExchangeRatesForMode = async ({
  date,
  exchangeRateMode = 'current',
  exchangeRates,
  customUsdRate,
} = {}) => {
  const fallbackRates = resolveFlowExchangeRatesForMode(exchangeRates, exchangeRateMode) || exchangeRates || null;
  if (exchangeRateMode === 'nbu' && isValidFlowDateYmd(date)) {
    return applyFlowCustomUsdRate(await fetchNbuUahExchangeRatesByDate(date), customUsdRate);
  }
  return applyFlowCustomUsdRate(fallbackRates, customUsdRate);
};

const formatFlowStoredCurrencyAmount = value => {
  const normalized = normalizeFlowStoredAmount(value);
  const asNumber = Number(normalized);
  if (!Number.isFinite(asNumber)) return normalized;
  return asNumber.toFixed(2);
};

export const saveFlowEntry = async ({
  ownerId,
  groupPath,
  date,
  amount,
  description = '',
  exchangeRates,
  exchangeRateMode = 'current',
  customUsdRate,
  rowCustomUsdRate,
}) => {
  if (!ownerId || !groupPath || !date || !amount) return;
  const datePath = buildFlowDatePath({ groupPath, date });
  if (!datePath) return;
  const normalizedAmountUah = normalizeFlowStoredAmount(amount);
  const amountUahNumber = Number(normalizedAmountUah);
  let effectiveRates = applyFlowCustomUsdRate(
    resolveFlowExchangeRatesForMode(exchangeRates, exchangeRateMode) || exchangeRates,
    customUsdRate
  );
  if (Number.isFinite(amountUahNumber)) {
    try {
      effectiveRates =
        (await fetchFlowExchangeRatesForMode({
          date,
          exchangeRateMode,
          exchangeRates,
          customUsdRate,
        })) || effectiveRates;
    } catch (error) {
      console.error(`Unable to load FX rates for ${date}`, error);
    }
  }
  const amountUsd =
    Number.isFinite(amountUahNumber) && Number.isFinite(effectiveRates?.usd) && effectiveRates.usd > 0
      ? formatFlowStoredCurrencyAmount(amountUahNumber / effectiveRates.usd)
      : '';
  const amountEur =
    Number.isFinite(amountUahNumber) && Number.isFinite(effectiveRates?.eur) && effectiveRates.eur > 0
      ? formatFlowStoredCurrencyAmount(amountUahNumber / effectiveRates.eur)
      : '';
  const normalizedRowCustomUsdRate = normalizeFlowCustomUsdRate(rowCustomUsdRate);
  const amountPayload = [
    normalizedAmountUah,
    amountUsd,
    amountEur,
    normalizedRowCustomUsdRate ? formatFlowStoredCurrencyAmount(normalizedRowCustomUsdRate) : '',
  ].join('/');
  const value = buildFlowEntryValue({ amount: amountPayload, description });
  const entryId = generateFlowEntryId();
  await set(ref2(database, `multiData/flow/${ownerId}/${datePath}/${entryId}`), value);
};

export const deleteFlowEntry = async ({ ownerId, groupPath, date, amount, description = '', entryId }) => {
  if (!ownerId || !groupPath || !date || !amount) return;
  const datePath = buildFlowDatePath({ groupPath, date });
  if (!datePath) return;

  if (entryId) {
    await remove(ref2(database, `multiData/flow/${ownerId}/${datePath}/${entryId}`));
    return;
  }

  const legacyPath = buildFlowEntryPath({ groupPath, date, amount, description });
  if (!legacyPath) return;
  await remove(ref2(database, `multiData/flow/${ownerId}/${legacyPath}`));
};

export const updateFlowEntry = async ({
  ownerId,
  groupPath,
  nextGroupPath,
  prevEntry,
  nextEntry,
  exchangeRates,
  exchangeRateMode = 'current',
  customUsdRate,
  rowCustomUsdRate,
}) => {
  if (!ownerId || !groupPath || !prevEntry || !nextEntry) return;
  const targetGroupPath = nextGroupPath || groupPath;
  await deleteFlowEntry({
    ownerId,
    groupPath,
    entryId: prevEntry.entryId,
    date: prevEntry.date,
    amount: prevEntry.amount,
    description: prevEntry.description,
  });
  await saveFlowEntry({
    ownerId,
    groupPath: targetGroupPath,
    date: nextEntry.date,
    amount: nextEntry.amount,
    description: nextEntry.description,
    exchangeRates,
    exchangeRateMode,
    customUsdRate,
    rowCustomUsdRate: rowCustomUsdRate ?? nextEntry.customUsdRate,
  });
};

export const clearFlowData = async ownerId => {
  if (!ownerId) return;
  await remove(buildFlowRef(ownerId));
};

export const deleteFlowCategory = async ({ ownerId, groupPath }) => {
  if (!ownerId || !groupPath) return;
  const safeGroupPath = buildFlowGroupPath(groupPath);
  if (!safeGroupPath) return;
  await remove(ref2(database, `multiData/flow/${ownerId}/${safeGroupPath}`));
};

export const renameFlowCategory = async ({ ownerId, fromGroupPath, toGroupPath }) => {
  if (!ownerId || !fromGroupPath || !toGroupPath) return;

  const safeFromGroupPath = buildFlowGroupPath(fromGroupPath);
  const safeToGroupPath = buildFlowGroupPath(toGroupPath);
  if (!safeFromGroupPath || !safeToGroupPath || safeFromGroupPath === safeToGroupPath) return;

  const fromRef = ref2(database, `multiData/flow/${ownerId}/${safeFromGroupPath}`);
  const toRef = ref2(database, `multiData/flow/${ownerId}/${safeToGroupPath}`);

  const fromSnapshot = await get(fromRef);
  if (!fromSnapshot.exists()) return;

  const toSnapshot = await get(toRef);
  if (toSnapshot.exists()) {
    const existing = toSnapshot.val();
    const next = fromSnapshot.val();
    await set(toRef, { ...(existing || {}), ...(next || {}) });
  } else {
    await set(toRef, fromSnapshot.val());
  }

  await remove(fromRef);
};

export const fetchUsersByIds = async (ids, { collectionSource } = {}) => {
  try {
    const source = collectionSource === 'users' || collectionSource === 'newUsers' ? collectionSource : null;
    const uniqueIds = [...new Set((ids || []).filter(Boolean).map(String))];
    const result = {};
    const missingIds = [];

    uniqueIds.forEach(id => {
      const cached = getCard(id);
      if (cached && source && cached.__sourceCollection === source) {
        result[id] = cached;
      } else if (cached && !source && cached.__sourceCollection === 'newUsers') {
        result[id] = cached;
      } else {
        missingIds.push(id);
      }
    });

    const snaps = await Promise.all(
      missingIds.map(id => {
        const readSources = source ? [source] : ['users', 'newUsers'];
        return Promise.all(
          readSources.map(sourceName => get(ref2(database, `${sourceName}/${id}`)).then(snapshot => [sourceName, snapshot]))
        ).then(entries => {
          const dataBySource = Object.fromEntries(
            entries
              .filter(([, snapshot]) => snapshot.exists())
              .map(([sourceName, snapshot]) => [
                sourceName,
                snapshot.val() && typeof snapshot.val() === 'object' ? snapshot.val() : {},
              ])
          );
          const hasUser = Object.prototype.hasOwnProperty.call(dataBySource, 'users');
          const hasNewUser = Object.prototype.hasOwnProperty.call(dataBySource, 'newUsers');
          if (!hasUser && !hasNewUser) return null;
          const data = {
            userId: id,
            ...(hasUser ? dataBySource.users : {}),
            ...(hasNewUser ? dataBySource.newUsers : {}),
            photos: [],
            __photosHydrated: false,
            __sourceCollection: hasNewUser ? 'newUsers' : 'users',
          };
          return [id, updateCard(id, data)];
        });
      })
    );
    snaps.forEach(entry => {
      if (entry) {
        const [id, data] = entry;
        result[id] = data;
      }
    });
    return result;
  } catch (error) {
    console.error('Error fetching users by ids:', error);
    return {};
  }
};

export const lazyLoadProfilePhotos = async (userId, collectionSource = null) => getAllUserPhotos(userId, collectionSource);

const addUserFromUsers = async (userId, users) => {
  const userSnap = await get(ref2(database, `users/${userId}`));
  const newUserSnap = await get(ref2(database, `newUsers/${userId}`));

  const userData = userSnap.exists() ? userSnap.val() : {};
  const newUserData = newUserSnap.exists() ? newUserSnap.val() : {};

  if (userSnap.exists() || newUserSnap.exists()) {
    users[userId] = {
      userId,
      ...userData,
      ...newUserData,
    };
  }
};

const searchBySearchIdUsers = async (
  modifiedSearchValue,
  rawSearchValue,
  uniqueUserIds,
  users,
  searchIdPrefixes,
  options = {},
) => {
  const searchKeys = buildSearchIdCandidateKeys(
    modifiedSearchValue,
    rawSearchValue,
    searchIdPrefixes,
    options,
  );
  const userIds = await collectUserIdsBySearchIdKeys(searchKeys, options);

  await Promise.all(
    userIds.map(async id => {
      if (uniqueUserIds.has(id)) return;
      uniqueUserIds.add(id);
      await addUserFromUsers(id, users);
    })
  );
};

const searchByPrefixesUsers = async (searchValue, uniqueUserIds, users) => {
  const fieldMatchesSearch = (value, normalizedSearch) => {
    if (typeof value === 'string') {
      return value.trim().toLowerCase().includes(normalizedSearch);
    }

    if (typeof value === 'number') {
      return String(value).toLowerCase().includes(normalizedSearch);
    }

    if (Array.isArray(value)) {
      return value.some(item => fieldMatchesSearch(item, normalizedSearch));
    }

    return false;
  };

  for (const prefix of keysToCheck) {
    let formatted = searchValue.trim();
    if (prefix === 'name' || prefix === 'surname') {
      formatted = searchValue.trim().charAt(0).toUpperCase() + searchValue.trim().slice(1).toLowerCase();
    }
    const searchPrefixes = [...new Set([formatted, formatted.toLowerCase()].filter(Boolean))];
    try {
      for (const queryPrefix of searchPrefixes) {
        const snap = await get(
          query(ref2(database, 'users'), orderByChild(prefix), startAt(queryPrefix), endAt(`${queryPrefix}\uf8ff`))
        );
        if (!snap.exists()) continue;

        snap.forEach(userSnap => {
          const userId = userSnap.key;
          const userData = userSnap.val();
          const fieldValue = userData[prefix];
          if (fieldMatchesSearch(fieldValue, formatted.toLowerCase()) && !uniqueUserIds.has(userId)) {
            uniqueUserIds.add(userId);
            users[userId] = { userId, ...userData };
          }
        });
      }
    } catch {}
  }
};

export const searchUserByPartialUserIdUsers = async (userId, users) => {
  try {
    const refToCollection = ref2(database, 'users');
    const partialQuery = query(refToCollection, orderByKey(), startAt(userId), endAt(userId + '\uf8ff'));
    const snapshot = await get(partialQuery);
    if (snapshot.exists()) {
      snapshot.forEach(userSnapshot => {
        const currentUserId = userSnapshot.key;
        if (currentUserId.includes(userId)) {
          users[currentUserId] = { userId: currentUserId, ...userSnapshot.val() };
        }
      });
      if (Object.keys(users).length > 0) return users;
    }
    return null;
  } catch (error) {
    console.error('Error fetching data by partial userId:', error);
    return null;
  }
};

export const searchUsersOnly = async (searchedValue, options = {}) => {
  const { searchIdPrefixes, allowTelegramPrefixMatches = false } = options;
  const { searchKey, searchValue, modifiedSearchValue } = makeSearchKeyValue(searchedValue, { searchIdPrefixes });
  const shouldSkipBroadFallback = shouldSkipBroadFallbackForExactSearchId(searchKey, options);
  const searchIdOptions = shouldSkipBroadFallback
    ? {
      includeVariants: false,
      includePrefixMatches: allowTelegramPrefixMatches,
      includeAdaptedPhoneVariant: true,
    }
    : { includeVariants: searchKey !== 'telegram', includePrefixMatches: searchKey !== 'telegram' };
  const users = {};
  const uniqueUserIds = new Set();
  try {
    if (searchKey === 'userId') {
      await addUserFromUsers(searchValue, users);
      if (users[searchValue]) {
        uniqueUserIds.add(searchValue);
      }
    }

    await searchBySearchIdUsers(
      modifiedSearchValue,
      searchValue,
      uniqueUserIds,
      users,
      searchIdPrefixes,
      searchIdOptions,
    );

    if (shouldSkipBroadFallback) {
      if (Object.keys(users).length === 1) {
        const id = Object.keys(users)[0];
        return users[id];
      }
      return users;
    }

    await searchByPrefixesUsers(searchValue, uniqueUserIds, users);
    await searchUserByPartialUserId(searchValue, users);

    if (Object.keys(users).length === 1) {
      const id = Object.keys(users)[0];
      return users[id];
    }
    if (Object.keys(users).length > 1) return users;
    return {};
  } catch (error) {
    console.error('Error searching users only:', error);
    return null;
  }
};

export const makeNewUser = async (searchedValue, rawQuery = '') => {
  const db = getDatabase();
  const newUsersRef = ref2(db, 'newUsers');
  const searchIdRef = ref2(db, 'searchId');

  const parsedQuery = parseUkTriggerQuery(rawQuery);
  const trimmedRawQuery = typeof rawQuery === 'string' ? rawQuery.trim() : '';
  const fallbackSearchPair =
    !parsedQuery && !searchedValue && trimmedRawQuery
      ? { name: trimmedRawQuery }
      : null;
  const effectiveSearchValue =
    parsedQuery?.searchPair || searchedValue || fallbackSearchPair;
  const hasSearchPair =
    effectiveSearchValue && Object.keys(effectiveSearchValue).length > 0;

  const searchMeta = hasSearchPair
    ? makeSearchKeyValue(effectiveSearchValue)
    : null;

  const newUserRef = push(newUsersRef); // Генеруємо унікальний ключ
  const newUserId = newUserRef.key;

  const now = new Date();
  const createdAt = now.toLocaleDateString('uk-UA');
  const createdAt2 = now.toISOString().split('T')[0];

  const newUser = {
    userId: newUserId,
    createdAt,
    createdAt2,
  };

  if (parsedQuery) {
    const { contactType, contactValues, name, surname } = parsedQuery;
    newUser[contactType] = contactValues;
    if (name !== undefined) {
      newUser.name = name;
    }
    if (surname !== undefined) {
      newUser.surname = surname;
    }
  }

  if (searchMeta) {
    const { searchKey, searchValue } = searchMeta;

    if (searchKey === 'userId') {
      newUser.searchedUserId = searchValue;
    } else if (!parsedQuery || searchKey !== parsedQuery.contactType) {
      newUser[searchKey] = searchValue;
    }
  }

  // Записуємо нового користувача в базу даних
  await set(newUserRef, newUser);
  await syncUserSearchKeyIndex(newUserId, {}, newUser);

  if (searchMeta?.searchIdKey) {
    const { searchIdKey } = searchMeta;
    const searchIdUpdates = { [searchIdKey]: newUserId };

    if (parsedQuery?.handle) {
      const normalizedHandle = parsedQuery.handle.toLowerCase();
      const handleKey = `telegram_${encodeKey(normalizedHandle)}`;
      searchIdUpdates[handleKey] = newUserId;
    }

    await update(searchIdRef, searchIdUpdates);
  }

  return {
    userId: newUserId,
    ...newUser,
  };
};




export const searchUserByPartialUserId = async (userId, users) => {
  try {
    const collections = ['users', 'newUsers']; // Масив колекцій, де здійснюється пошук

    for (const collection of collections) {
      const refToCollection = ref2(database, collection);
      const partialUserIdQuery = query(refToCollection, orderByKey(), startAt(userId), endAt(userId + '\uf8ff'));

      const snapshot = await get(partialUserIdQuery);

      if (snapshot.exists()) {
        const userPromises = []; // Масив для збереження обіцянок `addUserToResults`

        snapshot.forEach(userSnapshot => {
          const currentUserId = userSnapshot.key;

          if (currentUserId.includes(userId)) {
            // Додаємо обіцянку в масив
            userPromises.push(addUserToResults(currentUserId, users));
          }
        });

        // Виконуємо всі обіцянки для цієї колекції
        await Promise.all(userPromises);

        // Якщо після виконання є знайдені користувачі, повертаємо їх
        if (Object.keys(users).length > 0) {
          return users;
        }
      }
    }

    // Користувача не знайдено
    return null;
  } catch (error) {
    console.error('Error fetching data by partial userId:', error);
    return null;
  }
};

const addUserToResults = async (userId, users) => {
  const userSnapshotInNewUsers = await get(ref2(database, `newUsers/${userId}`));
  const userFromNewUsers = userSnapshotInNewUsers.exists() ? userSnapshotInNewUsers.val() : {};

  const userSnapshotInUsers = await get(ref2(database, `users/${userId}`));
  const userFromUsers = userSnapshotInUsers.exists() ? userSnapshotInUsers.val() : {};
  if (!userSnapshotInNewUsers.exists() && !userSnapshotInUsers.exists()) {
    return;
  }
  // users.push({
  //   userId,
  //   ...userFromNewUsers,
  //   ...userFromUsers,
  // });

  // // Додаємо користувача у форматі userId -> userData
  users[userId] = {
    userId,
    ...userFromNewUsers,
    ...userFromUsers,
  };
};

const getDateFormats = input => {
  const trimmed = (input || '').trim();
  const isoMatch = /^(\d{4})[-./\\](\d{1,2})[-./\\](\d{1,2})$/;
  const dmyMatch = /^(\d{1,2})[-./\\](\d{1,2})[-./\\](\d{4})$/;
  let yyyy, mm, dd;

  if (isoMatch.test(trimmed)) {
    [, yyyy, mm, dd] = trimmed.match(isoMatch);
  } else if (dmyMatch.test(trimmed)) {
    [, dd, mm, yyyy] = trimmed.match(dmyMatch);
  } else {
    return [];
  }

  const paddedMonth = String(mm).padStart(2, '0');
  const paddedDay = String(dd).padStart(2, '0');

  return [`${yyyy}-${paddedMonth}-${paddedDay}`, `${paddedDay}.${paddedMonth}.${yyyy}`];
};

const getIsoDateVariants = dateFormats => {
  const isoRegex = /^\d{4}-\d{2}-\d{2}$/;
  const dmyRegex = /^\d{2}\.\d{2}\.\d{4}$/;

  return dateFormats
    .map(dateValue => {
      if (isoRegex.test(dateValue)) return dateValue;
      if (dmyRegex.test(dateValue)) {
        const [dd, mm, yyyy] = dateValue.split('.');
        return `${yyyy}-${mm}-${dd}`;
      }
      return null;
    })
    .filter(Boolean);
};


const getIsoDateVariantsForSearch = rawValue => getIsoDateVariants(getDateFormats(rawValue));

const getDayTimestampRange = isoDate => {
  const dayStart = new Date(`${isoDate}T00:00:00`);
  const dayEnd = new Date(`${isoDate}T23:59:59.999`);

  if (Number.isNaN(dayStart.getTime()) || Number.isNaN(dayEnd.getTime())) {
    return null;
  }

  return {
    startMs: dayStart.getTime(),
    endMs: dayEnd.getTime(),
    startSec: Math.floor(dayStart.getTime() / 1000),
    endSec: Math.floor(dayEnd.getTime() / 1000),
  };
};

const searchByDate = async (searchValue, uniqueUserIds, users) => {
  if (isDev) console.log('searchByDate → input:', searchValue);
  const dateFormats = getDateFormats(searchValue);
  const isoDateVariants = getIsoDateVariants(dateFormats);
  if (isDev) console.log('searchByDate → formats:', dateFormats);
  if (dateFormats.length === 0) return false;

  const collections = ['newUsers', 'users'];
  const fields = ['createdAt', 'lastCycle', 'lastAction', 'getInTouch'];

  for (const date of dateFormats) {
    for (const collection of collections) {
      for (const field of fields) {
        if (isDev) console.log(`searchByDate → querying ${collection}.${field} for`, date);
        const refToCollection = ref2(database, collection);
        const queries =
          field === 'lastAction'
            ? isoDateVariants
                .map(getDayTimestampRange)
                .filter(Boolean)
                .flatMap(({ startMs, endMs, startSec, endSec }) => [
                  query(refToCollection, orderByChild(field), startAt(startMs), endAt(endMs)),
                  query(refToCollection, orderByChild(field), startAt(startSec), endAt(endSec)),
                ])
            : [query(refToCollection, orderByChild(field), equalTo(date))];
        try {
          for (const currentQuery of queries) {
            const snapshot = await get(currentQuery);
            if (isDev) console.log('snapshot.exists():', snapshot.exists());
            if (snapshot.exists()) {
              const promises = [];
              snapshot.forEach(userSnapshot => {
                const userId = userSnapshot.key;
                if (isDev) console.log(`Found ${userId} in ${collection}.${field}`);
                if (!uniqueUserIds.has(userId)) {
                  uniqueUserIds.add(userId);
                  promises.push(addUserToResults(userId, users));
                }
              });
              await Promise.all(promises);
            }
          }
        } catch (error) {
          if (isDev) console.error('Error searching by date:', error);
        }
      }
    }
  }

  return true;
};

const executeSearchBySearchIdIndex = async (
  modifiedSearchValue,
  rawSearchValue,
  uniqueUserIds,
  users,
  searchIdPrefixes,
  options = {},
) => {
  const searchKeys = buildSearchIdCandidateKeys(
    modifiedSearchValue,
    rawSearchValue,
    searchIdPrefixes,
    options,
  );
  const userIds = await collectUserIdsBySearchIdKeys(searchKeys, options);

  await Promise.all(
    userIds.map(async userId => {
      if (uniqueUserIds.has(userId)) return;
      uniqueUserIds.add(userId);
      await addUserToResults(userId, users);
    })
  );
};

const SEARCH_COLLECTIONS = ['newUsers', 'users'];

const SEARCH_KEY_DATE_FIELDS = new Set([LAST_ACTION_SEARCH_KEY_INDEX, GET_IN_TOUCH_SEARCH_KEY_INDEX]);

const normalizeDateSearchBucketFromQuery = rawSearchValue => {
  const parsed = parseLastActionDate(rawSearchValue);
  if (parsed.status !== 'valid') return null;
  return `${AGE_DATE_PREFIX}${toIsoDate(parsed.date)}`;
};

const collectUserIdsBySearchKeyBucket = async (field, rawSearchValue) => {
  if (!SEARCH_KEY_DATE_FIELDS.has(field)) return [];
  const bucket = normalizeDateSearchBucketFromQuery(rawSearchValue);
  if (!bucket) return [];

  const snapshot = await get(ref2(database, `${SEARCH_KEY_INDEX_ROOT}/${field}/${bucket}`));
  if (!snapshot.exists()) return [];

  return Object.entries(snapshot.val() || {})
    .filter(([userId, enabled]) => Boolean(userId) && enabled)
    .map(([userId]) => userId);
};

const executeSearchBySearchKeyBucket = async (searchKeys, rawSearchValue, uniqueUserIds, users) => {
  if (!Array.isArray(searchKeys) || searchKeys.length === 0) return;

  for (const key of searchKeys) {
    // eslint-disable-next-line no-await-in-loop
    const userIds = await collectUserIdsBySearchKeyBucket(key, rawSearchValue);
    // eslint-disable-next-line no-await-in-loop
    await Promise.all(
      userIds.map(async userId => {
        if (uniqueUserIds.has(userId)) return;
        uniqueUserIds.add(userId);
        await addUserToResults(userId, users);
      })
    );
  }
};


const DATE_LIKE_EQUAL_TO_FIELDS = new Set([
  'getInTouch',
  'lastAction',
  'lastLogin2',
  'createdAt',
  'lastCycle',
  'lastLogin',
]);

const isEqualToFieldMatch = (userData, key, expectedValue) => {
  if (!userData || !key) return false;
  const fieldValue = key === 'userId' ? userData.userId : userData[key];
  const values = Array.isArray(fieldValue) ? fieldValue : [fieldValue];

  if (DATE_LIKE_EQUAL_TO_FIELDS.has(key)) {
    const expectedDate = normalizeSearchDateComparableValue(expectedValue);
    return Boolean(expectedDate && values.some(value =>
      normalizeSearchDateComparableValue(value) === expectedDate
    ));
  }

  const expected = String(expectedValue ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  if (!expected) return false;
  return values.some(value => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase() === expected);
};

const buildEqualToQueriesForField = (collectionRef, key, candidate) => {
  if (key === 'lastAction') {
    const ranges = getIsoDateVariantsForSearch(candidate)
      .map(getDayTimestampRange)
      .filter(Boolean);

    if (ranges.length > 0) {
      return ranges.flatMap(({ startMs, endMs, startSec, endSec }) => [
        query(collectionRef, orderByChild(key), startAt(startMs), endAt(endMs)),
        query(collectionRef, orderByChild(key), startAt(startSec), endAt(endSec)),
      ]);
    }
  }

  return [query(collectionRef, orderByChild(key), equalTo(candidate))];
};

const executeSearchByEqualToFields = async (searchKeys, rawSearchValue, uniqueUserIds, users) => {
  if (!Array.isArray(searchKeys) || searchKeys.length === 0) return;

  for (const collection of SEARCH_COLLECTIONS) {
    for (const key of searchKeys) {
      const candidates = getEqualToCandidates(key, rawSearchValue);
      if (candidates.length === 0) continue;

      for (const candidate of candidates) {
        try {
          const promises = [];

          if (key === 'userId') {
            const directId = String(candidate || '').trim();
            if (directId && !uniqueUserIds.has(directId)) {
              // userId часто є ключем вузла, а не полем усередині картки.
              // Для таких записів equalTo(orderByChild('userId')) нічого не повертає,
              // тому перевіряємо direct lookup за ключем.
              // eslint-disable-next-line no-await-in-loop
              await addUserToResults(directId, users);
              if (users[directId]) {
                uniqueUserIds.add(directId);
              }
            }
          }

          const collectionRef = ref2(database, collection);
          const equalToQueries = buildEqualToQueriesForField(collectionRef, key, candidate);

          for (const currentQuery of equalToQueries) {
            // eslint-disable-next-line no-await-in-loop
            const snapshot = await get(currentQuery);

            if (snapshot.exists()) {
              snapshot.forEach(userSnapshot => {
                const userId = userSnapshot.key;
                const userData = userSnapshot.val();
                if (uniqueUserIds.has(userId)) return;
                if (!isEqualToFieldMatch({ userId, ...userData }, key, candidate)) return;

                uniqueUserIds.add(userId);
                promises.push(addUserToResults(userId, users));
              });
            }
          }

          // eslint-disable-next-line no-await-in-loop
          await Promise.all(promises);
        } catch (error) {
          if (isDev) {
            console.error(`executeSearchByEqualToFields → error querying ${collection}.${key}:`, error);
          }
        }
      }
    }
  }
};

const searchByPrefixes = async (searchValue, uniqueUserIds, users) => {
  const fieldMatchesSearch = (value, normalizedSearch) => {
    if (typeof value === 'string') {
      return value.trim().toLowerCase().includes(normalizedSearch);
    }

    if (typeof value === 'number') {
      return String(value).toLowerCase().includes(normalizedSearch);
    }

    if (Array.isArray(value)) {
      return value.some(item => fieldMatchesSearch(item, normalizedSearch));
    }

    return false;
  };

  // console.log('🔍 searchValue :>> ', searchValue);

  for (const prefix of keysToCheck) {
    // console.log('🛠 Searching by prefix:', prefix);

    let formattedSearchValue = searchValue.trim();

    // Якщо шукаємо за "surname", робимо пошук з урахуванням першої великої літери
    if (prefix === 'name' || prefix === 'surname') {
      formattedSearchValue = searchValue.trim().charAt(0).toUpperCase() + searchValue.trim().slice(1).toLowerCase();
    }

    //     if (prefix === 'telegram') {
    //       formattedSearchValue = `telegram_ук_см_${searchValue.trim().toLowerCase()}`;
    // }

    const searchPrefixes = [...new Set([formattedSearchValue, formattedSearchValue.toLowerCase()].filter(Boolean))];
    const shouldTryExactMatch = ['email', 'telegram', 'phone', 'instagram', 'facebook', 'tiktok', 'vk', 'twitter', 'line', 'otherLink'].includes(prefix);

    try {
      for (const queryPrefix of searchPrefixes) {
        for (const collection of SEARCH_COLLECTIONS) {
          if (shouldTryExactMatch) {
            const exactSnapshot = await get(query(ref2(database, collection), orderByChild(prefix), equalTo(queryPrefix)));

            if (exactSnapshot.exists()) {
              exactSnapshot.forEach(userSnapshot => {
                const userId = userSnapshot.key;
                const userData = userSnapshot.val();
                const fieldValue = userData[prefix];

                if (fieldMatchesSearch(fieldValue, queryPrefix.toLowerCase()) && !uniqueUserIds.has(userId)) {
                  uniqueUserIds.add(userId);
                  users[userId] = {
                    userId,
                    ...userData,
                  };
                }
              });
            }
          }

          const snapshotByPrefix = await get(
            query(ref2(database, collection), orderByChild(prefix), startAt(queryPrefix), endAt(`${queryPrefix}\uf8ff`))
          );
          // console.log(`📡 Firebase Query Executed for '${collection}.${prefix}'`);

          if (!snapshotByPrefix.exists()) continue;
          // console.log(`✅ Found results for '${collection}.${prefix}'`);

          snapshotByPrefix.forEach(userSnapshot => {
            const userId = userSnapshot.key;
            const userData = userSnapshot.val();

            const fieldValue = userData[prefix];

            // console.log('📌 Checking user:', userId);
            // console.log(`🧐 userData['${prefix}']:`, fieldValue);
            // console.log('📏 Type of fieldValue:', typeof fieldValue);
            // console.log(
            //   '🔍 Includes searchValue?',
            //   fieldValue.toLowerCase().includes(formattedSearchValue.toLowerCase())
            // );
            // console.log('🛑 Already in uniqueUserIds?', uniqueUserIds.has(userId));

            if (
              fieldMatchesSearch(fieldValue, formattedSearchValue.toLowerCase()) &&
              !uniqueUserIds.has(userId)
            ) {
              uniqueUserIds.add(userId);
              users[userId] = {
                userId,
                ...userData,
              };
              // console.log(`✅ Added user '${userId}' to results`);
            }
          });
        }
      }
    } catch (error) {
      if (isDev) console.error(`❌ Error fetching data for '${prefix}'`, error);
    }
  }
};


export const fetchNewUsersCollectionInRTDB = async (searchedValue, options = {}) => {
  const {
    searchIdPrefixes,
    equalToKeys,
    forceEqualToAllCards = false,
    forceSearchKeyBucket = false,
    searchKeyFields,
    forcePartialUserIdSearch = false,
    allowTelegramPrefixMatches = false,
  } = options;
  if (isDev) console.log('fetchNewUsersCollectionInRTDB → searchedValue:', searchedValue);
  const { searchKey, searchValue, modifiedSearchValue } = makeSearchKeyValue(searchedValue, { searchIdPrefixes });
  const shouldSkipBroadFallback = shouldSkipBroadFallbackForExactSearchId(searchKey, options);
  const searchIdOptions = shouldSkipBroadFallback
    ? {
      includeVariants: false,
      includePrefixMatches: allowTelegramPrefixMatches,
      includeAdaptedPhoneVariant: true,
    }
    : {
      includeVariants: searchKey !== 'telegram',
      includePrefixMatches: searchKey !== 'telegram' || allowTelegramPrefixMatches,
    };
  if (isDev)
    console.log('fetchNewUsersCollectionInRTDB → params:', {
      searchValue,
      modifiedSearchValue,
    });
  const users = {};
  const uniqueUserIds = new Set();

  try {
    if (searchKey === 'userId') {
      await addUserToResults(searchValue, users);
      if (users[searchValue]) {
        uniqueUserIds.add(searchValue);
      }
    }

    // Broad date search intentionally checks several date fields. Do not run it for
    // explicit EqualTo/searchKey requests: selected checkboxes must limit backend
    // queries to only those selected keys.
    const shouldRunBroadDateSearch = searchKey !== 'searchId' && !forceSearchKeyBucket && !forceEqualToAllCards;
    const isDateSearch = shouldRunBroadDateSearch
      ? await searchByDate(searchValue, uniqueUserIds, users)
      : false;
    if (isDev) console.log('fetchNewUsersCollectionInRTDB → isDateSearch:', isDateSearch);
    if (!isDateSearch) {
      if (forcePartialUserIdSearch) {
        await searchUserByPartialUserId(searchValue, users);
      } else if (forceSearchKeyBucket) {
        const selectedSearchKeyFields = Array.isArray(searchKeyFields)
          ? searchKeyFields.filter(key => SEARCH_KEY_DATE_FIELDS.has(key))
          : [...SEARCH_KEY_DATE_FIELDS];
        await executeSearchBySearchKeyBucket(selectedSearchKeyFields, searchValue, uniqueUserIds, users);
      } else if (forceEqualToAllCards) {
        const selectedEqualToKeys = resolveEqualToSearchKeys(equalToKeys);
        await executeSearchByEqualToFields(selectedEqualToKeys, searchValue, uniqueUserIds, users);
      } else {
        await executeSearchBySearchIdIndex(
          modifiedSearchValue,
          searchValue,
          uniqueUserIds,
          users,
          searchIdPrefixes,
          searchIdOptions,
        );

        if (!shouldSkipBroadFallback) {
          await searchByPrefixes(searchValue, uniqueUserIds, users);
          await searchByIndexOn({
            searchValue,
            uniqueUserIds,
            users,
            searchCollections: SEARCH_COLLECTIONS,
            database,
            addUserToResults,
            isDev,
            ref2,
            get,
            query,
            orderByChild,
            startAt,
            endAt,
          });
        }
      }
    }

    if (Object.keys(users).length === 1) {
      const singleUserId = Object.keys(users)[0];
      if (isDev) console.log('Знайдено одного користувача:', users[singleUserId]);
      return users[singleUserId];
    }

    if (Object.keys(users).length > 1) {
      if (isDev) console.log('Знайдено кілька користувачів:', users);
      return users;
    }

    if (isDev) console.log('Користувача не знайдено.');
    return {};
  } catch (error) {
    console.error('Error fetching data:', error);
    return null;
  }
};

export const getUserCards = async () => {
  const usersInCollection = await fetchUsersCollection();
  const usersInRTDB = await fetchUsersCollectionInRTDB();

  const userIdsInRTDB = usersInRTDB.map(user => user.userId);

  const newUsers = usersInCollection.filter(user => !userIdsInRTDB.includes(user.userId));

  const allUserCards = [...usersInRTDB, ...newUsers];

  return allUserCards;
};

export const updateDataInFiresoreDB = async (userId, uploadedInfo, condition, delCondition) => {
  const cleanedUploadedInfo = stripTransientUserDataFields(uploadedInfo);
  const keysToDelete = [
    ...(delCondition ? Object.keys(delCondition) : []),
    ...transientUserDataKeys,
  ];
  const basePayload = { ...cleanedUploadedInfo };
  keysToDelete.forEach(key => {
    delete basePayload[key];
  });
  const updatePayload = { ...basePayload };
  keysToDelete.forEach(key => {
    updatePayload[key] = deleteField();
  });
  try {
    const userRef = doc(db, `users/${userId}`);
    if (condition === 'update') {
      await updateDoc(userRef, updatePayload);
    } else if (condition === 'set') {
      await setDoc(userRef, basePayload);
    } else if (condition === 'check') {
      const userDoc = await getDoc(userRef);
      if (userDoc.exists()) {
        await updateDoc(userRef, updatePayload);
      } else {
        await setDoc(userRef, basePayload);
      }
    }
  } catch (error) {
    console.error('Сталася помилка під час збереження даних в Firestore Database1:', error);
    throw error;
  }
};

const removeUndefined = obj => {
  if (Array.isArray(obj)) {
    return obj.filter(item => item !== undefined).map(removeUndefined);
  } else if (typeof obj === 'object' && obj !== null) {
    return Object.fromEntries(
      Object.entries(obj)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => [key, removeUndefined(value)])
    );
  }
  return obj;
};

const transientUserDataKeys = [
  '__sourceCollection',
  '__photosHydrated',
  'cachedAt',
  'cacheVersion',
  'cashVersion',
  'cash version',
  'localVersion',
  'localUpdatedAt',
  'source',
  '__profileSnapshotVersion',
  '__profileSnapshotSource',
  '__profileSnapshotUpdatedAt',
];

const stripTransientUserDataFields = (payload, options = {}) => {
  const { markForRealtimeDeletion = false } = options;
  const cleaned = removeUndefined(payload);
  if (typeof cleaned !== 'object' || cleaned === null || Array.isArray(cleaned)) {
    return cleaned;
  }

  const nextPayload = { ...cleaned };
  transientUserDataKeys.forEach(key => {
    delete nextPayload[key];
    if (markForRealtimeDeletion) {
      nextPayload[key] = null;
    }
  });

  return nextPayload;
};

const normalizePhoneForStorage = value => {
  if (value === undefined || value === null) return value;

  if (Array.isArray(value)) {
    return value
      .map(item => normalizePhoneForStorage(item))
      .filter(item => item !== '' && item !== undefined && item !== null);
  }

  const digitsOnly = String(value).replace(/\D/g, '');
  return digitsOnly;
};

const sanitizeUploadedInfoPhones = uploadedInfo => {
  if (!uploadedInfo || typeof uploadedInfo !== 'object') return uploadedInfo;
  if (!Object.prototype.hasOwnProperty.call(uploadedInfo, 'phone')) return uploadedInfo;

  const normalizedPhone = normalizePhoneForStorage(uploadedInfo.phone);
  return {
    ...uploadedInfo,
    phone: normalizedPhone,
  };
};

export const updateDataInRealtimeDB = async (userId, uploadedInfo, condition) => {
  try {
    const userRefRTDB = ref2(database, `users/${userId}`);
    const cleanedUploadedInfo = stripTransientUserDataFields(uploadedInfo, {
      markForRealtimeDeletion: condition === 'update',
    });
    if (condition === 'update') {
      await update(userRefRTDB, cleanedUploadedInfo);
    } else {
      await set(userRefRTDB, cleanedUploadedInfo);
    }
  } catch (error) {
    console.error(
      'Сталася помилка під час збереження даних в Realtime Database2:',
      error
    );
    throw error;
  }
};

export const updateDataInNewUsersRTDB = async (userId, uploadedInfo, condition, skipIndexing = false) => {
  try {
    uploadedInfo = sanitizeUploadedInfoPhones(uploadedInfo);
    const userRefRTDB = ref2(database, `newUsers/${userId}`);
    const snapshot = await get(userRefRTDB);
    const currentUserDataRaw = snapshot.exists() ? snapshot.val() : {};
    const currentUserData = sanitizeUploadedInfoPhones(currentUserDataRaw) || {};

    if (!skipIndexing) {
      // Перебір ключів та їх обробка
      for (const key of keysToCheck) {
        const shouldRemoveKey = uploadedInfo[key] === '' || uploadedInfo[key] === null;

        if (shouldRemoveKey) {
          console.log(`${key} має пусте або null значення. Видаляємо.`);
          if (currentUserData[key] !== undefined && currentUserData[key] !== null) {
            await updateSearchId(key, currentUserData[key], userId, 'remove');
          }
          uploadedInfo[key] = null;
          continue;
        }

        if (uploadedInfo[key] !== undefined) {
          // console.log(`${key} uploadedInfo[key] :>> `, uploadedInfo[key]);

          // Формуємо currentValues
          const currentValues = Array.isArray(currentUserData?.[key])
            ? currentUserData[key].filter(Boolean)
            : typeof currentUserData?.[key] === 'object'
              ? Object.values(currentUserData[key]).filter(Boolean)
              : typeof currentUserData?.[key] === 'string'
                ? [currentUserData[key]].filter(Boolean)
                : [];

          // Формуємо newValues
          const newValues = Array.isArray(uploadedInfo[key])
            ? uploadedInfo[key].filter(Boolean)
            : typeof uploadedInfo[key] === 'object'
              ? Object.values(uploadedInfo[key]).filter(Boolean)
              : typeof uploadedInfo[key] === 'string'
                ? [uploadedInfo[key]].filter(Boolean)
                : [];

          // console.log(`${key} currentValues :>> `, currentValues);
          // console.log(`${key} newValues :>> `, newValues);

          // Видаляємо значення, яких більше немає у новому масиві
          for (const value of currentValues) {
            let cleanedValue = value;

            // Якщо ключ — це 'phone', прибираємо пробіли у значенні
            if (key === 'phone') {
              cleanedValue = normalizePhoneForStorage(value);
            }

            if (!newValues.includes(cleanedValue)) {
              await updateSearchId(key, cleanedValue.toLowerCase(), userId, 'remove'); // Видаляємо конкретний ID
            }
          }

          // Додаємо нові значення, яких не було в старому масиві
          for (const value of newValues) {
            let cleanedValue = value;

            // Якщо ключ — це 'phone', прибираємо пробіли у значенні
            if (key === 'phone') {
              cleanedValue = normalizePhoneForStorage(value);
            }

            // console.log('cleanedValue :>> ', cleanedValue);

            // Додаємо новий ID, якщо його ще немає в currentValues
            if (!currentValues.includes(cleanedValue)) {
              console.log('currentValues :>> ', currentValues);
              console.log('cleanedValue :>> ', cleanedValue);
              await updateSearchId(key, cleanedValue.toLowerCase(), userId, 'add'); // Додаємо новий ID
            }
          }
        }
      }
    }

    // Оновлення користувача в базі

    console.log('uploadedInfo :>> ', uploadedInfo);
    console.log('currentUserData :>> ', currentUserData);

    // if (condition === 'update' && !(Object.keys(uploadedInfo).length < Object.keys(currentUserData).length)) {
    const cleanedUploadedInfo = stripTransientUserDataFields(uploadedInfo, {
      markForRealtimeDeletion: condition === 'update',
    });

    if (condition === 'update') {
      console.log('update :>> ');
      await update(userRefRTDB, { ...cleanedUploadedInfo });
    } else {
      console.log('set :>> ');
      await set(userRefRTDB, { ...cleanedUploadedInfo });
    }

    if (cleanedUploadedInfo.lastLogin2 !== undefined) {
      try {
        await update(ref2(database, `users/${userId}`), { lastLogin2: cleanedUploadedInfo.lastLogin2 });
      } catch (e) {
        console.error('Error updating lastLogin2 in users:', e);
      }
    }
  } catch (error) {
    console.error('Сталася помилка під час збереження даних в Realtime Database3:', error);
    throw error;
  }
};
// export const auth = getAuth(app);

export const deletePhotos = async (userId, photoUrls = []) => {
  const validUrls = (photoUrls || []).filter(Boolean);
  await Promise.all(
    validUrls.map(async photoUrl => {
      try {
        const afterObjectSegment = photoUrl.split('/o/')[1];
        if (!afterObjectSegment) {
          return;
        }
        const [encodedPath] = afterObjectSegment.split('?');
        const filePath = decodeURIComponent(encodedPath);
        if (!filePath.startsWith(`avatar/${userId}`)) {
          return;
        }
        const fileRef = ref(storage, filePath);
        await deleteObject(fileRef);
      } catch (error) {
        if (error?.code !== 'storage/object-not-found') {
          console.error('Photo delete error:', error);
        }
      }
    })
  );
};

const normalizePhotoValues = value => {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(normalizePhotoValues);
  if (typeof value === 'object') return Object.values(value).flatMap(normalizePhotoValues);
  if (typeof value !== 'string') return [];
  const photo = value.trim();
  return photo ? [photo] : [];
};

const getPhotoSourceCollections = collectionSource => (
  collectionSource === 'users' || collectionSource === 'newUsers'
    ? [collectionSource]
    : ['newUsers', 'users']
);

export const getUserStorageAvatarPhotos = async userId => {
  if (!userId) return [];

  try {
    const folderRef = ref(storage, `avatar/${userId}`);
    const list = await listAll(folderRef);
    const settledUrls = await Promise.allSettled(list.items.map(item => getDownloadURL(item)));
    return settledUrls
      .flatMap(result => {
        if (result.status === 'fulfilled') return [result.value];
        console.error('Error loading user photo from Storage:', result.reason);
        return [];
      })
      .filter(Boolean);
  } catch (error) {
    console.error('Error listing user photos from Storage:', error);
    return [];
  }
};

export const getAllUserPhotos = async (userId, collectionSource = null, { includeStorage = true } = {}) => {
  if (!userId) return [];

  const storageUrls = includeStorage ? await getUserStorageAvatarPhotos(userId) : [];
  const sourceCollections = getPhotoSourceCollections(collectionSource);
  const snapshots = await Promise.allSettled(
    sourceCollections.map(source => get(ref2(database, `${source}/${userId}`)))
  );
  const databaseUrls = snapshots.flatMap((result, index) => {
    if (result.status === 'rejected') {
      console.error(`Error loading user photos from ${sourceCollections[index]}:`, result.reason);
      return [];
    }
    const snapshot = result.value;
    return snapshot.exists() ? normalizePhotoValues(snapshot.val()?.photos) : [];
  });
  const urls = [...storageUrls, ...databaseUrls]
    .map(convertDriveLinkToImage)
    .filter(Boolean);

  return Array.from(new Set(filterOutMedicationPhotos(urls, userId)));
};

export const getMedicationPhotos = async userId => {
  if (!userId) {
    return [];
  }

  try {
    const folderRef = ref(storage, `avatar/${userId}/medication`);
    const list = await listAll(folderRef);
    const urls = await Promise.all(list.items.map(item => getDownloadURL(item)));
    return urls;
  } catch (error) {
    if (error?.code !== 'storage/object-not-found') {
      console.error('Error listing medication photos:', error);
    }
    return [];
  }
};

// Функція для оновлення або видалення пар у searchId
export const updateSearchId = async (searchKey, searchValue, userId, action) => {
  if (isDev) {
    console.log('searchKey!!!!!!!!! :>> ', searchKey);
    console.log('searchValue!!!!!!!!! :>> ', searchValue);
    console.log('action!!!!!!!!!!! :>> ', action);
  }
  try {
    if (!searchValue || !searchKey || !userId) {
      console.error('Invalid parameters provided:', { searchKey, searchValue, userId });
      return;
    }

    if (!SEARCH_ID_INDEXED_FIELDS.has(searchKey)) {
      if (isDev) console.log('Пропускаємо не-searchId ключ :>> ', searchKey);
      return;
    }

    const normalizedValue = normalizeSearchIdInput(searchKey, searchValue).toLowerCase();
    const searchIdKey = `${searchKey}_${encodeKey(normalizedValue)}`;
    const searchIdRef = ref2(database, `searchId/${searchIdKey}`);
    if (isDev) console.log('searchIdKey in updateSearchId :>> ', searchIdKey);

    if (action === 'add') {
      const searchIdSnapshot = await get(searchIdRef);

      if (searchIdSnapshot.exists()) {
        const existingValue = searchIdSnapshot.val();

        if (Array.isArray(existingValue)) {
          if (!existingValue.includes(userId)) {
            const updatedValue = [...existingValue, userId];
            await update(ref2(database, 'searchId'), { [searchIdKey]: updatedValue });
            if (isDev) console.log(`Додано userId до масиву: ${searchIdKey}:`, updatedValue);
          } else {
            if (isDev) console.log(`userId вже існує в масиві для ключа: ${searchIdKey}`);
          }
        } else if (existingValue !== userId) {
          const updatedValue = [existingValue, userId];
          await update(ref2(database, 'searchId'), { [searchIdKey]: updatedValue });
          if (isDev) console.log(`Перетворено значення на масив і додано userId: ${searchIdKey}:`, updatedValue);
        } else {
          if (isDev) console.log(`Ключ вже містить userId: ${searchIdKey}`);
        }
      } else {
        await update(ref2(database, 'searchId'), { [searchIdKey]: userId });
        if (isDev) console.log(`Додано нову пару в searchId: ${searchIdKey}: ${userId}`);
      }
    } else if (action === 'remove') {
      const searchIdSnapshot = await get(searchIdRef);

      if (searchIdSnapshot.exists()) {
        const existingValue = searchIdSnapshot.val();

        if (Array.isArray(existingValue)) {
          const updatedValue = existingValue.filter(id => id !== userId);

          if (updatedValue.length === 1) {
            await update(ref2(database, 'searchId'), { [searchIdKey]: updatedValue[0] });
            if (isDev) console.log(`Оновлено значення ключа до одиничного значення: ${searchIdKey}:`, updatedValue[0]);
          } else if (updatedValue.length === 0) {
            await remove(searchIdRef);
            if (isDev) console.log(`Видалено ключ: ${searchIdKey}`);
          } else {
            await update(ref2(database, 'searchId'), { [searchIdKey]: updatedValue });
            if (isDev) console.log(`Оновлено масив ключа: ${searchIdKey}:`, updatedValue);
          }
        } else if (existingValue === userId) {
          await remove(searchIdRef);
          if (isDev) console.log(`Видалено ключ, що мав одиничне значення: ${searchIdKey}`);
        } else {
          if (isDev) console.log(`userId не знайдено для видалення: ${searchIdKey}`);
        }
      } else {
        if (isDev) console.log(`Ключ не знайдено для видалення: ${searchIdKey}`);
      }
    } else {
      console.error('Unknown action provided:', action);
    }
  } catch (error) {
    console.error('Error in updateSearchId:', error);
  }
};

const extractIndexableFieldValues = rawValue => {
  if (rawValue === undefined || rawValue === null) return [];

  if (typeof rawValue === 'string' || typeof rawValue === 'number') {
    return [rawValue];
  }

  if (Array.isArray(rawValue)) {
    return rawValue.flatMap(item => extractIndexableFieldValues(item));
  }

  if (typeof rawValue === 'object') {
    return Object.values(rawValue).flatMap(item => extractIndexableFieldValues(item));
  }

  return [];
};

export const syncUserSearchIdIndex = async (userId, prevData = {}, nextData = {}, deletedKeys = []) => {
  if (!userId) return;

  for (const key of getSubmittedSearchIndexKeys(keysToCheck, nextData, deletedKeys)) {

    const prevCandidates = new Set(
      extractIndexableFieldValues(prevData[key]).flatMap(value => buildSearchIndexCandidates(key, value))
    );
    const nextCandidates = new Set(
      extractIndexableFieldValues(nextData[key]).flatMap(value => buildSearchIndexCandidates(key, value))
    );

    for (const candidate of prevCandidates) {
      if (!nextCandidates.has(candidate)) {
        // eslint-disable-next-line no-await-in-loop
        await updateSearchId(key, candidate, userId, 'remove');
      }
    }

    for (const candidate of nextCandidates) {
      if (!prevCandidates.has(candidate)) {
        // eslint-disable-next-line no-await-in-loop
        await updateSearchId(key, candidate, userId, 'add');
      }
    }
  }
};

const normalizeBloodIndexValue = rawValue => {
  const normalized = String(rawValue || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');

  if (!normalized) return 'no';

  if (/^[1-4][+-]$/.test(normalized)) {
    return normalized;
  }

  if (/^[1-4]$/.test(normalized)) {
    return normalized;
  }

  if (normalized === '+') {
    return '+';
  }

  if (normalized === '-') {
    return '-';
  }

  return '?';
};

const collectSearchKeyRawValues = rawValue => {
  if (Array.isArray(rawValue)) {
    return rawValue.flatMap(item => collectSearchKeyRawValues(item));
  }

  if (rawValue && typeof rawValue === 'object') {
    const entries = Object.entries(rawValue);
    const isIndexedObject = entries.every(([key]) => /^\d+$/.test(key));
    const values = isIndexedObject
      ? entries
          .sort((a, b) => Number.parseInt(a[0], 10) - Number.parseInt(b[0], 10))
          .map(([, value]) => value)
      : Object.values(rawValue);
    return values.flatMap(item => collectSearchKeyRawValues(item));
  }

  return [rawValue];
};

const normalizeSearchKeyIndexValues = (rawValue, normalizeSingleValue) => {
  const rawValues = collectSearchKeyRawValues(rawValue);
  const nonEmptyValues = rawValues.filter(value => String(value ?? '').trim() !== '');

  if (nonEmptyValues.length === 0) {
    return new Set([normalizeSingleValue('')]);
  }

  return new Set(nonEmptyValues.map(value => normalizeSingleValue(value)));
};

const getBloodIndexSet = data => {
  if (!data || typeof data !== 'object') return new Set();
  return normalizeSearchKeyIndexValues(data.blood, normalizeBloodIndexValue);
};

const normalizeMaritalStatusIndexValue = rawValue => {
  const normalized = String(rawValue || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

  if (!normalized) return 'no';

  const compact = normalized.replace(/[.,;:!]/g, '');

  if (compact === '+' || compact === 'plus') return '+';
  if (compact === '-' || compact === 'minus') return '-';
  if (compact === '?') return '?';

  const normalizedNoSpace = compact.replace(/\s+/g, '');

  const positiveValues = new Set([
    'yes',
    'так',
    'заміжня',
    'замужем',
    'одружена',
    'одружений',
    'married',
  ]);

  if (positiveValues.has(compact) || positiveValues.has(normalizedNoSpace)) {
    return '+';
  }

  const negativeValues = new Set([
    'незаміжня',
    'не заміжня',
    'неодружена',
    'неодружений',
    'single',
    'unmarried',
  ]);

  if (negativeValues.has(compact) || negativeValues.has(normalizedNoSpace)) {
    return '-';
  }

  const noDataValues = new Set(['no', 'none', 'нема', 'немає', 'відсутньо', 'unknown', 'null']);
  if (noDataValues.has(compact) || noDataValues.has(normalizedNoSpace)) {
    return 'no';
  }

  return '?';
};

const getMaritalStatusIndexSet = data => {
  if (!data || typeof data !== 'object') return new Set();
  return normalizeSearchKeyIndexValues(data.maritalStatus, normalizeMaritalStatusIndexValue);
};

const normalizeAgeBirthDateIndexValue = rawValue => {
  const normalized = String(rawValue || '').trim();
  if (!normalized) return 'no';

  const match = normalized.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!match) return '?';

  const day = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const year = Number.parseInt(match[3], 10);

  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) {
    return '?';
  }

  const parsedDate = new Date(year, month - 1, day);
  if (
    parsedDate.getFullYear() !== year ||
    parsedDate.getMonth() !== month - 1 ||
    parsedDate.getDate() !== day
  ) {
    return '?';
  }

  const isoDate = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return `d_${isoDate}`;
};

const getAgeIndexSet = data => {
  if (!data || typeof data !== 'object') return new Set();
  return normalizeSearchKeyIndexValues(data.birth, normalizeAgeBirthDateIndexValue);
};

const normalizeMetricIndexValues = rawValue => {
  const rawValues = collectSearchKeyRawValues(rawValue);
  const normalizedValues = new Set();
  let hasNonEmptyValue = false;

  rawValues.forEach(value => {
    const normalized = String(value ?? '').trim();
    if (!normalized) return;
    hasNonEmptyValue = true;
    const parsedValue = Number.parseFloat(normalized.replace(',', '.'));
    if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
      normalizedValues.add('?');
      return;
    }
    normalizedValues.add(String(parsedValue).replace('.', ','));
  });

  if (normalizedValues.size > 0) return normalizedValues;
  return new Set([hasNonEmptyValue ? '?' : 'no']);
};

const normalizeImtBucketValue = value => {
  const normalized = String(value ?? '').trim();
  if (!normalized) return 'no';

  const parsedValue = Number.parseFloat(normalized.replace(',', '.'));
  if (!Number.isFinite(parsedValue) || parsedValue <= 0) return '?';

  const roundedImt = Math.round(parsedValue);
  if (roundedImt <= 28) return 'le28';
  if (roundedImt <= 31) return '29_31';
  if (roundedImt <= 35) return '32_35';
  return '36_plus';
};

const normalizeImtSearchKeyIndexValue = data => {
  if (!data || typeof data !== 'object') return 'no';

  let imtValue = null;

  if (!Number.isFinite(imtValue)) {
    const weight = Number.parseFloat(
      String(data.weight ?? '')
        .trim()
        .replace(',', '.')
    );
    const height = Number.parseFloat(
      String(data.height ?? '')
        .trim()
        .replace(',', '.')
    );
    if (Number.isFinite(weight) && weight > 0 && Number.isFinite(height) && height > 0) {
      const heightInMeters = height / 100;
      imtValue = weight / heightInMeters ** 2;
    }
  }

  if (!Number.isFinite(imtValue) || imtValue <= 0) {
    const hasAnyAnthropometry = String(data.weight ?? '').trim() || String(data.height ?? '').trim();
    return hasAnyAnthropometry ? '?' : 'no';
  }

  return normalizeImtBucketValue(imtValue);
};

const getImtIndexSet = data => {
  if (!data || typeof data !== 'object') return new Set();
  return new Set([normalizeImtSearchKeyIndexValue(data)]);
};

const getHeightIndexSet = data => {
  if (!data || typeof data !== 'object') return new Set();
  return normalizeMetricIndexValues(data.height);
};

const getWeightIndexSet = data => {
  if (!data || typeof data !== 'object') return new Set();
  return normalizeMetricIndexValues(data.weight);
};

const normalizeFieldCountSearchKeyIndexValue = data => {
  if (!data || typeof data !== 'object') return '0';
  return String(Object.keys(data).length);
};

const getFieldCountIndexSet = data => {
  return new Set([normalizeFieldCountSearchKeyIndexValue(data)]);
};

export const normalizeRoleSearchKeyIndexValue = (roleValue, userRoleValue) => {
  const normalizeSingleRole = value => {
    const normalized = String(value || '')
      .trim()
      .toLowerCase();

    if (!normalized) return '';
    if (normalized === 'ed') return 'ed';
    if (normalized === 'sm') return 'sm';
    if (normalized === 'ag') return 'ag';
    if (normalized === 'ip') return 'ip';
    if (normalized === 'pp') return 'pp';
    if (normalized === 'cl') return 'cl';
    return '?';
  };

  const normalizedRole = normalizeSingleRole(roleValue);
  if (normalizedRole && normalizedRole !== '?') return normalizedRole;

  const normalizedUserRole = normalizeSingleRole(userRoleValue);
  if (normalizedUserRole && normalizedUserRole !== '?') return normalizedUserRole;

  if (normalizedRole === '?' || normalizedUserRole === '?') return '?';
  return 'no';
};

const getRoleIndexSet = data => {
  if (!data || typeof data !== 'object') return new Set();
  const roleValues = normalizeSearchKeyIndexValues(data.role, value => normalizeRoleSearchKeyIndexValue(value, null));
  const normalizedRoleValues = new Set([...roleValues].filter(value => value !== 'no'));
  if (normalizedRoleValues.size > 0) return normalizedRoleValues;

  const userRoleValues = normalizeSearchKeyIndexValues(
    data.userRole,
    value => normalizeRoleSearchKeyIndexValue(null, value)
  );
  const normalizedUserRoleValues = new Set([...userRoleValues].filter(value => value !== 'no'));
  if (normalizedUserRoleValues.size > 0) return normalizedUserRoleValues;

  if (roleValues.has('?') || userRoleValues.has('?')) return new Set(['?']);
  return new Set(['no']);
};

const getUserIdIndexSet = userId => {
  const normalizedId = String(userId || '').trim().toLowerCase();
  if (!normalizedId) {
    return new Set(['other']);
  }

  const userIdVariants = new Set();
  if (normalizedId.startsWith('vk')) userIdVariants.add('vk');
  if (normalizedId.startsWith('aa')) userIdVariants.add('aa');
  if (normalizedId.startsWith('ab')) userIdVariants.add('ab');
  if (normalizedId.startsWith('id')) userIdVariants.add('id');
  if (normalizedId.length > 20) userIdVariants.add('long');
  if (normalizedId.length > 8 && normalizedId.length <= 20) userIdVariants.add('mid');
  if (userIdVariants.size === 0) userIdVariants.add('other');

  return userIdVariants;
};

const CSECTION_DATE_PATTERN = /\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/;
const CSECTION_INTEGER_PATTERN = /^[+-]?\d+$/;
const CSECTION_MINUS_VALUES = new Set(['-', 'no', 'ні', 'minus']);

const normalizeSingleCsectionIndexValue = value => {
  if (value === null || value === undefined) return 'no';

  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return 'no';
  const normalizedToken = normalized.replace(/[.,;:!?]+$/g, '');

  if (CSECTION_DATE_PATTERN.test(normalizedToken)) return 'cs1';

  if (normalizedToken === '+' || normalizedToken === 'plus') return 'cs1';
  if (normalizedToken === '++' || normalizedToken === '+++') return 'cs2plus';

  if (CSECTION_INTEGER_PATTERN.test(normalizedToken)) {
    const parsedInt = Number.parseInt(normalizedToken, 10);
    if (parsedInt === 1) return 'cs1';
    if (parsedInt === 2 || parsedInt === 3) return 'cs2plus';
  }

  if (CSECTION_MINUS_VALUES.has(normalizedToken)) return 'cs0';

  return 'other';
};

export const normalizeCsectionIndexValue = value => {
  if (Array.isArray(value)) {
    const normalizedItems = value
      .filter(item => item !== null && item !== undefined && String(item).trim() !== '')
      .map(item => normalizeSingleCsectionIndexValue(item));

    if (normalizedItems.length === 0) return 'no';
    if (normalizedItems.includes('cs2plus')) return 'cs2plus';
    if (normalizedItems.includes('cs1')) return 'cs1';
    if (normalizedItems.includes('cs0')) return 'cs0';
    if (normalizedItems.includes('no')) return 'no';
    return 'other';
  }

  return normalizeSingleCsectionIndexValue(value);
};

const getCsectionIndexSet = data => {
  if (!data || typeof data !== 'object') return new Set();
  return normalizeSearchKeyIndexValues(data.csection, normalizeSingleCsectionIndexValue);
};

/* eslint-disable no-unused-vars -- legacy searchKey bucket collectors are kept for existing index code paths. */
const BLOOD_SEARCH_KEY_BUCKETS = ['1+', '1-', '1', '2+', '2-', '2', '3+', '3-', '3', '4+', '4-', '4', '+', '-', '?', 'no'];

const getBloodBucketMeta = bucket => {
  const normalizedBucket = String(bucket || '').trim().toLowerCase();

  if (/^[1-4][+-]$/.test(normalizedBucket)) {
    return {
      bloodGroup: normalizedBucket[0],
      rh: normalizedBucket[1],
    };
  }

  if (/^[1-4]$/.test(normalizedBucket)) {
    return {
      bloodGroup: normalizedBucket,
      rh: 'empty',
    };
  }

  if (normalizedBucket === '+') {
    return { bloodGroup: 'other', rh: '+' };
  }

  if (normalizedBucket === '-') {
    return { bloodGroup: 'other', rh: '-' };
  }

  if (normalizedBucket === 'no') {
    return { bloodGroup: 'empty', rh: 'empty' };
  }

  if (normalizedBucket === '?') {
    return { bloodGroup: 'other', rh: 'other' };
  }

  return { bloodGroup: 'other', rh: 'other' };
};

const hasExplicitFilterSelection = filterMap =>
  Boolean(filterMap && typeof filterMap === 'object' && Object.values(filterMap).some(value => value === false));

const bucketGroupExcludesNo = group => {
  if (!group?.allBuckets?.map(String).includes('no')) return false;
  const buckets = Array.isArray(group?.buckets) ? group.buckets.map(String) : [];
  return buckets.length > 0 && !buckets.includes('no');
};

const isNoExcludingSearchKeyPointGroup = group => Boolean(group?.supportsPointCheck && bucketGroupExcludesNo(group));

const isBucketAllowedByFilters = (bucket, filterSettings = {}) => {
  const { bloodGroup, rh } = getBloodBucketMeta(bucket);
  const bloodGroupFilters = filterSettings?.bloodGroup;
  const rhFilters = filterSettings?.rh;

  const shouldApplyBloodGroup = hasExplicitFilterSelection(bloodGroupFilters);
  const shouldApplyRh = hasExplicitFilterSelection(rhFilters);
  const allKnownBloodGroupsAllowed = ['1', '2', '3', '4'].every(group => Boolean(bloodGroupFilters?.[group]));
  const isRhOnlyBucket = bucket === '+' || bucket === '-';

  // Окремий bucket "+"/"-" означає відомий резус без вказаної групи крові.
  // Дозволяємо його для повного набору груп, але не розширюємо ним вибір однієї конкретної групи.
  const bloodGroupAllowed = shouldApplyBloodGroup
    ? Boolean(bloodGroupFilters?.[bloodGroup]) || (isRhOnlyBucket && allKnownBloodGroupsAllowed)
    : true;
  const rhAllowed = shouldApplyRh ? Boolean(rhFilters?.[rh]) : true;

  return bloodGroupAllowed && rhAllowed;
};

const MARITAL_STATUS_SEARCH_KEY_BUCKETS = ['+', '-', '?', 'no'];
const CONTACT_SEARCH_KEY_BUCKETS = ['vk', 'instagram', 'ameblo', 'facebook', 'phone', 'telegram', 'telegram2', 'tiktok', 'linkedin', 'youtube', 'email', 'twitter', 'line', 'otherLink'];
const ROLE_SEARCH_KEY_BUCKETS = ['ed', 'sm', 'ag', 'ip', 'pp', 'cl', '?', 'no'];
const USER_ID_SEARCH_KEY_BUCKETS = ['vk', 'aa', 'ab', 'id', 'long', 'mid', 'other'];
const IMT_SEARCH_KEY_BUCKETS = ['le28', '29_31', '32_35', '36_plus', '?', 'no'];

const getMaritalStatusFilterKey = bucket => {
  const normalizedBucket = String(bucket || '').trim().toLowerCase();
  if (normalizedBucket === '+') return 'married';
  if (normalizedBucket === '-') return 'unmarried';
  if (normalizedBucket === 'no') return 'empty';
  return 'other';
};

const isMaritalStatusBucketAllowedByFilters = (bucket, filterSettings = {}) => {
  const maritalStatusFilters = filterSettings?.maritalStatus;
  const shouldApplyMaritalStatus = hasExplicitFilterSelection(maritalStatusFilters);
  if (!shouldApplyMaritalStatus) return true;

  const filterKey = getMaritalStatusFilterKey(bucket);
  return Boolean(maritalStatusFilters?.[filterKey]);
};

const isContactBucketAllowedByFilters = (bucket, filterSettings = {}) => {
  const contactFilters = filterSettings?.contact;
  const shouldApplyContact = hasExplicitFilterSelection(contactFilters);
  if (!shouldApplyContact) return true;
  return Boolean(contactFilters?.[bucket]);
};

const getRoleFilterKey = bucket => {
  const normalizedBucket = String(bucket || '').trim().toLowerCase();
  if (['ed', 'sm', 'ag', 'ip', 'pp', 'cl'].includes(normalizedBucket)) return normalizedBucket;
  if (normalizedBucket === 'no') return 'empty';
  return 'other';
};

const isRoleBucketAllowedByFilters = (bucket, filterSettings = {}) => {
  const roleFilters = filterSettings?.role;
  const shouldApplyRole = hasExplicitFilterSelection(roleFilters);
  if (!shouldApplyRole) return true;

  const filterKey = getRoleFilterKey(bucket);
  return Boolean(roleFilters?.[filterKey]);
};

const isUserIdBucketAllowedByFilters = (bucket, filterSettings = {}) => {
  const userIdFilters = filterSettings?.userId;
  const shouldApplyUserId = hasExplicitFilterSelection(userIdFilters);
  if (!shouldApplyUserId) return true;
  return Boolean(userIdFilters?.[bucket]);
};

const collectFieldCountIdsByFilters = async (fieldsFilters, rootPaths = [SEARCH_KEY_INDEX_ROOT]) => {
  const shouldApplyFields = hasExplicitFilterSelection(fieldsFilters);
  if (!shouldApplyFields) return null;

  const selected = {
    le5: Boolean(fieldsFilters?.le5),
    f6_10: Boolean(fieldsFilters?.f6_10),
    f11_20: Boolean(fieldsFilters?.f11_20),
    f20_plus: Boolean(fieldsFilters?.f20_plus),
  };

  const fieldIds = new Set();
  const snapshots = await Promise.all(
    rootPaths.map(rootPath => get(ref2(database, `${rootPath}/${FIELD_COUNT_SEARCH_KEY_INDEX}`)))
  );

  snapshots.forEach(snapshot => {
    if (!snapshot.exists()) return;

    Object.entries(snapshot.val() || {}).forEach(([countKey, usersMap]) => {
      const parsedCount = Number.parseInt(String(countKey), 10);
      if (!Number.isInteger(parsedCount) || parsedCount < 0) return;

      const inSelectedRange =
        (selected.le5 && parsedCount <= 5) ||
        (selected.f6_10 && parsedCount >= 6 && parsedCount <= 10) ||
        (selected.f11_20 && parsedCount >= 11 && parsedCount <= 20) ||
        (selected.f20_plus && parsedCount > 20);

      if (!inSelectedRange) return;
      Object.keys(usersMap || {}).forEach(userId => {
        if (userId) fieldIds.add(userId);
      });
    });
  });

  return fieldIds;
};

const AGE_DATE_PREFIX = 'd_';

const parseLastActionDate = rawValue => {
  if (rawValue === undefined || rawValue === null) return { status: 'empty', date: null };

  const normalized = String(rawValue).trim();
  if (!normalized) return { status: 'empty', date: null };

  let parsedDate = null;
  const isoMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const dotMatch = normalized.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);

  if (isoMatch) {
    const [, yearRaw, monthRaw, dayRaw] = isoMatch;
    const year = Number.parseInt(yearRaw, 10);
    const month = Number.parseInt(monthRaw, 10);
    const day = Number.parseInt(dayRaw, 10);
    const dateOnly = new Date(year, month - 1, day);
    if (
      dateOnly.getFullYear() !== year ||
      dateOnly.getMonth() !== month - 1 ||
      dateOnly.getDate() !== day
    ) {
      return { status: 'invalid', date: null };
    }

    const includesTime = normalized.length > isoMatch[0].length;
    if (includesTime) {
      const timestamp = Date.parse(normalized);
      if (Number.isNaN(timestamp)) return { status: 'invalid', date: null };
      parsedDate = new Date(timestamp);
    } else {
      parsedDate = dateOnly;
    }
  } else if (dotMatch) {
    const [, dayRaw, monthRaw, yearRaw] = dotMatch;
    const year = Number.parseInt(yearRaw, 10);
    const month = Number.parseInt(monthRaw, 10);
    const day = Number.parseInt(dayRaw, 10);
    parsedDate = new Date(year, month - 1, day);
    if (
      parsedDate.getFullYear() !== year ||
      parsedDate.getMonth() !== month - 1 ||
      parsedDate.getDate() !== day
    ) {
      return { status: 'invalid', date: null };
    }
  } else if (typeof rawValue === 'number' || /^\d+$/.test(normalized)) {
    const timestamp = Number(rawValue);
    if (!Number.isFinite(timestamp)) return { status: 'invalid', date: null };
    parsedDate = new Date(timestamp);
    if (Number.isNaN(parsedDate.getTime())) return { status: 'invalid', date: null };
  } else {
    const timestamp = Date.parse(normalized);
    if (Number.isNaN(timestamp)) return { status: 'invalid', date: null };
    parsedDate = new Date(timestamp);
  }

  return { status: 'valid', date: parsedDate };
};

export const normalizeLastActionSearchKeyBucket = rawValue => {
  const parsed = parseLastActionDate(rawValue);
  if (parsed.status === 'empty') return 'no';
  if (parsed.status === 'invalid') return '?';

  return `${AGE_DATE_PREFIX}${toIsoDate(parsed.date)}`;
};

export const normalizeLastActionSearchKeyValue = rawValue => {
  const parsed = parseLastActionDate(rawValue);
  if (parsed.status !== 'valid') return true;

  return parsed.date.getTime();
};

const getLastActionIndexSet = data => {
  if (!data || typeof data !== 'object') return new Set(['no']);
  return new Set([normalizeLastActionSearchKeyBucket(data.lastAction)]);
};


const normalizeDateSearchKeyBucket = rawValue => {
  const parsed = parseLastActionDate(rawValue);
  if (parsed.status === 'empty') return 'no';
  if (parsed.status === 'invalid') return '?';

  return `${AGE_DATE_PREFIX}${toIsoDate(parsed.date)}`;
};

const getGetInTouchIndexSet = data => {
  if (!data || typeof data !== 'object') return new Set(['no']);
  return new Set([normalizeDateSearchKeyBucket(data.getInTouch)]);
};

const GET_IN_TOUCH_SPECIAL_VALUES = new Set([
  '2099-99-99',
  '9999-99-99',
  '99.99.2099',
  '99.99.9999',
]);

const toIsoDate = date => {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const subtractYears = (date, years) => {
  const shifted = new Date(date);
  shifted.setFullYear(shifted.getFullYear() - years);
  return shifted;
};

const shiftDays = (date, days) => {
  const shifted = new Date(date);
  shifted.setDate(shifted.getDate() + days);
  return shifted;
};

const getBirthDateRangeByAge = ({ minAge, maxAge, today = new Date() }) => {
  let startDate = null;
  let endDate = null;

  if (Number.isFinite(maxAge)) {
    startDate = shiftDays(subtractYears(today, maxAge + 1), 1);
  }

  if (Number.isFinite(minAge)) {
    endDate = subtractYears(today, minAge);
  }

  if (!startDate) startDate = new Date(1900, 0, 1);
  if (!endDate) endDate = today;
  if (startDate > endDate) return null;

  return {
    startKey: `${AGE_DATE_PREFIX}${toIsoDate(startDate)}`,
    endKey: `${AGE_DATE_PREFIX}${toIsoDate(endDate)}`,
  };
};

const collectIdsFromAgeSnapshot = (snapshot, idSet) => {
  if (!snapshot.exists()) return;
  snapshot.forEach(bucketSnapshot => {
    const usersMap = bucketSnapshot.val() || {};
    Object.keys(usersMap).forEach(userId => {
      if (userId) idSet.add(userId);
    });
  });
};

export const collectAgeIdsByFilters = async (ageFilters, rootPaths = [SEARCH_KEY_INDEX_ROOT]) => {
  const shouldApplyAge = hasExplicitFilterSelection(ageFilters);
  if (!shouldApplyAge) return null;

  const selected = key => Boolean(ageFilters?.[key]);
  const ageIds = new Set();
  const requests = [];

  const addRangeRequest = (range, rootPath) => {
    if (!range) return;
    requests.push(
      get(
        query(
          ref2(database, `${rootPath}/${AGE_SEARCH_KEY_INDEX}`),
          orderByKey(),
          startAt(range.startKey),
          endAt(range.endKey)
        )
      )
    );
  };

  const ageRangeFilters = [
    { keys: ['le21'], range: { maxAge: 21 } },
    { keys: ['22_25'], range: { minAge: 22, maxAge: 25 } },
    { keys: ['26_30'], range: { minAge: 26, maxAge: 30 } },
    { keys: ['31_35'], range: { minAge: 31, maxAge: 35 } },
    { keys: ['36_38'], range: { minAge: 36, maxAge: 38 } },
    { keys: ['39_41'], range: { minAge: 39, maxAge: 41 } },
    { keys: ['42_plus'], range: { minAge: 42 } },
    // Backward compatibility with old buckets
    { keys: ['le25'], range: { maxAge: 25 } },
    { keys: ['31_33'], range: { minAge: 31, maxAge: 33 } },
    { keys: ['34_36'], range: { minAge: 34, maxAge: 36 } },
    { keys: ['37_42'], range: { minAge: 37, maxAge: 42 } },
    { keys: ['43_plus'], range: { minAge: 43 } },
  ];

  const dynamicRanges = Object.entries(ageFilters || {}).reduce((acc, [key, enabled]) => {
    if (!enabled) return acc;
    const rangeMatch = String(key).trim().match(/^(\d{1,3})\s*[_-]\s*(\d{1,3})$/);
    if (!rangeMatch) return acc;
    const a = Number.parseInt(rangeMatch[1], 10);
    const b = Number.parseInt(rangeMatch[2], 10);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return acc;
    acc.push({ minAge: Math.min(a, b), maxAge: Math.max(a, b) });
    return acc;
  }, []);

  rootPaths.forEach(rootPath => {
    ageRangeFilters.forEach(({ keys, range }) => {
      if (keys.some(key => selected(key))) {
        addRangeRequest(getBirthDateRangeByAge(range), rootPath);
      }
    });

    dynamicRanges.forEach(range => {
      addRangeRequest(getBirthDateRangeByAge(range), rootPath);
    });

    Object.entries(ageFilters || {}).forEach(([key, enabled]) => {
      if (!enabled) return;
      const normalizedKey = String(key).trim();
      if (!/^\d{1,3}$/.test(normalizedKey)) return;
      const ageValue = Number.parseInt(normalizedKey, 10);
      if (!Number.isFinite(ageValue)) return;
      addRangeRequest(getBirthDateRangeByAge({ minAge: ageValue, maxAge: ageValue }), rootPath);
    });

    if (selected('other') || selected('?')) requests.push(get(ref2(database, `${rootPath}/${AGE_SEARCH_KEY_INDEX}/?`)));
    if (selected('empty') || selected('no')) requests.push(get(ref2(database, `${rootPath}/${AGE_SEARCH_KEY_INDEX}/no`)));
  });

  const snapshots = await Promise.all(requests);
  snapshots.forEach(snapshot => {
    if (!snapshot.exists()) return;
    const isRangeResult = snapshot.key === AGE_SEARCH_KEY_INDEX;
    if (isRangeResult) {
      collectIdsFromAgeSnapshot(snapshot, ageIds);
      return;
    }
    Object.keys(snapshot.val() || {}).forEach(userId => {
      if (userId) ageIds.add(userId);
    });
  });

  return ageIds;
};

const collectImtIdsByFilters = async (imtFilters, rootPaths = [SEARCH_KEY_INDEX_ROOT]) => {
  const shouldApplyImt = hasExplicitFilterSelection(imtFilters);
  if (!shouldApplyImt) return null;

  const selected = key => Boolean(imtFilters?.[key]);
  const imtIds = new Set();
  const requests = [];

  rootPaths.forEach(rootPath => {
    if (selected('le28')) requests.push(get(ref2(database, `${rootPath}/${IMT_SEARCH_KEY_INDEX}/le28`)));
    if (selected('29_31')) requests.push(get(ref2(database, `${rootPath}/${IMT_SEARCH_KEY_INDEX}/29_31`)));
    if (selected('32_35')) requests.push(get(ref2(database, `${rootPath}/${IMT_SEARCH_KEY_INDEX}/32_35`)));
    if (selected('36_plus')) requests.push(get(ref2(database, `${rootPath}/${IMT_SEARCH_KEY_INDEX}/36_plus`)));
    if (selected('other')) requests.push(get(ref2(database, `${rootPath}/${IMT_SEARCH_KEY_INDEX}/?`)));
    if (selected('no')) requests.push(get(ref2(database, `${rootPath}/${IMT_SEARCH_KEY_INDEX}/no`)));
  });

  const snapshots = await Promise.all(requests);
  snapshots.forEach(snapshot => {
    if (!snapshot.exists()) return;
    Object.keys(snapshot.val() || {}).forEach(userId => {
      if (userId) imtIds.add(userId);
    });
  });

  return imtIds;
};

const getHeightFilterBucket = heightValue => {
  if (!Number.isFinite(heightValue) || heightValue <= 0) return null;
  if (heightValue < 163) return 'lt163';
  if (heightValue <= 176) return '163_176';
  if (heightValue <= 180) return '177_180';
  return '181_plus';
};

const collectHeightIdsByFilters = async (heightFilters, rootPaths = [SEARCH_KEY_INDEX_ROOT]) => {
  const shouldApplyHeight = hasExplicitFilterSelection(heightFilters);
  if (!shouldApplyHeight) return null;

  const selectedBuckets = Object.entries(heightFilters || {})
    .filter(([, enabled]) => enabled)
    .map(([bucket]) => bucket);

  if (selectedBuckets.length === 0) return new Set();

  const selectedSet = new Set(selectedBuckets);
  const heightIds = new Set();
  const snapshots = await Promise.all(
    rootPaths.map(rootPath => get(ref2(database, `${rootPath}/${HEIGHT_SEARCH_KEY_INDEX}`)))
  );

  snapshots.forEach(snapshot => {
    if (!snapshot.exists()) return;

    Object.entries(snapshot.val() || {}).forEach(([storedHeight, usersMap]) => {
      const parsedHeight = Number.parseFloat(String(storedHeight || '').replace(',', '.'));
      let bucket = getHeightFilterBucket(parsedHeight);
      if (!bucket && storedHeight === '?') bucket = 'other';
      if (!bucket && storedHeight === 'no') bucket = 'no';
      if (!bucket || !selectedSet.has(bucket)) return;
      Object.keys(usersMap || {}).forEach(userId => {
        if (userId) heightIds.add(userId);
      });
    });
  });

  return heightIds;
};

const parseIsoDate = value => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const parsedDate = new Date(year, month - 1, day);
  if (
    parsedDate.getFullYear() !== year ||
    parsedDate.getMonth() !== month - 1 ||
    parsedDate.getDate() !== day
  ) {
    return null;
  }
  return parsedDate;
};

const normalizeReactionSearchKeyIndexValue = rawGetInTouch => {
  const normalized = String(rawGetInTouch || '').trim();
  if (!normalized) return 'no';

  if (
    GET_IN_TOUCH_SPECIAL_VALUES.has(normalized) ||
    GET_IN_TOUCH_SPECIAL_VALUES.has(normalized.replace(/\./g, '-'))
  ) {
    return '99';
  }

  const parsedDate = parseIsoDate(normalized);
  if (!parsedDate) return '?';
  return `${AGE_DATE_PREFIX}${toIsoDate(parsedDate)}`;
};

const getReactionIndexSet = data => {
  if (!data || typeof data !== 'object') return new Set();
  return normalizeSearchKeyIndexValues(data.getInTouch, normalizeReactionSearchKeyIndexValue);
};

const collectReactionIdsByFilters = async (
  reactionFilters,
  { favoritesMap = {}, dislikedMap = {} } = {},
  rootPaths = [SEARCH_KEY_INDEX_ROOT],
) => {
  const shouldApplyReaction = hasExplicitFilterSelection(reactionFilters);
  if (!shouldApplyReaction) return null;

  const selected = key => Boolean(reactionFilters?.[key]);
  const reactionIds = new Set();
  const requests = [];

  const today = new Date();
  const todayAtMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const todayKey = `${AGE_DATE_PREFIX}${toIsoDate(todayAtMidnight)}`;

  const addRangeRequest = ({ startKey, endKey }, rootPath) => {
    requests.push(
      get(
        query(
          ref2(database, `${rootPath}/${REACTION_SEARCH_KEY_INDEX}`),
          orderByKey(),
          startAt(startKey),
          endAt(endKey)
        )
      )
    );
  };

  const addBucketRequest = (bucket, rootPath) => {
    requests.push(get(ref2(database, `${rootPath}/${REACTION_SEARCH_KEY_INDEX}/${bucket}`)));
  };

  rootPaths.forEach(rootPath => {
    if (selected('special99')) addBucketRequest('99', rootPath);
    if (selected('pastGetInTouch')) {
      addRangeRequest({ startKey: `${AGE_DATE_PREFIX}1900-01-01`, endKey: todayKey }, rootPath);
    }
    if (selected('futureGetInTouch')) {
      addRangeRequest({ startKey: todayKey, endKey: `${AGE_DATE_PREFIX}9999-12-31` }, rootPath);
    }
    if (selected('question')) addBucketRequest('?', rootPath);
    if (selected('none')) addBucketRequest('no', rootPath);
  });

  const snapshots = await Promise.all(requests);
  snapshots.forEach(snapshot => {
    if (!snapshot.exists()) return;
    const isRangeResult = snapshot.key === REACTION_SEARCH_KEY_INDEX;

    if (isRangeResult) {
      snapshot.forEach(bucketSnapshot => {
        const bucketKey = String(bucketSnapshot.key || '');
        if (!bucketKey.startsWith(AGE_DATE_PREFIX)) return;

        if (selected('pastGetInTouch') && bucketKey < todayKey) {
          Object.keys(bucketSnapshot.val() || {}).forEach(userId => {
            if (userId) reactionIds.add(userId);
          });
        }

        if (selected('futureGetInTouch') && bucketKey >= todayKey) {
          Object.keys(bucketSnapshot.val() || {}).forEach(userId => {
            if (userId) reactionIds.add(userId);
          });
        }
      });
      return;
    }

    Object.keys(snapshot.val() || {}).forEach(userId => {
      if (userId) reactionIds.add(userId);
    });
  });

  if (selected('like')) {
    Object.entries(favoritesMap).forEach(([userId, enabled]) => {
      if (userId && enabled) reactionIds.add(userId);
    });
  }

  if (selected('dislike')) {
    Object.entries(dislikedMap).forEach(([userId, enabled]) => {
      if (userId && enabled) reactionIds.add(userId);
    });
  }

  return reactionIds;
};
/* eslint-enable no-unused-vars */

const resolveSearchKeyLeafPath = (rootPath, indexName, value, userId) => {
  const safeRootPath = rootPath || SEARCH_KEY_INDEX_ROOT;
  return `${safeRootPath}/${indexName}/${value}/${userId}`;
};

const updateSearchKeyLeaf = async (indexName, value, userId, action, options = {}) => {
  if (!indexName || !value || !userId) return;
  const indexRef = ref2(database, resolveSearchKeyLeafPath(options?.rootPath, indexName, value, userId));

  if (action === 'add') {
    await set(indexRef, options?.leafValue ?? true);
    return;
  }

  if (action === 'remove') {
    await remove(indexRef);
  }
};

export const syncUserSearchKeyIndex = async (userId, prevData = {}, nextData = {}, options = {}) => {
  if (!userId) return;
  const updateLeaf = (indexName, value, action) =>
    updateSearchKeyLeaf(indexName, value, userId, action, options);

  const prevValues = getBloodIndexSet(prevData);
  const nextValues = getBloodIndexSet(nextData);
  const prevMaritalStatusValues = getMaritalStatusIndexSet(prevData);
  const nextMaritalStatusValues = getMaritalStatusIndexSet(nextData);
  const prevCsectionValues = getCsectionIndexSet(prevData);
  const nextCsectionValues = getCsectionIndexSet(nextData);
  const prevContactValues = getContactIndexSet(prevData);
  const nextContactValues = getContactIndexSet(nextData);
  const prevRoleValues = getRoleIndexSet(prevData);
  const nextRoleValues = getRoleIndexSet(nextData);
  const prevUserIdValues = getUserIdIndexSet(userId);
  const nextUserIdValues = getUserIdIndexSet(nextData?.userId || userId);
  const prevAgeValues = getAgeIndexSet(prevData);
  const nextAgeValues = getAgeIndexSet(nextData);
  const prevImtValues = getImtIndexSet(prevData);
  const nextImtValues = getImtIndexSet(nextData);
  const prevHeightValues = getHeightIndexSet(prevData);
  const nextHeightValues = getHeightIndexSet(nextData);
  const prevWeightValues = getWeightIndexSet(prevData);
  const nextWeightValues = getWeightIndexSet(nextData);

  for (const value of prevValues) {
    if (!nextValues.has(value)) {
      // eslint-disable-next-line no-await-in-loop
      await updateLeaf(BLOOD_SEARCH_KEY_INDEX, value, 'remove');
    }
  }

  for (const value of nextValues) {
    if (!prevValues.has(value)) {
      // eslint-disable-next-line no-await-in-loop
      await updateLeaf(BLOOD_SEARCH_KEY_INDEX, value, 'add');
    }
  }

  for (const value of prevMaritalStatusValues) {
    if (!nextMaritalStatusValues.has(value)) {
      // eslint-disable-next-line no-await-in-loop
      await updateLeaf(MARITAL_STATUS_SEARCH_KEY_INDEX, value, 'remove');
    }
  }

  for (const value of nextMaritalStatusValues) {
    if (!prevMaritalStatusValues.has(value)) {
      // eslint-disable-next-line no-await-in-loop
      await updateLeaf(MARITAL_STATUS_SEARCH_KEY_INDEX, value, 'add');
    }
  }

  for (const value of prevCsectionValues) {
    if (!nextCsectionValues.has(value)) {
      // eslint-disable-next-line no-await-in-loop
      await updateLeaf(CSECTION_SEARCH_KEY_INDEX, value, 'remove');
    }
  }

  for (const value of nextCsectionValues) {
    if (!prevCsectionValues.has(value)) {
      // eslint-disable-next-line no-await-in-loop
      await updateLeaf(CSECTION_SEARCH_KEY_INDEX, value, 'add');
    }
  }

  for (const value of prevContactValues) {
    if (!nextContactValues.has(value)) {
      // eslint-disable-next-line no-await-in-loop
      await updateLeaf(CONTACT_SEARCH_KEY_INDEX, value, 'remove');
    }
  }

  for (const value of nextContactValues) {
    if (!prevContactValues.has(value)) {
      // eslint-disable-next-line no-await-in-loop
      await updateLeaf(CONTACT_SEARCH_KEY_INDEX, value, 'add');
    }
  }

  for (const value of prevRoleValues) {
    if (!nextRoleValues.has(value)) {
      // eslint-disable-next-line no-await-in-loop
      await updateLeaf(ROLE_SEARCH_KEY_INDEX, value, 'remove');
    }
  }

  for (const value of nextRoleValues) {
    if (!prevRoleValues.has(value)) {
      // eslint-disable-next-line no-await-in-loop
      await updateLeaf(ROLE_SEARCH_KEY_INDEX, value, 'add');
    }
  }

  for (const value of prevUserIdValues) {
    if (!nextUserIdValues.has(value)) {
      // eslint-disable-next-line no-await-in-loop
      await updateLeaf(USER_ID_SEARCH_KEY_INDEX, value, 'remove');
    }
  }

  for (const value of nextUserIdValues) {
    if (!prevUserIdValues.has(value)) {
      // eslint-disable-next-line no-await-in-loop
      await updateLeaf(USER_ID_SEARCH_KEY_INDEX, value, 'add');
    }
  }

  for (const value of prevAgeValues) {
    if (!nextAgeValues.has(value)) {
      // eslint-disable-next-line no-await-in-loop
      await updateLeaf(AGE_SEARCH_KEY_INDEX, value, 'remove');
    }
  }

  for (const value of nextAgeValues) {
    if (!prevAgeValues.has(value)) {
      // eslint-disable-next-line no-await-in-loop
      await updateLeaf(AGE_SEARCH_KEY_INDEX, value, 'add');
    }
  }

  for (const value of prevImtValues) {
    if (!nextImtValues.has(value)) {
      // eslint-disable-next-line no-await-in-loop
      await updateLeaf(IMT_SEARCH_KEY_INDEX, value, 'remove');
    }
  }

  for (const value of nextImtValues) {
    if (!prevImtValues.has(value)) {
      // eslint-disable-next-line no-await-in-loop
      await updateLeaf(IMT_SEARCH_KEY_INDEX, value, 'add');
    }
  }

  for (const value of prevHeightValues) {
    if (!nextHeightValues.has(value)) {
      // eslint-disable-next-line no-await-in-loop
      await updateLeaf(HEIGHT_SEARCH_KEY_INDEX, value, 'remove');
    }
  }

  for (const value of nextHeightValues) {
    if (!prevHeightValues.has(value)) {
      // eslint-disable-next-line no-await-in-loop
      await updateLeaf(HEIGHT_SEARCH_KEY_INDEX, value, 'add');
    }
  }

  for (const value of prevWeightValues) {
    if (!nextWeightValues.has(value)) {
      // eslint-disable-next-line no-await-in-loop
      await updateLeaf(WEIGHT_SEARCH_KEY_INDEX, value, 'remove');
    }
  }

  for (const value of nextWeightValues) {
    if (!prevWeightValues.has(value)) {
      // eslint-disable-next-line no-await-in-loop
      await updateLeaf(WEIGHT_SEARCH_KEY_INDEX, value, 'add');
    }
  }

  const prevReactionValues = getReactionIndexSet(prevData);
  const nextReactionValues = getReactionIndexSet(nextData);

  for (const value of prevReactionValues) {
    if (!nextReactionValues.has(value)) {
      // eslint-disable-next-line no-await-in-loop
      await updateLeaf(REACTION_SEARCH_KEY_INDEX, value, 'remove');
    }
  }

  for (const value of nextReactionValues) {
    if (!prevReactionValues.has(value)) {
      // eslint-disable-next-line no-await-in-loop
      await updateLeaf(REACTION_SEARCH_KEY_INDEX, value, 'add');
    }
  }

  const prevFieldCountValues = getFieldCountIndexSet(prevData);
  const nextFieldCountValues = getFieldCountIndexSet(nextData);
  const prevLastActionValues = getLastActionIndexSet(prevData);
  const nextLastActionValues = getLastActionIndexSet(nextData);
  const prevGetInTouchValues = getGetInTouchIndexSet(prevData);
  const nextGetInTouchValues = getGetInTouchIndexSet(nextData);

  for (const value of prevFieldCountValues) {
    if (!nextFieldCountValues.has(value)) {
      // eslint-disable-next-line no-await-in-loop
      await updateLeaf(FIELD_COUNT_SEARCH_KEY_INDEX, value, 'remove');
    }
  }

  for (const value of nextFieldCountValues) {
    if (!prevFieldCountValues.has(value)) {
      // eslint-disable-next-line no-await-in-loop
      await updateLeaf(FIELD_COUNT_SEARCH_KEY_INDEX, value, 'add');
    }
  }

  for (const value of prevLastActionValues) {
    if (!nextLastActionValues.has(value)) {
      // eslint-disable-next-line no-await-in-loop
      await updateLeaf(LAST_ACTION_SEARCH_KEY_INDEX, value, 'remove');
    }
  }

  for (const value of nextLastActionValues) {
    if (!prevLastActionValues.has(value)) {
      // eslint-disable-next-line no-await-in-loop
      await updateLeaf(LAST_ACTION_SEARCH_KEY_INDEX, value, 'add');
    }
  }

  for (const value of prevGetInTouchValues) {
    if (!nextGetInTouchValues.has(value)) {
      // eslint-disable-next-line no-await-in-loop
      await updateLeaf(GET_IN_TOUCH_SEARCH_KEY_INDEX, value, 'remove');
    }
  }

  for (const value of nextGetInTouchValues) {
    if (!prevGetInTouchValues.has(value)) {
      // eslint-disable-next-line no-await-in-loop
      await updateLeaf(GET_IN_TOUCH_SEARCH_KEY_INDEX, value, 'add');
    }
  }
};

export const createSearchKeyIndexInCollection = async (collection, onProgress, options = {}) => {
  const usersData = options?.usersData || (await loadCollectionWithIndexCache(collection));
  if (!usersData) return;

  const userIds = Object.keys(usersData);
  const totalUsers = userIds.length;

  for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
    const batchIds = userIds.slice(i, i + BATCH_SIZE);

    // eslint-disable-next-line no-await-in-loop
    await Promise.all(
      batchIds.map(async userId => {
        const user = usersData[userId] || {};
        const bloodValues = getBloodIndexSet(user);
        await Promise.all(
          [...bloodValues].map(value =>
            updateSearchKeyLeaf(BLOOD_SEARCH_KEY_INDEX, value, userId, 'add', options)
          )
        );
      })
    );

    const progress = Math.floor(((i + batchIds.length) / totalUsers) * 100);
    if (onProgress) onProgress(progress);
  }
};

const uploadChunkedSearchKeyIndexUpdates = async (userIds, totalUsers, buildUpdates, onProgress) => {
  if (!totalUsers) return;

  for (let i = 0; i < userIds.length; i += SEARCH_KEY_BATCH_UPLOAD_SIZE) {
    const batchIds = userIds.slice(i, i + SEARCH_KEY_BATCH_UPLOAD_SIZE);
    const chunkPayload = buildUpdates(batchIds);

    if (Object.keys(chunkPayload).length > 0) {
      // eslint-disable-next-line no-await-in-loop
      await update(ref2(database), chunkPayload);
    }

    const progress = Math.floor((Math.min(i + batchIds.length, totalUsers) / totalUsers) * 100);
    if (onProgress) onProgress(progress);
  }
};

export const createMaritalStatusSearchKeyIndexInCollection = async (collection, onProgress, options = {}) => {
  const usersData = options?.usersData || (await loadCollectionWithIndexCache(collection));
  if (!usersData) return;
  const searchKeyRoot = options?.rootPath || SEARCH_KEY_INDEX_ROOT;

  const userIds = Object.keys(usersData);
  const totalUsers = userIds.length;
  if (totalUsers === 0) return;

  await uploadChunkedSearchKeyIndexUpdates(
    userIds,
    totalUsers,
    batchIds =>
      batchIds.reduce((acc, userId) => {
        const user = usersData[userId] || {};
        const maritalStatusValues = getMaritalStatusIndexSet(user);
        maritalStatusValues.forEach(maritalStatusValue => {
          acc[`${searchKeyRoot}/${MARITAL_STATUS_SEARCH_KEY_INDEX}/${maritalStatusValue}/${userId}`] = true;
        });
        return acc;
      }, {}),
    onProgress
  );
};

export const createCsectionSearchKeyIndexInCollection = async (collection, onProgress, options = {}) => {
  const usersData = options?.usersData || (await loadCollectionWithIndexCache(collection));
  if (!usersData) return;
  const searchKeyRoot = options?.rootPath || SEARCH_KEY_INDEX_ROOT;

  const userIds = Object.keys(usersData);
  const totalUsers = userIds.length;
  if (totalUsers === 0) return;

  await uploadChunkedSearchKeyIndexUpdates(
    userIds,
    totalUsers,
    batchIds =>
      batchIds.reduce((acc, userId) => {
        const user = usersData[userId] || {};
        const csectionValues = getCsectionIndexSet(user);
        csectionValues.forEach(csectionValue => {
          acc[`${searchKeyRoot}/${CSECTION_SEARCH_KEY_INDEX}/${csectionValue}/${userId}`] = true;
        });
        return acc;
      }, {}),
    onProgress
  );
};

export const createContactSearchKeyIndexInCollection = async (collection, onProgress, options = {}) => {
  const usersData = options?.usersData || (await loadCollectionWithIndexCache(collection));
  if (!usersData) return;
  const searchKeyRoot = options?.rootPath || SEARCH_KEY_INDEX_ROOT;

  const userIds = Object.keys(usersData);
  const totalUsers = userIds.length;
  if (totalUsers === 0) return;

  await uploadChunkedSearchKeyIndexUpdates(
    userIds,
    totalUsers,
    batchIds =>
      batchIds.reduce((acc, userId) => {
        const user = usersData[userId] || {};
        const contactValues = getContactIndexSet(user);
        contactValues.forEach(contactValue => {
          acc[`${searchKeyRoot}/${CONTACT_SEARCH_KEY_INDEX}/${contactValue}/${userId}`] = true;
        });
        return acc;
      }, {}),
    onProgress
  );
};

export const createRoleSearchKeyIndexInCollection = async (collection, onProgress, options = {}) => {
  const usersData = options?.usersData || (await loadCollectionWithIndexCache(collection));
  if (!usersData) return;
  const searchKeyRoot = options?.rootPath || SEARCH_KEY_INDEX_ROOT;

  const userIds = Object.keys(usersData);
  const totalUsers = userIds.length;
  if (totalUsers === 0) return;

  await uploadChunkedSearchKeyIndexUpdates(
    userIds,
    totalUsers,
    batchIds =>
      batchIds.reduce((acc, userId) => {
        const user = usersData[userId] || {};
        const roleValues = getRoleIndexSet(user);
        roleValues.forEach(roleValue => {
          acc[`${searchKeyRoot}/${ROLE_SEARCH_KEY_INDEX}/${roleValue}/${userId}`] = true;
        });
        return acc;
      }, {}),
    onProgress
  );
};

export const createUserIdSearchKeyIndexInCollection = async (collection, onProgress, options = {}) => {
  const usersData = options?.usersData || (await loadCollectionWithIndexCache(collection));
  if (!usersData) return;
  const searchKeyRoot = options?.rootPath || SEARCH_KEY_INDEX_ROOT;

  const userIds = Object.keys(usersData);
  const totalUsers = userIds.length;
  if (totalUsers === 0) return;

  await uploadChunkedSearchKeyIndexUpdates(
    userIds,
    totalUsers,
    batchIds =>
      batchIds.reduce((acc, userId) => {
        const user = usersData[userId] || {};
        const userIdValues = getUserIdIndexSet(user.userId || userId);
        userIdValues.forEach(userIdValue => {
          acc[`${searchKeyRoot}/${USER_ID_SEARCH_KEY_INDEX}/${userIdValue}/${userId}`] = true;
        });
        return acc;
      }, {}),
    onProgress
  );
};

export const createAgeSearchKeyIndexInCollection = async (collection, onProgress, options = {}) => {
  const usersData = options?.usersData || (await loadCollectionWithIndexCache(collection));
  if (!usersData) return;
  const searchKeyRoot = options?.rootPath || SEARCH_KEY_INDEX_ROOT;

  const userIds = Object.keys(usersData);
  const totalUsers = userIds.length;
  if (totalUsers === 0) return;

  await uploadChunkedSearchKeyIndexUpdates(
    userIds,
    totalUsers,
    batchIds =>
      batchIds.reduce((acc, userId) => {
        const user = usersData[userId] || {};
        const ageValues = getAgeIndexSet(user);
        ageValues.forEach(ageValue => {
          acc[`${searchKeyRoot}/${AGE_SEARCH_KEY_INDEX}/${ageValue}/${userId}`] = true;
        });
        return acc;
      }, {}),
    onProgress
  );
};

export const createImtHeightWeightSearchKeyIndexInCollection = async (collection, onProgress, options = {}) => {
  const usersData = options?.usersData || (await loadCollectionWithIndexCache(collection));
  if (!usersData) return;
  const searchKeyRoot = options?.rootPath || SEARCH_KEY_INDEX_ROOT;

  const userIds = Object.keys(usersData);
  const totalUsers = userIds.length;
  if (totalUsers === 0) return;

  await uploadChunkedSearchKeyIndexUpdates(
    userIds,
    totalUsers,
    batchIds =>
      batchIds.reduce((acc, userId) => {
        const user = usersData[userId] || {};
        const imtValues = getImtIndexSet(user);
        const heightValues = normalizeMetricIndexValues(user.height);
        const weightValues = normalizeMetricIndexValues(user.weight);
        imtValues.forEach(imtValue => {
          acc[`${searchKeyRoot}/${IMT_SEARCH_KEY_INDEX}/${imtValue}/${userId}`] = true;
        });
        heightValues.forEach(heightValue => {
          acc[`${searchKeyRoot}/${HEIGHT_SEARCH_KEY_INDEX}/${heightValue}/${userId}`] = true;
        });
        weightValues.forEach(weightValue => {
          acc[`${searchKeyRoot}/${WEIGHT_SEARCH_KEY_INDEX}/${weightValue}/${userId}`] = true;
        });
        return acc;
      }, {}),
    onProgress
  );
};

export const createReactionSearchKeyIndexInCollection = async (collection, onProgress, options = {}) => {
  const usersData = options?.usersData || (await loadCollectionWithIndexCache(collection));
  if (!usersData) return;
  const searchKeyRoot = options?.rootPath || SEARCH_KEY_INDEX_ROOT;

  const userIds = Object.keys(usersData);
  const totalUsers = userIds.length;
  if (totalUsers === 0) return;

  await uploadChunkedSearchKeyIndexUpdates(
    userIds,
    totalUsers,
    batchIds =>
      batchIds.reduce((acc, userId) => {
        const user = usersData[userId] || {};
        const reactionValues = getReactionIndexSet(user);
        reactionValues.forEach(reactionValue => {
          acc[`${searchKeyRoot}/${REACTION_SEARCH_KEY_INDEX}/${reactionValue}/${userId}`] = true;
        });
        return acc;
      }, {}),
    onProgress
  );
};

export const createFieldCountSearchKeyIndexInCollection = async (collection, onProgress, options = {}) => {
  const usersData = options?.usersData || (await loadCollectionWithIndexCache(collection));
  if (!usersData) return;
  const searchKeyRoot = options?.rootPath || SEARCH_KEY_INDEX_ROOT;

  const userIds = Object.keys(usersData);
  const totalUsers = userIds.length;
  if (totalUsers === 0) return;

  await uploadChunkedSearchKeyIndexUpdates(
    userIds,
    totalUsers,
    batchIds =>
      batchIds.reduce((acc, userId) => {
        const user = usersData[userId] || {};
        const fieldCountValue = normalizeFieldCountSearchKeyIndexValue(user);
        acc[`${searchKeyRoot}/${FIELD_COUNT_SEARCH_KEY_INDEX}/${fieldCountValue}/${userId}`] = true;
        return acc;
      }, {}),
    onProgress
  );
};


export const createLastActionSearchKeyIndexInCollection = async (collection, onProgress, options = {}) => {
  const searchKeyRoot = options?.rootPath || SEARCH_KEY_INDEX_ROOT;
  if (collection !== 'newUsers' && searchKeyRoot === SEARCH_KEY_INDEX_ROOT) return;
  const usersData = options?.usersData || (await loadCollectionWithIndexCache(collection));
  if (!usersData) return;

  const userIds = Object.keys(usersData);
  const totalUsers = userIds.length;
  if (totalUsers === 0) return;

  if (searchKeyRoot === SEARCH_KEY_INDEX_ROOT) {
    await remove(ref2(database, `${searchKeyRoot}/${LAST_ACTION_SEARCH_KEY_INDEX}`));
  }

  await uploadChunkedSearchKeyIndexUpdates(
    userIds,
    totalUsers,
    batchIds =>
      batchIds.reduce((acc, userId) => {
        const user = usersData[userId] || {};
        const bucket = normalizeLastActionSearchKeyBucket(user.lastAction);
        acc[`${searchKeyRoot}/${LAST_ACTION_SEARCH_KEY_INDEX}/${bucket}/${userId}`] = true;
        return acc;
      }, {}),
    onProgress
  );
};


export const createGetInTouchSearchKeyIndexInCollection = async (collection, onProgress, options = {}) => {
  const searchKeyRoot = options?.rootPath || SEARCH_KEY_INDEX_ROOT;
  if (collection !== 'newUsers' && searchKeyRoot === SEARCH_KEY_INDEX_ROOT) return;
  const usersData = options?.usersData || (await loadCollectionWithIndexCache(collection));
  if (!usersData) return;

  const userIds = Object.keys(usersData);
  const totalUsers = userIds.length;
  if (totalUsers === 0) return;

  if (searchKeyRoot === SEARCH_KEY_INDEX_ROOT) {
    await remove(ref2(database, `${searchKeyRoot}/${GET_IN_TOUCH_SEARCH_KEY_INDEX}`));
  }

  await uploadChunkedSearchKeyIndexUpdates(
    userIds,
    totalUsers,
    batchIds =>
      batchIds.reduce((acc, userId) => {
        const user = usersData[userId] || {};
        const bucket = normalizeDateSearchKeyBucket(user.getInTouch);
        acc[`${searchKeyRoot}/${GET_IN_TOUCH_SEARCH_KEY_INDEX}/${bucket}/${userId}`] = true;
        return acc;
      }, {}),
    onProgress
  );
};

const SEARCH_KEY_INDEX_TYPE_ALIASES = {
  imtHeightWeight: SEARCH_KEY_INDEX_TYPES.imtHeightWeight,
  fieldCount: SEARCH_KEY_INDEX_TYPES.fieldCount,
};

const normalizeSearchKeyIndexType = indexType =>
  SEARCH_KEY_INDEX_TYPE_ALIASES[indexType] || indexType;

const normalizeSearchKeyIndexTypes = indexTypes =>
  [...new Set((indexTypes || []).map(normalizeSearchKeyIndexType))];

const SEARCH_KEY_INDEX_BUILDERS = {
  [SEARCH_KEY_INDEX_TYPES.blood]: createSearchKeyIndexInCollection,
  [SEARCH_KEY_INDEX_TYPES.maritalStatus]: createMaritalStatusSearchKeyIndexInCollection,
  [SEARCH_KEY_INDEX_TYPES.csection]: createCsectionSearchKeyIndexInCollection,
  [SEARCH_KEY_INDEX_TYPES.contact]: createContactSearchKeyIndexInCollection,
  [SEARCH_KEY_INDEX_TYPES.role]: createRoleSearchKeyIndexInCollection,
  [SEARCH_KEY_INDEX_TYPES.userId]: createUserIdSearchKeyIndexInCollection,
  [SEARCH_KEY_INDEX_TYPES.age]: createAgeSearchKeyIndexInCollection,
  [SEARCH_KEY_INDEX_TYPES.imtHeightWeight]: createImtHeightWeightSearchKeyIndexInCollection,
  [SEARCH_KEY_INDEX_TYPES.reaction]: createReactionSearchKeyIndexInCollection,
  [SEARCH_KEY_INDEX_TYPES.fieldCount]: createFieldCountSearchKeyIndexInCollection,
  [SEARCH_KEY_INDEX_TYPES.lastAction]: createLastActionSearchKeyIndexInCollection,
  [SEARCH_KEY_INDEX_TYPES.getInTouch]: createGetInTouchSearchKeyIndexInCollection,
};

export const createSelectedSearchKeyIndexesInCollection = async (collection, indexTypes = [], onProgress, options = {}) => {
  if (!collection || !Array.isArray(indexTypes) || indexTypes.length === 0) return;

  const uniqueIndexTypes = normalizeSearchKeyIndexTypes(indexTypes).filter(indexType => SEARCH_KEY_INDEX_BUILDERS[indexType]);
  if (!uniqueIndexTypes.length) return;

  const usersData = await loadCollectionWithIndexCache(collection, {
    maxAgeMs: SEARCH_INDEX_COLLECTION_CACHE_TTL_MS,
  });

  if (!usersData) return;

  for (let index = 0; index < uniqueIndexTypes.length; index += 1) {
    const indexType = uniqueIndexTypes[index];
    const progressReporter =
      typeof onProgress === 'function'
        ? progress => {
            const overallProgress = Math.floor(((index + progress / 100) / uniqueIndexTypes.length) * 100);
            onProgress(overallProgress, {
              indexType,
              indexNumber: index + 1,
              totalIndexes: uniqueIndexTypes.length,
              indexProgress: progress,
            });
          }
        : undefined;

    // eslint-disable-next-line no-await-in-loop
    await SEARCH_KEY_INDEX_BUILDERS[indexType](collection, progressReporter, { usersData, ...options });
  }
};

const toPlainObjectFromSetMap = indexMap =>
  Object.entries(indexMap).reduce((acc, [key, value]) => {
    if (value instanceof Set) {
      const ids = [...value].filter(Boolean);
      if (ids.length === 1) {
        acc[key] = ids[0];
      } else if (ids.length > 1) {
        acc[key] = ids;
      }
      return acc;
    }

    if (value && typeof value === 'object') {
      const nested = toPlainObjectFromSetMap(value);
      if (nested && Object.keys(nested).length > 0) {
        acc[key] = nested;
      }
    }

    return acc;
  }, {});

export const buildSearchIdIndexPayloadFromCollections = collectionsMap => {
  const searchIdMap = {};

  Object.entries(collectionsMap || {}).forEach(([, usersMap]) => {
    Object.entries(usersMap || {}).forEach(([userId, userData]) => {
      if (!userId || !userData || typeof userData !== 'object') return;

      keysToCheck.forEach(key => {
        const candidates = extractIndexableFieldValues(userData[key]).flatMap(value =>
          buildSearchIndexCandidates(key, normalizeSearchIdInput(key, value))
        );
        candidates.forEach(candidate => {
          if (!candidate) return;
          const searchIdKey = `${key}_${encodeKey(String(candidate).toLowerCase())}`;
          if (!searchIdMap[searchIdKey]) {
            searchIdMap[searchIdKey] = new Set();
          }
          searchIdMap[searchIdKey].add(userId);
        });
      });
    });
  });

  return toPlainObjectFromSetMap(searchIdMap);
};

const resolveSearchKeyValuesByIndexType = (indexType, userId, userData) => {
  if (indexType === SEARCH_KEY_INDEX_TYPES.blood) {
    return [{ indexName: BLOOD_SEARCH_KEY_INDEX, values: [...getBloodIndexSet(userData)] }];
  }
  if (indexType === SEARCH_KEY_INDEX_TYPES.maritalStatus) {
    return [{ indexName: MARITAL_STATUS_SEARCH_KEY_INDEX, values: [...getMaritalStatusIndexSet(userData)] }];
  }
  if (indexType === SEARCH_KEY_INDEX_TYPES.csection) {
    return [{ indexName: CSECTION_SEARCH_KEY_INDEX, values: [...getCsectionIndexSet(userData)] }];
  }
  if (indexType === SEARCH_KEY_INDEX_TYPES.contact) {
    return [{ indexName: CONTACT_SEARCH_KEY_INDEX, values: [...getContactIndexSet(userData)] }];
  }
  if (indexType === SEARCH_KEY_INDEX_TYPES.role) {
    return [{ indexName: ROLE_SEARCH_KEY_INDEX, values: [...getRoleIndexSet(userData)] }];
  }
  if (indexType === SEARCH_KEY_INDEX_TYPES.userId) {
    return [{ indexName: USER_ID_SEARCH_KEY_INDEX, values: [...getUserIdIndexSet(userData?.userId || userId)] }];
  }
  if (indexType === SEARCH_KEY_INDEX_TYPES.age) {
    return [{ indexName: AGE_SEARCH_KEY_INDEX, values: [...getAgeIndexSet(userData)] }];
  }
  if (indexType === SEARCH_KEY_INDEX_TYPES.imtHeightWeight) {
    return [
      { indexName: IMT_SEARCH_KEY_INDEX, values: [...getImtIndexSet(userData)] },
      { indexName: HEIGHT_SEARCH_KEY_INDEX, values: [...normalizeMetricIndexValues(userData?.height)] },
      { indexName: WEIGHT_SEARCH_KEY_INDEX, values: [...normalizeMetricIndexValues(userData?.weight)] },
    ];
  }
  if (indexType === SEARCH_KEY_INDEX_TYPES.reaction) {
    return [{ indexName: REACTION_SEARCH_KEY_INDEX, values: [...getReactionIndexSet(userData)] }];
  }
  if (indexType === SEARCH_KEY_INDEX_TYPES.fieldCount) {
    return [{ indexName: FIELD_COUNT_SEARCH_KEY_INDEX, values: [normalizeFieldCountSearchKeyIndexValue(userData)] }];
  }
  if (indexType === SEARCH_KEY_INDEX_TYPES.lastAction) {
    return [{ indexName: LAST_ACTION_SEARCH_KEY_INDEX, values: [normalizeLastActionSearchKeyBucket(userData?.lastAction)] }];
  }
  if (indexType === SEARCH_KEY_INDEX_TYPES.getInTouch) {
    return [{ indexName: GET_IN_TOUCH_SEARCH_KEY_INDEX, values: [normalizeDateSearchKeyBucket(userData?.getInTouch)] }];
  }
  return [];
};

export const buildSearchKeyIndexPayloadFromCollections = (collectionsMap, indexTypes = []) => {
  const uniqueIndexTypes = normalizeSearchKeyIndexTypes(indexTypes).filter(indexType => Boolean(SEARCH_KEY_INDEX_BUILDERS[indexType]));
  if (!uniqueIndexTypes.length) return {};

  const payload = {};
  const assignNestedLeaf = (target, pathSegments, leafValue) => {
    if (!target || !Array.isArray(pathSegments) || pathSegments.length === 0) return;
    let node = target;
    pathSegments.forEach((segment, index) => {
      if (!segment) return;
      const isLeaf = index === pathSegments.length - 1;
      if (isLeaf) {
        node[segment] = leafValue;
        return;
      }
      if (!node[segment] || typeof node[segment] !== 'object') {
        node[segment] = {};
      }
      node = node[segment];
    });
  };

  Object.entries(collectionsMap || {}).forEach(([collectionName, usersMap]) => {
    const rootSegments = collectionName === 'users' ? ['users'] : [];

    Object.entries(usersMap || {}).forEach(([userId, userData]) => {
      if (!userId || !userData || typeof userData !== 'object') return;

      uniqueIndexTypes.forEach(indexType => {
        const entries = resolveSearchKeyValuesByIndexType(indexType, userId, userData);
        entries.forEach(({ indexName, values }) => {
          values.filter(Boolean).forEach(value => {
            assignNestedLeaf(payload, [...rootSegments, indexName, value, userId], true);
          });
        });
      });
    });
  });

  return payload;
};

const SEARCH_KEY_GET_IN_TOUCH_LOOKBACK_DAYS_PER_PAGE = 45;
const SEARCH_KEY_POINT_MEMBERSHIP_CONCURRENCY = 12;
const SEARCH_KEY_GET_IN_TOUCH_MAX_BATCHES_PER_PAGE = 25;
const SEARCH_KEY_BROAD_POINT_CHECK_MIN_BUCKETS = 3;
const SEARCH_KEY_BROAD_POINT_CHECK_RATIO = 0.65;

const getTodaySearchKeyDateBucket = () => {
  const today = new Date();
  return `${AGE_DATE_PREFIX}${toIsoDate(new Date(today.getFullYear(), today.getMonth(), today.getDate()))}`;
};

const getPreviousSearchKeyDateBucket = bucket => {
  const normalized = String(bucket || '').trim();
  const datePart = normalized.startsWith(AGE_DATE_PREFIX)
    ? normalized.slice(AGE_DATE_PREFIX.length)
    : normalized;
  const parsed = parseLastActionDate(datePart);
  if (parsed.status !== 'valid') return null;
  const previous = new Date(parsed.date.getFullYear(), parsed.date.getMonth(), parsed.date.getDate() - 1);
  return `${AGE_DATE_PREFIX}${toIsoDate(previous)}`;
};

const normalizeSearchKeyGetInTouchCursor = cursor => {
  if (!cursor) return { bucket: getTodaySearchKeyDateBucket(), userId: '' };
  if (typeof cursor === 'number') return { bucket: getTodaySearchKeyDateBucket(), userId: '' };
  const normalized = String(cursor || '').trim();
  if (!normalized || normalized === '0') return { bucket: getTodaySearchKeyDateBucket(), userId: '' };

  try {
    const parsed = JSON.parse(normalized);
    if (parsed?.bucket) {
      return {
        bucket: String(parsed.bucket),
        userId: parsed.userId ? String(parsed.userId) : '',
      };
    }
  } catch {
    // Старі значення курсора можуть бути простим bucket key.
  }

  return normalized.startsWith(AGE_DATE_PREFIX)
    ? { bucket: normalized, userId: '' }
    : { bucket: getTodaySearchKeyDateBucket(), userId: normalized };
};

const serializeSearchKeyGetInTouchCursor = ({ bucket, userId }) => JSON.stringify({ bucket, userId: userId || '' });

const readSearchKeyGetInTouchBucketIds = async ({ bucket, afterUserId = '', limit = PAGE_SIZE }) => {
  const readLimit = Math.max(limit * 2 + 1, limit + 1);
  const snapshots = await Promise.all(
    [SEARCH_KEY_INDEX_ROOT, SEARCH_KEY_USERS_INDEX_ROOT].map(rootPath => {
      const bucketRef = ref2(database, `${rootPath}/${GET_IN_TOUCH_SEARCH_KEY_INDEX}/${bucket}`);
      const bucketQuery = afterUserId
        ? query(bucketRef, orderByKey(), startAfter(afterUserId), limitToFirst(readLimit))
        : query(bucketRef, orderByKey(), limitToFirst(readLimit));
      return get(bucketQuery);
    })
  );

  const ids = new Set();
  let reachedReadLimit = false;
  snapshots.forEach(snapshot => {
    if (!snapshot.exists()) return;
    let snapshotCount = 0;
    snapshot.forEach(child => {
      snapshotCount += 1;
      if (child.key) ids.add(child.key);
    });
    if (snapshotCount >= readLimit) reachedReadLimit = true;
  });

  const sortedIds = [...ids].sort((a, b) => a.localeCompare(b));
  return {
    ids: sortedIds.slice(0, limit),
    bucketHasMore: reachedReadLimit || sortedIds.length > limit,
  };
};

const collectSearchKeyGetInTouchCandidateIds = async ({ cursor, limit = PAGE_SIZE }) => {
  let { bucket, userId } = normalizeSearchKeyGetInTouchCursor(cursor);
  const ids = [];
  const seen = new Set();
  let lookups = 0;
  let hasMore = true;
  let nextCursor = null;

  while (ids.length < limit && bucket && lookups < SEARCH_KEY_GET_IN_TOUCH_LOOKBACK_DAYS_PER_PAGE) {
    // Читаємо лише поточний bucket: паралельний lookahead між датами порушує послідовність курсора.
    lookups += 1;
    // eslint-disable-next-line no-await-in-loop
    const bucketResult = await readSearchKeyGetInTouchBucketIds({
      bucket,
      afterUserId: userId,
      limit: limit - ids.length,
    });

    const remaining = limit - ids.length;
    const pageIds = bucketResult.ids.slice(0, remaining);

    pageIds.forEach(id => {
      if (!id || seen.has(id)) return;
      seen.add(id);
      ids.push(id);
    });

    if ((bucketResult.bucketHasMore || bucketResult.ids.length > remaining) && pageIds.length > 0) {
      userId = pageIds[pageIds.length - 1];
      nextCursor = serializeSearchKeyGetInTouchCursor({ bucket, userId });
      break;
    }

    bucket = getPreviousSearchKeyDateBucket(bucket);
    userId = '';
    nextCursor = bucket ? serializeSearchKeyGetInTouchCursor({ bucket, userId: '' }) : null;
  }

  if (!bucket) {
    hasMore = false;
    nextCursor = null;
  } else if (ids.length === 0 && lookups >= SEARCH_KEY_GET_IN_TOUCH_LOOKBACK_DAYS_PER_PAGE) {
    hasMore = false;
    nextCursor = null;
  } else if (ids.length < limit && lookups >= SEARCH_KEY_GET_IN_TOUCH_LOOKBACK_DAYS_PER_PAGE) {
    hasMore = true;
  } else if (!nextCursor) {
    hasMore = false;
  }

  return { ids, nextCursor, hasMore };
};


const SEARCH_KEY_INDEXED_ROOT_PATHS = [SEARCH_KEY_INDEX_ROOT, SEARCH_KEY_USERS_INDEX_ROOT];

const collectIdsFromSearchKeyBucketSnapshot = (snapshot, idSet) => {
  if (!snapshot.exists()) return;
  Object.keys(snapshot.val() || {}).forEach(userId => {
    if (userId) idSet.add(userId);
  });
};

const readSearchKeyBucketsForGroup = async ({ indexName, buckets = [], rootPaths = SEARCH_KEY_INDEXED_ROOT_PATHS, debugLog = null }) => {
  const uniqueBuckets = [...new Set((buckets || []).filter(bucket => bucket !== undefined && bucket !== null && String(bucket).trim()).map(String))];
  const ids = new Set();

  if (!indexName || uniqueBuckets.length === 0) {
    return ids;
  }

  const reads = [];
  rootPaths.forEach(rootPath => {
    uniqueBuckets.forEach(bucket => {
      reads.push({
        rootPath,
        bucket,
        promise: get(ref2(database, `${rootPath}/${indexName}/${bucket}`)),
      });
    });
  });

  const snapshots = await Promise.all(reads.map(read => read.promise));
  snapshots.forEach((snapshot, index) => {
    const beforeCount = ids.size;
    collectIdsFromSearchKeyBucketSnapshot(snapshot, ids);
    if (typeof debugLog === 'function') {
      debugLog('groupBucketRead', {
        group: indexName,
        rootPath: reads[index].rootPath,
        bucket: reads[index].bucket,
        exists: snapshot.exists(),
        addedCount: ids.size - beforeCount,
        totalGroupIdsCount: ids.size,
      });
    }
  });

  return ids;
};

const getSelectedFilterKeys = filterMap => {
  if (!hasExplicitFilterSelection(filterMap)) return null;
  return Object.entries(filterMap || {})
    .filter(([, enabled]) => Boolean(enabled))
    .map(([key]) => key);
};

const getSelectedImtSearchKeyBuckets = imtFilters => {
  const selectedBuckets = getSelectedFilterKeys(imtFilters);
  if (!selectedBuckets) return null;

  return selectedBuckets.map(bucket => (bucket === 'other' ? '?' : bucket));
};

const createPointCheckSearchKeyGroup = ({
  filterSettings,
  filterName,
  indexName,
  buckets,
  isAllowedByFilters,
}) => {
  if (!hasExplicitFilterSelection(filterSettings?.[filterName])) return null;
  const selectedBuckets = (buckets || [])
    .filter(bucket => isAllowedByFilters(bucket, filterSettings))
    .map(String);

  return {
    key: filterName,
    indexName,
    buckets: selectedBuckets,
    allBuckets: (buckets || []).map(String),
    supportsPointCheck: true,
    readIds: ({ debugLog }) => readSearchKeyBucketsForGroup({ indexName, buckets: selectedBuckets, debugLog }),
  };
};

const getWeightFilterBucket = weightValue => {
  if (!Number.isFinite(weightValue) || weightValue <= 0) return null;
  if (weightValue < 55) return 'lt55';
  if (weightValue <= 69) return '55_69';
  if (weightValue <= 84) return '70_84';
  return '85_plus';
};

const collectWeightIdsByFilters = async (weightFilters, rootPaths = SEARCH_KEY_INDEXED_ROOT_PATHS) => {
  const shouldApplyWeight = hasExplicitFilterSelection(weightFilters);
  if (!shouldApplyWeight) return null;

  const selectedBuckets = Object.entries(weightFilters || {})
    .filter(([, enabled]) => enabled)
    .map(([bucket]) => bucket);

  if (selectedBuckets.length === 0) return new Set();

  const selectedSet = new Set(selectedBuckets);
  const weightIds = new Set();
  const snapshots = await Promise.all(
    rootPaths.map(rootPath => get(ref2(database, `${rootPath}/${WEIGHT_SEARCH_KEY_INDEX}`)))
  );

  snapshots.forEach(snapshot => {
    if (!snapshot.exists()) return;

    Object.entries(snapshot.val() || {}).forEach(([storedWeight, usersMap]) => {
      const parsedWeight = Number.parseFloat(String(storedWeight || '').replace(',', '.'));
      let bucket = getWeightFilterBucket(parsedWeight);
      if (!bucket && storedWeight === '?') bucket = 'other';
      if (!bucket && storedWeight === 'no') bucket = 'no';
      if (!bucket || !selectedSet.has(bucket)) return;
      Object.keys(usersMap || {}).forEach(userId => {
        if (userId) weightIds.add(userId);
      });
    });
  });

  return weightIds;
};

const collectLastActionIdsByFilters = async (lastActionFilters, rootPaths = SEARCH_KEY_INDEXED_ROOT_PATHS) => {
  const shouldApplyLastAction = hasExplicitFilterSelection(lastActionFilters);
  if (!shouldApplyLastAction) return null;

  const selected = key => Boolean(lastActionFilters?.[key]);
  const lastActionIds = new Set();
  const requests = [];
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const addRangeRequest = (daysBack, rootPath) => {
    const startDate = new Date(todayStart);
    startDate.setDate(todayStart.getDate() - daysBack);
    requests.push(
      get(
        query(
          ref2(database, `${rootPath}/${LAST_ACTION_SEARCH_KEY_INDEX}`),
          orderByKey(),
          startAt(`${AGE_DATE_PREFIX}${toIsoDate(startDate)}`),
          endAt(`${AGE_DATE_PREFIX}${toIsoDate(todayStart)}`)
        )
      )
    );
  };

  rootPaths.forEach(rootPath => {
    if (selected('today')) addRangeRequest(0, rootPath);
    if (selected('yesterday')) {
      const yesterday = new Date(todayStart);
      yesterday.setDate(todayStart.getDate() - 1);
      requests.push(
        get(
          query(
            ref2(database, `${rootPath}/${LAST_ACTION_SEARCH_KEY_INDEX}`),
            orderByKey(),
            startAt(`${AGE_DATE_PREFIX}${toIsoDate(yesterday)}`),
            endAt(`${AGE_DATE_PREFIX}${toIsoDate(yesterday)}`)
          )
        )
      );
    }
    if (selected('last3days')) addRangeRequest(3, rootPath);
    if (selected('last7days')) addRangeRequest(7, rootPath);
    if (selected('last14days')) addRangeRequest(14, rootPath);
    if (selected('last30days')) addRangeRequest(30, rootPath);
    if (selected('no')) requests.push(get(ref2(database, `${rootPath}/${LAST_ACTION_SEARCH_KEY_INDEX}/no`)));
    if (selected('?')) requests.push(get(ref2(database, `${rootPath}/${LAST_ACTION_SEARCH_KEY_INDEX}/?`)));
  });

  const snapshots = await Promise.all(requests);
  snapshots.forEach(snapshot => {
    if (!snapshot.exists()) return;
    if (snapshot.key === LAST_ACTION_SEARCH_KEY_INDEX) {
      snapshot.forEach(bucketSnapshot => collectIdsFromSearchKeyBucketSnapshot(bucketSnapshot, lastActionIds));
      return;
    }
    collectIdsFromSearchKeyBucketSnapshot(snapshot, lastActionIds);
  });

  return lastActionIds;
};

export const buildActiveSearchKeyFilterGroups = (filterSettings = {}, { favoritesMap = {}, dislikedMap = {} } = {}) => {
  const groups = [];
  const addGroup = group => {
    if (group) groups.push(group);
  };

  addGroup(createPointCheckSearchKeyGroup({
    filterSettings,
    filterName: 'maritalStatus',
    indexName: MARITAL_STATUS_SEARCH_KEY_INDEX,
    buckets: MARITAL_STATUS_SEARCH_KEY_BUCKETS,
    isAllowedByFilters: isMaritalStatusBucketAllowedByFilters,
  }));

  addGroup(createPointCheckSearchKeyGroup({
    filterSettings,
    filterName: 'csection',
    indexName: CSECTION_SEARCH_KEY_INDEX,
    buckets: ['cs2plus', 'cs1', 'cs0', 'no', 'other'],
    isAllowedByFilters: (bucket, settings) => Boolean(settings?.csection?.[bucket]),
  }));

  if (hasExplicitFilterSelection(filterSettings?.age)) {
    groups.push({
      key: 'age',
      indexName: AGE_SEARCH_KEY_INDEX,
      buckets: getSelectedFilterKeys(filterSettings.age) || [],
      readIds: () => collectAgeIdsByFilters(filterSettings.age, SEARCH_KEY_INDEXED_ROOT_PATHS),
    });
  }

  if (hasExplicitFilterSelection(filterSettings?.bloodGroup) || hasExplicitFilterSelection(filterSettings?.rh)) {
    const bloodBuckets = BLOOD_SEARCH_KEY_BUCKETS.filter(bucket => isBucketAllowedByFilters(bucket, filterSettings));
    groups.push({
      key: 'blood',
      indexName: BLOOD_SEARCH_KEY_INDEX,
      buckets: bloodBuckets,
      allBuckets: BLOOD_SEARCH_KEY_BUCKETS,
      supportsPointCheck: true,
      readIds: ({ debugLog }) => readSearchKeyBucketsForGroup({ indexName: BLOOD_SEARCH_KEY_INDEX, buckets: bloodBuckets, debugLog }),
    });
  }

  addGroup(createPointCheckSearchKeyGroup({
    filterSettings,
    filterName: 'userId',
    indexName: USER_ID_SEARCH_KEY_INDEX,
    buckets: USER_ID_SEARCH_KEY_BUCKETS,
    isAllowedByFilters: isUserIdBucketAllowedByFilters,
  }));

  addGroup(createPointCheckSearchKeyGroup({
    filterSettings,
    filterName: 'role',
    indexName: ROLE_SEARCH_KEY_INDEX,
    buckets: ROLE_SEARCH_KEY_BUCKETS,
    isAllowedByFilters: isRoleBucketAllowedByFilters,
  }));

  if (hasExplicitFilterSelection(filterSettings?.weight)) {
    groups.push({
      key: 'weight',
      indexName: WEIGHT_SEARCH_KEY_INDEX,
      buckets: getSelectedFilterKeys(filterSettings.weight) || [],
      readIds: () => collectWeightIdsByFilters(filterSettings.weight, SEARCH_KEY_INDEXED_ROOT_PATHS),
    });
  }

  if (hasExplicitFilterSelection(filterSettings?.height)) {
    groups.push({
      key: 'height',
      indexName: HEIGHT_SEARCH_KEY_INDEX,
      buckets: getSelectedFilterKeys(filterSettings.height) || [],
      readIds: () => collectHeightIdsByFilters(filterSettings.height, SEARCH_KEY_INDEXED_ROOT_PATHS),
    });
  }

  if (hasExplicitFilterSelection(filterSettings?.imt)) {
    groups.push({
      key: 'imt',
      indexName: IMT_SEARCH_KEY_INDEX,
      buckets: getSelectedImtSearchKeyBuckets(filterSettings.imt) || [],
      allBuckets: IMT_SEARCH_KEY_BUCKETS,
      supportsPointCheck: true,
      readIds: () => collectImtIdsByFilters(filterSettings.imt, SEARCH_KEY_INDEXED_ROOT_PATHS),
    });
  }

  addGroup(createPointCheckSearchKeyGroup({
    filterSettings,
    filterName: 'contact',
    indexName: CONTACT_SEARCH_KEY_INDEX,
    buckets: CONTACT_SEARCH_KEY_BUCKETS,
    isAllowedByFilters: isContactBucketAllowedByFilters,
  }));

  if (hasExplicitFilterSelection(filterSettings?.fields)) {
    groups.push({
      key: 'fields',
      indexName: FIELD_COUNT_SEARCH_KEY_INDEX,
      buckets: getSelectedFilterKeys(filterSettings.fields) || [],
      readIds: () => collectFieldCountIdsByFilters(filterSettings.fields, SEARCH_KEY_INDEXED_ROOT_PATHS),
    });
  }

  if (hasExplicitFilterSelection(filterSettings?.lastAction)) {
    groups.push({
      key: 'lastAction',
      indexName: LAST_ACTION_SEARCH_KEY_INDEX,
      buckets: getSelectedFilterKeys(filterSettings.lastAction) || [],
      readIds: () => collectLastActionIdsByFilters(filterSettings.lastAction, SEARCH_KEY_INDEXED_ROOT_PATHS),
    });
  }

  if (hasExplicitFilterSelection(filterSettings?.reaction)) {
    groups.push({
      key: 'reaction',
      indexName: REACTION_SEARCH_KEY_INDEX,
      buckets: getSelectedFilterKeys(filterSettings.reaction) || [],
      readIds: () => collectReactionIdsByFilters(
        filterSettings.reaction,
        { favoritesMap, dislikedMap },
        SEARCH_KEY_INDEXED_ROOT_PATHS,
      ),
    });
  }

  return groups;
};

const isBroadSearchKeyPointGroup = group => {
  const allowedCount = (group?.buckets || []).length;
  const allCount = (group?.allBuckets || []).length;

  if (!group?.supportsPointCheck || allCount < SEARCH_KEY_BROAD_POINT_CHECK_MIN_BUCKETS) return false;
  if (allowedCount <= 1 || allowedCount >= allCount) return false;
  // `no` often contains the bulk of cards. When a filter explicitly excludes it,
  // keep the group in the indexed/point-check path instead of scanning the broad
  // source and rejecting `no` records after hydration.
  if (isNoExcludingSearchKeyPointGroup(group)) return false;

  return allowedCount / allCount >= SEARCH_KEY_BROAD_POINT_CHECK_RATIO;
};

const readSearchKeyPointMembershipBuckets = async ({
  userId,
  group,
  buckets,
  rootPaths = SEARCH_KEY_INDEXED_ROOT_PATHS,
}) => {
  const normalizedUserId = String(userId || '').trim();
  const normalizedBuckets = [...new Set((buckets || []).map(String).filter(Boolean))];
  if (!normalizedUserId || !group?.indexName || normalizedBuckets.length === 0) return [];

  const checks = [];
  rootPaths.forEach(rootPath => {
    normalizedBuckets.forEach(bucket => {
      checks.push({
        bucket,
        promise: get(ref2(database, `${rootPath}/${group.indexName}/${bucket}/${normalizedUserId}`)),
      });
    });
  });

  const snapshots = await Promise.all(checks.map(check => check.promise));
  return [...new Set(checks
    .filter((check, index) => snapshots[index].exists() && snapshots[index].val() !== false)
    .map(check => check.bucket))];
};

const hasSearchKeyPointMembership = async ({
  userId,
  group,
  rootPaths = SEARCH_KEY_INDEXED_ROOT_PATHS,
  collectDiagnostics = false,
}) => {
  const allowedBuckets = [...new Set((group?.buckets || []).map(String).filter(Boolean))];

  if (collectDiagnostics) {
    const diagnosticBuckets = [...new Set([...(group?.allBuckets || []), ...allowedBuckets])];
    const userBuckets = await readSearchKeyPointMembershipBuckets({ userId, group, buckets: diagnosticBuckets, rootPaths });
    const allowedBucketSet = new Set(allowedBuckets);
    const matchedBuckets = userBuckets.filter(bucket => allowedBucketSet.has(bucket));
    return { passed: matchedBuckets.length > 0, matchedBuckets, userBuckets };
  }

  const matchedBuckets = await readSearchKeyPointMembershipBuckets({ userId, group, buckets: allowedBuckets, rootPaths });
  return { passed: matchedBuckets.length > 0, matchedBuckets, userBuckets: matchedBuckets };
};

const getProfileBloodDebug = profile => {
  const profileBlood = profile?.blood ?? `${profile?.bloodGroup || ''}${profile?.rh || ''}`;
  const expectedBucketFromProfile = normalizeBloodIndexValue(profileBlood);
  const { bloodGroup: profileBloodGroup, rh: profileRh } = getBloodBucketMeta(expectedBucketFromProfile);
  return { profileBloodGroup, profileRh, expectedBucketFromProfile };
};

const toSingleBucketOrList = buckets => buckets.length === 1 ? buckets[0] : buckets;

export const filterIdsBySearchKeyPointGroups = async ({ ids = [], groups = [], debugLog = null, collectDiagnostics = false, collectBloodDiagnostics = true }) => {
  const uniqueIds = [...new Set((ids || []).filter(Boolean).map(String))];
  const pointGroups = (groups || [])
    .filter(group => group?.supportsPointCheck)
    // Для старого режиму blood перевіряємо першим, щоб diagnostics охоплював усю вхідну сторінку.
    // Нові режими можуть вимкнути blood diagnostics і перевіряти групи від найвужчої.
    .sort((a, b) => {
      if (collectBloodDiagnostics && a?.key === 'blood') return -1;
      if (collectBloodDiagnostics && b?.key === 'blood') return 1;
      return (a?.buckets || []).length - (b?.buckets || []).length;
    });
  if (!pointGroups.length || uniqueIds.length === 0) return uniqueIds;

  if (pointGroups.some(group => !(group?.buckets || []).length)) {
    if (typeof debugLog === 'function') {
      debugLog('pointMembership:emptySelectedBuckets', {
        groups: pointGroups
          .filter(group => !(group?.buckets || []).length)
          .map(group => ({ key: group.key, indexName: group.indexName })),
      });
    }
    return [];
  }

  const matchedIds = [];
  const bloodGroup = collectBloodDiagnostics ? pointGroups.find(group => group?.key === 'blood') : null;
  const bloodSummary = bloodGroup
    ? {
        inputIdsCount: uniqueIds.length,
        acceptedCount: 0,
        rejectedCount: 0,
        rejectedByBucketNotFoundCount: 0,
        rejectedByDisallowedBucketCount: 0,
        allowedBuckets: bloodGroup.buckets || [],
        sampleAccepted: [],
        sampleRejected: [],
      }
    : null;

  // Різні userId перевіряємо паралельно малими порціями, але фільтри однієї картки — послідовно.
  // Після першого false не запускаємо зайві Firebase-запити для решти груп цієї картки.
  for (let start = 0; start < uniqueIds.length; start += SEARCH_KEY_POINT_MEMBERSHIP_CONCURRENCY) {
    const idBatch = uniqueIds.slice(start, start + SEARCH_KEY_POINT_MEMBERSHIP_CONCURRENCY);
    // Профілі потрібні для consistency-перевірки blood index; читаємо їх один раз на batch.
    // eslint-disable-next-line no-await-in-loop
    const profilesById = bloodGroup ? await fetchUsersByIds(idBatch) : {};
    // eslint-disable-next-line no-await-in-loop
    const batchMatches = await Promise.all(
      idBatch.map(async userId => {
        const checks = [];
        for (const group of pointGroups) {
          const shouldCollectDiagnostics = collectDiagnostics || (collectBloodDiagnostics && group.key === 'blood');
          // eslint-disable-next-line no-await-in-loop
          const result = await hasSearchKeyPointMembership({ userId, group, collectDiagnostics: shouldCollectDiagnostics });
          checks.push({ group, result });

          if (group.key === 'blood') {
            const profileDebug = getProfileBloodDebug(profilesById[userId]);
            const actualBucket = toSingleBucketOrList(result.userBuckets);
            const hasConsistentSingleBucket = result.userBuckets.length === 1
              && result.userBuckets[0] === profileDebug.expectedBucketFromProfile;

            if (!hasConsistentSingleBucket && typeof debugLog === 'function') {
              debugLog('blood:profileIndexMismatch', {
                userId,
                ...profileDebug,
                actualBucket,
                foundBuckets: result.userBuckets,
              });
            }

            if (result.passed) {
              bloodSummary.acceptedCount += 1;
              if (bloodSummary.sampleAccepted.length < 10) {
                bloodSummary.sampleAccepted.push({ userId, actualBucket, ...profileDebug });
              }
            } else {
              const reason = result.userBuckets.length > 0
                ? 'disallowed bucket'
                : 'user bucket not found in searchKey index';
              bloodSummary.rejectedCount += 1;
              if (result.userBuckets.length > 0) bloodSummary.rejectedByDisallowedBucketCount += 1;
              else bloodSummary.rejectedByBucketNotFoundCount += 1;
              if (bloodSummary.sampleRejected.length < 10) {
                bloodSummary.sampleRejected.push({
                  userId,
                  group: 'blood',
                  expectedAllowedBuckets: bloodGroup.buckets || [],
                  foundBuckets: result.userBuckets,
                  ...profileDebug,
                  reason,
                });
              }
            }
          }

          if (!result.passed) {
            if (typeof debugLog === 'function') {
              const profileDebug = group.key === 'blood' ? getProfileBloodDebug(profilesById[userId]) : {};
              debugLog('pointMembership:reject', {
                userId,
                group: group.key,
                indexName: group.indexName,
                userBucket: toSingleBucketOrList(result.userBuckets),
                allowedBuckets: group.buckets || [],
                ...(group.key === 'blood'
                  ? {
                      expectedAllowedBuckets: group.buckets || [],
                      foundBuckets: result.userBuckets,
                      ...profileDebug,
                    }
                  : {}),
                reason: result.userBuckets.length > 0 ? 'bucket mismatch' : 'user bucket not found in searchKey index',
              });
            }
            return null;
          }
        }

        if (typeof debugLog === 'function') {
          debugLog('pointMembership:accept', {
            userId,
            matchedGroups: checks.map(({ group, result }) => ({
              group: group.key,
              indexName: group.indexName,
              userBucket: toSingleBucketOrList(result.matchedBuckets),
            })),
          });
        }
        return userId;
      })
    );
    matchedIds.push(...batchMatches.filter(Boolean));
  }

  if (typeof debugLog === 'function') {
    if (bloodSummary) debugLog('blood:filterSummary', bloodSummary);
    debugLog('pointMembership:filteredCandidateIds', {
      inputIdsCount: uniqueIds.length,
      outputIdsCount: matchedIds.length,
      groups: pointGroups.map(group => ({
        key: group.key,
        indexName: group.indexName,
        bucketsCount: (group.buckets || []).length,
        bucketsSample: (group.buckets || []).slice(0, 20),
      })),
      inputIdsSample: uniqueIds.slice(0, 10),
      outputIdsSample: matchedIds.slice(0, 10),
    });
  }

  return matchedIds;
};

const summarizeSearchKeyFilterSettingsForLog = filterSettings => ({
  keys: filterSettings && typeof filterSettings === 'object' ? Object.keys(filterSettings) : [],
  favoriteOnly: Boolean(filterSettings?.favorite?.favOnly),
  reaction: filterSettings?.reaction || null,
  raw: filterSettings || {},
});

export const fetchUsersBySearchKeyPaged = async ({
  filterSettings = {},
  offset = 0,
  limit = PAGE_SIZE,
  favoritesMap = {},
  dislikedMap = {},
  debug = null,
  onProgress = null,
} = {}) => {
  const debugLog = (step, payload = {}) => {
    if (typeof debug === 'function') {
      debug(`fetchUsersBySearchKeyPaged:${step}`, payload);
    }
  };

  try {
    const targetLimit = Math.max(1, Number(limit) || PAGE_SIZE);
    const collectedUsers = {};
    const loadedIds = [];
    let cursor = offset;
    let hasMore = true;
    let batches = 0;
    const filterSummary = {
      pageIdsCount: 0,
      pointMembershipRejected: 0,
      filterMainRejected: 0,
      accepted: 0,
    };
    const logFilterSummary = () => debugLog('filterSummary', filterSummary);

    debugLog('start', {
      offset,
      limit,
      targetLimit,
      filterSettings: summarizeSearchKeyFilterSettingsForLog(filterSettings),
    });

    const activeSearchKeyGroups = buildActiveSearchKeyFilterGroups(filterSettings, { favoritesMap, dislikedMap });
    debugLog('activeSearchKeyGroups', {
      count: activeSearchKeyGroups.length,
      groups: activeSearchKeyGroups.map(group => ({
        key: group.key,
        indexName: group.indexName,
        bucketsCount: (group.buckets || []).length,
        bucketsSample: (group.buckets || []).slice(0, 20),
      })),
    });
    debugLog('searchKeyBucketDiagnostics', {
      groups: activeSearchKeyGroups.map(group => ({
        group: group.key,
        indexName: group.indexName,
        allowedBuckets: group.buckets || [],
        knownIndexedBuckets: group.allBuckets || group.buckets || [],
      })),
      normalizationNotes: {
        maritalStatus: { married: '+', unmarried: '-', empty: 'no', unknown: '?' },
        bloodRh: { plus: '+', minus: '-', empty: 'no', unknown: '?' },
      },
    });

    if (activeSearchKeyGroups.length > 0) {
      const broadPointCheckGroups = activeSearchKeyGroups
        .filter(group => group.supportsPointCheck && isBroadSearchKeyPointGroup(group));
      const pointCheckGroups = activeSearchKeyGroups
        .filter(group => group.supportsPointCheck && !isBroadSearchKeyPointGroup(group));
      const deferredGroups = activeSearchKeyGroups
        .filter(group => !group.supportsPointCheck || isBroadSearchKeyPointGroup(group));

      debugLog('indexedSearchKeyGroups', {
        count: activeSearchKeyGroups.length,
        pointCheckCount: pointCheckGroups.length,
        broadDeferredPointCheckCount: broadPointCheckGroups.length,
        deferredCount: deferredGroups.length,
        source: 'indexedGetInTouchPointMembership',
        broadDeferRule: {
          minBuckets: SEARCH_KEY_BROAD_POINT_CHECK_MIN_BUCKETS,
          ratio: SEARCH_KEY_BROAD_POINT_CHECK_RATIO,
        },
        groups: activeSearchKeyGroups.map(group => ({
          key: group.key,
          indexName: group.indexName,
          bucketsCount: (group.buckets || []).length,
          allBucketsCount: (group.allBuckets || []).length,
          bucketsSample: (group.buckets || []).slice(0, 20),
          supportsPointCheck: Boolean(group.supportsPointCheck),
          noBucketExcluded: bucketGroupExcludesNo(group),
          deferredBecauseBroad: broadPointCheckGroups.includes(group),
        })),
      });

      if (pointCheckGroups.some(group => !(group.buckets || []).length)) {
        logFilterSummary();
        debugLog('return', {
          collectedUsersCount: 0,
          loadedIdsCount: 0,
          lastKey: null,
          hasMore: false,
          batches,
          source: 'indexedGetInTouchPointMembership',
          zeroReason: 'one of active point-check filters has no selected buckets',
        });

        return {
          users: collectedUsers,
          lastKey: null,
          hasMore: false,
          loadedIds,
        };
      }

      while (Object.keys(collectedUsers).length < targetLimit && hasMore && batches < SEARCH_KEY_GET_IN_TOUCH_MAX_BATCHES_PER_PAGE) {
        debugLog('indexedGetInTouch:loop:start', {
          batch: batches + 1,
          cursorBefore: cursor,
          collectedUsersCount: Object.keys(collectedUsers).length,
          loadedIdsCount: loadedIds.length,
          hasMore,
        });

        batches += 1;
        // Беремо наступну невелику сторінку userId з getInTouch,
        // перетинаємо її з активними індексними фільтрами і лише тоді тягнемо повні анкети.
        // eslint-disable-next-line no-await-in-loop
        const candidatePage = await collectSearchKeyGetInTouchCandidateIds({
          cursor,
          limit: targetLimit,
        });

        cursor = candidatePage.nextCursor;
        hasMore = Boolean(candidatePage.hasMore);

        const pageIds = (candidatePage.ids || []).filter(id => id && !loadedIds.includes(id));
        loadedIds.push(...pageIds);
        filterSummary.pageIdsCount += pageIds.length;

        const candidateIds = await filterIdsBySearchKeyPointGroups({
          ids: pageIds,
          groups: pointCheckGroups,
          debugLog,
          // Детальні повторні читання bucket-ів лишаємо вимкненими у звичайній видачі.
          collectDiagnostics: false,
        });
        filterSummary.pointMembershipRejected += pageIds.length - candidateIds.length;
        debugLog('indexedGetInTouch:candidatePage', {
          batch: batches,
          nextCursor: cursor,
          hasMore,
          pageIdsCount: pageIds.length,
          pageIdsSample: pageIds.slice(0, 10),
          candidateIdsCount: candidateIds.length,
          candidateIdsSample: candidateIds.slice(0, 10),
        });

        if (candidateIds.length === 0) {
          debugLog('indexedGetInTouch:loop:end', {
            batch: batches,
            reason: hasMore ? 'page ids did not match active indexed filters, continue' : 'no matching ids and no more pages',
            collectedUsersCount: Object.keys(collectedUsers).length,
            loadedIdsCount: loadedIds.length,
            cursor,
            hasMore,
          });
          if (!hasMore) break;
          continue;
        }

        debugLog('fetchUsersByIds:before', {
          idsCount: candidateIds.length,
          idsSample: candidateIds.slice(0, 10),
          source: 'indexedGetInTouchPointMembership',
        });

        // eslint-disable-next-line no-await-in-loop
        const candidateUsers = await fetchUsersByIds(candidateIds);
        const candidateUsersEntries = Object.entries(candidateUsers || {});

        debugLog('fetchUsersByIds:after', {
          fetchedCount: candidateUsersEntries.length,
          fetchedIdsSample: candidateUsersEntries.map(([id, user]) => user?.userId || id).slice(0, 10),
          source: 'indexedGetInTouchPointMembership',
        });

        const filteredEntries = filterMain(
          candidateUsersEntries,
          'DATE2.1',
          filterSettings,
          favoritesMap,
          dislikedMap,
          // Без per-card debug filterMain завершується одразу після першого false.
          { requireCurrentOrPastGetInTouch: true },
        );
        filterSummary.filterMainRejected += candidateUsersEntries.length - filteredEntries.length;
        filterSummary.accepted += filteredEntries.length;

        filteredEntries.forEach(([id, user]) => {
          const userId = user?.userId || id;
          if (!userId || collectedUsers[userId]) return;
          if (Object.keys(collectedUsers).length >= targetLimit) return;
          collectedUsers[userId] = { ...user, userId };
        });
        if (typeof onProgress === 'function') onProgress({ ...collectedUsers });

        debugLog('filterMain:after', {
          beforeCount: candidateUsersEntries.length,
          afterCount: filteredEntries.length,
          collectedUsersCount: Object.keys(collectedUsers).length,
          removedCount: candidateUsersEntries.length - filteredEntries.length,
          filterSettings: summarizeSearchKeyFilterSettingsForLog(filterSettings),
          source: 'indexedGetInTouchPointMembership',
          zeroReason: filteredEntries.length === 0
            ? candidateUsersEntries.length === 0
              ? 'fetchUsersByIds returned 0 users from indexed getInTouch page'
              : 'filterMain removed all indexed getInTouch users'
            : null,
        });

        debugLog('indexedGetInTouch:loop:end', {
          batch: batches,
          collectedUsersCount: Object.keys(collectedUsers).length,
          loadedIdsCount: loadedIds.length,
          cursor,
          hasMore,
        });
      }

      const reachedBatchLimit = batches >= SEARCH_KEY_GET_IN_TOUCH_MAX_BATCHES_PER_PAGE && Object.keys(collectedUsers).length === 0;

      logFilterSummary();
      debugLog('return', {
        collectedUsersCount: Object.keys(collectedUsers).length,
        loadedIdsCount: loadedIds.length,
        lastKey: reachedBatchLimit ? null : cursor,
        hasMore: reachedBatchLimit ? false : hasMore,
        batches,
        reachedBatchLimit,
        source: 'indexedGetInTouchPointMembership',
      });

      return {
        users: collectedUsers,
        lastKey: reachedBatchLimit ? null : cursor,
        hasMore: reachedBatchLimit ? false : hasMore,
        loadedIds,
      };
    }

    while (Object.keys(collectedUsers).length < targetLimit && hasMore && batches < SEARCH_KEY_GET_IN_TOUCH_MAX_BATCHES_PER_PAGE) {
      debugLog('loop:start', {
        batch: batches + 1,
        cursorBefore: cursor,
        collectedUsersCount: Object.keys(collectedUsers).length,
        loadedIdsCount: loadedIds.length,
        hasMore,
      });

      batches += 1;
      // Беремо маленьку сторінку userId з getInTouch bucket-ів від сьогодні назад,
      // а не викачуємо великі searchKey buckets перед пагінацією.
      // eslint-disable-next-line no-await-in-loop
      const candidatePage = await collectSearchKeyGetInTouchCandidateIds({
        cursor,
        limit: targetLimit,
      });

      debugLog('candidatePage:response', {
        cursorBefore: cursor,
        nextCursor: candidatePage.nextCursor,
        hasMore: Boolean(candidatePage.hasMore),
        idsCount: (candidatePage.ids || []).length,
        idsSample: (candidatePage.ids || []).slice(0, 10),
      });

      cursor = candidatePage.nextCursor;
      hasMore = Boolean(candidatePage.hasMore);

      const candidateIds = (candidatePage.ids || []).filter(id => id && !loadedIds.includes(id));
      debugLog('candidateIds:normalized', {
        candidateIdsCount: candidateIds.length,
        candidateIdsSample: candidateIds.slice(0, 10),
        loadedIdsCountBeforePush: loadedIds.length,
      });
      filterSummary.pageIdsCount += candidateIds.length;

      if (candidateIds.length === 0) {
        debugLog('loop:end', {
          batch: batches,
          reason: hasMore ? 'empty candidateIds, continue' : 'empty candidateIds and no more pages',
          collectedUsersCount: Object.keys(collectedUsers).length,
          loadedIdsCount: loadedIds.length,
          cursor,
          hasMore,
        });
        if (!hasMore) break;
        continue;
      }

      loadedIds.push(...candidateIds);

      debugLog('fetchUsersByIds:before', {
        idsCount: candidateIds.length,
        idsSample: candidateIds.slice(0, 10),
      });

      // eslint-disable-next-line no-await-in-loop
      const candidateUsers = await fetchUsersByIds(candidateIds);
      const candidateUsersEntries = Object.entries(candidateUsers || {});

      debugLog('fetchUsersByIds:after', {
        fetchedCount: candidateUsersEntries.length,
        fetchedIdsSample: candidateUsersEntries.map(([id, user]) => user?.userId || id).slice(0, 10),
      });

      debugLog('filterMain:before', {
        beforeCount: candidateUsersEntries.length,
        filterSettings: summarizeSearchKeyFilterSettingsForLog(filterSettings),
      });

      const filteredEntries = filterMain(
        candidateUsersEntries,
        'DATE2.1',
        filterSettings,
        favoritesMap,
        dislikedMap,
        // Без per-card debug filterMain завершується одразу після першого false.
        { requireCurrentOrPastGetInTouch: true },
      );
      filterSummary.filterMainRejected += candidateUsersEntries.length - filteredEntries.length;
      filterSummary.accepted += filteredEntries.length;

      debugLog('filterMain:after', {
        beforeCount: candidateUsersEntries.length,
        afterCount: filteredEntries.length,
        removedCount: candidateUsersEntries.length - filteredEntries.length,
        filterSettings: summarizeSearchKeyFilterSettingsForLog(filterSettings),
        zeroReason: filteredEntries.length === 0
          ? candidateUsersEntries.length === 0
            ? 'fetchUsersByIds returned 0 users'
            : 'filterMain removed all fetched users'
          : null,
      });

      filteredEntries.forEach(([id, user]) => {
        const userId = user?.userId || id;
        if (!userId || collectedUsers[userId]) return;
        collectedUsers[userId] = { ...user, userId };
      });
      if (typeof onProgress === 'function') onProgress({ ...collectedUsers });

      debugLog('loop:end', {
        batch: batches,
        collectedUsersCount: Object.keys(collectedUsers).length,
        loadedIdsCount: loadedIds.length,
        cursor,
        hasMore,
      });
    }

    const reachedBatchLimit = batches >= SEARCH_KEY_GET_IN_TOUCH_MAX_BATCHES_PER_PAGE && Object.keys(collectedUsers).length === 0;

    logFilterSummary();
    debugLog('return', {
      collectedUsersCount: Object.keys(collectedUsers).length,
      loadedIdsCount: loadedIds.length,
      lastKey: reachedBatchLimit ? null : cursor,
      hasMore: reachedBatchLimit ? false : hasMore,
      batches,
      reachedBatchLimit,
    });

    return {
      users: collectedUsers,
      lastKey: reachedBatchLimit ? null : cursor,
      hasMore: reachedBatchLimit ? false : hasMore,
      loadedIds,
    };
  } catch (error) {
    debugLog('error', {
      message: error?.message || String(error),
      stack: error?.stack || null,
      name: error?.name || null,
      offset,
      limit,
      filterSettings: summarizeSearchKeyFilterSettingsForLog(filterSettings),
    });
    throw error;
  }
};

// Старе ім'я зберігаємо як сумісний alias: loader уже обробляє всі searchKey-групи, а не лише blood.
export const fetchUsersBySearchKeyBloodPaged = options => fetchUsersBySearchKeyPaged(options);

// За відсутності активних searchKey-груп цей самий loader читає default-list у порядку getInTouch.
export const fetchUsersByDefaultGetInTouchPaged = options => fetchUsersBySearchKeyPaged(options);

// export const updateSearchId = async (searchKey, searchValue, userId, action) => {
//   console.log('searchKey!!!!!!!!! :>> ', searchKey);
//   console.log('searchValue!!!!!!!!! :>> ', searchValue);
//   console.log('action!!!!!!!!!!! :>> ', action);

//   if (!searchValue || !searchKey || !userId) {
//     console.error('Invalid parameters provided:', { searchKey, searchValue, userId });
//     return;
//   }

//   const searchIdKey = `${searchKey}_${encodeKey(searchValue)}`;
//   const searchIdRef = ref2(database, `searchId/${searchIdKey}`);
//   console.log('searchIdKey in updateSearchId :>> ', searchIdKey);

//   try {
//     await runTransaction(searchIdRef, currentData => {
//       if (action === 'add') {
//         if (currentData === null) {
//           // Ключ ще не існує, ставимо одразу userId
//           return userId;
//         } else if (Array.isArray(currentData)) {
//           // Якщо це масив, перевіряємо чи вже є userId
//           if (!currentData.includes(userId)) {
//             currentData.push(userId);
//           }
//           return currentData;
//         } else {
//           // Якщо це одиничне значення, але не масив
//           if (currentData !== userId) {
//             return [currentData, userId];
//           }
//           return currentData;
//         }
//       } else if (action === 'remove') {
//         if (currentData === null) {
//           // Нема чого видаляти
//           return currentData;
//         } else if (Array.isArray(currentData)) {
//           const updatedValue = currentData.filter(id => id !== userId);
//           if (updatedValue.length === 1) {
//             return updatedValue[0]; // Залишився один елемент - повертаємо його як одиничне значення
//           } else if (updatedValue.length === 0) {
//             return null; // Видаляємо ключ
//           } else {
//             return updatedValue;
//           }
//         } else {
//           // Якщо одиничне значення
//           if (currentData === userId) {
//             return null; // Видаляємо ключ
//           }
//           return currentData;
//         }
//       } else {
//         console.error('Unknown action provided:', action);
//         return currentData;
//       }
//     }, {
//       applyLocally: false // Якщо не потрібне локальне застосування
//     });

//     console.log(`Операція '${action}' успішно виконана для ключа ${searchIdKey}.`);
//   } catch (error) {
//     console.error('Error in updateSearchId with transaction:', error);
//   }
// };

export const createSearchIdsInCollection = async (collection, onProgress) => {
  const usersData = await loadCollectionWithIndexCache(collection);
  if (!usersData) return;

  const userIds = Object.keys(usersData);
  if (isDev) console.log('userIds :>> ', userIds);

  const totalUsers = userIds.length;
  for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
    const batchIds = userIds.slice(i, i + BATCH_SIZE);
    const updatePromises = [];
    for (const userId of batchIds) {
      const user = usersData[userId];
      for (const key of keysToCheck) {
        if (user.hasOwnProperty(key)) {
          let value = user[key];

          if (Array.isArray(value)) {
            if (isDev) console.log('Array.isArray(value) :>> ', value);
            value.forEach(item => {
              if (item && typeof item === 'string') {
                let cleanedValue = item.toString().trim();

                if (key === 'phone' || key === 'name' || key === 'surname') {
                  cleanedValue = cleanedValue.replace(/\s+/g, '');
                }

                if (key === 'telegram') {
                  cleanedValue = encodeKey(cleanedValue);
                }

                updatePromises.push(updateSearchId(key, cleanedValue.toLowerCase(), userId, 'add'));
              }
            });
          } else if (value && (typeof value === 'string' || typeof value === 'number')) {
            let cleanedValue = value.toString();

            if (key === 'phone' || key === 'name' || key === 'surname') {
              cleanedValue = cleanedValue.replace(/\s+/g, '');
            }
            if (key === 'telegram') {
              cleanedValue = encodeKey(value);
            }

            updatePromises.push(updateSearchId(key, cleanedValue.toLowerCase(), userId, 'add'));
          }
        }
      }
    }

    // eslint-disable-next-line no-await-in-loop
    await Promise.all(updatePromises);
    const progress = Math.floor(((i + batchIds.length) / totalUsers) * 100);
    if (onProgress && progress % 10 === 0) onProgress(progress);
  }
};

// Функція для видалення пар у searchId
export const removeSearchId = async userId => {
  const db = getDatabase();

  // Отримуємо всі пари в searchId
  const searchIdSnapshot = await get(ref2(db, `searchId`));

  if (searchIdSnapshot.exists()) {
    const searchIdData = searchIdSnapshot.val();

    // Перебираємо всі ключі у searchId
    const keysToRemove = Object.keys(searchIdData).filter(key => searchIdData[key] === userId);

    // Видаляємо пари, що відповідають userId
    for (const key of keysToRemove) {
      await remove(ref2(db, `searchId/${key}`));
      console.log(`Видалено пару в searchId: ${key}`);
    }
  }

  // Видалення картки в newUsers
  const userRef = ref2(db, `newUsers/${userId}`);
  await remove(userRef);
  console.log(`Видалено картку користувача з newUsers: ${userId}`);
};

// Функція для видалення пар у searchId
export const removeSpecificSearchId = async (userId, searchedValue) => {
  const db = getDatabase();

  const [searchKey, searchValue] = Object.entries(searchedValue)[0];
  const searchIdKey = buildSearchIdRecordKey({ [searchKey]: searchValue }); // Формуємо ключ для пошуку у searchId
  if (!searchIdKey) return;
  console.log(`searchIdKey`, searchIdKey);
  // Отримуємо всі пари в searchId
  const searchIdSnapshot = await get(ref2(db, `searchId`));
  console.log(`5555555555`);
  if (searchIdSnapshot.exists()) {
    const searchIdData = searchIdSnapshot.val();
    console.log(`searchIdData`, searchIdData);

    // Перебираємо всі ключі у searchId
    const keysToRemove = Object.keys(searchIdData).filter(key => key === searchIdKey && searchIdData[key] === userId);
    console.log(`keysToRemove`, keysToRemove);
    // Видаляємо пари, що відповідають userId
    for (const key of keysToRemove) {
      await remove(ref2(db, `searchId/${key}`));
      console.log(`Видалено пару в searchId: ${key}`);
    }
  }
};

// Фільтр за роллю користувача
const filterByUserRole = value => {
  const excludedRoles = ['ag', 'ip', 'Конкурент', 'Агент']; // Ролі, які потрібно виключити
  return !excludedRoles.includes(value.userRole) && !excludedRoles.includes(value.role);
  // return !excludedRoles.includes(value.userRole);
};

// Фільтр за довжиною userId
const filterByUserIdLength = userId => {
  // Перевіряємо, що userId є рядком та його довжина не перевищує 25 символів
  return typeof userId === 'string' && userId.length <= 25;
};

const categorizeCsection = val => normalizeCsectionIndexValue(val);

const normalizeSingleFilterValue = value => String(value ?? '').trim().toLowerCase();

const getRoleCategory = value => {
  const role = normalizeSingleFilterValue(value.role || value.userRole);
  if (!role) return 'empty';
  if (['ed', 'sm', 'ag', 'ip', 'pp', 'cl'].includes(role)) return role;
  return 'other';
};

const getUserRoleCategory = value => {
  const role = normalizeSingleFilterValue(value.userRole);
  if (!role) return 'other';
  if (role === 'ed') return 'ed';
  if (role === 'ag') return 'ag';
  if (role === 'ip') return 'ip';
  return 'other';
};

const getMaritalStatusCategory = value => {
  const m = normalizeSingleFilterValue(value.maritalStatus);
  if (!m) return 'empty';
  if (['yes', 'так', '+', 'married', 'одружена', 'заміжня'].includes(m)) return 'married';
  if (['no', 'ні', '-', 'unmarried', 'single', 'незаміжня'].includes(m)) return 'unmarried';
  return 'other';
};

const getBloodGroupCategory = value => {
  const b = normalizeSingleFilterValue(value.blood).replace(/\s+/g, '');
  if (!b) return 'empty';
  if (/^[1234]/.test(b)) return b[0];
  return 'other';
};

const getRhCategory = value => {
  const b = normalizeSingleFilterValue(value.blood).replace(/\s+/g, '');
  if (b.endsWith('+') || b === '+') return '+';
  if (b.endsWith('-') || b === '-') return '-';
  if (/^[1-4]$/.test(b)) return 'empty';
  if (!b) return 'empty';
  return 'other';
};

const getAgeCategory = value => {
  if (!value.birth || typeof value.birth !== 'string' || !value.birth.trim()) return 'empty';
  const birthParts = value.birth.split('.');
  const birthYear = parseInt(birthParts[2], 10);
  if (!Number.isFinite(birthYear)) return 'other';
  const currentYear = new Date().getFullYear();
  const age = currentYear - birthYear;
  if (age <= 25) return 'le25';
  if (age >= 26 && age <= 30) return '26_30';
  if (age >= 31 && age <= 33) return '31_33';
  if (age >= 34 && age <= 36) return '34_36';
  if (age >= 37 && age <= 42) return '37_42';
  if (age >= 43) return '43_plus';
  return 'other';
};

const hasContactValue = value => {
  if (Array.isArray(value)) {
    return value.some(item => String(item || '').trim());
  }
  return String(value || '').trim().length > 0;
};

const getTelegramValues = value => {
  const values = Array.isArray(value) ? value : [value];
  return values.map(item => String(item || '').trim()).filter(Boolean);
};
const hasTelegramNonUk = value => {
  const values = getTelegramValues(value);
  return values.some(item => !item.toLowerCase().startsWith('ук'));
};

const isTelegramUkOnly = value => {
  const values = getTelegramValues(value);
  return values.length > 0 && values.every(item => item.toLowerCase().startsWith('ук'));
};

const getContactIndexSet = data => {
  if (!data || typeof data !== 'object') return new Set();

  const contactSet = new Set();
  if (hasContactValue(data.vk)) contactSet.add('vk');
  if (hasContactValue(data.instagram)) contactSet.add('instagram');
  if (hasContactValue(data.ameblo)) contactSet.add('ameblo');
  if (hasContactValue(data.facebook)) contactSet.add('facebook');
  if (hasContactValue(data.phone)) contactSet.add('phone');
  if (hasTelegramNonUk(data.telegram)) contactSet.add('telegram');
  if (getTelegramValues(data.telegram).some(item => item.toLowerCase().startsWith('ук'))) {
    contactSet.add('telegram2');
  }
  if (hasContactValue(data.tiktok)) contactSet.add('tiktok');
  if (hasContactValue(data.linkedin)) contactSet.add('linkedin');
  if (hasContactValue(data.youtube)) contactSet.add('youtube');
  if (hasContactValue(data.email)) contactSet.add('email');
  if (hasContactValue(data.twitter)) contactSet.add('twitter');
  if (hasContactValue(data.line)) contactSet.add('line');
  if (hasContactValue(data.otherLink)) contactSet.add('otherLink');

  return contactSet;
};

const getBmiCategory = value => {
  const weight = parseFloat(value.weight);
  const height = parseFloat(value.height);
  if (weight && height) {
    const bmi = weight / (height / 100) ** 2;
    if (bmi < 18.5) return 'lt18_5';
    if (bmi < 25) return '18_5_24_9';
    if (bmi < 30) return '25_29_9';
    return '30_plus';
  }
  return 'other';
};

const getImtCategory = value => {
  return normalizeImtSearchKeyIndexValue(value);
};

const getHeightCategory = value => {
  const rawHeight = String(value?.height ?? '').trim();
  if (!rawHeight) return 'no';
  const parsedHeight = Number.parseFloat(rawHeight.replace(',', '.'));
  return getHeightFilterBucket(parsedHeight) || 'other';
};

const getCountryCategory = value => {
  const raw = (value.country || '').toString().trim();
  if (!raw) return 'unknown';
  const normalized = raw.toLowerCase();
  const uaVariants = ['ukraine', 'україна', 'украина', 'украин', 'уккраина'];
  if (uaVariants.includes(normalized)) return 'ua';
  return 'other';
};

const getUserIdCategory = userId => {
  if (!userId) return 'other';
  const id = userId.toString().toLowerCase();
  if (id.startsWith('vk')) return 'vk';
  if (id.startsWith('aa')) return 'aa';
  if (id.startsWith('ab')) return 'ab';
  if (id.startsWith('id')) return 'id';
  if (id.length > 20) return 'long';
  if (id.length > 8 && id.length <= 20) return 'mid';
  return 'other';
};

const getFieldCountCategory = value => {
  const count = Object.keys(value).length;
  if (count <= 5) return 'le5';
  if (count <= 10) return 'f6_10';
  if (count <= 20) return 'f11_20';
  return 'f20_plus';
};

const getCommentLengthCategory = comment => {
  if (!comment || typeof comment !== 'string') return 'other';
  const wordCount = comment.trim().split(/\s+/).length;
  if (wordCount < 10) return 'w0_9';
  if (wordCount < 30) return 'w10_29';
  if (wordCount < 50) return 'w30_49';
  if (wordCount < 100) return 'w50_99';
  if (wordCount < 200) return 'w100_199';
  return 'w200_plus';
};

const isFavoriteUser = (userId, favorites) => {
  return !!favorites[userId];
};

const isLastActionAllowedByFilters = (rawLastAction, lastActionFilters = {}) => {
  const selectedKeys = Object.entries(lastActionFilters)
    .filter(([, enabled]) => Boolean(enabled))
    .map(([key]) => key);
  if (selectedKeys.length === 0) return true;

  const parsed = parseLastActionDate(rawLastAction);
  if (parsed.status === 'empty') return Boolean(lastActionFilters.no);
  if (parsed.status === 'invalid') return Boolean(lastActionFilters['?']);

  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const actionStart = new Date(parsed.date.getFullYear(), parsed.date.getMonth(), parsed.date.getDate());
  const diffDays = Math.floor((todayStart.getTime() - actionStart.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays < 0) return false;

  return (
    (lastActionFilters.today && diffDays === 0) ||
    (lastActionFilters.yesterday && diffDays === 1) ||
    (lastActionFilters.last3days && diffDays <= 3) ||
    (lastActionFilters.last7days && diffDays <= 7) ||
    (lastActionFilters.last14days && diffDays <= 14) ||
    (lastActionFilters.last30days && diffDays <= 30)
  );
};

// Фільтр за віком
const filterByAge = (value, ageLimit = 30) => {
  // Якщо дата народження відсутня або не є рядком, пропускаємо користувача
  if (!value.birth || typeof value.birth !== 'string') return true;

  const birthParts = value.birth.split('.');
  const birthYear = parseInt(birthParts[2], 10);
  const currentYear = new Date().getFullYear();
  const age = currentYear - birthYear;

  // Пропускаємо користувача, якщо вік не перевищує ageLimit
  return age <= ageLimit;
};

// Основна функція фільтрації
export const filterMain = (
  usersData,
  filterForload,
  filterSettings = {},
  favoriteUsers = {},
  dislikedUsers = {},
  options = {},
) => {
  const debugLog = typeof options?.debugLog === 'function' ? options.debugLog : null;
  const requireCurrentOrPastGetInTouch = Boolean(options?.requireCurrentOrPastGetInTouch);
  const isPartialFilterActive = group => {
    if (!group || typeof group !== 'object') return false;
    const values = Object.values(group);
    return values.some(value => value === false) && values.some(value => value === true);
  };
  const getExpectedFilterKeys = group => Object.entries(group || {})
    .filter(([, isAllowed]) => Boolean(isAllowed))
    .map(([key]) => key);
  const hasCsectionFilter = isPartialFilterActive(filterSettings.csection);
  const hasUserRoleFilter = isPartialFilterActive(filterSettings.userRole);
  const hasRoleFilter = !hasUserRoleFilter && isPartialFilterActive(filterSettings.role);
  const hasMaritalStatusFilter = isPartialFilterActive(filterSettings.maritalStatus);
  const hasBloodGroupFilter = isPartialFilterActive(filterSettings.bloodGroup);
  const hasRhFilter = isPartialFilterActive(filterSettings.rh);
  const hasAgeFilter = isPartialFilterActive(filterSettings.age);
  const hasContactFilter = isPartialFilterActive(filterSettings.contact);
  const hasBmiFilter = isPartialFilterActive(filterSettings.bmi);
  const hasImtFilter = isPartialFilterActive(filterSettings.imt);
  const hasHeightFilter = isPartialFilterActive(filterSettings.height);
  const hasCountryFilter = isPartialFilterActive(filterSettings.country);
  const hasUserIdFilter = isPartialFilterActive(filterSettings.userId);
  const hasFieldsFilter = isPartialFilterActive(filterSettings.fields);
  const hasCommentLengthFilter = isPartialFilterActive(filterSettings.commentLength);
  const hasLastActionFilter = isPartialFilterActive(filterSettings.lastAction);
  const hasReactionFilter = isPartialFilterActive(filterSettings.reaction);
  const isFavoriteOnlyFilter = Boolean(filterSettings.favorite?.favOnly);
  const allowedContacts = hasContactFilter ? getExpectedFilterKeys(filterSettings.contact) : [];

  const filteredUsers = usersData.filter(([key, value]) => {
    const userId = value.userId || key;
    const shouldDebugUser = Boolean(debugLog && (!options?.debugUserId || options.debugUserId === userId));
    const reasons = {};
    const addCheck = (name, passed, userValue, expected) => {
      const p = Boolean(passed);
      reasons[name] = {
        passed: p,
        ...(userValue !== undefined ? { userValue } : {}),
        ...(expected !== undefined ? { expected } : {}),
      };
      return p;
    };

    if (filterForload === 'ED') {
      if (!addCheck('edUserRole', filterByUserRole(value), value.userRole || value.role || null, 'not ag/ip/Конкурент/Агент') && !shouldDebugUser) return false;
      if (!addCheck('edUserIdLength', filterByUserIdLength(userId), userId, '<= 25') && !shouldDebugUser) return false;
      if (!addCheck('edAge', filterByAge(value, 30), value.birth || null, '<= 30') && !shouldDebugUser) return false;
    }

    if (hasCsectionFilter) {
      const cat = categorizeCsection(value.csection);
      if (!addCheck('csection', filterSettings.csection[cat], cat, getExpectedFilterKeys(filterSettings.csection)) && !shouldDebugUser) return false;
    }

    if (hasUserRoleFilter) {
      const cat = getUserRoleCategory(value);
      if (!addCheck('userRole', filterSettings.userRole[cat], cat, getExpectedFilterKeys(filterSettings.userRole)) && !shouldDebugUser) return false;
    } else if (hasRoleFilter) {
      const cat = getRoleCategory(value);
      if (!addCheck('role', filterSettings.role[cat], cat, getExpectedFilterKeys(filterSettings.role)) && !shouldDebugUser) return false;
    }

    if (hasMaritalStatusFilter) {
      const cat = getMaritalStatusCategory(value);
      if (!addCheck('maritalStatus', filterSettings.maritalStatus[cat], value.maritalStatus ?? null, getExpectedFilterKeys(filterSettings.maritalStatus)) && !shouldDebugUser) return false;
    }

    if (hasBloodGroupFilter) {
      const cat = getBloodGroupCategory(value);
      if (!addCheck('blood', filterSettings.bloodGroup[cat], value.blood ?? null, getExpectedFilterKeys(filterSettings.bloodGroup)) && !shouldDebugUser) return false;
    }

    if (hasRhFilter) {
      const cat = getRhCategory(value);
      if (!addCheck('rh', filterSettings.rh[cat], cat, getExpectedFilterKeys(filterSettings.rh)) && !shouldDebugUser) return false;
    }

    if (hasAgeFilter) {
      const cat = getAgeCategory(value);
      const filterCat = Object.prototype.hasOwnProperty.call(filterSettings.age, '37_plus') && (cat === '37_42' || cat === '43_plus')
        ? '37_plus'
        : cat;
      if (!addCheck('age', filterSettings.age[filterCat], cat, getExpectedFilterKeys(filterSettings.age)) && !shouldDebugUser) return false;
    }

    if (hasContactFilter) {
      const contactMap = {
        vk: hasContactValue(value.vk),
        instagram: hasContactValue(value.instagram),
        ameblo: hasContactValue(value.ameblo),
        facebook: hasContactValue(value.facebook),
        phone: hasContactValue(value.phone),
        telegram: hasTelegramNonUk(value.telegram),
        telegram2: isTelegramUkOnly(value.telegram),
        tiktok: hasContactValue(value.tiktok),
        linkedin: hasContactValue(value.linkedin),
        youtube: hasContactValue(value.youtube),
        email: hasContactValue(value.email),
        twitter: hasContactValue(value.twitter),
        line: hasContactValue(value.line),
        otherLink: hasContactValue(value.otherLink),
      };
      if (!addCheck('contact', allowedContacts.some(contactKey => contactMap[contactKey]), contactMap, allowedContacts) && !shouldDebugUser) return false;
    }

    if (hasBmiFilter) {
      const cat = getBmiCategory(value);
      if (!addCheck('bmi', filterSettings.bmi[cat], cat, getExpectedFilterKeys(filterSettings.bmi)) && !shouldDebugUser) return false;
    }

    if (hasImtFilter) {
      const cat = getImtCategory(value);
      if (!addCheck('imt', filterSettings.imt[cat], cat, getExpectedFilterKeys(filterSettings.imt)) && !shouldDebugUser) return false;
    }

    if (hasHeightFilter) {
      const cat = getHeightCategory(value);
      if (!addCheck('height', filterSettings.height[cat], cat, getExpectedFilterKeys(filterSettings.height)) && !shouldDebugUser) return false;
    }

    if (hasCountryFilter) {
      const cat = getCountryCategory(value);
      if (!addCheck('country', filterSettings.country[cat], value.country ?? null, getExpectedFilterKeys(filterSettings.country)) && !shouldDebugUser) return false;
    }

    if (hasUserIdFilter) {
      const cat = getUserIdCategory(userId);
      if (!addCheck('userId', filterSettings.userId[cat], cat, getExpectedFilterKeys(filterSettings.userId)) && !shouldDebugUser) return false;
    }

    if (hasFieldsFilter) {
      const cat = getFieldCountCategory(value);
      if (!addCheck('fields', filterSettings.fields[cat], cat, getExpectedFilterKeys(filterSettings.fields)) && !shouldDebugUser) return false;
    }

    if (hasCommentLengthFilter) {
      const cat = getCommentLengthCategory(value.myComment);
      if (!addCheck('commentLength', filterSettings.commentLength[cat], cat, getExpectedFilterKeys(filterSettings.commentLength)) && !shouldDebugUser) return false;
    }

    if (hasLastActionFilter) {
      if (!addCheck('lastAction', isLastActionAllowedByFilters(value.lastAction, filterSettings.lastAction), value.lastAction ?? null, getExpectedFilterKeys(filterSettings.lastAction)) && !shouldDebugUser) return false;
    }

    if (isFavoriteOnlyFilter) {
      if (!addCheck('favorite', isFavoriteUser(userId, favoriteUsers), isFavoriteUser(userId, favoriteUsers), true) && !shouldDebugUser) return false;
    }

    if (requireCurrentOrPastGetInTouch) {
      if (!addCheck('getInTouch', isGetInTouchDateOnOrBeforeToday(value.getInTouch), value.getInTouch ?? null, '<= today') && !shouldDebugUser) return false;
    }

    if (hasReactionFilter) {
      const reactionCategory = getReactionCategory(value, favoriteUsers, dislikedUsers);
      if (!addCheck('reaction', filterSettings.reaction[reactionCategory], reactionCategory, getExpectedFilterKeys(filterSettings.reaction)) && !shouldDebugUser) return false;
    }

    const passed = Object.values(reasons).every(reason => reason.passed);
    if (shouldDebugUser) {
      debugLog(passed ? 'filterMain:accept' : 'filterMain:reject', {
        userId,
        role: value.role ?? null,
        userRole: value.userRole ?? null,
        reasons,
      });
    }
    return passed;
  });

  return filteredUsers;
};

// Функція для перевірки формату дати (dd.mm.ррр)
// Перевірка коректності дати
const isValidDate = date => {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !isNaN(new Date(date).getTime());
};

// Сортування
export const sortUsers = (
  filteredUsers,
  { includeSpecialFutureDates = false, skipGetInTouchFilter = false } = {},
) => {
  // const today = new Date().toLocaleDateString('uk-UA'); // "дд.мм.рррр"
  // const today = new Date().toISOString().split('T')[0]; // Формат рррр-мм-дд
  const currentDate = new Date(); // Поточна дата
  const tomorrow = new Date(currentDate); // Копія поточної дати
  tomorrow.setDate(currentDate.getDate() + 1); // Збільшуємо дату на 1 день
  const today = tomorrow.toISOString().split('T')[0]; // Формат YYYY-MM-DD
  const allowFutureDates = includeSpecialFutureDates || skipGetInTouchFilter;
  const getGroup = date => {
    if (!date) return 3; // порожня дата
    if (date === '2099-99-99' || date === '9999-99-99') {
      return 4; // спеціальні дати завжди відображаємо
    }
    if (!isValidDate(date)) return 2; // некоректні дати
    if (date === today) return 0; // сьогодні
    if (date < today) return 1; // минулі дати
    // Будь-які майбутні дати повертаємо лише для пошуку
    return allowFutureDates ? 4 : null;
  };

  const usersToSort = skipGetInTouchFilter
    ? Array.from(filteredUsers)
    : filteredUsers.filter(([, u]) => getGroup(u.getInTouch) !== null);

  return usersToSort
    .sort(([, a], [, b]) => {
      const groupA = getGroup(a.getInTouch);
      const groupB = getGroup(b.getInTouch);

      if (groupA !== groupB) return groupA - groupB;

      // Сортуємо минулі дати у зворотному порядку (від сьогодні назад)
      if (groupA === 1) {
        const aDate = a.getInTouch || '';
        const bDate = b.getInTouch || '';
        return bDate.localeCompare(aDate);
      }

      return 0;
    });
};

export const fetchPaginatedNewUsers = async (
  lastKey,
  filterForload,
  filterSettings = {},
  favoriteUsers = {},
  options = {},
) => {
  const db = getDatabase();
  const usersRef = ref2(db, 'newUsers');
  const limit = PAGE_SIZE + 1;

  const { dislikedUsers = {} } = options || {};

  try {
    const baseQuery = lastKey ? query(usersRef, orderByKey(), startAfter(lastKey), limitToFirst(limit)) : query(usersRef, orderByKey(), limitToFirst(limit));

    const snapshot = await get(baseQuery);
    if (!snapshot.exists()) {
      return { users: {}, lastKey: null, hasMore: false };
    }

    let fetchedUsers = Object.entries(snapshot.val());
    const rawNextKey = fetchedUsers.length > PAGE_SIZE ? fetchedUsers[PAGE_SIZE][0] : null;

    const noExplicitFilters =
      (!filterForload || filterForload === 'NewLoad') && (!filterSettings || Object.values(filterSettings).every(value => value === 'off'));

    const filteredUsers = noExplicitFilters
      ? fetchedUsers
      : filterMain(
          fetchedUsers,
          filterForload,
          filterSettings,
          favoriteUsers,
          dislikedUsers,
        );

    const sortedUsers = sortUsers(filteredUsers, options);

    const paginatedSlice = sortedUsers.slice(0, PAGE_SIZE);
    const nextKey =
      filterForload === 'DATE3'
        ? rawNextKey
        : sortedUsers.length > PAGE_SIZE
        ? sortedUsers[PAGE_SIZE][0]
        : null;

    const paginatedUsers = paginatedSlice.reduce((acc, [userId, userData]) => {
      acc[userId] = userData;
      return acc;
    }, {});

    const userIds = Object.keys(paginatedUsers);
    const userResults = await Promise.all(userIds.map(id => fetchUserById(id)));

    const usersData = {};
    userResults.forEach((data, idx) => {
      const id = userIds[idx];
      if (data) usersData[id] = data;
    });

    const finalUsers = userIds.reduce((acc, id) => {
      acc[id] = { ...paginatedUsers[id], ...(usersData[id] || {}) };
      return acc;
    }, {});

    return {
      users: finalUsers,
      lastKey: nextKey,
      hasMore: !!nextKey,
    };
  } catch (error) {
    console.error('Error fetching paginated filtered users:', error);
    return {
      users: {},
      lastKey: null,
      hasMore: false,
    };
  }
};

export const fetchListOfUsers = async () => {
  const db = getDatabase();
  const usersRef = ref2(db, 'users');

  try {
    // Паралельне виконання обох запитів
    const [usersSnapshot] = await Promise.all([get(usersRef)]);

    // Перевірка наявності даних у 'users'
    let userIds = [];
    if (usersSnapshot.exists()) {
      const usersData = usersSnapshot.val();
      userIds = Object.keys(usersData);
      // .slice(0, 4); // Отримуємо перші три ключі
    }

    // Повертаємо перші три ID користувачів
    return userIds;
  } catch (error) {
    console.error('Error fetching paginated data:', error);
    return {
      users: {},
      lastKey: null,
      hasMore: false,
    };
  }
};

export const fetchUserById = async userId => {
  const db = getDatabase();

  // console.log('userId в fetchUserById: ', userId);

  // Референси для пошуку в newUsers і users
  const userRefInNewUsers = ref2(db, `newUsers/${userId}`);
  const userRefInUsers = ref2(db, `users/${userId}`);

  try {
    // Пошук у newUsers
    const newUserSnapshot = await get(userRefInNewUsers);
    if (newUserSnapshot.exists()) {
      const userSnapshotInUsers = await get(ref2(db, `users/${userId}`));
      const photos = await getAllUserPhotos(
        userId,
        userSnapshotInUsers.exists() ? null : 'newUsers'
      );
      if (userSnapshotInUsers.exists()) {
        return {
          userId,
          ...userSnapshotInUsers.val(),
          ...newUserSnapshot.val(),
          photos,
          __sourceCollection: 'newUsers',
        };
      }
      return {
        userId,
        ...newUserSnapshot.val(),
        photos,
        __sourceCollection: 'newUsers',
      };
    }

    // Пошук у users, якщо не знайдено в newUsers
    const userSnapshot = await get(userRefInUsers);
    if (userSnapshot.exists()) {
      const photos = await getAllUserPhotos(userId, 'users');
      console.log('Знайдено користувача у users: ', userSnapshot.val());
      return {
        userId,
        ...userSnapshot.val(),
        photos,
        __sourceCollection: 'users',
      };
    }

    // Якщо користувача не знайдено в жодній колекції
    console.log('Користувача не знайдено в жодній колекції.1.');
    return null;
  } catch (error) {
    console.error('Помилка під час пошуку користувача: ', error);
    return null;
  }
};

// Функція для видалення ключа з Firebase
export const removeKeyFromFirebase = async (field, value, userId) => {
  const dbRealtime = getDatabase();
  const dbFirestore = getFirestore();

  // Визначаємо шляхи для видалення в обох колекціях Realtime Database
  const newUsersRefRealtime = ref2(dbRealtime, `newUsers/${userId}/${field}`);
  const usersRefRealtime = ref2(dbRealtime, `users/${userId}/${field}`);

  // Визначаємо шляхи для видалення в Firestore
  // const newUsersDocFirestore = doc(dbFirestore, 'newUsers', userId);
  const usersDocFirestore = doc(dbFirestore, 'users', userId);

  try {
    if (field === 'photos') {
      const urls = Array.isArray(value) ? value : [value];
      await deletePhotos(userId, urls);
    }
    // Видалення з newUsers у Realtime Database
    await remove(newUsersRefRealtime);
    console.log(`Ключ "${field}" видалено з Realtime Database: newUsers/${userId}`);
    // console.log(`Значення "${value}" видалено з Realtime Database: newUsers/${userId}`);
    await updateSearchId(field, value, userId, 'remove');

    // Видалення з users у Realtime Database
    await remove(usersRefRealtime);
    console.log(`Ключ "${field}" видалено з Realtime Database: users/${userId}`);

    // Видалення з newUsers у Firestore
    // const newUsersDocSnap = await getDoc(newUsersDocFirestore);
    // if (newUsersDocSnap.exists()) {
    //   await updateDoc(newUsersDocFirestore, { [field]: deleteField() });
    //   console.log(`Ключ "${field}" видалено з Firestore: newUsers/${userId}`);
    // }

    // Видалення з users у Firestore
    const usersDocSnap = await getDoc(usersDocFirestore);
    if (usersDocSnap.exists()) {
      await updateDoc(usersDocFirestore, { [field]: deleteField() });
      console.log(`Ключ "${field}" видалено з Firestore: users/${userId}`);
    }
  } catch (error) {
    console.error('Помилка видалення ключа з Firebase:', error);
  }
};

// через баг з сьорчАйді вивидить пусту карточку
// export const loadDuplicateUsers = async () => {
//   const duplicates = []; // Масив для зберігання дублікатів

//   try {
//     // Запит для отримання всіх записів з searchId
//     const searchIdSnapshot = await get(ref2(database, 'searchId'));

//     if (searchIdSnapshot.exists()) {
//       const searchIdData = searchIdSnapshot.val();

//       // Проходимо через всі ключі в searchId
//       for (const [searchKey, userIdOrArray] of Object.entries(searchIdData)) {
//         if (searchKey.startsWith('name') || searchKey.startsWith('surname')) {
//           continue; // Пропускаємо ключі, які починаються на "name" або "surname"
//         }

//         if (Array.isArray(userIdOrArray)) {
//           console.log('Duplicate found in searchId:', { searchKey, userIdOrArray });

//           // Якщо ключ - масив, додаємо всі userId до списку дублікатів
//           duplicates.push(...userIdOrArray);
//         }
//       }

//       console.log('All duplicates (with repeats):', duplicates);

//       // Отримуємо перші 20 userId, включаючи повтори
//       const first20Duplicates = duplicates.slice(0, 20);
//       console.log('First 20 duplicates (with repeats):', first20Duplicates);

//       // Отримуємо дані по кожному userId
// // Отримуємо дані по кожному userId
// const mergedUsers = {}; // Об'єкт для збереження об'єднаних користувачів
// for (const userId of first20Duplicates) {
//   try {
//     let mergedData = { userId }; // Початковий об'єкт з userId

//     // Пошук користувача спочатку в newUsers
//     const userSnapshotInNewUsers = await get(ref2(database, `newUsers/${userId}`));
//     if (userSnapshotInNewUsers.exists()) {
//       const userDataInNewUsers = userSnapshotInNewUsers.val();
//       mergedData = {
//         ...mergedData,
//         ...userDataInNewUsers, // Додаємо дані з newUsers
//       };
//     }

//     // Пошук користувача в users
//     const userSnapshotInUsers = await get(ref2(database, `users/${userId}`));
//     if (userSnapshotInUsers.exists()) {
//       const userDataInUsers = userSnapshotInUsers.val();
//       mergedData = {
//         ...mergedData,
//         ...userDataInUsers, // Додаємо дані з users
//       };
//     }

//     // Зберігаємо об'єднані дані для userId
//     mergedUsers[userId] = mergedData;
//         } catch (error) {
//           console.error(`Error fetching user data for userId: ${userId}`, error);
//         }
//       }

//       console.log('Duplicate users:', mergedUsers);

//       // Повертаємо перші 20 користувачів
//       return mergedUsers;
//     } else {
//       console.log('No duplicates found in searchId.');
//       return {};
//     }
//   } catch (error) {
//     console.error('Error loading duplicate users:', error);
//     return {};
//   }
// };
export const loadDuplicateUsers = async () => {
  try {
    const searchIdData = await loadCollectionWithIndexCache('searchId');

    if (!searchIdData) {
      console.log('No duplicates found in searchId.');
      return {};
    }

    const pairs = []; // Масив для зберігання пар (userIdOrArray)
    for (const [searchKey, userIdOrArray] of Object.entries(searchIdData)) {
      if (
        searchKey.startsWith('name') ||
        searchKey.startsWith('surname') ||
        searchKey.startsWith('other') ||
        searchKey.startsWith('getInTouch') ||
        searchKey.startsWith('lastAction')
      ) {
        continue; // Пропускаємо ключі, які починаються на "name" або "surname"
      }

      if (Array.isArray(userIdOrArray)) {
        console.log('Duplicate found in searchId:', { searchKey, userIdOrArray });
        // Зберігаємо пару в масив pairs
        // Припускаємо, що це завжди пара (2 значення), якщо буває більше — можна додати перевірку.
        pairs.push(userIdOrArray);
      }
    }

    console.log('All pairs of duplicates:', pairs);

    // Отримаємо перші 10 пар
    const first10Pairs = pairs.slice(0, 300);
    const totalDuplicates = pairs.length;
    // console.log('totalDuplicates :>> ', totalDuplicates);

    const mergedUsers = {};
    for (const pair of first10Pairs) {
      if (pair.length < 2) continue; // Якщо чомусь пара не повна, пропускаємо

      const [firstUserId, secondUserId] = pair;

      // // Отримуємо дані першого користувача
      // let mergedDataFirst = { userId: firstUserId };
      // const userSnapshotInNewUsersFirst = await get(ref2(database, `newUsers/${firstUserId}`));
      // if (userSnapshotInNewUsersFirst.exists()) {
      //   const userDataInNewUsers = userSnapshotInNewUsersFirst.val();
      //   mergedDataFirst = {
      //     ...mergedDataFirst,
      //     ...userDataInNewUsers,
      //   };
      // }

      // const userSnapshotInUsersFirst = await get(ref2(database, `users/${firstUserId}`));
      // if (userSnapshotInUsersFirst.exists()) {
      //   const userDataInUsers = userSnapshotInUsersFirst.val();
      //   mergedDataFirst = {
      //     ...mergedDataFirst,
      //     ...userDataInUsers,
      //   };
      // }

      // Функція для отримання даних користувача
      const getUserData = async userId => {
        let mergedData = { userId };
        const userSnapshotInNewUsers = await get(ref2(database, `newUsers/${userId}`));
        if (userSnapshotInNewUsers.exists()) {
          const userDataInNewUsers = userSnapshotInNewUsers.val();
          mergedData = {
            ...mergedData,
            ...userDataInNewUsers,
          };
        }

        const userSnapshotInUsers = await get(ref2(database, `users/${userId}`));
        if (userSnapshotInUsers.exists()) {
          const userDataInUsers = userSnapshotInUsers.val();
          mergedData = {
            ...mergedData,
            ...userDataInUsers,
          };
        }

        return mergedData;
      };

      // Отримуємо дані другого користувача
      // let mergedDataSecond = { userId: secondUserId };
      // const userSnapshotInNewUsersSecond = await get(ref2(database, `newUsers/${secondUserId}`));
      // if (userSnapshotInNewUsersSecond.exists()) {
      //   const userDataInNewUsers2 = userSnapshotInNewUsersSecond.val();
      //   mergedDataSecond = {
      //     ...mergedDataSecond,
      //     ...userDataInNewUsers2,
      //   };
      // }

      // const userSnapshotInUsersSecond = await get(ref2(database, `users/${secondUserId}`));
      // if (userSnapshotInUsersSecond.exists()) {
      //   const userDataInUsers2 = userSnapshotInUsersSecond.val();
      //   mergedDataSecond = {
      //     ...mergedDataSecond,
      //     ...userDataInUsers2,
      //   };
      // }

      // Отримуємо дані для обох користувачів
      const mergedDataFirst = await getUserData(firstUserId);
      const mergedDataSecond = await getUserData(secondUserId);

      // Перевіряємо першого користувача
      const keysFirst = Object.keys(mergedDataFirst);
      if (keysFirst.length <= 1) {
        console.log(`Ignoring pair [${firstUserId}, ${secondUserId}] because first user is empty`);
        continue;
      }

      // Перевіряємо другого користувача - чи є у нього інші ключі крім userId
      const keysSecond = Object.keys(mergedDataSecond);
      if (keysSecond.length <= 1) {
        // Другий користувач не має даних окрім userId, ігноруємо цю пару
        console.log(`Ignoring pair [${firstUserId}, ${secondUserId}] because second user is empty`);
        continue;
      }

      // Якщо у другого користувача є дані, додаємо обох в mergedUsers
      mergedUsers[firstUserId] = mergedDataFirst;
      mergedUsers[secondUserId] = mergedDataSecond;
    }

    console.log('Duplicate users after filtering empty second user:', mergedUsers);

    return { mergedUsers, totalDuplicates };
  } catch (error) {
    console.error('Error loading duplicate users:', error);
    return {};
  }
};

export const mergeDuplicateUsers = async () => {
  try {
    const searchIdData = await loadCollectionWithIndexCache('searchId');

    if (!searchIdData) {
      console.log('No duplicates found in searchId.');
      return {};
    }

    const pairs = [];
    for (const [searchKey, userIdOrArray] of Object.entries(searchIdData)) {
      if (
        searchKey.startsWith('name') ||
        searchKey.startsWith('surname') ||
        searchKey.startsWith('other') ||
        searchKey.startsWith('getInTouch') ||
        searchKey.startsWith('lastAction')
      ) {
        continue;
      }

      if (Array.isArray(userIdOrArray)) {
        console.log('Duplicate found in searchId:', { searchKey, userIdOrArray });
        pairs.push(userIdOrArray);
      }
    }

    console.log('All pairs of duplicates:', pairs);

    const first10Pairs = pairs;
    // .slice(0, 300);
    const totalDuplicates = pairs.length;

    const mergedUsers = {};

    const getUserData = async userId => {
      let mergedData = { userId };
      const userSnapshotInNewUsers = await get(ref2(database, `newUsers/${userId}`));
      if (userSnapshotInNewUsers.exists()) {
        mergedData = { ...mergedData, ...userSnapshotInNewUsers.val() };
      }

      const userSnapshotInUsers = await get(ref2(database, `users/${userId}`));
      if (userSnapshotInUsers.exists()) {
        mergedData = { ...mergedData, ...userSnapshotInUsers.val() };
      }

      return mergedData;
    };

    const mergeValues = (key, currentVal, nextVal) => {
      const normalize = value => String(value).replace(/\s+/g, '').trim();

      const toArray = value => {
        if (!value) return [];
        if (Array.isArray(value)) return value.map(normalize).filter(item => item !== ''); // Якщо вже масив – очищаємо
        return String(value)
          .split(/[,;]/) // Розбиваємо значення за `,` або `;`
          .map(item => normalize(item))
          .filter(item => item !== '');
      };

      if (!currentVal) return nextVal || '';
      if (!nextVal) return currentVal;

      const currentArray = toArray(currentVal).flatMap(toArray);
      const nextArray = toArray(nextVal).flatMap(toArray);

      const seen = new Set();
      const uniqueValues = [...currentArray, ...nextArray].filter(val => {
        const normalizedVal = val.trim();
        if (seen.has(normalizedVal)) {
          return false;
        }
        seen.add(normalizedVal);
        return true;
      });

      // Якщо залишилось одне значення – повертаємо його як рядок, якщо більше – як масив
      return uniqueValues.length === 1 ? uniqueValues[0] : uniqueValues;
    };

    const delKeys = [
      'photos',
      'areTermsConfirmed',
      'attitude',
      'breastSize',
      'chin',
      'bodyType',
      'lastAction',
      'clothingSize',
      'education',
      'experience',
      'eyeColor',
      'faceShape',
      'glasses',
      'hairColor',
      'hairStructure',
      'language',
      'lastLogin',
      'lipsShape',
      'noseShape',
      'profession',
      'publish',
      'race',
      'registrationDate',
      'reward',
      'shoeSize',
      'street',
      'whiteList',
      'blackList',
    ];

    for (const pair of first10Pairs) {
      if (pair.length < 2) continue;

      const [firstUserId, secondUserId] = pair;
      const user1 = await getUserData(firstUserId);
      const user2 = await getUserData(secondUserId);

      if (Object.keys(user1).length <= 1 || Object.keys(user2).length <= 1) {
        console.log(`Ignoring pair [${firstUserId}, ${secondUserId}] because one user is empty`);
        continue;
      }

      // Перевіряємо чи userId містить тільки `VK` або `AA`
      if (!/^VK|AA\d+$/.test(user1.userId) || !/^VK|AA\d+$/.test(user2.userId)) {
        console.log(`Skipping pair [${firstUserId}, ${secondUserId}] because userId is not VK or AA`);
        continue;
      }

      let primaryUser, donorUser;
      if (!user1.userId.startsWith('VK')) {
        primaryUser = firstUserId;
        donorUser = secondUserId;
      } else if (!user2.userId.startsWith('VK')) {
        primaryUser = secondUserId;
        donorUser = firstUserId;
      } else {
        donorUser = firstUserId;
        primaryUser = secondUserId;
      }

      console.log(`Primary user: ${primaryUser}, Donor user: ${donorUser}`);

      for (const key of Object.keys(user2)) {
        if (!delKeys.includes(key) && key !== 'userId') {
          user1[key] = mergeValues(key, user1[key], user2[key]);
        }
      }

      // ГАРАНТУЄМО, що `userId` не зміниться!
      user1.userId = primaryUser;

      mergedUsers[primaryUser] = user1; // Використовуємо `primaryUser`, бо він завжди правильний

      console.log(`Merged user saved as ${primaryUser}:`, mergedUsers[primaryUser]);

      await updateDataInNewUsersRTDB(mergedUsers[primaryUser].userId, mergedUsers[primaryUser], 'update');

      const db = getDatabase();
      await remove(ref2(db, `newUsers/${donorUser}`));
      console.log(`Deleted donor user: ${donorUser}`);
    }

    console.log('Final merged users:', mergedUsers);

    return { mergedUsers, totalDuplicates };
  } catch (error) {
    console.error('Error loading duplicate users:', error);
    return {};
  }
};

export const removeCardAndSearchId = async userId => {
  const db = getDatabase();

  try {
    // Отримуємо картку користувача з newUsers
    const userSnapshot = await get(ref2(db, `newUsers/${userId}`));
    if (!userSnapshot.exists()) {
      console.warn(`Користувач не знайдений у newUsers: ${userId}`);
      return;
    }

    const userData = userSnapshot.val();
    console.log(`Дані користувача:`, userData);

    // Зберігаємо видалені значення для відображення в toast
    const deletedFields = [];

    // Перебір ключів для перевірки
    for (const key of keysToCheck) {
      const valueToCheck = userData[key];

      if (!valueToCheck) continue; // Пропускаємо, якщо значення відсутнє

      // Якщо значення — рядок
      if (typeof valueToCheck === 'string' || typeof valueToCheck === 'number') {
        console.log(`Видалення рядкового значення: ${key} -> ${valueToCheck}`);
        const candidates = buildSearchIndexCandidates(key, valueToCheck);
        for (const candidate of candidates) {
          // eslint-disable-next-line no-await-in-loop
          await updateSearchId(key, candidate, userId, 'remove');
        }
        deletedFields.push(`${key} -> ${valueToCheck}`);
      }

      // Якщо значення — масив
      if (Array.isArray(valueToCheck)) {
        console.log(`Видалення масиву значень для ключа: ${key} -> ${valueToCheck}`);
        for (const item of valueToCheck) {
          if (typeof item === 'string' || typeof item === 'number') {
            const candidates = buildSearchIndexCandidates(key, item);
            for (const candidate of candidates) {
              // eslint-disable-next-line no-await-in-loop
              await updateSearchId(key, candidate, userId, 'remove');
            }
          } else {
            console.warn(`Пропущено непідтримуване значення в масиві для ключа: ${key}`, item);
          }
        }
      }
    }

    await syncUserSearchKeyIndex(userId, userData, {});

    // console.warn(`Видаляємо картку користувача з newUsers: ${userId}`);
    // Видаляємо картку користувача з newUsers
    await remove(ref2(db, `newUsers/${userId}`));
    console.log(`Картка користувача видалена з newUsers: ${userId}`);

    removeCard(userId);

    if (deletedFields.length) {
      toast.success(`Видалені дані:\n${deletedFields.join('\n')}`, {
        style: { whiteSpace: 'pre-line' },
      });
    } else {
      toast.success(`Картка користувача видалена з newUsers: ${userId}`);
    }
  } catch (error) {
    console.error(`Помилка під час видалення searchId для userId: ${userId}`, error);
  }
};
// Повертає прості фільтри, які можна застосувати на сервері
const getServerFilters = filterSettings => {
  const simpleKeys = ['csection', 'userRole', 'role', 'maritalStatus', 'bloodGroup', 'rh'];
  const result = {};
  simpleKeys.forEach(key => {
    const cfg = filterSettings[key];
    if (cfg && Object.values(cfg).some(v => !v)) {
      result[key] = Object.keys(cfg).filter(k => cfg[k]);
    }
  });
  return result;
};

// Виконує запити до вказаного шляху з урахуванням простих фільтрів
const fetchByPathWithFilters = async (path, filters) => {
  const dataById = {};
  const sets = [];

  for (const [key, values] of Object.entries(filters)) {
    const ids = new Set();
    await Promise.all(
      values.map(async value => {
        const q = query(ref2(database, path), orderByChild(key), equalTo(value));
        const snap = await get(q);
        if (snap.exists()) {
          Object.entries(snap.val()).forEach(([id, data]) => {
            ids.add(id);
            dataById[id] = { ...(dataById[id] || {}), ...data };
          });
        }
      }),
    );
    sets.push(ids);
  }

  let finalIds = sets.length > 0 ? Array.from(sets[0]) : Object.keys(dataById);
  for (let i = 1; i < sets.length; i++) {
    finalIds = finalIds.filter(id => sets[i].has(id));
  }

  const result = {};
  finalIds.forEach(id => {
    result[id] = { userId: id, ...dataById[id] };
  });

  return result;
};

export const fetchAllFilteredUsers = async (
  filterForload,
  filterSettings = {},
  favoriteUsers = {},
  options = {},
) => {
  try {
    const { dislikedUsers = {} } = options || {};
    const serverFilters = getServerFilters(filterSettings);

    let newUsersData = {};
    let usersData = {};

    if (Object.keys(serverFilters).length > 0) {
      [newUsersData, usersData] = await Promise.all([
        fetchByPathWithFilters('newUsers', serverFilters),
        fetchByPathWithFilters('users', serverFilters),
      ]);
    } else {
      const [newUsersSnapshot, usersSnapshot] = await Promise.all([
        get(ref2(database, 'newUsers')),
        get(ref2(database, 'users')),
      ]);
      newUsersData = newUsersSnapshot.exists() ? newUsersSnapshot.val() : {};
      usersData = usersSnapshot.exists() ? usersSnapshot.val() : {};
    }

    const allUserIds = new Set([...Object.keys(newUsersData), ...Object.keys(usersData)]);

    const allUsersArray = Array.from(allUserIds).map(userId => {
      const newUserRaw = newUsersData[userId] || {};

      return [
        userId,
        {
          userId,
          ...(usersData[userId] || {}),
          ...newUserRaw,
        },
      ];
    });

    const filteredUsers = filterMain(
      allUsersArray,
      filterForload,
      filterSettings,
      favoriteUsers,
      dislikedUsers,
    );
    const sortedUsers = sortUsers(filteredUsers, options);
    return Object.fromEntries(sortedUsers);
  } catch (error) {
    console.error('Error fetching filtered users:', error);
    return {};
  }
};

export const fetchAllUsersFromRTDB = async () => {
  try {
    // Отримуємо дані з двох колекцій
    const [newUsersSnapshot, usersSnapshot] = await Promise.all([get(ref2(database, 'newUsers')), get(ref2(database, 'users'))]);

    const newUsersData = newUsersSnapshot.exists() ? newUsersSnapshot.val() : {};
    const usersData = usersSnapshot.exists() ? usersSnapshot.val() : {};

    const allUserIds = new Set([...Object.keys(newUsersData), ...Object.keys(usersData)]);

    // Перетворюємо Set у масив
    const allUsersArray = Array.from(allUserIds);

    // Об’єднуємо дані та формуємо масив пар [userId, userObject]
    const mergedUsersArray = allUsersArray.map(userId => {
      const newUserRaw = newUsersData[userId] || {};
      return [
        userId,
        {
          userId,
          ...(usersData[userId] || {}),
          ...newUserRaw,
        },
      ];
    });

    // Обмежуємо результати першими 3
    const limitedUsersArray = mergedUsersArray;
    // .slice(0, 40);

    // Перетворюємо назад в об’єкт
    const limitedUsers = Object.fromEntries(limitedUsersArray);

    console.log('Отримано перших 3 користувачів:', limitedUsers);
    return limitedUsers;
  } catch (error) {
    console.error('Помилка при отриманні даних:', error);
    return null;
  }
};

export const indexLastLogin = async onProgress => {
  const usersSnap = await get(ref2(database, 'users'));
  if (!usersSnap.exists()) return;

  const usersData = usersSnap.val();

  const entries = Object.entries(usersData);
  const total = entries.length;
  let processed = 0;
  let lastProgress = 0;

  const parseDate = str => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
    const parts = str.split('.');
    if (parts.length === 3) {
      const [dd, mm, yy] = parts;
      return `${yy}-${mm}-${dd}`;
    }
    return null;
  };

  for (const [uid, user] of entries) {
    const id = uid;

    let date;

    if (typeof user.lastLogin === 'string') {
      date = parseDate(user.lastLogin);
    }

    if (!date && typeof user.registrationDate === 'string') {
      date = parseDate(user.registrationDate);
    }

    if (!date) {
      date = '2024-01-01';
    }

    // eslint-disable-next-line no-await-in-loop
    await update(ref2(database, `users/${id}`), { lastLogin2: date });

    processed += 1;
    const progress = Math.floor((processed / total) * 100);
    if (onProgress && progress % 10 === 0 && progress !== lastProgress) {
      onProgress(progress);
      lastProgress = progress;
    }
  }
};

export async function fetchSortedUsersByDate(limit = PAGE_SIZE, offset = 0) {
  const dbInstance = getDatabase();
  const usersRef = ref2(dbInstance, 'newUsers');

  const currentDate = new Date();
  const tomorrow = new Date(currentDate);
  tomorrow.setDate(currentDate.getDate() + 1);
  const today = tomorrow.toISOString().split('T')[0];

  const twoWeeksAgo = new Date(tomorrow);
  twoWeeksAgo.setDate(tomorrow.getDate() - 14);
  const twoWeeksAgoDate = twoWeeksAgo.toISOString().split('T')[0];

  const twoWeeksAhead = new Date(tomorrow);
  twoWeeksAhead.setDate(tomorrow.getDate() + 14);
  const twoWeeksAheadDate = twoWeeksAhead.toISOString().split('T')[0];

  const beforeTwoWeeksAgo = new Date(twoWeeksAgo);
  beforeTwoWeeksAgo.setDate(twoWeeksAgo.getDate() - 1);
  const beforeTwoWeeksAgoDate = beforeTwoWeeksAgo.toISOString().split('T')[0];

  const fetchData = async q => {
    const snap = await get(q);
    return snap.exists() ? Object.entries(snap.val()) : [];
  };

  const result = [];
  const fetchedIds = new Set();
  const pushUnique = entries => {
    for (const entry of entries) {
      if (!fetchedIds.has(entry[0])) {
        fetchedIds.add(entry[0]);
        result.push(entry);
      }
    }
  };

  // Today's records
  let entries = await fetchData(query(usersRef, orderByChild('getInTouch'), equalTo(today)));
  pushUnique(entries);

  // Previous records within two weeks
  entries = await fetchData(query(usersRef, orderByChild('getInTouch'), startAt(twoWeeksAgoDate), endAt(today)));
  entries = entries.filter(([, u]) => u.getInTouch < today);
  pushUnique(entries);

  // Upcoming records within two weeks
  entries = await fetchData(query(usersRef, orderByChild('getInTouch'), startAt(today), endAt(twoWeeksAheadDate)));
  entries = entries.filter(([, u]) => u.getInTouch > today && u.getInTouch <= twoWeeksAheadDate);
  pushUnique(entries);

  // Records outside two week range (past and future)
  entries = await fetchData(query(usersRef, orderByChild('getInTouch'), endAt(beforeTwoWeeksAgoDate)));
  entries = entries.filter(([, u]) => isValidDate(u.getInTouch) && u.getInTouch < twoWeeksAgoDate);
  pushUnique(entries);

  entries = await fetchData(query(usersRef, orderByChild('getInTouch'), startAt(twoWeeksAheadDate)));
  entries = entries.filter(
    ([, u]) => isValidDate(u.getInTouch) && u.getInTouch > twoWeeksAheadDate && u.getInTouch !== '2099-99-99' && u.getInTouch !== '9999-99-99'
  );
  pushUnique(entries);

  // Empty dates
  entries = await fetchData(query(usersRef, orderByChild('getInTouch'), equalTo('')));
  pushUnique(entries);

  // Records with invalid dates (non-empty and not YYYY-MM-DD)
  entries = await fetchData(query(usersRef, orderByChild('getInTouch')));
  entries = entries.filter(([id, u]) => {
    const d = u.getInTouch;
    return d && !isValidDate(d) && d !== '2099-99-99' && d !== '9999-99-99' && !fetchedIds.has(id);
  });
  pushUnique(entries);

  // Records with special future dates are skipped

  const sliced = result.slice(offset, offset + limit);
  return { data: Object.fromEntries(sliced) };
}

export { fetchFilteredUsersByPage } from './dateLoad';
export { fetchUsersByLastLoginPaged } from './lastLoginLoad';
export { fetchUsersByLastActionPaged } from './lastActionLoad';
