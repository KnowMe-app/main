import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, getFirestore, setDoc, updateDoc, deleteField } from 'firebase/firestore';
import { getDownloadURL, getStorage, uploadBytes, ref, deleteObject, listAll } from 'firebase/storage';
import {
  getDatabase,
  ref as ref2,
  get,
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
import { getCurrentDate } from './foramtDate';
import toast from 'react-hot-toast';
import { removeCard, setIdsForQuery, normalizeQueryKey } from '../utils/cardIndex';
import { updateCard } from '../utils/cardsStorage';
import { parseUkTriggerQuery } from '../utils/parseUkTrigger';
import { getCacheKey } from '../utils/cache';
import { getReactionCategory } from 'utils/reactionCategory';
import { buildSearchIndexCandidates, encodeKey } from '../utils/searchIndexCandidates';
import {
  buildSearchIdCandidateKeys,
  getEqualToCandidates,
  makeSearchKeyValue,
  shouldSkipBroadFallbackForExactSearchId,
} from '../utils/searchKeyUtils';
import { resolveEqualToSearchKeys } from '../utils/searchKeyCheckboxFilters';
import { searchByIndexOn } from './searchByIndexOn';

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

export { PAGE_SIZE, BATCH_SIZE, MEDICATION_SCHEDULE_CLEANUP_DAY_LIMIT } from './constants';

const keysToCheck = ['instagram', 'facebook', 'email', 'phone', 'telegram', 'tiktok', 'other', 'vk', 'name', 'surname', 'lastAction', 'getInTouch'];
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



export const getUrlofUploadedAvatar = async (photo, userId, options = {}) => {
  const { disableCompression = false, maxSizeKB = 50 } = options;
  const file = disableCompression
    ? photo
    : await getFileBlob(await compressPhoto(photo, maxSizeKB));

  const uniqueId = Date.now().toString(); // генеруємо унікальне ім"я для фото
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

        // Задаємо зменшені розміри canvas, зберігаючи пропорції
        let width = img.width;
        let height = img.height;

        // Якщо зображення більше 1000px по ширині, зменшуємо до 1000px
        const MAX_WIDTH = 1000;
        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        }

        canvas.width = width;
        canvas.height = height;

        // Малюємо зображення на canvas з новими розмірами
        ctx.drawImage(img, 0, 0, width, height);

        // Спробуємо спочатку стиснути з якістю 0.6
        let quality = 0.6;
        let compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
        let compressedFile = dataURLToFile(compressedDataUrl);

        // Перевірка розміру файлу після стиснення і зниження якості поступово
        while (compressedFile.size > maxSizeKB * 1024 && quality > 0.1) {
          quality -= 0.1; // Зменшуємо якість
          compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
          compressedFile = dataURLToFile(compressedDataUrl);
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
export const addFavoriteUser = async userId => {
  try {
    const owner = auth.currentUser;
    if (!owner) return;
    await set(ref2(database, `multiData/favorites/${owner.uid}/${userId}`), true);
  } catch (error) {
    console.error('Error adding favorite user:', error);
  }
};

export const removeFavoriteUser = async userId => {
  try {
    const owner = auth.currentUser;
    if (!owner) return;
    await remove(ref2(database, `multiData/favorites/${owner.uid}/${userId}`));
  } catch (error) {
    console.error('Error removing favorite user:', error);
  }
};

export const addDislikeUser = async userId => {
  try {
    const owner = auth.currentUser;
    if (!owner) return;
    await set(ref2(database, `multiData/dislikes/${owner.uid}/${userId}`), true);
  } catch (error) {
    console.error('Error adding dislike user:', error);
  }
};

export const removeDislikeUser = async userId => {
  try {
    const owner = auth.currentUser;
    if (!owner) return;
    await remove(ref2(database, `multiData/dislikes/${owner.uid}/${userId}`));
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

export const setUserComment = async (cardId, text) => {
  try {
    const user = auth.currentUser;
    if (!user) {
      throw new Error('User not authenticated');
    }
    if (!cardId || typeof text !== 'string') {
      throw new Error('cardId і text обовʼязкові');
    }
    const commentsRef = ref2(database, `multiData/comments/${user.uid}`);
    const q = query(commentsRef, orderByChild('cardId'), equalTo(cardId));
    const snap = await get(q);
    const lastAction = Date.now();
    if (snap.exists()) {
      const key = Object.keys(snap.val())[0];
      await set(ref2(database, `multiData/comments/${user.uid}/${key}`), {
        cardId,
        text,
        authorId: user.uid,
        lastAction,
      });
      return { commentId: key, lastAction };
    }
    const newRef = push(commentsRef);
    await set(newRef, { cardId, text, authorId: user.uid, lastAction });
    return { commentId: newRef.key, lastAction };
  } catch (error) {
    console.error('Error setting comment:', error);
    return null;
  }
};

export const updateCommentByOwner = async ({ ownerId, commentId, cardId, text }) => {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('User not authenticated');
    }
    const safeOwnerId = String(ownerId || '').trim();
    const safeCommentId = String(commentId || '').trim();
    if (!safeOwnerId || !safeCommentId || !cardId || typeof text !== 'string') {
      throw new Error('ownerId, commentId, cardId і text обовʼязкові');
    }

    const targetRef = ref2(database, `multiData/comments/${safeOwnerId}/${safeCommentId}`);
    const snap = await get(targetRef);
    if (!snap.exists()) {
      return null;
    }

    const lastAction = Date.now();
    await update(targetRef, {
      cardId,
      text,
      lastAction,
    });
    return { commentId: safeCommentId, lastAction };
  } catch (error) {
    console.error('Error updating comment by owner:', error);
    return null;
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
const FLOW_MONOBANK_CACHE_KEY = 'flow:monobank-uah-rates:v1';
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

const parseMonobankPairRate = pair => {
  if (!pair || typeof pair !== 'object') return null;
  const cross = Number(pair.rateCross);
  if (Number.isFinite(cross) && cross > 0) return { value: cross, source: 'cross' };

  const buy = Number(pair.rateBuy);
  const sell = Number(pair.rateSell);
  if (Number.isFinite(buy) && buy > 0 && Number.isFinite(sell) && sell > 0) {
    return { value: (buy + sell) / 2, source: 'mid' };
  }

  if (Number.isFinite(sell) && sell > 0) return { value: sell, source: 'sell' };
  if (Number.isFinite(buy) && buy > 0) return { value: buy, source: 'buy' };
  return null;
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
  const directRate = parseMonobankPairRate(directPair);
  if (Number.isFinite(directRate?.value) && directRate.value > 0) {
    return {
      value: directRate.value,
      source: directRate.source,
      pairDate: parseMonobankPairDate(directPair),
    };
  }

  const reversePair = pairs.find(
    pair => Number(pair?.currencyCodeA) === UAH_CURRENCY_CODE && Number(pair?.currencyCodeB) === sourceCode
  );
  const reverseRate = parseMonobankPairRate(reversePair);
  if (Number.isFinite(reverseRate?.value) && reverseRate.value > 0) {
    return {
      value: 1 / reverseRate.value,
      source: reverseRate.source === 'mid' ? 'mid-inverted' : `${reverseRate.source}-inverted`,
      pairDate: parseMonobankPairDate(reversePair),
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

const formatFlowStoredCurrencyAmount = value => {
  const normalized = normalizeFlowStoredAmount(value);
  const asNumber = Number(normalized);
  if (!Number.isFinite(asNumber)) return normalized;
  return asNumber.toFixed(2);
};

export const saveFlowEntry = async ({ ownerId, groupPath, date, amount, description = '', exchangeRates }) => {
  if (!ownerId || !groupPath || !date || !amount) return;
  const datePath = buildFlowDatePath({ groupPath, date });
  if (!datePath) return;
  const normalizedAmountUah = normalizeFlowStoredAmount(amount);
  const amountUahNumber = Number(normalizedAmountUah);
  let effectiveRates = exchangeRates;
  if (Number.isFinite(amountUahNumber) && isValidFlowDateYmd(date)) {
    try {
      effectiveRates = (await fetchNbuUahExchangeRatesByDate(date)) || exchangeRates;
    } catch (error) {
      console.error(`Unable to load historical FX rates for ${date}`, error);
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
  const amountPayload = [normalizedAmountUah, amountUsd, amountEur].join('/');
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

export const fetchUsersByIds = async ids => {
  try {
    const snaps = await Promise.all(
      ids.map(id =>
        Promise.all([
          get(ref2(database, `newUsers/${id}`)),
          get(ref2(database, `users/${id}`)),
        ]).then(([newSnap, userSnap]) => {
          const data = {
            userId: id,
            ...(newSnap.exists() ? newSnap.val() : {}),
            ...(userSnap.exists() ? userSnap.val() : {}),
          };
          return Object.keys(data).length > 1 ? [id, data] : null;
        })
      )
    );
    const result = {};
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

const addUserFromUsers = async (userId, users) => {
  const userSnap = await get(ref2(database, `users/${userId}`));
  const newUserSnap = await get(ref2(database, `newUsers/${userId}`));

  const userData = userSnap.exists() ? userSnap.val() : {};
  const newUserData = newUserSnap.exists() ? newUserSnap.val() : {};

  if (userSnap.exists() || newUserSnap.exists()) {
    users[userId] = {
      userId,
      ...newUserData,
      ...userData,
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
  const { searchIdPrefixes } = options;
  const { searchKey, searchValue, modifiedSearchValue } = makeSearchKeyValue(searchedValue);
  const shouldSkipBroadFallback = shouldSkipBroadFallbackForExactSearchId(searchKey, options);
  const searchIdOptions = shouldSkipBroadFallback
    ? { includeVariants: false, includePrefixMatches: true, includeAdaptedPhoneVariant: true }
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

  if (searchMeta) {
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
  const isoMatch = /^(\d{4})[-./\\](\d{2})[-./\\](\d{2})$/;
  const dmyMatch = /^(\d{2})[-./\\](\d{2})[-./\\](\d{4})$/;
  let yyyy, mm, dd;

  if (isoMatch.test(trimmed)) {
    [, yyyy, mm, dd] = trimmed.match(isoMatch);
  } else if (dmyMatch.test(trimmed)) {
    [, dd, mm, yyyy] = trimmed.match(dmyMatch);
  } else {
    return [];
  }

  return [`${yyyy}-${mm}-${dd}`, `${dd}.${mm}.${yyyy}`];
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

          // eslint-disable-next-line no-await-in-loop
          const snapshot = await get(
            query(ref2(database, collection), orderByChild(key), equalTo(candidate))
          );

          if (snapshot.exists()) {
            snapshot.forEach(userSnapshot => {
              const userId = userSnapshot.key;
              if (uniqueUserIds.has(userId)) return;

              uniqueUserIds.add(userId);
              promises.push(addUserToResults(userId, users));
            });
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
    const shouldTryExactMatch = ['email', 'telegram', 'phone', 'instagram', 'facebook', 'tiktok', 'vk'].includes(prefix);

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
    forcePartialUserIdSearch = false,
    allowTelegramPrefixMatches = false,
  } = options;
  if (isDev) console.log('fetchNewUsersCollectionInRTDB → searchedValue:', searchedValue);
  const { searchKey, searchValue, modifiedSearchValue } = makeSearchKeyValue(searchedValue);
  const shouldSkipBroadFallback = shouldSkipBroadFallbackForExactSearchId(searchKey, options);
  const searchIdOptions = shouldSkipBroadFallback
    ? { includeVariants: false, includePrefixMatches: true, includeAdaptedPhoneVariant: true }
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

    // Для exact-пошуку по searchId не запускаємо date-пошук по полях картки
    // (getInTouch/lastAction/...): інакше запити на кшталт
    // "УК СМ Лилит 12.04.2026" можуть некоректно підтягувати date-збіги.
    const isDateSearch = searchKey === 'searchId'
      ? false
      : await searchByDate(searchValue, uniqueUserIds, users);
    if (isDev) console.log('fetchNewUsersCollectionInRTDB → isDateSearch:', isDateSearch);
    if (!isDateSearch) {
      if (forcePartialUserIdSearch) {
        await searchUserByPartialUserId(searchValue, users);
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
  const cleanedUploadedInfo = removeUndefined(uploadedInfo);
  const keysToDelete = delCondition ? Object.keys(delCondition) : [];
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
    const cleanedUploadedInfo = removeUndefined(uploadedInfo);
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
    const cleanedUploadedInfo = removeUndefined(uploadedInfo);

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

export const getAllUserPhotos = async userId => {
  try {
    const folderRef = ref(storage, `avatar/${userId}`);
    const list = await listAll(folderRef);
    const urls = await Promise.all(list.items.map(item => getDownloadURL(item)));
    return filterOutMedicationPhotos(urls, userId);
  } catch (error) {
    console.error('Error listing user photos:', error);
    return [];
  }
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

    if (searchKey === 'getInTouch' || searchKey === 'lastAction') {
      if (isDev) console.log('Пропускаємо непотрібні ключі :>> ', searchKey);
      return;
    }

    const normalizedValue = String(searchValue).toLowerCase();
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

export const syncUserSearchIdIndex = async (userId, prevData = {}, nextData = {}) => {
  if (!userId) return;

  for (const key of keysToCheck) {
    if (key === 'getInTouch' || key === 'lastAction') continue;

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

const parseImtNumber = rawValue => {
  const values = [...normalizeMetricIndexValues(rawValue)];
  const firstNumericValue = values.find(value => value !== 'no' && value !== '?');
  if (!firstNumericValue) return null;
  const parsedValue = Number.parseFloat(String(firstNumericValue).replace(',', '.'));
  if (!Number.isFinite(parsedValue) || parsedValue <= 0) return null;
  return parsedValue;
};

const normalizeImtSearchKeyIndexValue = data => {
  if (!data || typeof data !== 'object') return 'no';

  const explicitImt = parseImtNumber(data.imt);
  let imtValue = explicitImt;

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
    const hasAnyAnthropometry = String(data.imt ?? '').trim() || String(data.weight ?? '').trim() || String(data.height ?? '').trim();
    return hasAnyAnthropometry ? '?' : 'no';
  }

  const roundedImt = Math.round(imtValue);
  if (roundedImt <= 28) return 'le28';
  if (roundedImt <= 31) return '29_31';
  if (roundedImt <= 35) return '32_35';
  return '36_plus';
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

const isBucketAllowedByFilters = (bucket, filterSettings = {}) => {
  const { bloodGroup, rh } = getBloodBucketMeta(bucket);
  const bloodGroupFilters = filterSettings?.bloodGroup;
  const rhFilters = filterSettings?.rh;

  const shouldApplyBloodGroup = hasExplicitFilterSelection(bloodGroupFilters);
  const shouldApplyRh = hasExplicitFilterSelection(rhFilters);

  const bloodGroupAllowed = shouldApplyBloodGroup ? Boolean(bloodGroupFilters?.[bloodGroup]) : true;
  const rhAllowed = shouldApplyRh ? Boolean(rhFilters?.[rh]) : true;

  return bloodGroupAllowed && rhAllowed;
};

const MARITAL_STATUS_SEARCH_KEY_BUCKETS = ['+', '-', '?', 'no'];
const CONTACT_SEARCH_KEY_BUCKETS = ['vk', 'instagram', 'facebook', 'phone', 'telegram', 'telegram2', 'tiktok', 'email'];
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

const collectAgeIdsByFilters = async (ageFilters, rootPaths = [SEARCH_KEY_INDEX_ROOT]) => {
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

  rootPaths.forEach(rootPath => {
    if (selected('le25')) addRangeRequest(getBirthDateRangeByAge({ maxAge: 25 }), rootPath);
    if (selected('26_30')) addRangeRequest(getBirthDateRangeByAge({ minAge: 26, maxAge: 30 }), rootPath);
    if (selected('31_33')) addRangeRequest(getBirthDateRangeByAge({ minAge: 31, maxAge: 33 }), rootPath);
    if (selected('34_36')) addRangeRequest(getBirthDateRangeByAge({ minAge: 34, maxAge: 36 }), rootPath);
    if (selected('37_42')) addRangeRequest(getBirthDateRangeByAge({ minAge: 37, maxAge: 42 }), rootPath);
    if (selected('43_plus')) addRangeRequest(getBirthDateRangeByAge({ minAge: 43 }), rootPath);
    if (selected('other')) requests.push(get(ref2(database, `${rootPath}/${AGE_SEARCH_KEY_INDEX}/?`)));
    if (selected('empty')) requests.push(get(ref2(database, `${rootPath}/${AGE_SEARCH_KEY_INDEX}/no`)));
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

const resolveSearchKeyLeafPath = (rootPath, indexName, value, userId) => {
  const safeRootPath = rootPath || SEARCH_KEY_INDEX_ROOT;
  return `${safeRootPath}/${indexName}/${value}/${userId}`;
};

const updateSearchKeyLeaf = async (indexName, value, userId, action, options = {}) => {
  if (!indexName || !value || !userId) return;
  const indexRef = ref2(database, resolveSearchKeyLeafPath(options?.rootPath, indexName, value, userId));

  if (action === 'add') {
    await set(indexRef, true);
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
        const imtValue = normalizeImtSearchKeyIndexValue(user);
        const heightValues = normalizeMetricIndexValues(user.height);
        const weightValues = normalizeMetricIndexValues(user.weight);
        acc[`${searchKeyRoot}/${IMT_SEARCH_KEY_INDEX}/${imtValue}/${userId}`] = true;
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
};

export const createSelectedSearchKeyIndexesInCollection = async (collection, indexTypes = [], onProgress, options = {}) => {
  if (!collection || !Array.isArray(indexTypes) || indexTypes.length === 0) return;

  const uniqueIndexTypes = [...new Set(indexTypes)].filter(indexType => SEARCH_KEY_INDEX_BUILDERS[indexType]);
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
        if (key === 'getInTouch' || key === 'lastAction') return;
        const candidates = extractIndexableFieldValues(userData[key]).flatMap(value =>
          buildSearchIndexCandidates(key, value)
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
      { indexName: IMT_SEARCH_KEY_INDEX, values: [normalizeImtSearchKeyIndexValue(userData)] },
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
  return [];
};

export const buildSearchKeyIndexPayloadFromCollections = (collectionsMap, indexTypes = []) => {
  const uniqueIndexTypes = [...new Set(indexTypes)].filter(indexType => Boolean(SEARCH_KEY_INDEX_BUILDERS[indexType]));
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

export const fetchUsersBySearchKeyBloodPaged = async ({
  filterSettings = {},
  offset = 0,
  limit = PAGE_SIZE,
  favoritesMap = {},
  dislikedMap = {},
} = {}) => {
  const searchKeyRoots = [SEARCH_KEY_INDEX_ROOT, SEARCH_KEY_USERS_INDEX_ROOT];
  const filteredBuckets = BLOOD_SEARCH_KEY_BUCKETS.filter(bucket => isBucketAllowedByFilters(bucket, filterSettings));
  const filteredMaritalStatusBuckets = MARITAL_STATUS_SEARCH_KEY_BUCKETS.filter(bucket =>
    isMaritalStatusBucketAllowedByFilters(bucket, filterSettings)
  );
  const filteredContactBuckets = CONTACT_SEARCH_KEY_BUCKETS.filter(bucket =>
    isContactBucketAllowedByFilters(bucket, filterSettings)
  );
  const filteredRoleBuckets = ROLE_SEARCH_KEY_BUCKETS.filter(bucket => isRoleBucketAllowedByFilters(bucket, filterSettings));
  const filteredUserIdBuckets = USER_ID_SEARCH_KEY_BUCKETS.filter(bucket =>
    isUserIdBucketAllowedByFilters(bucket, filterSettings)
  );
  const filteredImtBuckets = IMT_SEARCH_KEY_BUCKETS.filter(bucket => {
    const imtFilters = filterSettings?.imt;
    const shouldApplyImt = hasExplicitFilterSelection(imtFilters);
    if (!shouldApplyImt) return true;
    const filterKey = bucket === '?' ? 'other' : bucket;
    return Boolean(imtFilters?.[filterKey]);
  });
  const ageUserIds = await collectAgeIdsByFilters(filterSettings?.age, searchKeyRoots);
  const imtUserIds = await collectImtIdsByFilters(filterSettings?.imt, searchKeyRoots);
  const heightUserIds = await collectHeightIdsByFilters(filterSettings?.height, searchKeyRoots);
  const fieldCountUserIds = await collectFieldCountIdsByFilters(filterSettings?.fields, searchKeyRoots);
  const reactionUserIds = await collectReactionIdsByFilters(filterSettings?.reaction, {
    favoritesMap,
    dislikedMap,
  }, searchKeyRoots);

  const [bucketSnapshots, maritalStatusSnapshots, contactSnapshots, roleSnapshots, userIdSnapshots, imtSnapshots] = await Promise.all([
    Promise.all(
      searchKeyRoots.flatMap(rootPath =>
        filteredBuckets.map(bucket => get(ref2(database, `${rootPath}/${BLOOD_SEARCH_KEY_INDEX}/${bucket}`)))
      )
    ),
    Promise.all(
      searchKeyRoots.flatMap(rootPath =>
        filteredMaritalStatusBuckets.map(bucket =>
          get(ref2(database, `${rootPath}/${MARITAL_STATUS_SEARCH_KEY_INDEX}/${bucket}`))
        )
      )
    ),
    Promise.all(
      searchKeyRoots.flatMap(rootPath =>
        filteredContactBuckets.map(bucket =>
          get(ref2(database, `${rootPath}/${CONTACT_SEARCH_KEY_INDEX}/${bucket}`))
        )
      )
    ),
    Promise.all(
      searchKeyRoots.flatMap(rootPath =>
        filteredRoleBuckets.map(bucket =>
          get(ref2(database, `${rootPath}/${ROLE_SEARCH_KEY_INDEX}/${bucket}`))
        )
      )
    ),
    Promise.all(
      searchKeyRoots.flatMap(rootPath =>
        filteredUserIdBuckets.map(bucket =>
          get(ref2(database, `${rootPath}/${USER_ID_SEARCH_KEY_INDEX}/${bucket}`))
        )
      )
    ),
    Promise.all(
      searchKeyRoots.flatMap(rootPath =>
        filteredImtBuckets.map(bucket =>
          get(ref2(database, `${rootPath}/${IMT_SEARCH_KEY_INDEX}/${bucket}`))
        )
      )
    ),
  ]);

  const collectIdsFromSnapshots = snapshots => {
    const ids = new Set();
    snapshots.forEach(snapshot => {
      if (!snapshot.exists()) return;
      Object.keys(snapshot.val() || {}).forEach(id => {
        if (!id) return;
        ids.add(id);
      });
    });
    return ids;
  };

  const bloodUserIds = collectIdsFromSnapshots(bucketSnapshots);
  const maritalStatusUserIds = collectIdsFromSnapshots(maritalStatusSnapshots);
  const contactUserIds = collectIdsFromSnapshots(contactSnapshots);
  const roleUserIds = collectIdsFromSnapshots(roleSnapshots);
  const userIdUserIds = collectIdsFromSnapshots(userIdSnapshots);
  const indexedImtUserIds = collectIdsFromSnapshots(imtSnapshots);
  const shouldApplyMaritalStatusFilter = hasExplicitFilterSelection(filterSettings?.maritalStatus);
  const shouldApplyContactFilter = hasExplicitFilterSelection(filterSettings?.contact);
  const shouldApplyRoleFilter = hasExplicitFilterSelection(filterSettings?.role);
  const shouldApplyUserIdFilter = hasExplicitFilterSelection(filterSettings?.userId);
  const shouldApplyAgeFilter = ageUserIds instanceof Set;
  const shouldApplyImtFilter = imtUserIds instanceof Set;
  const shouldApplyHeightFilter = heightUserIds instanceof Set;
  const shouldApplyFieldCountFilter = fieldCountUserIds instanceof Set;
  const shouldApplyReactionFilter = reactionUserIds instanceof Set;

  let finalIds = [...bloodUserIds];
  if (shouldApplyMaritalStatusFilter) {
    finalIds = finalIds.filter(id => maritalStatusUserIds.has(id));
  }
  if (shouldApplyContactFilter) {
    finalIds = finalIds.filter(id => contactUserIds.has(id));
  }
  if (shouldApplyRoleFilter) {
    finalIds = finalIds.filter(id => roleUserIds.has(id));
  }
  if (shouldApplyUserIdFilter) {
    finalIds = finalIds.filter(id => userIdUserIds.has(id));
  }
  if (shouldApplyAgeFilter) {
    finalIds = finalIds.filter(id => ageUserIds.has(id));
  }
  if (shouldApplyImtFilter) {
    finalIds = finalIds.filter(id => imtUserIds.has(id));
  } else if (hasExplicitFilterSelection(filterSettings?.imt)) {
    finalIds = finalIds.filter(id => indexedImtUserIds.has(id));
  }
  if (shouldApplyHeightFilter) {
    finalIds = finalIds.filter(id => heightUserIds.has(id));
  }
  if (shouldApplyFieldCountFilter) {
    finalIds = finalIds.filter(id => fieldCountUserIds.has(id));
  }
  if (shouldApplyReactionFilter) {
    finalIds = finalIds.filter(id => reactionUserIds.has(id));
  }

  const sortedIds = [...finalIds].sort((a, b) => a.localeCompare(b));
  const pageIds = sortedIds.slice(offset, offset + limit);
  const users = await fetchUsersByIds(pageIds);
  const nextOffset = offset + pageIds.length;
  const hasMore = nextOffset < sortedIds.length;

  return {
    users,
    lastKey: nextOffset,
    hasMore,
    totalCount: sortedIds.length,
    loadedIds: pageIds,
  };
};

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
  const normalizedValue = String(searchValue).toLowerCase();
  const searchIdKey = `${searchKey}_${encodeKey(normalizedValue)}`; // Формуємо ключ для пошуку у searchId
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

const getRoleCategory = value => {
  const role = (value.role || value.userRole || '').toString().trim().toLowerCase();
  if (!role) return 'other';
  if (['ed'].includes(role)) return 'ed';
  if (['sm'].includes(role)) return 'sm';
  if (role === 'ag') return 'ag';
  if (role === 'ip') return 'ip';
  if (role === 'cl') return 'cl';
  return 'other';
};

const getUserRoleCategory = value => {
  const role = (value.userRole || '').toString().trim().toLowerCase();
  if (!role) return 'other';
  if (role === 'ed') return 'ed';
  if (role === 'ag') return 'ag';
  if (role === 'ip') return 'ip';
  return 'other';
};

const getMaritalStatusCategory = value => {
  if (!value.maritalStatus || typeof value.maritalStatus !== 'string') return 'other';
  const m = value.maritalStatus.trim().toLowerCase();
  if (['yes', 'так', '+', 'married', 'одружена', 'заміжня'].includes(m)) return 'married';
  if (['no', 'ні', '-', 'unmarried', 'single', 'незаміжня'].includes(m)) return 'unmarried';
  return 'other';
};

const getBloodGroupCategory = value => {
  const b = (value.blood || '').toString().trim().toLowerCase().replace(/\s+/g, '');
  if (/^[1234]/.test(b)) return b[0];
  return 'other';
};

const getRhCategory = value => {
  const b = (value.blood || '').toString().trim().toLowerCase().replace(/\s+/g, '');
  if (b.endsWith('+') || b === '+') return '+';
  if (b.endsWith('-') || b === '-') return '-';
  if (/^[1-4]$/.test(b)) return 'empty';
  if (!b) return 'empty';
  return 'other';
};

const getAgeCategory = value => {
  if (!value.birth || typeof value.birth !== 'string') return 'other';
  const birthParts = value.birth.split('.');
  const birthYear = parseInt(birthParts[2], 10);
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
  if (hasContactValue(data.facebook)) contactSet.add('facebook');
  if (hasContactValue(data.phone)) contactSet.add('phone');
  if (hasTelegramNonUk(data.telegram)) contactSet.add('telegram');
  if (getTelegramValues(data.telegram).some(item => item.toLowerCase().startsWith('ук'))) {
    contactSet.add('telegram2');
  }
  if (hasContactValue(data.tiktok)) contactSet.add('tiktok');
  if (hasContactValue(data.email)) contactSet.add('email');

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
  const parsedHeight = Number.parseFloat(
    String(value?.height ?? '')
      .trim()
      .replace(',', '.')
  );
  return getHeightFilterBucket(parsedHeight);
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
) => {
  console.log('filterMain called with', {
    filterForload,
    filterSettings,
    usersCount: usersData.length,
  });

  const filteredUsers = usersData.filter(([key, value]) => {
    const userId = value.userId || key;
    let filters = {};
    if (filterForload === 'ED') {
      // Якщо filterForload === ED, використовуємо додаткові фільтри
      Object.assign(filters, {
        filterByUserRole: filterByUserRole(value),
        filterByUserIdLength: filterByUserIdLength(userId),
        filterByAge: filterByAge(value, 30),
      });
    }

    if (filterSettings.csection && Object.values(filterSettings.csection).some(v => !v)) {
      const cat = categorizeCsection(value.csection);
      filters.csection = !!filterSettings.csection[cat];
    }

    if (filterSettings.userRole && Object.values(filterSettings.userRole).some(v => !v)) {
      const cat = getUserRoleCategory(value);
      filters.userRole = !!filterSettings.userRole[cat];
    } else if (filterSettings.role && Object.values(filterSettings.role).some(v => !v)) {
      const cat = getRoleCategory(value);
      filters.role = !!filterSettings.role[cat];
    }

    if (filterSettings.maritalStatus && Object.values(filterSettings.maritalStatus).some(v => !v)) {
      const cat = getMaritalStatusCategory(value);
      filters.maritalStatus = !!filterSettings.maritalStatus[cat];
    }

    if (filterSettings.bloodGroup && Object.values(filterSettings.bloodGroup).some(v => !v)) {
      const cat = getBloodGroupCategory(value);
      filters.bloodGroup = !!filterSettings.bloodGroup[cat];
    }

    if (filterSettings.rh && Object.values(filterSettings.rh).some(v => !v)) {
      const cat = getRhCategory(value);
      filters.rh = !!filterSettings.rh[cat];
    }

    if (filterSettings.age && Object.values(filterSettings.age).some(v => !v)) {
      const cat = getAgeCategory(value);
      if (Object.prototype.hasOwnProperty.call(filterSettings.age, '37_plus')) {
        if (cat === '37_42' || cat === '43_plus') {
          filters.age = !!filterSettings.age['37_plus'];
        } else {
          filters.age = !!filterSettings.age[cat];
        }
      } else {
        filters.age = !!filterSettings.age[cat];
      }
    }

    if (filterSettings.contact && Object.values(filterSettings.contact).some(v => !v)) {
      const contactMap = {
        vk: hasContactValue(value.vk),
        instagram: hasContactValue(value.instagram),
        facebook: hasContactValue(value.facebook),
        phone: hasContactValue(value.phone),
        telegram: hasTelegramNonUk(value.telegram),
        telegram2: isTelegramUkOnly(value.telegram),
        tiktok: hasContactValue(value.tiktok),
        email: hasContactValue(value.email),
      };
      const allowedContacts = Object.entries(filterSettings.contact)
        .filter(([, isAllowed]) => isAllowed)
        .map(([key]) => key);
      filters.contact = allowedContacts.some(key => contactMap[key]);
    }

    if (filterSettings.bmi && Object.values(filterSettings.bmi).some(v => !v)) {
      const cat = getBmiCategory(value);
      filters.bmi = !!filterSettings.bmi[cat];
    }

    if (filterSettings.imt && Object.values(filterSettings.imt).some(v => !v)) {
      const cat = getImtCategory(value);
      filters.imt = !!filterSettings.imt[cat];
    }

    if (filterSettings.height && Object.values(filterSettings.height).some(v => !v)) {
      const cat = getHeightCategory(value);
      filters.height = !!filterSettings.height[cat];
    }

    if (filterSettings.country && Object.values(filterSettings.country).some(v => !v)) {
      const cat = getCountryCategory(value);
      filters.country = !!filterSettings.country[cat];
    }

    if (filterSettings.userId && Object.values(filterSettings.userId).some(v => !v)) {
      const cat = getUserIdCategory(userId);
      filters.userId = !!filterSettings.userId[cat];
    }

    if (filterSettings.fields && Object.values(filterSettings.fields).some(v => !v)) {
      const cat = getFieldCountCategory(value);
      filters.fields = !!filterSettings.fields[cat];
    }

    if (filterSettings.commentLength && Object.values(filterSettings.commentLength).some(v => !v)) {
      const cat = getCommentLengthCategory(value.myComment);
      filters.commentLength = !!filterSettings.commentLength[cat];
    }

    if (filterSettings.favorite && filterSettings.favorite.favOnly) {
      filters.favorite = isFavoriteUser(userId, favoriteUsers);
    }

    if (filterSettings.reaction && Object.values(filterSettings.reaction).some(v => !v)) {
      const reactionCategory = getReactionCategory(value, favoriteUsers, dislikedUsers);
      filters.reaction = !!filterSettings.reaction[reactionCategory];
    }

    const failedFilters = Object.entries(filters).filter(([, result]) => !result);

    if (failedFilters.length > 0) {
      // console.log(`User excluded by filter: ${key}`);
      failedFilters.forEach(() => {
        // console.log(`Failed filter`);
      });
    }

    return failedFilters.length === 0;
  });

  return filteredUsers;
};

// Функція для перевірки формату дати (dd.mm.ррр)
// Перевірка коректності дати
const isValidDate = date => {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !isNaN(new Date(date).getTime());
};

// Сортування
const sortUsers = (
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

    let totalCount;
    if (!lastKey) {
      totalCount = await fetchTotalFilteredUsersCount(
        filterForload,
        filterSettings,
        favoriteUsers,
        options,
      );
    }

    return {
      users: finalUsers,
      lastKey: nextKey,
      hasMore: !!nextKey,
      totalCount,
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
      const photos = await getAllUserPhotos(userId);
      const userSnapshotInUsers = await get(ref2(db, `users/${userId}`));
      if (userSnapshotInUsers.exists()) {
        return {
          userId,
          ...userSnapshotInUsers.val(),
          ...newUserSnapshot.val(),
          photos,
        };
      }
      return {
        userId,
        ...newUserSnapshot.val(),
        photos,
      };
    }

    // Пошук у users, якщо не знайдено в newUsers
    const userSnapshot = await get(userRefInUsers);
    if (userSnapshot.exists()) {
      const photos = await getAllUserPhotos(userId);
      console.log('Знайдено користувача у users: ', userSnapshot.val());
      return {
        userId,
        ...userSnapshot.val(),
        photos,
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
      'deviceHeight',
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
          ...newUserRaw,
          ...(usersData[userId] || {}),
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

export const fetchTotalFilteredUsersCount = async (
  filterForload,
  filterSettings = {},
  favoriteUsers = {},
  options = {},
) => {
  const allUsers = await fetchAllFilteredUsers(
    filterForload,
    filterSettings,
    favoriteUsers,
    options,
  );
  return Object.keys(allUsers).length;
};

export const fetchTotalNewUsersCount = async () => {
  try {
    const snapshot = await get(ref2(database, 'newUsers'));
    if (snapshot.exists()) {
      const data = snapshot.val();
      return Object.keys(data).length;
    }
    return 0;
  } catch (error) {
    console.error('Error fetching total newUsers count:', error);
    return 0;
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
          ...newUserRaw,
          ...(usersData[userId] || {}),
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
  return { data: Object.fromEntries(sliced), totalCount: result.length };
}

export { fetchFilteredUsersByPage } from './dateLoad';
export { fetchUsersByLastLoginPaged } from './lastLoginLoad';
export { fetchUsersByLastActionPaged } from './lastActionLoad';
