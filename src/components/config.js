import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { collection, doc, getDoc as firebaseGetDoc, getDocs as firebaseGetDocs, getFirestore, setDoc, updateDoc, deleteField } from 'firebase/firestore';
import { getDownloadURL as firebaseGetDownloadURL, getStorage, uploadBytes, ref, deleteObject, listAll as firebaseListAll, getBytes } from 'firebase/storage';
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
  orderByValue,
  startAfter,
  limitToFirst,
  limitToLast,
  startAt,
  endAt,
  endBefore,
  equalTo,
  serverTimestamp,
  runTransaction,
} from 'firebase/database';
import { PAGE_SIZE, BATCH_SIZE, MEDICATION_SCHEDULE_CLEANUP_DAY_LIMIT } from './constants';
import { filterOutMedicationPhotos } from '../utils/photoFilters';
import { convertDriveLinkToImage } from '../utils/convertDriveLinkToImage';
import { getCurrentDate } from './foramtDate';
import { formatDateToDisplay, formatDateToServer } from './inputValidations';
import toast from 'react-hot-toast';
import { clearEmptySearchQueryCache, getCard, incrementMatchingLoadStat, removeCard, setIdsForQuery, normalizeQueryKey } from '../utils/cardIndex';
import { updateCard } from '../utils/cardsStorage';
import {
  SEARCH_QUERIES_ROOT_PATH,
  encodeSearchQueryKey,
  isTypingContinuation,
  normalizeSearchQuery,
  shouldStoreSearchQuery,
} from '../utils/searchQueryStorage';
import { parseUkTriggerQuery } from '../utils/parseUkTrigger';
import { getCacheKey } from '../utils/cache';
import { getReactionCategory, isGetInTouchDateOnOrBeforeToday } from 'utils/reactionCategory';
import { buildSearchIndexCandidates, encodeKey } from '../utils/searchIndexCandidates';
import { getExplicitlyDeletedKeys, getSubmittedSearchIndexKeys } from '../utils/searchIndexSync';
import {
  SEARCH_ID_INDEXED_FIELDS,
  buildSearchIdCandidateKeys,
  buildSearchIdRecordKey,
  getEqualToCandidates,
  makeSearchKeyValue,
  normalizeSearchIdInput,
  normalizeSearchDateComparableValue,
  shouldSkipBroadFallbackForExactSearchId,
  splitSearchIdCandidateKeys,
} from '../utils/searchKeyUtils';
import { isAdminUid } from '../utils/accessLevel';
import { resolveEqualToSearchKeys } from '../utils/searchKeyCheckboxFilters';
import { resolveProfileFieldCountBucket } from '../utils/fieldCountBuckets';
import { buildProfileNodePatch } from '../utils/profileNodeWriter';
import { mergeProfileNodes, hasAnyProfileNode } from '../utils/profileNodeMerge';
import { mergeProfileNodeCollections, PROFILE_NODE_NAMES } from '../utils/profileNodeCollections';
import { PROFILE_NODES, resolveFieldOwnerNode } from '../utils/profileNodeSchema';
import {
  MATCHING_CARDS_ROOT,
  MATCHING_CARD_ORDER_FIELD,
  areMatchingCardProjectionsEqual,
  buildMatchingCardProjection,
  expandMatchingCard,
  isCurrentMatchingCardSchema,
  isMatchingSummaryCard,
  resolveMatchingCardAvatarFromProfile,
} from '../utils/matchingCardIndex';
import {
  AGE_BUCKET_FILTER_KEYS,
  SEARCH_KEY_EMPTY_BUCKET,
  resolveBmiBucket,
  resolveCountryBucket,
  isBucketSelectedByFilterGroup,
  planSearchKeyBucketRead,
  withoutEmptySearchKeyBucket,
} from '../utils/searchKeyBuckets';
import { searchByIndexOn } from './searchByIndexOn';
import { withAdminDownloadToast } from '../utils/backendDownloadToast';
import { normalizeProfileRole } from '../utils/profileRole';

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
const BMI_SEARCH_KEY_INDEX = 'bmi';
const COUNTRY_SEARCH_KEY_INDEX = 'country';
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
  bmi: BMI_SEARCH_KEY_INDEX,
  country: COUNTRY_SEARCH_KEY_INDEX,
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

/**
 * Уся анкетна база, зібрана з нових вузлів — під перебудову індексів.
 *
 * Індекси мусять будуватись із того ж джерела, з якого читає застосунок.
 * Інакше перебудова індексувала б значення, яких веб уже не показує, а пошук
 * віддавав би порожню видачу.
 *
 * `publish` — єдиний виняток, і він свідомий: власного вузла в нього немає, ним
 * володіє мобільний застосунок, і лежить він у `/users`. Тож саме звідти він і
 * береться, а `feedDate` у картці рахується з нього.
 *
 * Читання важке (пʼять вузлів цілком), але це разова адмінська операція, а не
 * шлях користувача — і саме тому воно йде через той самий кеш колекцій, що й
 * решта індексацій.
 */
export const loadProfilesFromNodesForIndexing = async (options = {}) => {
  const [nodeMaps, legacyUsers] = await Promise.all([
    Promise.all(PROFILE_NODE_NAMES.map(node => loadCollectionWithIndexCache(node, options))),
    // Тільки заради `publish`: власного вузла в нього немає, ним володіє
    // мобільний застосунок. Якщо `users` уже прибрали — читання просто дасть
    // порожньо, і стан публікації візьметься з `feedDate` у картці.
    loadCollectionWithIndexCache('users', options),
  ]);

  const sources = Object.fromEntries(PROFILE_NODE_NAMES.map((node, index) => [node, nodeMaps[index]]));
  // Колекція у вебі одна: сюди приходять усі анкети, а не «анкети деки».
  const { profiles } = mergeProfileNodeCollections({ ...sources, users: legacyUsers });

  return Object.keys(profiles).length ? profiles : null;
};

// Відмова в правах приходить то кодом, то текстом — залежно від виклику.
const isSearchIdPermissionDenied = error => {
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  return code.includes('permission-denied')
    || code.includes('permission_denied')
    || message.includes('permission_denied')
    || message.includes('permission denied');
};

const collectUserIdsBySearchIdKeys = async (searchKeys, options = {}) => {
  const uniqueIds = new Set();
  const { includePrefixMatches = true, rawSearchValue = '' } = options;
  const addIds = value => {
    const ids = Array.isArray(value) ? value : [value];

    ids.forEach(id => {
      if (id) {
        uniqueIds.add(id);
      }
    });
  };

  const readKeys = async keys => {
    if (!keys.length) return;
    incrementMatchingLoadStat('searchIdKeyReads', keys.length);
    await Promise.all(
      keys.map(async searchKey => {
        const searchEntrySnapshot = await get(ref2(database, `searchId/${searchKey}`));
        if (!searchEntrySnapshot.exists()) return;

        addIds(searchEntrySnapshot.val());
      })
    );
  };

  // Перша черга — ключі, які відповідають формі запиту; друга потрібна лише
  // тоді, коли перша не знайшла нічого. Див. `splitSearchIdCandidateKeys`.
  const { primary, fallback } = splitSearchIdCandidateKeys(searchKeys, rawSearchValue);
  await readKeys(primary);
  if (!uniqueIds.size) await readKeys(fallback);

  const uniqueSearchKeys = [...new Set(searchKeys)];

  // Точний ключ уже прочитаний — далі йде тільки розширення пошуку по префіксу,
  // а воно сканує вузол `searchId`, право на що є лише в адмінів. Тому для
  // решти читачів цей крок навіть не починається: раніше він щоразу давав по
  // запиту на кожен ключ, і кожен закономірно повертався з PERMISSION_DENIED —
  // трафік і затримка за відповідь, у якій нічого немає.
  //
  // `try/catch` нижче лишається: права можуть змінитись, і відмова в
  // необовʼязковому кроці не має губити те, що вже знайдено за точним ключем.
  if (includePrefixMatches && isAdminUid(auth.currentUser?.uid)) {
    await Promise.all(
      uniqueSearchKeys.map(async searchKey => {
        try {
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
        } catch (error) {
          // Будь-яка інша помилка — не про права, і ховати її не можна.
          if (!isSearchIdPermissionDenied(error)) throw error;
        }
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

const getUploadFileExtension = file => {
  const originalExtension = String(file?.name || '').split('.').pop();
  if (originalExtension && originalExtension !== file?.name) {
    return originalExtension.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'jpg';
  }

  const mimeExtension = String(file?.type || '').split('/').pop();
  return mimeExtension ? mimeExtension.replace(/[^a-z0-9]/gi, '').toLowerCase() : 'jpg';
};

export const uploadFileToStorageFolder = async (photo, folderPath, options = {}) => {
  const { disableCompression = false, maxSizeKB = 1024 } = options;
  const file = shouldKeepOriginalUpload(photo, disableCompression, maxSizeKB)
    ? photo
    : await getFileBlob(await compressPhoto(photo, maxSizeKB));

  const uniqueId = generateUploadFileId();
  const fileName = `${uniqueId}.${getUploadFileExtension(file)}`;
  const normalizedFolder = String(folderPath || '').split('/').filter(Boolean).join('/');
  const filePath = `${normalizedFolder}/${fileName}`;
  const linkToFile = ref(storage, filePath);
  await uploadBytes(linkToFile, file);
  return { fileName, filePath };
};

// File names (not URLs) directly under a Storage folder. Documents Builder clinic logos use
// the Storage folder itself as the source of truth instead of mirroring names into Realtime DB.
export const listStorageFolderFileNames = async folderPath => {
  const normalizedFolder = String(folderPath || '').split('/').filter(Boolean).join('/');
  if (!normalizedFolder) return [];
  const list = await listAll(ref(storage, normalizedFolder));
  return list.items.map(item => item.name).filter(Boolean);
};

export const deleteStorageFile = async filePath => {
  const normalizedPath = String(filePath || '').split('/').filter(Boolean).join('/');
  if (!normalizedPath) return;
  await deleteObject(ref(storage, normalizedPath));
};

export const getStorageFileDataUrl = async filePath => {
  const normalizedPath = String(filePath || '').split('/').filter(Boolean).join('/');
  if (!normalizedPath) return '';
  const fileRef = ref(storage, normalizedPath);
  try {
    const bytes = await getBytes(fileRef);
    const byteArray = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const contentType = getStorageContentTypeFromBytes(byteArray) || getStorageContentTypeFromName({ name: normalizedPath }) || 'image/jpeg';
    return `data:${contentType};base64,${bytesToBase64(byteArray)}`;
  } catch (bytesError) {
    // getBytes() can fail even when the caller is allowed to read the file - e.g. a CORS
    // preflight rejection on some browsers/network setups. getDownloadURL() + fetch() takes a
    // different code path (a plain GET against a token-authenticated URL) that isn't subject to
    // the same restriction, so it recovers files that getBytes alone would report as unloadable.
    try {
      const url = await getDownloadURL(fileRef);
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
      const blob = await response.blob();
      return await blobToDataUrl(blob);
    } catch (fetchError) {
      console.error('Unable to load Storage file via getBytes or getDownloadURL/fetch', normalizedPath, bytesError, fetchError);
      throw bytesError;
    }
  }
};

export const getUrlofUploadedAvatar = async (photo, userId, options = {}) => {
  const { disableCompression = false, maxSizeKB = 1024, rootFolder = 'avatar' } = options;
  const file = shouldKeepOriginalUpload(photo, disableCompression, maxSizeKB)
    ? photo
    : await getFileBlob(await compressPhoto(photo, maxSizeKB));

  const uniqueId = generateUploadFileId(); // генеруємо унікальне ім"я для фото
  const fileName = `${uniqueId}.${getUploadFileExtension(file)}`; // Використовуємо унікальне ім'я для файлу
  const pathSegments = [rootFolder, userId];
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
  const usersSnap = await get(ref2(database, 'users'));
  const usersData = usersSnap.exists() ? usersSnap.val() : {};
  const allIds = [];
  Object.keys(usersData).forEach(id => {
    const merged = usersData[id] || {};
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

// Стеля вікна пагінації повних анкет. Див. коментар у циклі нижче.
const SOURCE_PAGE_WINDOW_CAP = 512;

export const fetchUsersByLastLogin2 = async (limit = 9, lastDate) => {
  const usersRef = ref2(database, 'users');
  const realLimit = limit + 1;
  const { todayDash } = getCurrentDate();
  const cursor =
    typeof lastDate === 'object' && lastDate !== null
      ? { date: lastDate.date || '', userId: lastDate.userId || '' }
      : { date: lastDate || '', userId: '' };

  // Курсор регулярно потрапляє в групу анкет з однаковою датою `lastLogin2`:
  // `endAt` віддає їх усі, а відсікання за парою (дата, id) лишає нуль нових,
  // тож вікно доводиться розширювати. Кожне розширення перечитує той самий зріз
  // з нуля — і робить це повними анкетами. Стеля в 5000 означала мегабайти
  // трафіку на одну сторінку з п'яти карток; на цій висоті дані вже зламані, і
  // правильна відповідь — зупинитись, а не викачати всю колекцію.
  let fetchLimit = realLimit;
  let entries = [];
  let snapshotSize = 0;

  while (entries.length < realLimit && fetchLimit <= SOURCE_PAGE_WINDOW_CAP) {
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

export const addDislikeUser = async (userId, ownerId, dislikedAt) => {
  try {
    const owner = auth.currentUser;
    if (!owner) return;
    const timestamp = typeof dislikedAt === 'number' ? dislikedAt : Date.now();
    await set(ref2(database, `multiData/dislikes/${ownerId || owner.uid}/${userId}`), timestamp);
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

// Історія пошуку — особисті дані, тож пише її лише сам власник, під власний UID
// (правило RTDB `auth.uid == $ownerId`). Ключ рядка рахується з тексту запиту:
// раніше кожен виконаний пошук ішов у `push()`, і база наповнювалась ланцюгами
// набору тексту ("Arma", "Arman", "Armand", "Armando") — по ряду на кожну паузу.
// Тепер повтор того самого запиту лише піднімає `count` і `updatedAt` у єдиному
// ряді, а щойно збережений початок ланцюга прибирає його ж продовження.
let lastRecordedSearchQuery = null;

export const addMatchingSearchQuery = async searchQuery => {
  try {
    const owner = auth.currentUser;
    if (!owner) return;

    const normalizedQuery = normalizeSearchQuery(searchQuery);
    if (!shouldStoreSearchQuery(normalizedQuery)) return;

    const queryKey = encodeSearchQueryKey(normalizedQuery);
    if (!queryKey) return;

    const ownerPath = `${SEARCH_QUERIES_ROOT_PATH}/${owner.uid}`;
    const now = Date.now();
    const previous = lastRecordedSearchQuery;

    // Дописані символи роблять із попереднього запису початок того самого
    // пошуку — він іде геть замість того, щоб лишитись окремим рядом.
    if (previous
      && previous.ownerId === owner.uid
      && previous.key !== queryKey
      && isTypingContinuation(previous.query, normalizedQuery, now - previous.at)) {
      lastRecordedSearchQuery = null;
      await remove(ref2(database, `${ownerPath}/${previous.key}`));
    }

    await runTransaction(ref2(database, `${ownerPath}/${queryKey}`), current => {
      const stored = typeof current === 'string' ? { query: current } : (current || {});
      const storedCount = Number(stored.count);
      const storedCreatedAt = Number(stored.createdAt);
      return {
        query: normalizedQuery,
        createdAt: Number.isFinite(storedCreatedAt) && storedCreatedAt > 0 ? storedCreatedAt : now,
        updatedAt: now,
        count: (Number.isFinite(storedCount) && storedCount > 0 ? storedCount : 0) + 1,
      };
    });

    lastRecordedSearchQuery = { ownerId: owner.uid, query: normalizedQuery, key: queryKey, at: now };
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
      normalizedStatuses.map(async status => {
        const q = query(
          ref2(database, 'users'),
          orderByChild('cycleStatus'),
          equalTo(status),
        );
        const snap = await get(q);
        if (snap.exists()) {
          Object.keys(snap.val()).forEach(id => idSet.add(id));
        }
      }),
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

// ---------------------------------------------------------------------------
// Public profile comments (matching spec §8)
//
// A different thing from multiData/comments, which holds one *private* note per
// (owner, card). These are public records about a third party, written under the
// author's own name and readable by every signed-in user of the base, so they
// live in their own tree, keyed by a push id, and every write carries the
// author's uid for the security rules to check.
//
//   comments/{profileId}/{commentId} = {
//     text, authorId, authorName, createdAt, updatedAt | null, visibility
//   }
//
// `replies/{commentId}` is reserved for the subject's own answer to a record
// about them. It is not implemented here - the slot exists so adding it later
// doesn't reshape what is already stored.
export const PUBLIC_COMMENTS_ROOT_PATH = 'comments';
export const PUBLIC_COMMENT_REPLIES_ROOT_PATH = 'replies';
export const PUBLIC_COMMENT_MAX_LENGTH = 2000;

const normalizePublicComment = (id, value) => ({
  id,
  text: typeof value?.text === 'string' ? value.text : '',
  authorId: typeof value?.authorId === 'string' ? value.authorId : '',
  authorName: typeof value?.authorName === 'string' ? value.authorName : '',
  createdAt: typeof value?.createdAt === 'number' ? value.createdAt : 0,
  updatedAt: typeof value?.updatedAt === 'number' ? value.updatedAt : null,
  visibility: value?.visibility === 'public' ? 'public' : 'public',
});

const sortPublicComments = comments =>
  [...comments].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

export const fetchPublicProfileComments = async (profileIds = []) => {
  const ids = Array.from(new Set((profileIds || []).filter(Boolean)));
  if (!ids.length) return {};

  const entries = await Promise.all(ids.map(async profileId => {
    try {
      const snap = await firebaseGet(ref2(database, `${PUBLIC_COMMENTS_ROOT_PATH}/${profileId}`));
      if (!snap.exists()) return [profileId, []];
      const value = snap.val() || {};
      return [profileId, sortPublicComments(
        Object.entries(value).map(([id, comment]) => normalizePublicComment(id, comment))
      )];
    } catch (error) {
      console.error('Error fetching public comments:', error);
      return [profileId, []];
    }
  }));

  return Object.fromEntries(entries);
};

export const addPublicProfileComment = async ({ profileId, text, authorName = '' }) => {
  const user = auth.currentUser;
  if (!user) throw new Error('User not authenticated');
  if (!profileId) throw new Error('profileId обовʼязковий');

  const trimmed = String(text || '').trim();
  if (!trimmed) throw new Error('Порожній коментар не зберігається');
  if (trimmed.length > PUBLIC_COMMENT_MAX_LENGTH) {
    throw new Error(`Коментар довший за ${PUBLIC_COMMENT_MAX_LENGTH} символів`);
  }

  const listRef = ref2(database, `${PUBLIC_COMMENTS_ROOT_PATH}/${profileId}`);
  const commentRef = push(listRef);
  await set(commentRef, {
    text: trimmed,
    authorId: user.uid,
    authorName: String(authorName || '').slice(0, 200),
    createdAt: serverTimestamp(),
    updatedAt: null,
    visibility: 'public',
  });

  return {
    id: commentRef.key,
    text: trimmed,
    authorId: user.uid,
    authorName: String(authorName || '').slice(0, 200),
    createdAt: Date.now(),
    updatedAt: null,
    visibility: 'public',
  };
};

// authorId and createdAt are immutable after creation, so an edit only ever
// touches the text and the updatedAt stamp - the rules reject anything else.
export const updatePublicProfileComment = async ({ profileId, commentId, text }) => {
  const user = auth.currentUser;
  if (!user) throw new Error('User not authenticated');
  if (!profileId || !commentId) throw new Error('profileId і commentId обовʼязкові');

  const trimmed = String(text || '').trim();
  if (!trimmed) {
    await remove(ref2(database, `${PUBLIC_COMMENTS_ROOT_PATH}/${profileId}/${commentId}`));
    return null;
  }
  if (trimmed.length > PUBLIC_COMMENT_MAX_LENGTH) {
    throw new Error(`Коментар довший за ${PUBLIC_COMMENT_MAX_LENGTH} символів`);
  }

  await update(ref2(database, `${PUBLIC_COMMENTS_ROOT_PATH}/${profileId}/${commentId}`), {
    text: trimmed,
    updatedAt: serverTimestamp(),
  });

  return { id: commentId, text: trimmed, updatedAt: Date.now() };
};

// Автор прибирає власний запис, адмін — будь-який: публічний коментар про третю
// особу мусить мати кому зняти. Правило RTDB на comments/{profileId}/{commentId}
// пускає видалення тому самому колу (автор або адмін), тож обидві дороги —
// стерти текст і натиснути «видалити» — ведуть сюди.
export const deletePublicProfileComment = async ({ profileId, commentId }) => {
  const user = auth.currentUser;
  if (!user) throw new Error('User not authenticated');
  if (!profileId || !commentId) throw new Error('profileId і commentId обовʼязкові');

  await remove(ref2(database, `${PUBLIC_COMMENTS_ROOT_PATH}/${profileId}/${commentId}`));
  return null;
};

export const COMMENTS_ROOT_PATH = 'multiData/comments';
const getCommentPath = (ownerId, cardId) =>
  [COMMENTS_ROOT_PATH, ownerId, cardId].filter(Boolean).join('/');
const normalizeComment = value => ({
  text: typeof value?.text === 'string' ? value.text : '',
  lastAction: typeof value?.updatedAt === 'number' ? value.updatedAt : 0,
});

// Особистий коментар адміна до картки — multiData/comments/{ownerId}/{cardId} = { text, updatedAt }.
// Рівно один запис на пару ownerId+cardId: повторне збереження оновлює його
// (set), а не створює новий запис із випадковим ключем (push() не використовується).
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
    const updatedAt = Date.now();
    await set(ref2(database, getCommentPath(commentsOwnerId, cardId)), { text, updatedAt });
    invalidateOwnerCommentsCache(commentsOwnerId);
    return { lastAction: updatedAt };
  } catch (error) {
    console.error('Error setting comment:', error);
    // A comment is saved outside the card payload, so callers cannot infer a
    // failed write from the regular profile save. Keep the Firebase error
    // intact (notably `PERMISSION_DENIED`) so the comment field can surface it.
    throw error;
  }
};

export const updateCommentByOwner = async ({ ownerId, cardId, text }) => {
  try {
    const user = auth.currentUser;
    if (!user) {
      throw new Error('User not authenticated');
    }
    if (!ownerId || !cardId || typeof text !== 'string') {
      throw new Error('ownerId, cardId і text обовʼязкові');
    }
    const updatedAt = Date.now();
    await set(ref2(database, getCommentPath(ownerId, cardId)), { text, updatedAt });
    invalidateOwnerCommentsCache(ownerId);
    return { lastAction: updatedAt, ownerId };
  } catch (error) {
    console.error('Error updating comment by owner:', error);
    return null;
  }
};

export const deleteCommentByOwner = async ({ ownerId, cardId }) => {
  try {
    const user = auth.currentUser;
    if (!user) {
      throw new Error('User not authenticated');
    }
    if (!ownerId || !cardId) {
      throw new Error('ownerId і cardId обовʼязкові');
    }
    await remove(ref2(database, getCommentPath(ownerId, cardId)));
    invalidateOwnerCommentsCache(ownerId);
    return true;
  } catch (error) {
    console.error('Error deleting comment by owner:', error);
    return false;
  }
};

export const fetchUserComment = async (ownerId, cardId) => {
  try {
    if (!ownerId || !cardId) return null;
    const snap = await get(ref2(database, getCommentPath(ownerId, cardId)));
    return snap.exists() ? normalizeComment(snap.val()) : null;
  } catch (error) {
    console.error('Error fetching comment:', error);
    return null;
  }
};

// Зберігає (або, для порожнього тексту, видаляє) особистий коментар поточного
// адміна до картки в multiData/comments/{ownerId}/{cardId} — замінює старий підхід "писати прямо
// в поле myComment на картці".
export const saveMyCardComment = async (cardId, text, ownerId) => {
  const trimmed = (text || '').trim();
  if (!trimmed) {
    const commentsOwnerId = ownerId || auth.currentUser?.uid;
    const deleted = await deleteCommentByOwner({ ownerId: commentsOwnerId, cardId });
    if (!deleted) {
      throw new Error('Не вдалося видалити коментар');
    }
    return null;
  }
  return setUserComment(cardId, text, ownerId);
};

// Moves an edited legacy card comment to the current admin's personal
// multiData record. The canonical write must succeed independently; cleanup
// of old card fields is intentionally best-effort.
export const migrateMyCardComment = async (cardId, text, ownerId) => {
  const user = auth.currentUser;
  if (!user) throw new Error('User not authenticated');
  if (!cardId) throw new Error('cardId обовʼязковий');

  const commentsOwnerId = ownerId || user.uid;
  const trimmed = String(text || '').trim();
  if (trimmed) {
    const updatedAt = Date.now();
    // Persist the new source of truth first. Legacy cleanup is deliberately
    // best-effort: missing permissions on an old root must not roll this write back.
    await set(ref2(database, getCommentPath(commentsOwnerId, cardId)), { text, updatedAt });
    invalidateOwnerCommentsCache(commentsOwnerId);
    remove(ref2(database, `users/${cardId}/myComment`)).catch(error => {
      console.error('Error cleaning up legacy card comment:', error);
    });
    return { lastAction: updatedAt };
  }

  await remove(ref2(database, getCommentPath(commentsOwnerId, cardId)));
  invalidateOwnerCommentsCache(commentsOwnerId);
  remove(ref2(database, `users/${cardId}/myComment`)).catch(error => {
    console.error('Error cleaning up legacy card comment:', error);
  });
  return null;
};

// Коментарі одного власника — це одне піддерево `multiData/comments/{ownerId}`,
// на яке правила дають читачеві право цілком.
//
// Читати його не можна безоглядно: в активного адміна там тисячі записів, і
// заради трьох карток тягнути все — гірше, ніж три поштучні запити. Тому
// піддерево береться лише тоді, коли поштучних запитів було б більше за поріг,
// і після цього живе в памʼяті короткий TTL — стрічка питає коментарі до кожної
// нової сторінки карток, і без кешу перша ж сторінка знецінила б виграш.
//
// Що лишається забороненим (і чого цей код не робить): корінь
// `multiData/comments` через усіх власників і будь-який легасі-корінь.
const ownerCommentsSubtreeCache = new Map();
const OWNER_COMMENTS_SUBTREE_TTL_MS = 2 * 60 * 1000;
const OWNER_COMMENTS_SUBTREE_THRESHOLD = 8;

const getCachedOwnerCommentsSubtree = ownerId => {
  const cached = ownerCommentsSubtreeCache.get(ownerId);
  if (!cached || Date.now() - cached.cachedAt > OWNER_COMMENTS_SUBTREE_TTL_MS) return null;
  return cached.promise;
};

const readOwnerCommentsSubtree = async ownerId => {
  const cached = getCachedOwnerCommentsSubtree(ownerId);
  if (cached) return cached;

  const promise = get(ref2(database, `${COMMENTS_ROOT_PATH}/${ownerId}`))
    .then(snapshot => (snapshot.exists() ? snapshot.val() || {} : {}))
    .catch(error => {
      // Не кешуємо провал: наступний виклик має спробувати ще раз.
      ownerCommentsSubtreeCache.delete(ownerId);
      throw error;
    });

  ownerCommentsSubtreeCache.set(ownerId, { promise, cachedAt: Date.now() });
  return promise;
};

/** Скидає кеш піддерева — після запису чи видалення коментаря. */
export const invalidateOwnerCommentsCache = ownerId => {
  if (ownerId) ownerCommentsSubtreeCache.delete(ownerId);
  else ownerCommentsSubtreeCache.clear();
};

export const fetchUserComments = async (ownerId, cardIds = []) => {
  try {
    if (!ownerId || !Array.isArray(cardIds) || !cardIds.length) return {};

    const cachedSubtree = getCachedOwnerCommentsSubtree(ownerId);
    const shouldReadSubtree = Boolean(cachedSubtree) || cardIds.length >= OWNER_COMMENTS_SUBTREE_THRESHOLD;

    if (shouldReadSubtree) {
      incrementMatchingLoadStat('commentsSubtreeReads');
      const subtree = await readOwnerCommentsSubtree(ownerId);
      const result = {};
      cardIds.forEach(cardId => {
        const raw = subtree?.[cardId];
        if (raw) result[cardId] = normalizeComment(raw);
      });
      return result;
    }

    incrementMatchingLoadStat('commentsReads', cardIds.length);
    const result = {};
    await Promise.all(cardIds.map(async cardId => {
      const comment = await fetchUserComment(ownerId, cardId);
      if (comment) result[cardId] = comment;
    }));
    return result;
  } catch (error) {
    console.error('Error fetching comments:', error);
    return {};
  }
};

export const fetchAllCommentsByCardId = async (cardId, ownerIds = []) => {
  try {
    if (!cardId) return [];
    const uniqueOwnerIds = [...new Set(ownerIds.filter(Boolean))];
    const comments = await Promise.all(uniqueOwnerIds.map(async ownerId => ({
      ownerId,
      comment: await fetchUserComment(ownerId, cardId),
    })));
    return comments.flatMap(({ ownerId, comment }) => {
      const text = String(comment?.text || '').trim();
      return text ? [{ ownerId, text, lastAction: comment.lastAction || 0 }] : [];
    });
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

const isFlowFormulaAmount = value => String(value || '').trim().startsWith('=');

const sanitizeFlowValuePart = (value, { preserveSlash = false } = {}) =>
  String(value || '')
    .trim()
    .replace(preserveSlash ? /[#$[\]]/g : /[#$[\]/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeFlowStoredAmount = value => {
  const normalized = String(value || '').replace(/,/g, '.').replace(/\$/g, 'USD');
  return sanitizeFlowValuePart(normalized, { preserveSlash: isFlowFormulaAmount(normalized) });
};

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
  const normalizedCustomUsdRateAmount = normalizedRowCustomUsdRate
    ? formatFlowStoredCurrencyAmount(normalizedRowCustomUsdRate)
    : '';
  const value = isFlowFormulaAmount(normalizedAmountUah)
    ? {
        amount: normalizedAmountUah,
        amountUsd,
        amountEur,
        customUsdRate: normalizedCustomUsdRateAmount,
        description: sanitizeFlowValuePart(description),
      }
    : buildFlowEntryValue({
        amount: [normalizedAmountUah, amountUsd, amountEur, normalizedCustomUsdRateAmount].join('/'),
        description,
      });
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

/**
 * Читає анкету з нових вузлів.
 *
 * Це основний шлях: `users` лишається лише для мобільного застосунку. Тобто
 * джерелом істини для вебу є саме ці пʼять вузлів, і legacy читається тільки як
 * відкат для анкет, які ще не переїхали.
 *
 * Читання паралельне і поштучне: контакти, робочі позначки і технічне беруться
 * лише тоді, коли їх справді показують. Для списку вистачає картки і деталей —
 * решта не їде по мережі взагалі.
 *
 * Відмова в правах — не помилка анкети. `profileContacts` може бути закритий
 * для цього читача, і картка має відкритись без контактів, а не впасти.
 */
const readProfileNodePart = async (node, id) => {
  try {
    const snapshot = await get(ref2(database, `${node}/${id}`));
    return snapshot.exists() ? snapshot.val() : null;
  } catch (error) {
    console.warn('[profileNodes] вузол не прочитано', { node, userId: id, error });
    return null;
  }
};

/**
 * Що з legacy-анкети ще має право говорити.
 *
 * Дзеркалення двостороннє: мобільний застосунок пише в `/users`, і веб мусить
 * бачити ці зміни. Але накласти legacy цілим шаром не можна — тоді поле, яке у
 * вебі навмисно стерли, поверталося б із кожним читанням.
 *
 * Межу проводить наявність вузла: якщо `profileContacts/{id}` існує, контакти
 * належать вебу, і legacy про них мовчить — стерте лишається стертим. Якщо
 * вузла немає, анкета в цій частині ще не переїхала, і legacy — єдиний, хто про
 * неї щось знає. Поля без власного вузла (`publish`, `userRole`) проходять
 * завжди: їх ніхто, крім legacy, і не тримає.
 */
const legacyFieldsNodesDoNotOwn = (legacy, parts) => {
  if (!legacy || typeof legacy !== 'object') return null;

  const presentNodes = new Set(
    Object.entries({
      [PROFILE_NODES.matchingCards]: parts.card,
      [PROFILE_NODES.profileDetails]: parts.details,
      [PROFILE_NODES.profileContacts]: parts.contacts,
      [PROFILE_NODES.profileWorkflow]: parts.workflow,
      [PROFILE_NODES.profileTechnical]: parts.technical,
    })
      .filter(([, value]) => value && typeof value === 'object' && Object.keys(value).length)
      .map(([node]) => node),
  );

  const kept = Object.fromEntries(
    Object.entries(legacy).filter(([field]) => !presentNodes.has(resolveFieldOwnerNode(field))),
  );

  return Object.keys(kept).length ? kept : null;
};

export const readProfileFromNodes = async (userId, options = {}) => {
  const id = String(userId || '').trim();
  if (!id) return null;

  const {
    includeContacts = true,
    includeWorkflow = true,
    includeTechnical = false,
    // Читати legacy заради полів, яких нові вузли ще не тримають. Дорого на
    // список (це зайве читання на анкету), дешево на одну анкету — тож
    // вмикається там, де застарілі дані справді видно: на самій анкеті.
    withLegacy = false,
    legacy = null,
  } = options;

  const [card, details, contacts, workflow, technical, legacyUsers] = await Promise.all([
    readProfileNodePart(PROFILE_NODES.matchingCards, id),
    readProfileNodePart(PROFILE_NODES.profileDetails, id),
    includeContacts ? readProfileNodePart(PROFILE_NODES.profileContacts, id) : null,
    includeWorkflow ? readProfileNodePart(PROFILE_NODES.profileWorkflow, id) : null,
    includeTechnical ? readProfileNodePart(PROFILE_NODES.profileTechnical, id) : null,
    withLegacy && !legacy ? readProfileNodePart('users', id) : null,
  ]);

  const parts = { card, details, contacts, workflow, technical };
  if (!hasAnyProfileNode(parts)) return null;

  const legacySnapshot = legacy || legacyUsers || null;

  const merged = mergeProfileNodes({
    userId: id,
    ...parts,
    legacy: legacyFieldsNodesDoNotOwn(legacySnapshot, parts),
  });
  if (!merged) return null;

  // `getInTouch` і `writer` підмішуються з `multiData` — це персональні
  // позначки того, хто зараз дивиться, а не поля анкети. Стара логіка бачить
  // рівно ті самі `card.getInTouch` і `card.writer`, просто значення приходять
  // з іншого місця. Мапи власника читаються раз на сесію, тож ця гілка не
  // коштує запиту.
  const ownerId = auth.currentUser?.uid;
  if (ownerId) {
    const [getInTouchMap, writerMap] = await Promise.all([
      readOwnerGetInTouchMap(ownerId),
      readOwnerWriterMap(ownerId),
    ]);
    if (Object.prototype.hasOwnProperty.call(getInTouchMap, id)) merged.getInTouch = getInTouchMap[id];
    else delete merged.getInTouch;
    // Позначки немає — немає й поля: інакше стара, ще не дочищена з анкети,
    // пережила б своє зняття.
    if (Object.prototype.hasOwnProperty.call(writerMap, id)) merged.writer = writerMap[id];
    else delete merged.writer;
  }

  return merged;
};

/**
 * Прочитати анкети за id.
 *
 * Читаються лише нові вузли, і картка стрічки серед них — саме вона і є тим
 * мінімумом, який завжди є в показаної анкети. Legacy-колекція звідси прибрана
 * навмисно: у вебі вона лишилась дзеркалом для мобільного застосунку, тобто
 * адресатом запису, а не джерелом показу. Читання з неї було ще й крихким —
 * `users/{чужий id}` відкритий лише адмінам, тож на першій же відмові гинула
 * вся відповідь.
 */
export const fetchUsersByIds = async ids => {
  try {
    const uniqueIds = [...new Set((ids || []).filter(Boolean).map(String))];
    const result = {};
    const missingIds = [];

    uniqueIds.forEach(id => {
      const cached = getCard(id);
      if (!cached) {
        missingIds.push(id);
        return;
      }
      result[id] = cached;
    });

    const snaps = await Promise.all(
      missingIds.map(async id => {
        try {
          // Вузли — єдине джерело показу. Немає жодного (навіть картки) —
          // показувати нема чого, і це не привід іти в legacy.
          const fromNodes = await readProfileFromNodes(id);
          if (!fromNodes) return null;
          return [id, updateCard(id, { ...fromNodes, photos: fromNodes.photos || [] })];
        } catch (error) {
          console.error(`Error fetching user ${id}:`, error);
          return null;
        }
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

export const lazyLoadProfilePhotos = async (userId, options = {}) => getAllUserPhotos(userId, options);

// Проєкція, яку отримує читач без повного доступу до матчингу: прізвище, імʼя,
// вік, регіон, місто — і публічний коментар, що живе у власному дереві й
// читається кожним авторизованим. Правила відкривають рівно ці дочірні шляхи
// `users/$uid`, тож перелік і правила мусять іти в ногу: запит на щось інше
// буде відхилено, а не відфільтровано.
export const LIMITED_PROFILE_FIELDS = ['name', 'surname', 'birth', 'region', 'city'];

/**
 * Та сама проєкція, але з опублікованої картки стрічки.
 *
 * Анкета, заведена у вебі, тіла в legacy-колекції не має взагалі — і пошук за
 * `searchId` знаходив її id, а показати за ним було нічого. Картка ж
 * `matchingCards/{id}` відкрита кожному авторизованому, щойно вона має
 * `feedDate`: це і є та «загальнодоступна картка», на яку можна подивитись і
 * під якою можна лишити публічний відгук.
 *
 * Повне прізвище в картці не зберігається — тільки `surnameShort`. Для урізаної
 * проєкції це не втрата, а рівно та форма, яку вона й має показувати.
 */
const readLimitedProfileFromMatchingCard = async userId => {
  let card = null;
  try {
    const snapshot = await get(ref2(database, `${MATCHING_CARDS_ROOT}/${userId}`));
    card = snapshot.exists() ? snapshot.val() : null;
  } catch {
    // Непублічну картку читати не дають — це не помилка, а відсутність проєкції.
    return null;
  }
  if (!card || typeof card !== 'object') return null;

  const projection = {};
  LIMITED_PROFILE_FIELDS.forEach(field => {
    if (field === 'surname') return;
    if (card[field] !== undefined && card[field] !== null) projection[field] = card[field];
  });
  if (card.surnameShort) projection.surname = card.surnameShort;
  if (card.country) projection.country = card.country;
  if (card.avatar) projection.avatar = card.avatar;

  return Object.keys(projection).length ? projection : null;
};

// Reads a search hit through the limited projection. Unlike the full read this
// never touches the record's node, only the paths the rules open, so there is
// nothing for the caller to strip afterwards.
export const fetchLimitedProfileById = async userId => {
  if (!userId) return null;
  // Джерело одне — картка стрічки: один запит замість пʼяти, і вона є в анкети
  // незалежно від того, чи має та тіло в legacy-колекції. Полів анкети з
  // `users/$uid` тут більше не питають: веб з legacy не читає.
  const projection = await readLimitedProfileFromMatchingCard(userId);
  if (!projection) return null;
  return {
    userId,
    ...projection,
    __limitedProfile: true,
    publish: true,
  };
};

const addLimitedUser = async (userId, users) => {
  const profile = await fetchLimitedProfileById(userId);
  if (profile) users[userId] = profile;
};

/**
 * Чим показати знайдене.
 *
 * Пошук шукає в `searchId` — там лежать id, а не анкети, — тож знайдене треба
 * ще й прочитати. Читаються нові вузли, і перший серед них `matchingCards`:
 * проєкція є в кожної показаної анкети, відкрита кожному авторизованому і має
 * рівно ті поля, якими малюють рядок. Тобто картка, якої немає в стрічці,
 * показується з проєкції — і більше нізвідки.
 *
 * Legacy-колекції тут немає навмисно. `users/$uid` відкритий лише самому
 * власнику й адмінам, тож звичайному читачеві це читання не давало нічого,
 * крім `PERMISSION_DENIED` — а той летів з `Promise.all` у `catch` усього
 * пошуку і перетворював знайдене на «Не знайшов». Вузли ж на відмову в правах
 * не падають: `readProfileNodePart` віддає порожній вузол.
 */
const readProfileForSearchHit = async userId => readProfileFromNodes(userId);

const addSearchHit = async (userId, users) => {
  const profile = await readProfileForSearchHit(userId);
  if (profile) users[userId] = profile;
};

const searchBySearchIdUsers = async (
  modifiedSearchValue,
  rawSearchValue,
  uniqueUserIds,
  users,
  searchIdPrefixes,
  options = {},
  { limitedFields = false } = {},
) => {
  const searchKeys = buildSearchIdCandidateKeys(
    modifiedSearchValue,
    rawSearchValue,
    searchIdPrefixes,
    options,
  );
  const userIds = await collectUserIdsBySearchIdKeys(searchKeys, { ...options, rawSearchValue });

  await Promise.all(
    userIds.map(async id => {
      if (uniqueUserIds.has(id)) return;
      uniqueUserIds.add(id);
      if (limitedFields) await addLimitedUser(id, users);
      else await addSearchHit(id, users);
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

/**
 * Пошук за частиною id ходить по `matchingCards`.
 *
 * Ключ картки — це userId, і картка є в кожної анкети, хай де лежить її тіло.
 * Legacy-колекція таким каталогом більше не є: анкета, заведена у вебі, тіла в
 * ній не має взагалі, і скан по `users` знаходив би лише акаунти.
 */
const collectIdsByPartialUserId = async userId => {
  const cardsQuery = query(
    ref2(database, MATCHING_CARDS_ROOT),
    orderByKey(),
    startAt(userId),
    endAt(`${userId}\uf8ff`),
  );
  const snapshot = await get(cardsQuery);
  if (!snapshot.exists()) return [];

  const ids = [];
  snapshot.forEach(cardSnapshot => {
    const currentUserId = cardSnapshot.key;
    if (currentUserId.includes(userId)) ids.push(currentUserId);
  });
  return ids;
};

export const searchUserByPartialUserIdUsers = async (userId, users) => {
  try {
    const ids = await collectIdsByPartialUserId(userId);
    await Promise.all(ids.map(async currentUserId => {
      const profile = await readProfileForSearchHit(currentUserId);
      if (profile) users[currentUserId] = profile;
    }));
    return Object.keys(users).length > 0 ? users : null;
  } catch (error) {
    console.error('Error fetching data by partial userId:', error);
    return null;
  }
};

export const searchUsersOnly = async (searchedValue, options = {}) => {
  const { searchIdPrefixes, allowTelegramPrefixMatches = false, enabledSearchKeys, limitedFields = false } = options;
  const isBroadTextSearchEnabled = Boolean(enabledSearchKeys?.broadTextSearch) && !limitedFields;
  const { searchKey, searchValue, modifiedSearchValue } = makeSearchKeyValue(searchedValue, { searchIdPrefixes });
  const shouldSkipBroadFallback = shouldSkipBroadFallbackForExactSearchId(searchKey, options);
  const baseSearchIdOptions = shouldSkipBroadFallback
    ? {
      includeVariants: false,
      includePrefixMatches: allowTelegramPrefixMatches,
      includeAdaptedPhoneVariant: true,
    }
    : { includeVariants: searchKey !== 'telegram', includePrefixMatches: searchKey !== 'telegram' };
  // A limited viewer may read a searchId entry by its exact key but not scan the
  // index, and may not read either collection's root either. Both the prefix scan
  // and the broad fallback do exactly that, so neither runs for them - the index
  // stays a lookup, never an enumeration.
  const searchIdOptions = limitedFields
    ? { ...baseSearchIdOptions, includePrefixMatches: false }
    : baseSearchIdOptions;
  const addHit = limitedFields ? addLimitedUser : addSearchHit;
  const users = {};
  const uniqueUserIds = new Set();
  try {
    if (searchKey === 'userId') {
      await addHit(searchValue, users);
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
      { limitedFields },
    );

    if (shouldSkipBroadFallback) {
      if (Object.keys(users).length === 1) {
        const id = Object.keys(users)[0];
        return users[id];
      }
      return users;
    }

    // Широкий fallback (до ~16 запитів по всіх полях `users`) дорого коштує
    // по трафіку, тому виконується лише коли користувач сам явно увімкнув чекбокс
    // "широкий пошук" (enabledSearchKeys.broadTextSearch), а не автоматично щоразу.
    if (isBroadTextSearchEnabled) {
      await searchByPrefixesUsers(searchValue, uniqueUserIds, users);
      await searchUserByPartialUserId(searchValue, users);
    }

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

/**
 * Завести нову анкету у вебі.
 *
 * Тіла в legacy-колекції вона не отримує, і це не економія: `users` — це вузол
 * акаунтів, і право писати в чужий `users/$uid` має лише сам власник та адмін.
 * Дати його редактору означало б дати право переписати чужий `accessLevel`.
 * Нові ж вузли мають власні правила з перевіркою кожного поля — саме туди
 * анкета й лягає, а `push` на `users` слугує лише генератором ключа.
 */
export const makeNewUser = async (searchedValue, rawQuery = '') => {
  const db = getDatabase();
  const usersRef = ref2(db, 'users');
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

  const newUserId = push(usersRef).key; // `push` лише генерує ключ, тіла ще не пише

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

  // Анкета одразу розкладається по вузлах — так само, як це робить кожне
  // збереження. Вузли доступні делегованим редакторам, на відміну від `users`,
  // тож саме вони і є записом анкети.
  const nodesWritten = await fanOutProfileNodes(newUserId, newUser);
  if (!nodesWritten) throwProfileWriteFailure(newUserId, 'вузли анкети');
  // І одразу лягає в legacy-колекцію: з `users` читає мобільний застосунок, і
  // нова анкета має бути там у його форматі — з крапковими датами і двійниками
  // `createdAt`/`createdAt2`. Це робить спільне дзеркало, тож формат тут і
  // формат при кожному наступному збереженні — той самий.
  const legacyWritten = await mirrorProfileToLegacyUsers(newUserId, newUser, 'set');
  if (!legacyWritten) {
    console.warn('[profileNodes] legacy-дзеркало нової анкети не створено', { userId: newUserId });
  }
  await syncUserSearchKeyIndex(newUserId, {}, newUser);
  // І одразу отримує урізану картку, інакше вона зʼявиться в стрічці тільки
  // після наступної індексації.
  await syncMatchingCardIndex(newUserId, newUser, { existingCard: null, includeStorageAvatar: false });
  // І повний `searchId` по всіх полях, а не лише по тому, з якого її створили.
  // Запит на кшталт «УК СМ …» кладе в анкету і імʼя, і прізвище, і контакт —
  // але нижче в індекс іде тільки ключ самого запиту, тож за рештою полів нова
  // анкета не знаходилась, доки хтось її не відредагує.
  await syncUserSearchIdIndex(newUserId, {}, newUser);

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

  clearEmptySearchQueryCache();

  return {
    userId: newUserId,
    ...newUser,
  };
};




export const searchUserByPartialUserId = async (userId, users) => {
  try {
    const ids = await collectIdsByPartialUserId(userId);
    await Promise.all(ids.map(currentUserId => addUserToResults(currentUserId, users)));

    // Користувача не знайдено
    return Object.keys(users).length > 0 ? users : null;
  } catch (error) {
    console.error('Error fetching data by partial userId:', error);
    return null;
  }
};

const addUserToResults = async (userId, users) => {
  const profile = await readProfileForSearchHit(userId);
  // Додаємо користувача у форматі userId -> userData
  if (profile) users[userId] = profile;
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

  const fields = ['createdAt', 'lastCycle', 'lastAction', 'getInTouch'];
  const refToCollection = ref2(database, 'users');

  for (const date of dateFormats) {
    for (const field of fields) {
      if (isDev) console.log(`searchByDate → querying users.${field} for`, date);
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
              if (isDev) console.log(`Found ${userId} in users.${field}`);
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

  // Дати анкети лежать у legacy, а `matchingCards` тримає рівно одну — ключ
  // стрічки. Але тримає її для кожної показаної картки, зокрема заведеної у
  // вебі, тіла в legacy якої немає взагалі.
  for (const isoDate of isoDateVariants) {
    try {
      const snapshot = await get(query(
        ref2(database, MATCHING_CARDS_ROOT),
        orderByChild(MATCHING_CARD_ORDER_FIELD),
        equalTo(isoDate),
      ));
      if (!snapshot.exists()) continue;
      const promises = [];
      snapshot.forEach(cardSnapshot => {
        const userId = cardSnapshot.key;
        if (uniqueUserIds.has(userId)) return;
        uniqueUserIds.add(userId);
        promises.push(addUserToResults(userId, users));
      });
      await Promise.all(promises);
    } catch (error) {
      if (isDev) console.error('Error searching matchingCards by feedDate:', error);
    }
  }

  return true;
};

/**
 * Імʼя — єдине текстове поле анкети, що лежить у самій картці стрічки цілком.
 *
 * `surnameShort` тут навмисно немає: це одна літера, і префіксний запит по ній
 * віддає всіх, у кого прізвище починається з тієї літери, — тобто відсотки
 * колекції на кожен пошук. Прізвище шукається через `searchId`, де лежить
 * повне значення.
 *
 * Решту широкий пошук бере з legacy, а `matchingCards` дає ту частину, яку
 * legacy вже не має: анкету, заведену у вебі, знайти інакше нема де.
 */
const MATCHING_CARD_TEXT_SEARCH_FIELDS = ['name'];

const searchMatchingCardsByText = async (searchValue, uniqueUserIds, users) => {
  const trimmed = String(searchValue || '').trim();
  if (!trimmed) return;

  const capitalized = trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
  const prefixes = [...new Set([capitalized, trimmed, trimmed.toLowerCase()])];

  for (const field of MATCHING_CARD_TEXT_SEARCH_FIELDS) {
    for (const prefix of prefixes) {
      try {
        const snapshot = await get(query(
          ref2(database, MATCHING_CARDS_ROOT),
          orderByChild(field),
          startAt(prefix),
          endAt(`${prefix}\uf8ff`),
        ));
        if (!snapshot.exists()) continue;
        const promises = [];
        snapshot.forEach(cardSnapshot => {
          const userId = cardSnapshot.key;
          if (uniqueUserIds.has(userId)) return;
          uniqueUserIds.add(userId);
          promises.push(addUserToResults(userId, users));
        });
        // eslint-disable-next-line no-await-in-loop
        await Promise.all(promises);
      } catch (error) {
        if (isDev) console.error(`Error searching matchingCards by ${field}:`, error);
      }
    }
  }
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
  const userIds = await collectUserIdsBySearchIdKeys(searchKeys, { ...options, rawSearchValue });

  await Promise.all(
    userIds.map(async userId => {
      if (uniqueUserIds.has(userId)) return;
      uniqueUserIds.add(userId);
      await addUserToResults(userId, users);
    })
  );
};

const SEARCH_COLLECTIONS = ['users'];

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


export const searchUsersCollectionInRTDB = async (searchedValue, options = {}) => {
  const {
    searchIdPrefixes,
    equalToKeys,
    forceEqualToAllCards = false,
    forceSearchKeyBucket = false,
    searchKeyFields,
    forcePartialUserIdSearch = false,
    allowTelegramPrefixMatches = false,
    enabledSearchKeys,
  } = options;
  const isBroadTextSearchEnabled = Boolean(enabledSearchKeys?.broadTextSearch);
  if (isDev) console.log('searchUsersCollectionInRTDB → searchedValue:', searchedValue);
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
    console.log('searchUsersCollectionInRTDB → params:', {
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
    // explicit EqualTo/searchKey/partialUserId requests: selected checkboxes must limit
    // backend queries to only those selected keys.
    const shouldRunBroadDateSearch =
      searchKey !== 'searchId' && !forceSearchKeyBucket && !forceEqualToAllCards && !forcePartialUserIdSearch;
    const isDateSearch = shouldRunBroadDateSearch
      ? await searchByDate(searchValue, uniqueUserIds, users)
      : false;
    if (isDev) console.log('searchUsersCollectionInRTDB → isDateSearch:', isDateSearch);
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

        // searchByPrefixes ганяє до 16 полів × 2 регістри по `users`, searchByIndexOn —
        // ще додатково. Це дорого по трафіку, тому виконується лише коли користувач сам
        // явно увімкнув чекбокс "широкий пошук" (enabledSearchKeys.broadTextSearch),
        // а не автоматично для кожного пошуку картки.
        if (!shouldSkipBroadFallback && isBroadTextSearchEnabled) {
          await searchMatchingCardsByText(searchValue, uniqueUserIds, users);
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

  const onlyInFirestore = usersInCollection.filter(user => !userIdsInRTDB.includes(user.userId));

  const allUserCards = [...usersInRTDB, ...onlyInFirestore];

  return allUserCards;
};

export const updateDataInFiresoreDB = async (userId, uploadedInfo, condition, delCondition) => {
  const cleanedUploadedInfo = normalizeStoredDates(stripTransientUserDataFields(uploadedInfo));
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

// Ключі, які ніколи не мають лишатись записаними на самій картці `users`:
// клієнтські кеш-мітки (транзитні за природою) та 'myComment', яке мігрувало в
// окреме сховище multiData/comments/{ownerId}/{cardId} (per-адмін коментарі, config.js: setUserComment
// / fetchUserComment). Останнє тут не тому, що воно транзитне, а тому, що для
// нього тепер є власне джерело правди — картка більше не повинна його дублювати.
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
  'myComment',
];

/**
 * Поля, які тримають дату і тільки дату.
 *
 * Перелік явний, а не «усе, що схоже на дату»: `csection`, наприклад, буває і
 * датою, і текстом («2 кесарі»), і чіпати його не можна.
 */
const STORAGE_DATE_FIELDS = [
  'birth',
  'birthWife',
  'birthHusband',
  'lastDelivery',
  'opuDate',
  'lastCycle',
  'getInTouch',
  'lastLogin',
  'lastLogin2',
  'registrationDate',
];

/**
 * Дата в базі лежить у `РРРР-ММ-ДД` — незалежно від того, звідки прийшов запис.
 *
 * Людині дата і далі показується крапками: поле введення форматує ввід у
 * `ДД.ММ.РРРР`, а `formatDateToDisplay` повертає її в такому ж вигляді при
 * читанні. Перетворення на формат бази робиться в одному місці — тут, на
 * виході з застосунку, — бо шляхів збереження кілька (форма анкети, поля
 * картки, імпорт), і кожен інакше домовлявся б із базою окремо.
 *
 * Навіщо саме `РРРР-ММ-ДД`: у ньому рядкове порівняння збігається з
 * хронологічним, тож база вміє і сортувати, і брати діапазон; у крапковому
 * першим стоїть день, і `01.09.2026` виявляється «меншим» за `02.01.2020`.
 */
const normalizeStoredDates = payload => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;

  const toStorage = value => {
    if (Array.isArray(value)) return value.map(toStorage);
    if (typeof value !== 'string') return value;
    return formatDateToServer(value);
  };

  const next = { ...payload };
  STORAGE_DATE_FIELDS.forEach(field => {
    if (!Object.prototype.hasOwnProperty.call(next, field)) return;
    if (next[field] === null || next[field] === undefined) return;
    next[field] = toStorage(next[field]);
  });
  return next;
};

/**
 * Дати для legacy-колекції `users`.
 *
 * `users` живе своїм життям: із неї читає мобільний застосунок, і там дата
 * написана крапками — `ДД.ММ.РРРР`. Нові вузли й картка стрічки лишаються в
 * `РРРР-ММ-ДД`, бо саме за ними база сортує і бере діапазони. Тому один і той
 * самий запис лягає у два місця у двох написаннях, і перетворення стоїть на
 * єдиному вході в legacy — тут.
 *
 * Виняток — поля-двійники. У legacy дата лежить двічі: крапкова під коротким
 * імʼям і ISO-копія під тим самим імʼям із «2» (`lastLogin`/`lastLogin2`,
 * `createdAt`/`createdAt2`). ISO-копію чіпати не можна: саме за нею ходить
 * пагінація (`fetchUsersByLastLogin2`), а крапкову читає посторінковий
 * завантажувач за датою входу (`defaultFetchByLastLogin`, `equalTo` рівно в
 * `дд.мм.рррр`). Тож двійник дописується поруч, а не замість.
 */
const LEGACY_TWIN_DATE_FIELDS = Object.freeze({
  createdAt: 'createdAt2',
  lastLogin: 'lastLogin2',
});

const LEGACY_TWIN_DATE_KEYS = new Set([
  ...Object.keys(LEGACY_TWIN_DATE_FIELDS),
  ...Object.values(LEGACY_TWIN_DATE_FIELDS),
]);

const LEGACY_DOTTED_DATE_FIELDS = STORAGE_DATE_FIELDS.filter(field => !LEGACY_TWIN_DATE_KEYS.has(field));

const formatDatesForLegacyUsers = payload => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;

  const toDotted = value => {
    if (Array.isArray(value)) return value.map(toDotted);
    if (typeof value !== 'string') return value;
    return formatDateToDisplay(value);
  };

  const next = { ...payload };
  LEGACY_DOTTED_DATE_FIELDS.forEach(field => {
    if (!Object.prototype.hasOwnProperty.call(next, field)) return;
    if (next[field] === null || next[field] === undefined) return;
    next[field] = toDotted(next[field]);
  });

  // Кожна копія двійника лишається своєю: `createdAt` рахується локальним часом,
  // `createdAt2` — UTC, і після 21:00 за Києвом це різні дати. Тому наявне
  // значення лише переписується у власне написання, а виводиться з сусіда тільки
  // те, чого в записі немає.
  Object.entries(LEGACY_TWIN_DATE_FIELDS).forEach(([dotted, iso]) => {
    const dottedValue = typeof payload[dotted] === 'string' ? payload[dotted] : '';
    const isoValue = typeof payload[iso] === 'string' ? payload[iso] : '';
    if (!dottedValue && !isoValue) return;
    next[dotted] = formatDateToDisplay(dottedValue || isoValue);
    next[iso] = formatDateToServer(isoValue || dottedValue);
  });

  return next;
};

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

const normalizeIndexedValues = value => Array.isArray(value)
  ? value.filter(Boolean)
  : value && typeof value === 'object'
    ? Object.values(value).filter(Boolean)
    : typeof value === 'string'
      ? [value].filter(Boolean)
      : [];


/**
 * Оновлює урізану картку після запису анкети.
 *
 * Стоїть у самих писачах (`updateDataInRealtimeDB`, `updateProfileNodesInRTDB`),
 * а не у викликачів: правити анкету можна з кількох екранів, і хук на кожному з
 * них рано чи пізно десь забули б поставити. Часткове оновлення (`update`) не
 * містить усієї анкети, тож запис перечитується — одне читання на збереження,
 * тоді як виграш це дає на кожному показі стрічки.
 *
 * Ніколи не кидає: проєкція — це прискорення читання, а не частина збереження.
 */
/**
 * Перечитати анкету, щоб зібрати з неї картку стрічки.
 *
 * Часткове збереження (`update`) не несе всієї анкети, а картка збирається з
 * усієї: без перечитування вона згубила б поля, яких у цьому записі не було.
 * Читається — з нових вузлів, бо саме вони джерело істини; legacy лишається
 * запасним шляхом для анкет, які ще не переїхали, і зникне разом із собою.
 */
const readProfileForMatchingCard = async id => {
  const fromNodes = await readProfileFromNodes(id, { includeTechnical: true });
  if (fromNodes) return fromNodes;

  try {
    const snapshot = await get(ref2(database, `users/${id}`));
    return snapshot.exists() ? snapshot.val() : null;
  } catch (error) {
    console.warn('[matchingCards] анкету не вдалося перечитати для картки', { userId: id, error });
    return null;
  }
};

const runMatchingCardRefresh = async (id, payload, condition) => {
  try {
    // Перечитане знизу, збережене зверху. `publish` власного вузла не має —
    // у нових вузлах він виражений наявністю `feedDate` у самій картці, тобто
    // перечитування дає його *попередній* стан. Без цього накладання зняття
    // публікації не спрацювало б жодного разу: картка перебудувалась би зі
    // старою датою і лишилась у стрічці.
    const stored = condition === 'update' ? await readProfileForMatchingCard(id) : null;
    const nextData = condition === 'update' ? { ...(stored || {}), ...payload } : payload;
    if (!nextData || typeof nextData !== 'object') return;
    await syncMatchingCardIndex(id, nextData);
  } catch (error) {
    console.warn('[matchingCards] не вдалося оновити картку після збереження анкети', { userId: id, error });
  }
};

// Проєкція стрічки — рівно один прогін на картку за раз.
//
// Кожен запис в анкету тягне за собою перечитування анкети, читання самої
// проєкції і (коли в анкеті немає фото) рекурсивний лістинг Storage. Поки ці
// прогони йшли паралельно, N записів поспіль давали N незалежних `set` в один
// і той самий вузол, зібраних з N різних читань анкети. Вигравав не найсвіжіший
// стан, а той прогін, що завершився останнім, — і проєкція лишалась зі старим
// імʼям, хоча в `users` уже лежало нове. Стрічка читає саме проєкцію, тож для
// ока це виглядало як «зміна не збереглась».
//
// Тепер на картку є щонайбільше один активний прогін і один відкладений.
// Відкладені не копичаться: той, що чекає, однаково перечитає анкету, коли
// дійде до нього черга, тож усі, хто прийшов за час очікування, отримують
// рівно його. Звідси й друга властивість: сплеск із десятка записів коштує
// дві пари читання-запис, а не десять.
const matchingCardRefreshes = new Map();

/**
 * Розкладає збережені поля по їхніх вузлах.
 *
 * Це друга половина запису анкети: перша поклала все в legacy `/users` (її
 * читає мобільний застосунок і ще не перенесена веб-логіка), а ця кладе кожне
 * поле туди, де воно живе після розділення — контакти в `profileContacts`,
 * робочі позначки в `profileWorkflow` і так далі.
 *
 * Один мультилокаційний `update` від кореня: RTDB застосовує його атомарно, тож
 * анкета не розʼїжджається по вузлах наполовину.
 *
 * Ніколи не кидає — але каже, чи щось доїхало. Відмова на одному вузлі не
 * скасовує решту (права на них різні), а виклик нагорі вирішує сам, чи вважати
 * збереження провальним: анкета втрачена лише тоді, коли не прийняв ані
 * жоден вузол, ані legacy. Тиші тут теж немає — відмова йде в консоль із
 * переліком шляхів, які не доїхали.
 *
 * @returns {Promise<boolean>} чи прийняв запис хоч один вузол.
 */
const fanOutProfileNodes = async (userId, payload) => {
  // `getInTouch` і `writer` — не поля анкети, а персональні позначки того, хто
  // їх поставив, тож вони їдуть не у вузол профілю, а під власника в
  // `multiData`. Значення там сидить у назві ключа, і зміна значення — це
  // переїзд, а не запис; цим займаються `setOwnerGetInTouch` і `setOwnerWriter`.
  if (payload && Object.prototype.hasOwnProperty.call(payload, 'getInTouch')) {
    const ownerId = auth.currentUser?.uid;
    if (ownerId) await setOwnerGetInTouch(ownerId, userId, payload.getInTouch);
  }

  if (payload && Object.prototype.hasOwnProperty.call(payload, 'writer')) {
    const ownerId = auth.currentUser?.uid;
    if (ownerId) await setOwnerWriter(ownerId, userId, payload.writer);
  }

  const patch = buildProfileNodePatch(userId, payload);
  const paths = Object.keys(patch);
  // Порожній патч — це не відмова: писати не було чого.
  if (!paths.length) return true;

  // Запис іде вузол за вузлом, а не одним патчем від кореня, і саме тому, що
  // мультилокаційний `update` атомарний. Права на нові вузли різні: редактор
  // матчингу без токена контактів має право на `profileDetails`, але не на
  // `profileContacts`. В одному патчі відмова на одному шляху скасувала б
  // запис і в решту вузлів — тобто одне закрите право тихо знеструмило б усе
  // розділення. Окремими записами відмова лишається там, де вона є.
  const byNode = paths.reduce((acc, path) => {
    const node = path.split('/')[0];
    (acc[node] = acc[node] || {})[path] = patch[path];
    return acc;
  }, {});

  const results = await Promise.all(Object.entries(byNode).map(async ([node, nodePatch]) => {
    try {
      await update(ref2(database, '/'), nodePatch);
      return true;
    } catch (error) {
      console.warn('[profileNodes] вузол не оновлено', {
        userId,
        node,
        paths: Object.keys(nodePatch),
        error,
      });
      return false;
    }
  }));

  return results.some(Boolean);
};

// ---------------------------------------------------------------------------
// Позначки власника в `multiData`
//
// `getInTouch` («коли звʼязатись») і `writer` («хто і чим уже спілкувався») —
// це не поля анкети, а позначки того, хто їх поставив. В анкеті вони опинились
// лише тому, що іншого місця не було. Обидві живуть однаково, і значення в них
// сидить у назві ключа:
//
//   multiData/{поле}/{ownerId}/{значення}/{profileId}: true
//
// Так однакове значення не плодить тисячі однакових підструктур: «2099-99-99»
// на пів тисячі карток — це один вузол із пів тисячею прапорців, а не пів
// тисячі вузлів з однаковим рядком усередині.
//
// Ціна цієї форми — відповідь на питання «яке значення в цієї картки» більше не
// лежить поруч із карткою. Тому мапа власника читається цілком, один раз на
// сесію, і тримається в памʼяті: вона потрібна на кожен список, а важить
// стільки ж, скільки важили б ті самі значення в анкетах.
//
// Реалізація одна на обидва поля навмисно: дві копії того самого коду
// розійшлись би на першій же правці, і одне з полів тихо лишилось би зі старою
// поведінкою.
// ---------------------------------------------------------------------------

const OWNER_GET_IN_TOUCH_PATH = 'multiData/getInTouch';
const OWNER_WRITER_PATH = 'multiData/writer';
const OWNER_STIMULATION_SCHEDULE_PATH = 'multiData/stimulationSchedule';

/** `шлях::owner -> Promise<{ profileId: значення }>`. */
const ownerValueMapCache = new Map();

/**
 * Стара форма запису: `{owner}/{значення}/{profileId}: true`.
 *
 * Впізнається однозначно — обʼєкт, у якому кожне значення дорівнює `true`.
 * Ані дата, ані нотатка, ані графік стимуляції так не виглядають: у графіка
 * під ключами лежать рядки й таблиці, а не самі лише прапорці.
 */
const isLegacyOwnerValueGroup = value => (
  value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
  && Object.keys(value).length > 0
  && Object.values(value).every(flag => flag === true)
);

/**
 * `profileId -> значення` для одного власника і одного поля.
 *
 * Читається так, як лежить: під власником — анкети, під анкетою — значення.
 * Перевертати структуру більше не треба, і саме тому база вміє її сортувати
 * (`orderByValue` по `.indexOn: ".value"`), а не тільки віддати цілком.
 */
const readOwnerValueMap = async (path, ownerId) => {
  const owner = String(ownerId || '').trim();
  if (!owner) return {};

  const cacheKey = `${path}::${owner}`;
  const cached = ownerValueMapCache.get(cacheKey);
  if (cached) return cached;

  const pending = (async () => {
    try {
      const snapshot = await get(ref2(database, `${path}/${owner}`));
      if (!snapshot.exists()) return {};
      const map = {};
      Object.entries(snapshot.val() || {}).forEach(([key, value]) => {
        if (value === null || value === undefined) return;
        // Позначки, записані до переїзду, лежать навпаки: під значенням —
        // набір карток прапорцями. Читач розуміє обидві форми, бо інакше все,
        // поставлене до цього релізу, зникло б з карток мовчки. Розрізняє їх
        // сама форма: під анкетою лежить значення, під значенням — `true`.
        if (isLegacyOwnerValueGroup(value)) {
          Object.keys(value).forEach(profileId => {
            map[profileId] = key;
          });
          return;
        }
        map[key] = value;
      });
      return map;
    } catch (error) {
      console.warn('[multiData] не вдалося прочитати мапу власника', { path, ownerId: owner, error });
      return {};
    }
  })();

  ownerValueMapCache.set(cacheKey, pending);
  return pending;
};

/** Скидає памʼять — після власного запису або зміни власника. */
const invalidateOwnerValueMap = (path, ownerId) => {
  if (ownerId) {
    ownerValueMapCache.delete(`${path}::${String(ownerId).trim()}`);
    return;
  }
  [...ownerValueMapCache.keys()]
    .filter(key => key.startsWith(`${path}::`))
    .forEach(key => ownerValueMapCache.delete(key));
};

/**
 * Ставить (або знімає) позначку власника для однієї картки.
 *
 * Один запис в одну адресу: значення лежить значенням, тож зміна позначки —
 * це запис, а не переїзд між ключами. Зняття — `null` у тій самій адресі.
 */
const setOwnerValue = async (path, ownerId, profileId, value) => {
  const owner = String(ownerId || '').trim();
  const id = String(profileId || '').trim();
  if (!owner || !id) return false;

  const hasValue = value !== null && value !== undefined
    && (typeof value !== 'string' || value.trim() !== '');
  const nextValue = hasValue && typeof value === 'string' ? value.trim() : value;

  const map = await readOwnerValueMap(path, owner);
  const previous = map[id];
  if (!hasValue && previous === undefined) return true;
  if (hasValue && previous === nextValue) return true;

  try {
    await set(ref2(database, `${path}/${owner}/${id}`), hasValue ? nextValue : null);
    // Мапа оновлюється на місці — перечитувати цілий вузол заради однієї зміни
    // означало б платити за кожну позначку читанням усього списку власника.
    const nextMap = { ...map };
    if (hasValue) nextMap[id] = nextValue;
    else delete nextMap[id];
    ownerValueMapCache.set(`${path}::${owner}`, Promise.resolve(nextMap));
    return true;
  } catch (error) {
    console.warn('[multiData] позначку не збережено', { path, ownerId: owner, profileId: id, error });
    return false;
  }
};

export const readOwnerGetInTouchMap = ownerId => readOwnerValueMap(OWNER_GET_IN_TOUCH_PATH, ownerId);

export const invalidateOwnerGetInTouchMap = ownerId => (
  invalidateOwnerValueMap(OWNER_GET_IN_TOUCH_PATH, ownerId)
);

export const setOwnerGetInTouch = (ownerId, profileId, value) => (
  setOwnerValue(OWNER_GET_IN_TOUCH_PATH, ownerId, profileId, value)
);

export const readOwnerWriterMap = ownerId => readOwnerValueMap(OWNER_WRITER_PATH, ownerId);

export const invalidateOwnerWriterMap = ownerId => invalidateOwnerValueMap(OWNER_WRITER_PATH, ownerId);

export const setOwnerWriter = (ownerId, profileId, value) => (
  setOwnerValue(OWNER_WRITER_PATH, ownerId, profileId, value)
);

export const readOwnerStimulationScheduleMap = ownerId => (
  readOwnerValueMap(OWNER_STIMULATION_SCHEDULE_PATH, ownerId)
);

export const invalidateOwnerStimulationScheduleMap = ownerId => (
  invalidateOwnerValueMap(OWNER_STIMULATION_SCHEDULE_PATH, ownerId)
);

export const setOwnerStimulationSchedule = (ownerId, profileId, value) => (
  setOwnerValue(OWNER_STIMULATION_SCHEDULE_PATH, ownerId, profileId, value)
);

/**
 * Позначки власника, впорядковані базою.
 *
 * Ось заради чого значення лежить значенням: `orderByValue()` по індексу
 * `.value` віддає картки вже в потрібному порядку — і, за потреби, лише
 * потрібний діапазон дат. Раніше для цього довелось би прочитати весь вузол
 * власника і сортувати його в памʼяті браузера.
 */
export const readOwnerGetInTouchSorted = async (ownerId, { from, to, limit } = {}) => {
  const owner = String(ownerId || '').trim();
  if (!owner) return [];

  const constraints = [orderByValue()];
  if (from) constraints.push(startAt(from));
  if (to) constraints.push(endAt(to));
  if (limit) constraints.push(limitToFirst(limit));

  try {
    const snapshot = await get(query(ref2(database, `${OWNER_GET_IN_TOUCH_PATH}/${owner}`), ...constraints));
    const rows = [];
    // `forEach` знімка — єдиний спосіб не втратити порядок: звичайний обʼєкт
    // його не тримає.
    snapshot.forEach(child => {
      rows.push({ userId: child.key, getInTouch: child.val() });
    });
    return rows;
  } catch (error) {
    console.warn('[multiData] не вдалося прочитати впорядковані позначки', { ownerId: owner, error });
    return [];
  }
};

const refreshMatchingCardAfterProfileWrite = async (userId, payload, condition) => {
  const id = String(userId || '').trim();
  if (!id) return;

  const active = matchingCardRefreshes.get(id);
  if (active) {
    active.pending = { payload, condition };
    return active.done;
  }

  const entry = { pending: null, done: null };
  matchingCardRefreshes.set(id, entry);
  entry.done = (async () => {
    try {
      let next = { payload, condition };
      while (next) {
        entry.pending = null;
        await runMatchingCardRefresh(id, next.payload, next.condition);
        next = entry.pending;
      }
    } finally {
      matchingCardRefreshes.delete(id);
    }
  })();

  return entry.done;
};

/**
 * Дзеркалення анкети в legacy-колекцію.
 *
 * Дзеркалення двостороннє: мобільний застосунок пише в `/users` і читає звідти,
 * тож веб мусить класти туди свої зміни. Але це саме дзеркало, а не збереження:
 * коли `/users` перестане підтримуватись — вузол приберуть, права закриють —
 * запис сюди почне відмовляти, і веб не має від цього падати. Тому відмова тут
 * не кидається далі, а повертається викликачу, який уже вирішує, чи анкета
 * взагалі кудись збереглась.
 *
 * @returns {Promise<boolean>} чи прийняла legacy-колекція запис.
 */
const mirrorProfileToLegacyUsers = async (userId, payload, condition) => {
  try {
    const legacyRef = ref2(database, `users/${userId}`);
    // Дати переписуються у формат мобільного застосунку рівно тут — на єдиному
    // вході в legacy. Вузли й картка стрічки лишаються в ISO.
    const legacyPayload = formatDatesForLegacyUsers(payload);
    if (condition === 'update') await update(legacyRef, legacyPayload);
    else await set(legacyRef, legacyPayload);
    return true;
  } catch (error) {
    console.warn('[legacy] анкету не вдалося віддзеркалити в стару колекцію', {
      userId,
      error,
    });
    return false;
  }
};

/**
 * Анкета не збереглась нікуди.
 *
 * Окремий текст, бо це єдиний випадок, коли користувач мусить побачити помилку:
 * коли адресатів двоє, відмова одного — це знижена надлишковість, і мовчати про
 * неї можна; відмова всіх — це втрачені дані, і мовчати про неї не можна.
 */
const throwProfileWriteFailure = (userId, targets) => {
  const error = new Error(`Анкету ${userId} не збережено: запис не прийняли ${targets}.`);
  error.code = 'PROFILE_WRITE_FAILED';
  throw error;
};

export const updateDataInRealtimeDB = async (userId, uploadedInfo, condition) => {
  try {
    const cleanedUploadedInfo = normalizeStoredDates(stripTransientUserDataFields(uploadedInfo, {
      markForRealtimeDeletion: condition === 'update',
    }));

    // Спершу вузли — вони джерело істини для веба, і саме їх читає застосунок.
    // Legacy йде другим: це дзеркало для мобільного застосунку, і його відмова
    // не має скасовувати збереження.
    const nodesWritten = await fanOutProfileNodes(userId, cleanedUploadedInfo);
    const legacyWritten = await mirrorProfileToLegacyUsers(userId, cleanedUploadedInfo, condition);
    if (!nodesWritten && !legacyWritten) throwProfileWriteFailure(userId, 'ні нові вузли, ні стара колекція');

    await refreshMatchingCardAfterProfileWrite(userId, cleanedUploadedInfo, condition);
  } catch (error) {
    console.error(
      'Сталася помилка під час збереження даних в Realtime Database2:',
      error
    );
    throw error;
  }
};

/**
 * Зберегти анкету, яка живе тільки в нових вузлах.
 *
 * На відміну від `updateDataInRealtimeDB`, тіла в legacy-колекції в такої
 * анкети немає — її не читає ані мобільний застосунок, ані стара веб-логіка,
 * тож і дзеркалити нема куди. Натомість цей писач сам тримає в актуальному
 * стані `searchId`: анкету, заведену у вебі, шукають саме за контактами.
 */
export const updateProfileNodesInRTDB = async (userId, uploadedInfo, condition, skipIndexing = false) => {
  try {
    uploadedInfo = sanitizeUploadedInfoPhones(uploadedInfo);
    // Попередній стан потрібен лише для звірки пошукових індексів. Коли анкету
    // прочитати не вдалось, звірка йде від порожнього — нові значення все одно
    // проіндексуються, а зняти старі однаково нема з чого.
    const currentUserDataRaw = (await readProfileFromNodes(userId, { includeTechnical: true })) || {};
    const currentUserData = sanitizeUploadedInfoPhones(currentUserDataRaw) || {};

    if (!skipIndexing) {
      // Перебір ключів та їх обробка
      for (const key of keysToCheck) {
        const currentValues = normalizeIndexedValues(currentUserData?.[key]);
        const shouldRemoveKey = uploadedInfo[key] === ''
          || uploadedInfo[key] === null
          || (condition !== 'update' && uploadedInfo[key] === undefined);

        if (shouldRemoveKey) {
          console.log(`${key} має пусте або null значення. Видаляємо.`);
          for (const value of currentValues) {
            const cleanedValue = key === 'phone' ? normalizePhoneForStorage(value) : value;
            await updateSearchId(key, String(cleanedValue).toLowerCase(), userId, 'remove');
          }
          uploadedInfo[key] = null;
          continue;
        }

        if (uploadedInfo[key] !== undefined) {
          // console.log(`${key} uploadedInfo[key] :>> `, uploadedInfo[key]);

          // Формуємо currentValues
          // Формуємо newValues
          const newValues = normalizeIndexedValues(uploadedInfo[key]);

          // console.log(`${key} currentValues :>> `, currentValues);
          // console.log(`${key} newValues :>> `, newValues);

          // Значення, яких більше немає в новому масиві, лишаються в індексі.
          // Змінена пошта — не зникла пошта: анкету шукають ще й ті, хто знає
          // лише старий контакт. Юзер бачить у себе тільки нову адресу, а
          // адмін бачить обидві й сам вирішує, чи стару зносити. Ключ
          // знімається вище — коли поле стерли навмисно.

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
    const cleanedUploadedInfo = normalizeStoredDates(stripTransientUserDataFields(uploadedInfo, {
      markForRealtimeDeletion: condition === 'update',
    }));

    const nodesWritten = await fanOutProfileNodes(userId, cleanedUploadedInfo);
    if (!nodesWritten) throwProfileWriteFailure(userId, 'вузли анкети');

    if (cleanedUploadedInfo.lastLogin2 !== undefined) {
      try {
        await update(ref2(database, `users/${userId}`), { lastLogin2: cleanedUploadedInfo.lastLogin2 });
      } catch (e) {
        console.error('Error updating lastLogin2 in users:', e);
      }
    }

    await refreshMatchingCardAfterProfileWrite(userId, cleanedUploadedInfo, condition);

    clearEmptySearchQueryCache();
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

const collectUserStorageAvatarItems = async userId => {
  const folderRef = ref(storage, `avatar/${userId}`);
  const collectStorageItems = async currentFolderRef => {
    const list = await listAll(currentFolderRef);
    const nestedItems = await Promise.all(list.prefixes.map(prefix => collectStorageItems(prefix)));
    return [...list.items, ...nestedItems.flat()];
  };

  return collectStorageItems(folderRef);
};

const getStorageContentTypeFromName = item => {
  const extension = String(item?.name || '').split('.').pop()?.toLowerCase();
  if (extension === 'png') return 'image/png';
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  return null;
};

const getStorageContentTypeFromBytes = bytes => {
  const byteArray = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (byteArray[0] === 0xff && byteArray[1] === 0xd8 && byteArray[2] === 0xff) return 'image/jpeg';
  if (byteArray[0] === 0x89 && byteArray[1] === 0x50 && byteArray[2] === 0x4e && byteArray[3] === 0x47) return 'image/png';
  if (byteArray[0] === 0x47 && byteArray[1] === 0x49 && byteArray[2] === 0x46) return 'image/gif';
  if (byteArray[0] === 0x42 && byteArray[1] === 0x4d) return 'image/bmp';
  if (
    byteArray[0] === 0x52 && byteArray[1] === 0x49 && byteArray[2] === 0x46 && byteArray[3] === 0x46
    && byteArray[8] === 0x57 && byteArray[9] === 0x45 && byteArray[10] === 0x42 && byteArray[11] === 0x50
  ) return 'image/webp';
  return null;
};

const bytesToBase64 = bytes => {
  const byteArray = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < byteArray.length; index += chunkSize) {
    binary += String.fromCharCode(...byteArray.subarray(index, index + chunkSize));
  }

  if (typeof btoa === 'function') {
    return btoa(binary);
  }
  return Buffer.from(binary, 'binary').toString('base64');
};

const isMedicationStorageItem = (item, userId) => String(item?.fullPath || '').startsWith(`avatar/${userId}/medication/`);

export const getUserStorageAvatarPhotos = async userId => {
  if (!userId) return [];

  try {
    const items = await collectUserStorageAvatarItems(userId);
    const settledUrls = await Promise.allSettled(
      items
        .filter(item => !isMedicationStorageItem(item, userId))
        .map(item => getDownloadURL(item))
    );
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

const blobToDataUrl = blob => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : '');
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(blob);
});

// Loads every photo from Storage avatar/{userId} (except medication/) as a data URL.
// Never throws: each file carries its own error text, and a listing failure is
// returned in `error` — callers surface these in the PDF debug output.
export const getUserStorageAvatarPhotoFiles = async userId => {
  if (!userId) return { items: [], error: 'no userId provided' };

  let items;
  try {
    items = await collectUserStorageAvatarItems(userId);
  } catch (error) {
    console.error('Error listing user photo bytes from Storage:', error);
    return { items: [], error: `listAll(avatar/${userId}) failed: ${error?.code || ''} ${error?.message || String(error)}`.trim() };
  }

  const photoItems = items.filter(item => !isMedicationStorageItem(item, userId));
  const files = await Promise.all(
    photoItems.map(async item => {
      const file = {
        path: String(item?.fullPath || ''),
        name: String(item?.name || ''),
        size: 0,
        contentType: '',
        dataUrl: '',
        source: '',
        error: '',
      };

      try {
        const bytes = await getBytes(item);
        const byteArray = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
        file.size = byteArray.length;
        file.contentType = getStorageContentTypeFromBytes(byteArray) || getStorageContentTypeFromName(item) || 'image/jpeg';
        file.dataUrl = `data:${file.contentType};base64,${bytesToBase64(byteArray)}`;
        file.source = 'getBytes';
        return file;
      } catch (bytesError) {
        const bytesMessage = `getBytes failed: ${bytesError?.code || ''} ${bytesError?.message || String(bytesError)}`.trim();
        try {
          const url = await getDownloadURL(item);
          const response = await fetch(url);
          if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
          const blob = await response.blob();
          file.size = blob.size;
          file.contentType = blob.type || getStorageContentTypeFromName(item) || 'image/jpeg';
          file.dataUrl = await blobToDataUrl(blob);
          file.source = 'downloadUrl-fetch';
          file.error = bytesMessage;
          return file;
        } catch (fetchError) {
          file.error = `${bytesMessage}; downloadUrl/fetch failed: ${fetchError?.code || ''} ${fetchError?.message || String(fetchError)}`.trim();
          console.error('Error loading user photo bytes from Storage:', item?.fullPath, bytesError, fetchError);
          return file;
        }
      }
    })
  );

  return { items: files, error: '' };
};

// Читає рівно `${collection}/${userId}/photos`, а не весь вузол анкети.
// Стрічка викликає це для кожної картки, чию анкету щойно гідратувала повністю —
// читання цілого вузла заради одного поля означало другу копію тієї самої анкети
// в трафіку на кожну картку.
const readPhotosField = async (collection, userId) => {
  const snapshot = await get(ref2(database, `${collection}/${userId}/photos`));
  return snapshot.exists() ? normalizePhotoValues(snapshot.val()) : null;
};

/**
 * Фото живуть у `profileDetails` — там їхнє місце після переїзду.
 *
 * Питати їх тут, а не в legacy, — це не оптимізація, а умова того, що галерея
 * працює далі, коли `users` не стане. `null` означає «у вузлі цього немає», і
 * тоді читач повертається до старої колекції.
 */
const readPhotosFromProfileNode = async userId => {
  try {
    const snapshot = await get(ref2(database, `${PROFILE_NODES.profileDetails}/${userId}/photos`));
    return snapshot.exists() ? normalizePhotoValues(snapshot.val()) : null;
  } catch (error) {
    console.error('Error loading user photos from profileDetails:', error);
    return null;
  }
};

export const getAllUserPhotos = async (userId, { includeStorage = true, knownPhotos = null } = {}) => {
  if (!userId) return [];

  const storageUrls = includeStorage ? await getUserStorageAvatarPhotos(userId) : [];

  let databaseUrls;
  const fromProfileNode = Array.isArray(knownPhotos) ? null : await readPhotosFromProfileNode(userId);

  if (Array.isArray(knownPhotos)) {
    // Викликач уже тримає анкету в руках (щойно гідратував картку) — ходити за
    // тим самим полем у базу вдруге нема за чим.
    databaseUrls = normalizePhotoValues(knownPhotos);
  } else if (fromProfileNode !== null) {
    databaseUrls = fromProfileNode;
  } else {
    const snapshots = await Promise.allSettled([readPhotosField('users', userId)]);
    databaseUrls = snapshots.flatMap(result => {
      if (result.status === 'rejected') {
        console.error('Error loading user photos from users:', result.reason);
        return [];
      }
      return result.value || [];
    });
  }

  const urls = [...storageUrls, ...databaseUrls]
    .map(convertDriveLinkToImage)
    .filter(Boolean);

  return Array.from(new Set(filterOutMedicationPhotos(urls, userId)));
};

// ---------------------------------------------------------------------------
// matchingCards — урізана картка під стрічку матчингу
//
// Читач стрічки більше не тягне повні анкети: він бере цей вузол. Писач тримає
// його в актуальному стані на кожному збереженні анкети адміном, а разова
// індексація з AddNewProfile добудовує його для анкет, які ще жодного разу не
// зберігали після появи цієї проєкції.
// ---------------------------------------------------------------------------

// Стеля вікна пагінації урізаних карток. Вище її не піднімають: якщо стільки
// карток ділять одну дату `lastLogin2`, проблема в даних, а не в розмірі вікна.
const MATCHING_CARDS_PAGE_WINDOW_CAP = 512;

// У скільки разів перше вікно ширше за порцію.
//
// Запас потрібен через збіг дат: `lastLogin2` — це день, тож курсор регулярно
// стоїть усередині групи карток з тією самою датою, і вікно рівно на
// `limit + 1` після відсікання за парою (дата, id) лишало менше, ніж треба.
// Без запасу кожна зі 120 сторінок поспіль ішла на друге коло.
//
// Четверний запас закладався тоді, коли вікно наполовину складалося з карток,
// які однаково не показуються. Тепер в індексі стрічки лежать лише показані,
// і запас можна міряти самим збігом дат: на живих даних 277 показаних карток
// розкидані по 219 датах, найбільша група однією датою — 4, найгірший випадок
// «група + порція» — 10 карток. Подвійний запас це покриває, а подвоєння вікна
// лишається запасним ходом на випадок, якого замір не бачив.
const MATCHING_CARDS_FIRST_WINDOW_FACTOR = 2;

const buildMatchingCardRef = userId => ref2(database, `${MATCHING_CARDS_ROOT}/${userId}`);

const readMatchingCardRaw = async userId => {
  const snapshot = await get(buildMatchingCardRef(userId));
  return snapshot.exists() ? snapshot.val() : null;
};

/**
 * Аватар для проєкції.
 *
 * Дешевий шлях — поле `photos` анкети. Дорогий — рекурсивний лістинг
 * `avatar/{userId}` у Storage, і саме його стрічка робила на кожній картці при
 * кожному відкритті сторінки. Тут він робиться щонайбільше раз на збереження
 * анкети, а результат лягає в базу, тож переглядач не платить за нього ніколи.
 */
const resolveMatchingCardAvatar = async (userId, data, { includeStorage = true } = {}) => {
  const fromProfile = resolveMatchingCardAvatarFromProfile(data);
  if (fromProfile) return fromProfile;
  if (!includeStorage) return '';
  try {
    const storageUrls = await getUserStorageAvatarPhotos(userId);
    const usable = filterOutMedicationPhotos(storageUrls, userId).map(convertDriveLinkToImage).filter(Boolean);
    return usable[0] || '';
  } catch (error) {
    // Аватар — не привід завалити збереження анкети.
    console.warn('[matchingCards] не вдалося зчитати аватар зі Storage', { userId, error });
    return '';
  }
};

/**
 * Приводить `matchingCards/{userId}` у відповідність до анкети.
 *
 * Викликається поруч із `syncUserSearchKeyIndex` — там, де анкету вже зберегли,
 * і там, де вже відомі і попередні, і нові дані. Коли жодне поле стрічки не
 * змінилось, запис не робиться взагалі: правка коментаря чи контакту не має
 * коштувати ще одного запису в базу.
 */
export const syncMatchingCardIndex = async (userId, nextData = {}, options = {}) => {
  const id = String(userId || '').trim();
  if (!id) return null;

  const hasProfileData = Boolean(nextData) && typeof nextData === 'object' && Object.keys(nextData).length > 0;
  if (!hasProfileData) return null;

  try {
    const existing = options.existingCard !== undefined ? options.existingCard : await readMatchingCardRaw(id);
    const knownAvatar = typeof options.avatar === 'string'
      ? options.avatar
      : await resolveMatchingCardAvatar(id, nextData, { includeStorage: options.includeStorageAvatar !== false });

    const projection = buildMatchingCardProjection(id, nextData, { avatar: knownAvatar });
    if (!projection) return null;

    if (existing && areMatchingCardProjectionsEqual(existing, projection)) return projection;

    await set(buildMatchingCardRef(id), projection);
    return projection;
  } catch (error) {
    console.error('[matchingCards] не вдалося оновити урізану картку', { userId: id, error });
    return null;
  }
};

/** Знімає картку зі стрічки разом з видаленням анкети. */
export const removeMatchingCardIndex = async userId => {
  const id = String(userId || '').trim();
  if (!id) return;
  try {
    await remove(buildMatchingCardRef(id));
  } catch (error) {
    console.error('[matchingCards] не вдалося видалити урізану картку', { userId: id, error });
  }
};

/**
 * Сторінка стрічки — один запит.
 *
 * Замість `limitToLast` по колекції `users` з повними анкетами (і циклу
 * подвоєння ліміту, який перечитував той самий зріз з нуля) тут звичайна
 * пагінація по курсору: `endAt(курсор)` + `limitToLast(limit + 1)` по вузлу,
 * де одна картка важить сотні байтів, а не кілобайти.
 */
const fetchMatchingCardsPageUncoalesced = async ({ limit = 10, cursor = null } = {}) => {
  const safeLimit = Math.max(1, Number(limit) || 1);
  const cardsRef = ref2(database, MATCHING_CARDS_ROOT);
  // Індекс стрічки містить лише показані картки колекції `users`, тож сторінка
  // приходить щільною і вже своєю: і фільтр показу, і розділення колекцій
  // відпрацювали в базі, а не в браузері.
  const orderField = MATCHING_CARD_ORDER_FIELD;
  const today = new Date().toISOString().split('T')[0];
  const upperBound = today;
  const normalizedCursor = cursor && typeof cursor === 'object'
    ? { date: String(cursor.date || ''), userId: String(cursor.userId || '') }
    : { date: String(cursor || ''), userId: '' };

  // +1 щоб дізнатись про наявність наступної сторінки, не роблячи другий запит.
  const fetchLimit = safeLimit + 1;

  // Перше вікно береться із запасом на збіг дат.
  //
  // `lastLogin2` — це день, тож курсор майже завжди стоїть усередині групи
  // карток з тією самою датою. Вікно рівно на `limit + 1` після відсікання за
  // парою (дата, id) лишало менше, ніж треба, вікно подвоювалось — і кожна
  // сторінка коштувала два запити замість одного. Запас дешевший за зайвий
  // круг: картка важить сотні байтів, а круг — це ще й затримка.
  const firstWindow = Math.min(
    MATCHING_CARDS_PAGE_WINDOW_CAP,
    Math.max(fetchLimit, safeLimit * MATCHING_CARDS_FIRST_WINDOW_FACTOR),
  );

  // `lastLogin2` — це дата з точністю до дня, тож курсор регулярно потрапляє в
  // групу карток з однаковою датою: `endAt` віддає їх усі, а відсікання за
  // парою (дата, id) лишає нуль нових. Тоді вікно розширюється — але, на
  // відміну від пагінації повних анкет, тут це дешево: картка важить сотні
  // байтів, і стеля стоїть на порядок нижче.
  let entries = [];
  let windowSize = firstWindow;

  while (windowSize <= MATCHING_CARDS_PAGE_WINDOW_CAP) {
    // Ключ стрічки і `lastLogin2` — обидва чисті дати, тож межа однакова для
    // будь-якого з них.
    const cursorBound = normalizedCursor.date || upperBound;
    // `startAt('')` excludes projections without `feedDate` and is part of the
    // database-rule contract: every signed-in viewer may scan published cards,
    // while unpublished projections remain unreadable as a collection.
    const cardsQuery = query(
      cardsRef,
      orderByChild(orderField),
      startAt(''),
      endAt(cursorBound),
      limitToLast(windowSize)
    );

    // eslint-disable-next-line no-await-in-loop
    const snapshot = await get(cardsQuery);
    if (!snapshot.exists()) return { users: [], lastKey: null, hasMore: false };

    const raw = snapshot.val() || {};
    const snapshotSize = Object.keys(raw).length;

    entries = Object.entries(raw).sort((a, b) => {
      const byDate = String(b[1]?.[MATCHING_CARD_ORDER_FIELD] || '').localeCompare(String(a[1]?.[MATCHING_CARD_ORDER_FIELD] || ''));
      return byDate !== 0 ? byDate : b[0].localeCompare(a[0]);
    });

    if (normalizedCursor.date) {
      entries = entries.filter(([id, card]) => {
        const date = String(card?.[MATCHING_CARD_ORDER_FIELD] || '');
        if (date < normalizedCursor.date) return true;
        if (date > normalizedCursor.date) return false;
        return normalizedCursor.userId ? id.localeCompare(normalizedCursor.userId) < 0 : false;
      });
    }

    // Досить карток, або вузол вичерпано — розширювати вікно нема сенсу.
    if (entries.length >= fetchLimit || snapshotSize < windowSize) break;
    windowSize *= 2;
  }

  const hasMore = entries.length > safeLimit;
  if (hasMore) entries = entries.slice(0, safeLimit);

  const users = entries
    .map(([id, card]) => expandMatchingCard(id, card))
    .filter(Boolean);
  const lastEntry = entries[entries.length - 1];

  return {
    users,
    lastKey: lastEntry
      ? { date: String(lastEntry[1]?.[MATCHING_CARD_ORDER_FIELD] || ''), userId: lastEntry[0] }
      : null,
    hasMore,
  };
};

/**
 * Сторінки в польоті — щоб та сама сторінка не читалась двічі.
 *
 * `loadInitial` і `loadMore` стартують незалежно один від одного, і другий
 * встигає піти в базу раніше, ніж перший поклав курсор у стан. Тобто обидва
 * читають ту саму першу сторінку. Замір на прод-збірці: два запити по 33 КБ,
 * обидва з `cursor: null`, з різницею 62 мс — тобто другий стартував усередині
 * першого, який іде ~190 мс. Половина трафіку стрічки була цим дублем.
 *
 * Однаковий запит — це однакова відповідь, тож другий викликач чекає на
 * перший замість власного круга. Тримається лише політ: щойно запит
 * завершився, ключ прибирається, і наступне читання тієї самої сторінки знову
 * піде в базу. Кешу тут немає — застарілої сторічки теж.
 *
 * Сторінка віддається кожному викликачу власною копією масиву: картки в ній
 * і так не мутують (`decorateUser` розкладає кожну в новий обʼєкт), але
 * спільний масив — це запрошення до помилки, яку потім не знайти.
 */
const matchingCardsPageInFlight = new Map();

const buildMatchingCardsPageKey = ({ limit, cursor }) => {
  const normalized = cursor && typeof cursor === 'object'
    ? `${cursor.date || ''}|${cursor.userId || ''}`
    : `${cursor || ''}|`;
  return `${limit}|${normalized}`;
};

export const fetchMatchingCardsPage = (options = {}) => {
  const key = buildMatchingCardsPageKey({
    limit: Math.max(1, Number(options.limit) || 1),
    cursor: options.cursor,
  });

  let pending = matchingCardsPageInFlight.get(key);
  if (!pending) {
    pending = fetchMatchingCardsPageUncoalesced(options).finally(() => {
      matchingCardsPageInFlight.delete(key);
    });
    matchingCardsPageInFlight.set(key, pending);
  }

  return pending.then(page => (
    page && Array.isArray(page.users) ? { ...page, users: [...page.users] } : page
  ));
};

/**
 * Урізані картки за списком id — шлях, яким ходить пошук по індексу
 * `searchKey`: індекс називає id, а показати треба картку.
 *
 * Це так само один запит на id, але картка на два порядки менша за анкету і не
 * тягне за собою ні другого читання заради `photos`, ні лістингу Storage.
 * Id, для якого проєкції ще немає (або вона старої версії), повертається в
 * `missingIds` — викликач догідратує його повною анкетою.
 */
export const fetchMatchingCardsByIds = async (ids = []) => {
  const uniqueIds = [...new Set((ids || []).filter(Boolean).map(String))];
  if (!uniqueIds.length) return { cards: {}, missingIds: [] };

  const cards = {};
  const missingIds = [];
  await Promise.all(uniqueIds.map(async id => {
    try {
      const raw = await readMatchingCardRaw(id);
      const expanded = isCurrentMatchingCardSchema(raw) ? expandMatchingCard(id, raw) : null;
      if (expanded) cards[id] = expanded;
      else missingIds.push(id);
    } catch (error) {
      console.warn('[matchingCards] не вдалося прочитати урізану картку', { userId: id, error });
      missingIds.push(id);
    }
  }));

  return { cards, missingIds };
};

const MATCHING_CARDS_BACKFILL_BATCH_SIZE = 200;
const MATCHING_CARDS_AVATAR_CONCURRENCY = 8;

const mapWithConcurrency = async (items, limit, worker) => {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = new Array(Math.min(limit, items.length)).fill(null).map(async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      // eslint-disable-next-line no-await-in-loop
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
};

const buildBackfillProjection = async (rawProfile, userId, includeStorageAvatars) => {
  const data = { ...(rawProfile || {}) };
  let avatar = resolveMatchingCardAvatarFromProfile(data);
  let avatarFromStorage = false;
  if (!avatar && includeStorageAvatars) {
    avatar = await resolveMatchingCardAvatar(userId, data, { includeStorage: true });
    avatarFromStorage = Boolean(avatar);
  }
  return { userId, projection: buildMatchingCardProjection(userId, data, { avatar }), avatarFromStorage };
};

/**
 * Разова побудова проєкцій для всієї колекції.
 *
 * Колекція читається один раз (через той самий кеш, що й решта індексацій), а
 * записи йдуть пачками через мультилокаційний `update` — тобто ~1 запит на 200
 * карток замість запиту на картку.
 *
 * `includeStorageAvatars` вмикає найдорожчу частину: для анкет без поля `photos`
 * доводиться лістити Storage. Це саме та робота, яку раніше робив кожен
 * переглядач при кожному завантаженні стрічки; тут вона робиться один раз.
 */
// PERMISSION_DENIED тут майже завжди означає одне: правила бази ще не викочені,
// і вузла `matchingCards` для них не існує — тоді діє заборона з кореня. Сира
// відповідь Firebase цього не каже й не підказує, що робити, тож перекладаємо її
// в текст, з якого видно і причину, і два виходи.
const MATCHING_CARDS_FAILURE_STAGES = {
  read: 'читання анкет',
  cleanup: 'прибирання застарілих карток у matchingCards',
  write: 'запис карток у matchingCards',
};

const describeMatchingCardsFailure = (error, { stage }) => {
  if (!/permission[_ ]denied/i.test(String(error?.message || error || ''))) return error;

  const where = MATCHING_CARDS_FAILURE_STAGES[stage] || stage;
  const explained = new Error(
    `Немає доступу: ${where}. Найімовірніше, не викочені правила бази — вузлів `
      + '`matchingCards` для правил ще не існує, тож діє заборона '
      + 'з кореня. Виконайте `firebase deploy --only database`. Або зберіть '
      + 'matchingCards.json локально і залийте його вручну: ручний імпорт іде повз правила.',
  );
  explained.cause = error;
  explained.code = 'MATCHING_CARDS_PERMISSION_DENIED';
  return explained;
};

export const createMatchingCardsIndex = async (onProgress, options = {}) => {
  const includeStorageAvatars = options.includeStorageAvatars !== false;
  let usersData;
  try {
    usersData = options?.usersData || (await loadProfilesFromNodesForIndexing());
  } catch (error) {
    throw describeMatchingCardsFailure(error, { stage: 'read' });
  }
  if (!usersData) return { total: 0, written: 0, skipped: 0, withStorageAvatar: 0 };

  // Перебудова авторитетна: картка, за якою вже немає анкети, зникає. Прогін
  // один на всю колекцію — тож жодного «а чи ця картка з моєї деки»: деки
  // одна, і все, чому немає анкети, тут зайве.
  try {
    const cardsSnapshot = await get(ref2(database, MATCHING_CARDS_ROOT));
    const stalePayload = {};
    Object.entries(cardsSnapshot.val() || {}).forEach(([id]) => {
      if (!usersData[id]) stalePayload[`${MATCHING_CARDS_ROOT}/${id}`] = null;
    });
    await update(ref2(database), stalePayload);
  } catch (error) {
    throw describeMatchingCardsFailure(error, { stage: 'cleanup' });
  }

  const userIds = Object.keys(usersData).filter(Boolean);
  const total = userIds.length;
  if (!total) {
    return { total: 0, written: 0, skipped: 0, withStorageAvatar: 0 };
  }

  let written = 0;
  let skipped = 0;
  let withStorageAvatar = 0;
  let processed = 0;

  for (let start = 0; start < userIds.length; start += MATCHING_CARDS_BACKFILL_BATCH_SIZE) {
    const batchIds = userIds.slice(start, start + MATCHING_CARDS_BACKFILL_BATCH_SIZE);

    // eslint-disable-next-line no-await-in-loop
    const projections = await mapWithConcurrency(batchIds, MATCHING_CARDS_AVATAR_CONCURRENCY, id =>
      buildBackfillProjection(usersData[id], id, includeStorageAvatars));

    const usable = projections.filter(entry => entry?.userId && entry.projection);
    withStorageAvatar += projections.filter(entry => entry?.avatarFromStorage).length;
    skipped += projections.filter(entry => entry?.userId && !entry.projection).length;
    written += usable.length;

    const chunkPayload = Object.fromEntries(
      usable.map(entry => [`${MATCHING_CARDS_ROOT}/${entry.userId}`, entry.projection]),
    );

    if (Object.keys(chunkPayload).length) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await update(ref2(database), chunkPayload);
      } catch (error) {
        throw describeMatchingCardsFailure(error, { stage: 'write' });
      }
    }

    processed += batchIds.length;
    if (typeof onProgress === 'function') {
      onProgress(Math.floor((processed / total) * 100), { processed, total });
    }
  }

  return { total, written, skipped, withStorageAvatar };
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

/**
 * Індекс `searchId` доповнюється, а не переписується.
 *
 * Змінена пошта — не зникла пошта. Анкету шукають ще й ті, хто знає лише
 * старий контакт, тож заміна значення додає новий ключ і лишає старий: юзер
 * бачить у себе тільки нову адресу, адмін бачить обидві й сам вирішує, чи
 * стару зносити. Знімається ключ лише тоді, коли поле стерли навмисно —
 * тобто воно прийшло в `deletedKeys`.
 */
export const syncUserSearchIdIndex = async (userId, prevData = {}, nextData = {}, deletedKeys = []) => {
  if (!userId) return;

  const explicitlyDeletedKeys = new Set(getExplicitlyDeletedKeys(deletedKeys));

  for (const key of getSubmittedSearchIndexKeys(keysToCheck, nextData, deletedKeys)) {

    const prevCandidates = new Set(
      extractIndexableFieldValues(prevData[key]).flatMap(value => buildSearchIndexCandidates(key, value))
    );
    const nextCandidates = new Set(
      extractIndexableFieldValues(nextData[key]).flatMap(value => buildSearchIndexCandidates(key, value))
    );

    for (const candidate of explicitlyDeletedKeys.has(key) ? prevCandidates : []) {
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

  // Обидва написання: у базі дата лежить у `РРРР-ММ-ДД`, у legacy-анкетах —
  // крапками. Приймати лише одне означало б, що половина анкет індексується
  // як «вік невідомий».
  const dotted = normalized.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  const iso = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const match = dotted || iso;
  if (!match) return '?';

  const day = Number.parseInt(dotted ? match[1] : match[3], 10);
  const month = Number.parseInt(match[2], 10);
  const year = Number.parseInt(dotted ? match[3] : match[1], 10);

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

// Stored as one of four range buckets rather than the raw count: a filter then reads
// the ranges it asked for instead of the whole node, and the index stops producing
// numeric keys that RTDB hands back as a sparse array.
const normalizeFieldCountSearchKeyIndexValue = data => resolveProfileFieldCountBucket(data);

const getFieldCountIndexSet = data => {
  return new Set([normalizeFieldCountSearchKeyIndexValue(data)]);
};

// BMI and country are derived, not stored, so both sides use the shared resolver.
const getBmiIndexSet = data => {
  if (!data || typeof data !== 'object') return new Set();
  return new Set([resolveBmiBucket(data)]);
};

const getCountryIndexSet = data => {
  if (!data || typeof data !== 'object') return new Set();
  return new Set([resolveCountryBucket(data)]);
};

export const normalizeRoleSearchKeyIndexValue = (roleValue, userRoleValue) => {
  const normalizeSingleRole = value => {
    if (!String(value || '').trim()) return '';
    return normalizeProfileRole(value) || '?';
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

// `includeUnofferedBuckets` reconciles the index with the drawer: Matching has no
// "no" checkbox for age, and its post-filter counts a profile without a birth date
// as "?", so the `no` bucket has to follow the "?" option instead of being dropped.
export const collectAgeIdsByFilters = async (
  ageFilters,
  rootPaths = [SEARCH_KEY_INDEX_ROOT],
  { includeUnofferedBuckets = false, emptyBucketStored = false } = {},
) => {
  const shouldApplyAge = hasExplicitFilterSelection(ageFilters);
  if (!shouldApplyAge) return null;

  const selected = key => Boolean(ageFilters?.[key]);

  const specialBucketSelected = bucket => {
    if (includeUnofferedBuckets) {
      return isBucketSelectedByFilterGroup(ageFilters, bucket, { bucketMap: AGE_BUCKET_FILTER_KEYS });
    }
    return bucket === '?' ? selected('other') || selected('?') : selected('empty') || selected('no');
  };

  // Profiles without a birth date are not in the searchKey index at all, so a
  // selection that keeps them cannot be answered by reading buckets. Say so instead
  // of returning a set that quietly omits them - the caller falls back to its own
  // filtering. searchKeySets are the exception: they do materialise `no`, because an
  // access rule naming it has to be answered positively, never widened.
  const wantsEmptyBucket = specialBucketSelected(SEARCH_KEY_EMPTY_BUCKET);
  if (wantsEmptyBucket && !emptyBucketStored) return null;

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
    { keys: ['37_plus'], range: { minAge: 37 } },
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

    if (specialBucketSelected('?')) requests.push(get(ref2(database, `${rootPath}/${AGE_SEARCH_KEY_INDEX}/?`)));
    if (wantsEmptyBucket) {
      requests.push(get(ref2(database, `${rootPath}/${AGE_SEARCH_KEY_INDEX}/${SEARCH_KEY_EMPTY_BUCKET}`)));
    }
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
  // Cards with no anthropometry are absent from the index, not in a `no` bucket.
  if (selected('no') || selected('empty')) return null;
  const imtIds = new Set();
  const requests = [];

  rootPaths.forEach(rootPath => {
    if (selected('le28')) requests.push(get(ref2(database, `${rootPath}/${IMT_SEARCH_KEY_INDEX}/le28`)));
    if (selected('29_31')) requests.push(get(ref2(database, `${rootPath}/${IMT_SEARCH_KEY_INDEX}/29_31`)));
    if (selected('32_35')) requests.push(get(ref2(database, `${rootPath}/${IMT_SEARCH_KEY_INDEX}/32_35`)));
    if (selected('36_plus')) requests.push(get(ref2(database, `${rootPath}/${IMT_SEARCH_KEY_INDEX}/36_plus`)));
    if (selected('other')) requests.push(get(ref2(database, `${rootPath}/${IMT_SEARCH_KEY_INDEX}/?`)));
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
  if (selectedBuckets.includes('no') || selectedBuckets.includes('empty')) return null;

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
  // `none` means no getInTouch on record, which the index expresses by absence.
  if (reactionFilters?.none) return null;

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

// An account key is a Firebase-Auth uid - always 28 characters. A card created
// in the web carries either a short editorial id or a Firebase push key, and a
// push key is exactly 20, so the boundary is "longer than 20", not "20 or more".
// The old `>= 20` counted every push key as an account key and indexed it into
// the wrong searchKey root.
export const isUsersCollectionUserId = userId => String(userId || '').trim().length > 20;

export const resolveSearchKeyRootForUserId = userId =>
  (isUsersCollectionUserId(userId) ? SEARCH_KEY_USERS_INDEX_ROOT : SEARCH_KEY_INDEX_ROOT);

const resolveSearchKeyLeafPath = (rootPath, indexName, value, userId) => {
  const safeRootPath = rootPath || resolveSearchKeyRootForUserId(userId);
  return `${safeRootPath}/${indexName}/${value}/${userId}`;
};

// A rebuild replaces an index, it does not merge into it: without this the `no`
// buckets and the legacy numeric `fields` nodes would survive every reindex.
/**
 * Два корені `searchKey` — це не дві колекції, а одна, розкладена за форматом
 * id: `searchKey/users` тримає довгі id, `searchKey` — короткі. Читання завжди
 * питає обидва (див. `SEARCH_KEY_INDEXED_ROOT_PATHS`), тож перебудова мусить
 * охопити обидва теж — інакше половина колекції зникає з пошуку.
 */
const SEARCH_KEY_INDEX_ROOT_PATHS = [SEARCH_KEY_INDEX_ROOT, SEARCH_KEY_USERS_INDEX_ROOT];

/** Куди пишеться запис конкретної анкети. Вирішує формат її id. */
const resolveSearchKeyWriteRoot = (options, userId) => (
  options?.rootPath || resolveSearchKeyRootForUserId(userId)
);

/** Скинути індекс перед перебудовою — в обох коренях, якщо не вказано один. */
const resetSearchKeyIndexRoots = async (options, indexNames = []) => {
  const roots = options?.rootPath ? [options.rootPath] : SEARCH_KEY_INDEX_ROOT_PATHS;
  await Promise.all(roots.map(root => resetSearchKeyIndexNodes(root, indexNames)));
};

const resetSearchKeyIndexNodes = async (searchKeyRoot, indexNames = []) => {
  await Promise.all(
    [...new Set(indexNames.filter(Boolean))].map(indexName =>
      remove(ref2(database, `${searchKeyRoot}/${indexName}`)),
    ),
  );
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

// The `no` bucket is not written any more - "поле не заповнене" is the absence of
// the id from the index. Only the *next* values are stripped, so the prev/next diff
// below still removes a legacy `no` leaf the first time an old profile is saved.
export const syncUserSearchKeyIndex = async (userId, prevData = {}, nextData = {}, options = {}) => {
  if (!userId) return;
  const updateLeaf = (indexName, value, action) =>
    updateSearchKeyLeaf(indexName, value, userId, action, options);

  const prevValues = getBloodIndexSet(prevData);
  const nextValues = withoutEmptySearchKeyBucket(getBloodIndexSet(nextData), BLOOD_SEARCH_KEY_INDEX);
  const prevMaritalStatusValues = getMaritalStatusIndexSet(prevData);
  const nextMaritalStatusValues = withoutEmptySearchKeyBucket(getMaritalStatusIndexSet(nextData), MARITAL_STATUS_SEARCH_KEY_INDEX);
  const prevCsectionValues = getCsectionIndexSet(prevData);
  const nextCsectionValues = withoutEmptySearchKeyBucket(getCsectionIndexSet(nextData), CSECTION_SEARCH_KEY_INDEX);
  const prevContactValues = getContactIndexSet(prevData);
  const nextContactValues = getContactIndexSet(nextData);
  const prevRoleValues = getRoleIndexSet(prevData);
  const nextRoleValues = withoutEmptySearchKeyBucket(getRoleIndexSet(nextData), ROLE_SEARCH_KEY_INDEX);
  const prevUserIdValues = getUserIdIndexSet(userId);
  const nextUserIdValues = getUserIdIndexSet(nextData?.userId || userId);
  const prevAgeValues = getAgeIndexSet(prevData);
  const nextAgeValues = withoutEmptySearchKeyBucket(getAgeIndexSet(nextData), AGE_SEARCH_KEY_INDEX);
  const prevImtValues = getImtIndexSet(prevData);
  const nextImtValues = withoutEmptySearchKeyBucket(getImtIndexSet(nextData), IMT_SEARCH_KEY_INDEX);
  const prevHeightValues = getHeightIndexSet(prevData);
  const nextHeightValues = withoutEmptySearchKeyBucket(getHeightIndexSet(nextData), HEIGHT_SEARCH_KEY_INDEX);
  const prevWeightValues = getWeightIndexSet(prevData);
  const nextWeightValues = withoutEmptySearchKeyBucket(getWeightIndexSet(nextData), WEIGHT_SEARCH_KEY_INDEX);

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

  // Profiles saved before role aliases were introduced may still have a leaf in
  // the unknown bucket. Reassert recognized next values and clear that legacy
  // leaf even when normalized prev/next values are identical.
  const recognizedNextRoleValues = new Set([...nextRoleValues].filter(value => value !== '?'));
  if (recognizedNextRoleValues.size > 0 && !nextRoleValues.has('?')) {
    await updateLeaf(ROLE_SEARCH_KEY_INDEX, '?', 'remove');
    for (const value of recognizedNextRoleValues) {
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
  const nextReactionValues = withoutEmptySearchKeyBucket(getReactionIndexSet(nextData), REACTION_SEARCH_KEY_INDEX);

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

  // `fields` used to be keyed by the raw count; the prev/next diff below only knows
  // range buckets, so the legacy numeric leaf is named explicitly and removed here.
  const legacyFieldCountKey = prevData && typeof prevData === 'object'
    ? String(Object.keys(prevData).length)
    : null;
  const prevFieldCountValues = new Set([
    ...getFieldCountIndexSet(prevData),
    ...(legacyFieldCountKey ? [legacyFieldCountKey] : []),
  ]);
  const nextFieldCountValues = getFieldCountIndexSet(nextData);
  const prevLastActionValues = getLastActionIndexSet(prevData);
  const nextLastActionValues = withoutEmptySearchKeyBucket(getLastActionIndexSet(nextData), LAST_ACTION_SEARCH_KEY_INDEX);
  const prevGetInTouchValues = getGetInTouchIndexSet(prevData);
  const nextGetInTouchValues = withoutEmptySearchKeyBucket(getGetInTouchIndexSet(nextData), GET_IN_TOUCH_SEARCH_KEY_INDEX);
  const prevBmiValues = getBmiIndexSet(prevData);
  const nextBmiValues = withoutEmptySearchKeyBucket(getBmiIndexSet(nextData), BMI_SEARCH_KEY_INDEX);
  const prevCountryValues = getCountryIndexSet(prevData);
  const nextCountryValues = withoutEmptySearchKeyBucket(getCountryIndexSet(nextData), COUNTRY_SEARCH_KEY_INDEX);

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

  for (const value of prevBmiValues) {
    if (!nextBmiValues.has(value)) {
      // eslint-disable-next-line no-await-in-loop
      await updateLeaf(BMI_SEARCH_KEY_INDEX, value, 'remove');
    }
  }

  for (const value of nextBmiValues) {
    if (!prevBmiValues.has(value)) {
      // eslint-disable-next-line no-await-in-loop
      await updateLeaf(BMI_SEARCH_KEY_INDEX, value, 'add');
    }
  }

  for (const value of prevCountryValues) {
    if (!nextCountryValues.has(value)) {
      // eslint-disable-next-line no-await-in-loop
      await updateLeaf(COUNTRY_SEARCH_KEY_INDEX, value, 'remove');
    }
  }

  for (const value of nextCountryValues) {
    if (!prevCountryValues.has(value)) {
      // eslint-disable-next-line no-await-in-loop
      await updateLeaf(COUNTRY_SEARCH_KEY_INDEX, value, 'add');
    }
  }
};

export const createSearchKeyIndex = async (onProgress, options = {}) => {
  const usersData = options?.usersData || (await loadProfilesFromNodesForIndexing());
  if (!usersData) return;

  const userIds = Object.keys(usersData);
  const totalUsers = userIds.length;
  if (totalUsers === 0) return;

  await resetSearchKeyIndexRoots(options, [BLOOD_SEARCH_KEY_INDEX]);

  for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
    const batchIds = userIds.slice(i, i + BATCH_SIZE);

    // eslint-disable-next-line no-await-in-loop
    await Promise.all(
      batchIds.map(async userId => {
        const user = usersData[userId] || {};
        const bloodValues = withoutEmptySearchKeyBucket(getBloodIndexSet(user), BLOOD_SEARCH_KEY_INDEX);
        await Promise.all(
          [...bloodValues].map(value =>
            updateSearchKeyLeaf(BLOOD_SEARCH_KEY_INDEX, value, userId, 'add', { ...options, rootPath: resolveSearchKeyWriteRoot(options, userId) })
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

export const createMaritalStatusSearchKeyIndex = async (onProgress, options = {}) => {
  const usersData = options?.usersData || (await loadProfilesFromNodesForIndexing());
  if (!usersData) return;

  const userIds = Object.keys(usersData);
  const totalUsers = userIds.length;
  if (totalUsers === 0) return;

  await resetSearchKeyIndexRoots(options, [MARITAL_STATUS_SEARCH_KEY_INDEX]);

  await uploadChunkedSearchKeyIndexUpdates(
    userIds,
    totalUsers,
    batchIds =>
      batchIds.reduce((acc, userId) => {
        const user = usersData[userId] || {};
        const maritalStatusValues = withoutEmptySearchKeyBucket(getMaritalStatusIndexSet(user), MARITAL_STATUS_SEARCH_KEY_INDEX);
        maritalStatusValues.forEach(maritalStatusValue => {
          acc[`${resolveSearchKeyWriteRoot(options, userId)}/${MARITAL_STATUS_SEARCH_KEY_INDEX}/${maritalStatusValue}/${userId}`] = true;
        });
        return acc;
      }, {}),
    onProgress
  );
};

export const createCsectionSearchKeyIndex = async (onProgress, options = {}) => {
  const usersData = options?.usersData || (await loadProfilesFromNodesForIndexing());
  if (!usersData) return;

  const userIds = Object.keys(usersData);
  const totalUsers = userIds.length;
  if (totalUsers === 0) return;

  await resetSearchKeyIndexRoots(options, [CSECTION_SEARCH_KEY_INDEX]);

  await uploadChunkedSearchKeyIndexUpdates(
    userIds,
    totalUsers,
    batchIds =>
      batchIds.reduce((acc, userId) => {
        const user = usersData[userId] || {};
        const csectionValues = withoutEmptySearchKeyBucket(getCsectionIndexSet(user), CSECTION_SEARCH_KEY_INDEX);
        csectionValues.forEach(csectionValue => {
          acc[`${resolveSearchKeyWriteRoot(options, userId)}/${CSECTION_SEARCH_KEY_INDEX}/${csectionValue}/${userId}`] = true;
        });
        return acc;
      }, {}),
    onProgress
  );
};

export const createContactSearchKeyIndex = async (onProgress, options = {}) => {
  const usersData = options?.usersData || (await loadProfilesFromNodesForIndexing());
  if (!usersData) return;

  const userIds = Object.keys(usersData);
  const totalUsers = userIds.length;
  if (totalUsers === 0) return;

  await resetSearchKeyIndexRoots(options, [CONTACT_SEARCH_KEY_INDEX]);

  await uploadChunkedSearchKeyIndexUpdates(
    userIds,
    totalUsers,
    batchIds =>
      batchIds.reduce((acc, userId) => {
        const user = usersData[userId] || {};
        const contactValues = getContactIndexSet(user);
        contactValues.forEach(contactValue => {
          acc[`${resolveSearchKeyWriteRoot(options, userId)}/${CONTACT_SEARCH_KEY_INDEX}/${contactValue}/${userId}`] = true;
        });
        return acc;
      }, {}),
    onProgress
  );
};

export const createRoleSearchKeyIndex = async (onProgress, options = {}) => {
  const usersData = options?.usersData || (await loadProfilesFromNodesForIndexing());
  if (!usersData) return;

  const userIds = Object.keys(usersData);
  const totalUsers = userIds.length;
  if (totalUsers === 0) return;

  await resetSearchKeyIndexRoots(options, [ROLE_SEARCH_KEY_INDEX]);

  await uploadChunkedSearchKeyIndexUpdates(
    userIds,
    totalUsers,
    batchIds =>
      batchIds.reduce((acc, userId) => {
        const user = usersData[userId] || {};
        const roleValues = withoutEmptySearchKeyBucket(getRoleIndexSet(user), ROLE_SEARCH_KEY_INDEX);
        roleValues.forEach(roleValue => {
          acc[`${resolveSearchKeyWriteRoot(options, userId)}/${ROLE_SEARCH_KEY_INDEX}/${roleValue}/${userId}`] = true;
        });
        return acc;
      }, {}),
    onProgress
  );
};

export const createUserIdSearchKeyIndex = async (onProgress, options = {}) => {
  const usersData = options?.usersData || (await loadProfilesFromNodesForIndexing());
  if (!usersData) return;

  const userIds = Object.keys(usersData);
  const totalUsers = userIds.length;
  if (totalUsers === 0) return;

  await resetSearchKeyIndexRoots(options, [USER_ID_SEARCH_KEY_INDEX]);

  await uploadChunkedSearchKeyIndexUpdates(
    userIds,
    totalUsers,
    batchIds =>
      batchIds.reduce((acc, userId) => {
        const user = usersData[userId] || {};
        const userIdValues = getUserIdIndexSet(user.userId || userId);
        userIdValues.forEach(userIdValue => {
          acc[`${resolveSearchKeyWriteRoot(options, userId)}/${USER_ID_SEARCH_KEY_INDEX}/${userIdValue}/${userId}`] = true;
        });
        return acc;
      }, {}),
    onProgress
  );
};

export const createAgeSearchKeyIndex = async (onProgress, options = {}) => {
  const usersData = options?.usersData || (await loadProfilesFromNodesForIndexing());
  if (!usersData) return;

  const userIds = Object.keys(usersData);
  const totalUsers = userIds.length;
  if (totalUsers === 0) return;

  await resetSearchKeyIndexRoots(options, [AGE_SEARCH_KEY_INDEX]);

  await uploadChunkedSearchKeyIndexUpdates(
    userIds,
    totalUsers,
    batchIds =>
      batchIds.reduce((acc, userId) => {
        const user = usersData[userId] || {};
        const ageValues = withoutEmptySearchKeyBucket(getAgeIndexSet(user), AGE_SEARCH_KEY_INDEX);
        ageValues.forEach(ageValue => {
          acc[`${resolveSearchKeyWriteRoot(options, userId)}/${AGE_SEARCH_KEY_INDEX}/${ageValue}/${userId}`] = true;
        });
        return acc;
      }, {}),
    onProgress
  );
};

export const createImtHeightWeightSearchKeyIndex = async (onProgress, options = {}) => {
  const usersData = options?.usersData || (await loadProfilesFromNodesForIndexing());
  if (!usersData) return;

  const userIds = Object.keys(usersData);
  const totalUsers = userIds.length;
  if (totalUsers === 0) return;

  await resetSearchKeyIndexRoots(options, [IMT_SEARCH_KEY_INDEX, HEIGHT_SEARCH_KEY_INDEX, WEIGHT_SEARCH_KEY_INDEX]);

  await uploadChunkedSearchKeyIndexUpdates(
    userIds,
    totalUsers,
    batchIds =>
      batchIds.reduce((acc, userId) => {
        const user = usersData[userId] || {};
        const imtValues = withoutEmptySearchKeyBucket(getImtIndexSet(user), IMT_SEARCH_KEY_INDEX);
        const heightValues = withoutEmptySearchKeyBucket(normalizeMetricIndexValues(user.height), HEIGHT_SEARCH_KEY_INDEX);
        const weightValues = withoutEmptySearchKeyBucket(normalizeMetricIndexValues(user.weight), WEIGHT_SEARCH_KEY_INDEX);
        imtValues.forEach(imtValue => {
          acc[`${resolveSearchKeyWriteRoot(options, userId)}/${IMT_SEARCH_KEY_INDEX}/${imtValue}/${userId}`] = true;
        });
        heightValues.forEach(heightValue => {
          acc[`${resolveSearchKeyWriteRoot(options, userId)}/${HEIGHT_SEARCH_KEY_INDEX}/${heightValue}/${userId}`] = true;
        });
        weightValues.forEach(weightValue => {
          acc[`${resolveSearchKeyWriteRoot(options, userId)}/${WEIGHT_SEARCH_KEY_INDEX}/${weightValue}/${userId}`] = true;
        });
        return acc;
      }, {}),
    onProgress
  );
};

export const createReactionSearchKeyIndex = async (onProgress, options = {}) => {
  const usersData = options?.usersData || (await loadProfilesFromNodesForIndexing());
  if (!usersData) return;

  const userIds = Object.keys(usersData);
  const totalUsers = userIds.length;
  if (totalUsers === 0) return;

  await resetSearchKeyIndexRoots(options, [REACTION_SEARCH_KEY_INDEX]);

  await uploadChunkedSearchKeyIndexUpdates(
    userIds,
    totalUsers,
    batchIds =>
      batchIds.reduce((acc, userId) => {
        const user = usersData[userId] || {};
        const reactionValues = withoutEmptySearchKeyBucket(getReactionIndexSet(user), REACTION_SEARCH_KEY_INDEX);
        reactionValues.forEach(reactionValue => {
          acc[`${resolveSearchKeyWriteRoot(options, userId)}/${REACTION_SEARCH_KEY_INDEX}/${reactionValue}/${userId}`] = true;
        });
        return acc;
      }, {}),
    onProgress
  );
};

export const createFieldCountSearchKeyIndex = async (onProgress, options = {}) => {
  const usersData = options?.usersData || (await loadProfilesFromNodesForIndexing());
  if (!usersData) return;

  const userIds = Object.keys(usersData);
  const totalUsers = userIds.length;
  if (totalUsers === 0) return;

  await resetSearchKeyIndexRoots(options, [FIELD_COUNT_SEARCH_KEY_INDEX]);

  await uploadChunkedSearchKeyIndexUpdates(
    userIds,
    totalUsers,
    batchIds =>
      batchIds.reduce((acc, userId) => {
        const user = usersData[userId] || {};
        const fieldCountValue = normalizeFieldCountSearchKeyIndexValue(user);
        acc[`${resolveSearchKeyWriteRoot(options, userId)}/${FIELD_COUNT_SEARCH_KEY_INDEX}/${fieldCountValue}/${userId}`] = true;
        return acc;
      }, {}),
    onProgress
  );
};


const createDerivedSearchKeyIndex = async (indexName, getIndexSet, onProgress, options = {}) => {
  const usersData = options?.usersData || (await loadProfilesFromNodesForIndexing());
  if (!usersData) return;

  const userIds = Object.keys(usersData);
  const totalUsers = userIds.length;
  if (totalUsers === 0) return;

  await resetSearchKeyIndexRoots(options, [indexName]);

  await uploadChunkedSearchKeyIndexUpdates(
    userIds,
    totalUsers,
    batchIds =>
      batchIds.reduce((acc, userId) => {
        const user = usersData[userId] || {};
        withoutEmptySearchKeyBucket(getIndexSet(user), indexName).forEach(value => {
          acc[`${resolveSearchKeyWriteRoot(options, userId)}/${indexName}/${value}/${userId}`] = true;
        });
        return acc;
      }, {}),
    onProgress
  );
};

export const createBmiSearchKeyIndex = (onProgress, options = {}) =>
  createDerivedSearchKeyIndex(BMI_SEARCH_KEY_INDEX, getBmiIndexSet, onProgress, options);

export const createCountrySearchKeyIndex = (onProgress, options = {}) =>
  createDerivedSearchKeyIndex(COUNTRY_SEARCH_KEY_INDEX, getCountryIndexSet, onProgress, options);

export const createLastActionSearchKeyIndex = async (onProgress, options = {}) => {
  const usersData = options?.usersData || (await loadProfilesFromNodesForIndexing());
  if (!usersData) return;

  const userIds = Object.keys(usersData);
  const totalUsers = userIds.length;
  if (totalUsers === 0) return;

  await resetSearchKeyIndexRoots(options, [LAST_ACTION_SEARCH_KEY_INDEX]);

  await uploadChunkedSearchKeyIndexUpdates(
    userIds,
    totalUsers,
    batchIds =>
      batchIds.reduce((acc, userId) => {
        const user = usersData[userId] || {};
        const bucket = normalizeLastActionSearchKeyBucket(user.lastAction);
        if (bucket === SEARCH_KEY_EMPTY_BUCKET) return acc;
        acc[`${resolveSearchKeyWriteRoot(options, userId)}/${LAST_ACTION_SEARCH_KEY_INDEX}/${bucket}/${userId}`] = true;
        return acc;
      }, {}),
    onProgress
  );
};


export const createGetInTouchSearchKeyIndex = async (onProgress, options = {}) => {
  const usersData = options?.usersData || (await loadProfilesFromNodesForIndexing());
  if (!usersData) return;

  const userIds = Object.keys(usersData);
  const totalUsers = userIds.length;
  if (totalUsers === 0) return;

  await resetSearchKeyIndexRoots(options, [GET_IN_TOUCH_SEARCH_KEY_INDEX]);

  await uploadChunkedSearchKeyIndexUpdates(
    userIds,
    totalUsers,
    batchIds =>
      batchIds.reduce((acc, userId) => {
        const user = usersData[userId] || {};
        const bucket = normalizeDateSearchKeyBucket(user.getInTouch);
        if (bucket === SEARCH_KEY_EMPTY_BUCKET) return acc;
        acc[`${resolveSearchKeyWriteRoot(options, userId)}/${GET_IN_TOUCH_SEARCH_KEY_INDEX}/${bucket}/${userId}`] = true;
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
  [SEARCH_KEY_INDEX_TYPES.blood]: createSearchKeyIndex,
  [SEARCH_KEY_INDEX_TYPES.maritalStatus]: createMaritalStatusSearchKeyIndex,
  [SEARCH_KEY_INDEX_TYPES.csection]: createCsectionSearchKeyIndex,
  [SEARCH_KEY_INDEX_TYPES.contact]: createContactSearchKeyIndex,
  [SEARCH_KEY_INDEX_TYPES.role]: createRoleSearchKeyIndex,
  [SEARCH_KEY_INDEX_TYPES.userId]: createUserIdSearchKeyIndex,
  [SEARCH_KEY_INDEX_TYPES.age]: createAgeSearchKeyIndex,
  [SEARCH_KEY_INDEX_TYPES.imtHeightWeight]: createImtHeightWeightSearchKeyIndex,
  [SEARCH_KEY_INDEX_TYPES.reaction]: createReactionSearchKeyIndex,
  [SEARCH_KEY_INDEX_TYPES.fieldCount]: createFieldCountSearchKeyIndex,
  [SEARCH_KEY_INDEX_TYPES.lastAction]: createLastActionSearchKeyIndex,
  [SEARCH_KEY_INDEX_TYPES.getInTouch]: createGetInTouchSearchKeyIndex,
  [SEARCH_KEY_INDEX_TYPES.bmi]: createBmiSearchKeyIndex,
  [SEARCH_KEY_INDEX_TYPES.country]: createCountrySearchKeyIndex,
};

/**
 * Перебудувати обрані індекси `searchKey`.
 *
 * Прогін один на всю колекцію, і це не оптимізація: колекція у вебі одна, а
 * два корені `searchKey` — лише розкладка за форматом id. Два прогони (по
 * одному «на колекцію») читали б ті самі вузли двічі й писали б у той самий
 * індекс двічі.
 */
export const createSelectedSearchKeyIndexes = async (indexTypes = [], onProgress, options = {}) => {
  if (!Array.isArray(indexTypes) || indexTypes.length === 0) return;

  const uniqueIndexTypes = normalizeSearchKeyIndexTypes(indexTypes).filter(indexType => SEARCH_KEY_INDEX_BUILDERS[indexType]);
  if (!uniqueIndexTypes.length) return;

  // Індекс будується з того ж джерела, з якого читає застосунок. Читати тут
  // legacy-колекцію означало б індексувати те, чого веб уже не показує.
  const usersData = await loadProfilesFromNodesForIndexing({
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
    await SEARCH_KEY_INDEX_BUILDERS[indexType](progressReporter, { usersData, ...options });
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


// The getInTouch deck pages both collections at once, so its bulk reads span both
// roots. Per-card checks must not: they resolve the one root that can hold the id
// (see resolveSearchKeyRootForUserId) instead of asking both and paying twice.
const SEARCH_KEY_INDEXED_ROOT_PATHS = SEARCH_KEY_INDEX_ROOT_PATHS;

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

// A group carries the plan that says how to reach the index for it, so the point
// check and the bulk read agree on which buckets to touch and what a hit means.
const withSearchKeyReadPlan = group => {
  if (!group?.indexName) return group;
  const plan = planSearchKeyBucketRead({
    indexName: group.indexName,
    allBuckets: group.allBuckets || group.buckets,
    selectedBuckets: group.buckets,
  });
  return { ...group, readMode: plan.mode, readBuckets: plan.buckets };
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

  return withSearchKeyReadPlan({
    key: filterName,
    indexName,
    buckets: selectedBuckets,
    allBuckets: (buckets || []).map(String),
    supportsPointCheck: true,
    readIds: ({ debugLog }) => readSearchKeyBucketsForGroup({ indexName, buckets: selectedBuckets, debugLog }),
  });
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
  if (selectedBuckets.includes('no') || selectedBuckets.includes('empty')) return null;

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
  // Cards that never acted are absent from the index, not in a `no` bucket.
  if (lastActionFilters?.no || lastActionFilters?.empty) return null;

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
    groups.push(withSearchKeyReadPlan({
      key: 'blood',
      indexName: BLOOD_SEARCH_KEY_INDEX,
      buckets: bloodBuckets,
      allBuckets: BLOOD_SEARCH_KEY_BUCKETS,
      supportsPointCheck: true,
      readIds: ({ debugLog }) => readSearchKeyBucketsForGroup({ indexName: BLOOD_SEARCH_KEY_INDEX, buckets: bloodBuckets, debugLog }),
    }));
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
    groups.push(withSearchKeyReadPlan({
      key: 'imt',
      indexName: IMT_SEARCH_KEY_INDEX,
      buckets: getSelectedImtSearchKeyBuckets(filterSettings.imt) || [],
      allBuckets: IMT_SEARCH_KEY_BUCKETS,
      supportsPointCheck: true,
      readIds: () => collectImtIdsByFilters(filterSettings.imt, SEARCH_KEY_INDEXED_ROOT_PATHS),
    }));
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

// A group used to be pushed out of the point-check path once its selection covered
// most of the vocabulary, because checking it meant reading the bulk buckets. The
// read plan removes that cost - a wide selection is answered by checking the few
// buckets it rejects - so the only group left for the post-filter is one the index
// genuinely cannot express.
const isBroadSearchKeyPointGroup = group => group?.readMode === 'defer' || group?.readMode === 'range';

const readSearchKeyPointMembershipBuckets = async ({
  userId,
  group,
  buckets,
  rootPaths,
}) => {
  const normalizedUserId = String(userId || '').trim();
  const normalizedBuckets = [...new Set((buckets || []).map(String).filter(Boolean))];
  if (!normalizedUserId || !group?.indexName || normalizedBuckets.length === 0) return [];

  const resolvedRootPaths = rootPaths || [resolveSearchKeyRootForUserId(normalizedUserId)];
  const checks = [];
  resolvedRootPaths.forEach(rootPath => {
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

/**
 * Does this card pass the group?
 *
 * Under an 'include' plan the card has to sit in one of the buckets the plan names.
 * Under 'exclude' it has to sit in none of them: the selection keeps the cards with
 * nothing on record, and those are exactly the ones no bucket holds. Reading the
 * probe buckets is the same cost either way - what differs is what a hit means.
 */
const hasSearchKeyPointMembership = async ({
  userId,
  group,
  rootPaths,
  collectDiagnostics = false,
}) => {
  const readMode = group?.readMode || 'include';
  if (readMode === 'none') return { passed: true, matchedBuckets: [], userBuckets: [] };

  const probeBuckets = [...new Set((group?.readBuckets || group?.buckets || []).map(String).filter(Boolean))];
  const passesOnHit = readMode !== 'exclude';

  if (collectDiagnostics) {
    const diagnosticBuckets = [...new Set([...(group?.allBuckets || []), ...probeBuckets])];
    const userBuckets = await readSearchKeyPointMembershipBuckets({ userId, group, buckets: diagnosticBuckets, rootPaths });
    const probeBucketSet = new Set(probeBuckets);
    const matchedBuckets = userBuckets.filter(bucket => probeBucketSet.has(bucket));
    return { passed: passesOnHit ? matchedBuckets.length > 0 : matchedBuckets.length === 0, matchedBuckets, userBuckets };
  }

  const matchedBuckets = await readSearchKeyPointMembershipBuckets({ userId, group, buckets: probeBuckets, rootPaths });
  return {
    passed: passesOnHit ? matchedBuckets.length > 0 : matchedBuckets.length === 0,
    matchedBuckets,
    userBuckets: matchedBuckets,
  };
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
      return (a?.readBuckets || a?.buckets || []).length - (b?.readBuckets || b?.buckets || []).length;
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
        groups: activeSearchKeyGroups.map(group => ({
          key: group.key,
          indexName: group.indexName,
          bucketsCount: (group.buckets || []).length,
          allBucketsCount: (group.allBuckets || []).length,
          bucketsSample: (group.buckets || []).slice(0, 20),
          supportsPointCheck: Boolean(group.supportsPointCheck),
          readMode: group.readMode || 'include',
          readBuckets: group.readBuckets || [],
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

export const createSearchIds = async onProgress => {
  // Те саме джерело, що й у решти індексацій: контакти, за якими будується
  // `searchId`, живуть у `profileContacts`, а не в legacy-анкеті.
  const usersData = await loadProfilesFromNodesForIndexing();
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

  // Видалення картки в users
  const userRef = ref2(db, `users/${userId}`);
  await remove(userRef);
  console.log(`Видалено картку користувача з users: ${userId}`);
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
  const rawRole = value.role || value.userRole;
  if (!normalizeSingleFilterValue(rawRole)) return 'empty';
  const role = normalizeProfileRole(rawRole);
  if (role) return role;
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

// Shared with the index writer and the Matching post-filter - see searchKeyBuckets.
const getBmiCategory = value => resolveBmiBucket(value);

const getImtCategory = value => {
  return normalizeImtSearchKeyIndexValue(value);
};

const getHeightCategory = value => {
  const rawHeight = String(value?.height ?? '').trim();
  if (!rawHeight) return 'no';
  const parsedHeight = Number.parseFloat(rawHeight.replace(',', '.'));
  return getHeightFilterBucket(parsedHeight) || 'other';
};

const getCountryCategory = value => resolveCountryBucket(value);

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

// Same rule as the index writer, so a `fields` filter agrees with the index it read.
const getFieldCountCategory = value => resolveProfileFieldCountBucket(value);

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

  // Рік беремо з форми, у якій дату показують людині, — `formatDateToDisplay`
  // зводить до неї і `РРРР-ММ-ДД` з бази, і крапкову з legacy-анкети. Без
  // цього ISO-дата давала б `NaN`, а `NaN <= 30` — false, тобто анкета
  // мовчки випадала б із фільтра.
  const birthParts = formatDateToDisplay(value.birth).split('.');
  const birthYear = parseInt(birthParts[2], 10);
  if (!Number.isFinite(birthYear)) return true;
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

    // Картка стрічки про контакти не знає нічого: вони живуть у
    // `profileContacts` з власними правами, і в проєкцію не потрапляє навіть
    // перелік їхніх ключів. Тож фільтр «є контакт» до неї не застосовується —
    // не «нічого не знайшлось», а «питання не до цієї картки». Мовчазне
    // застосування відсіяло б усю стрічку до нуля.
    if (hasContactFilter && !isMatchingSummaryCard(value)) {
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

export const fetchPaginatedUsers = async (
  lastKey,
  filterForload,
  filterSettings = {},
  favoriteUsers = {},
  options = {},
) => {
  const db = getDatabase();
  const usersRef = ref2(db, 'users');
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

  try {
    // Нові вузли — основний шлях; legacy лишається відкатом для анкет, які ще
    // не переїхали, і джерелом для мобільного застосунку.
    // `withLegacy` саме тут: анкета — це те місце, де застарілі дані видно
    // одразу, і те місце, з якого їх правлять. Мобільний застосунок пише в
    // `/users`, і без цього читання його зміни у вебі не зʼявились би ніколи.
    const fromNodes = await readProfileFromNodes(userId, { includeTechnical: true, withLegacy: true });
    if (fromNodes) {
      const photos = fromNodes.__photosHydrated ? fromNodes.photos : await getAllUserPhotos(userId);
      return { ...fromNodes, photos: photos || [], __photosHydrated: true };
    }

    const userSnapshot = await get(ref2(db, `users/${userId}`));
    if (userSnapshot.exists()) {
      const usersData = userSnapshot.val() || {};
      const photos = await getAllUserPhotos(userId);
      return { userId, ...usersData, photos };
    }

    // Якщо користувача не знайдено
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

  // Визначаємо шлях для видалення в Realtime Database
  const usersRefRealtime = ref2(dbRealtime, `users/${userId}/${field}`);

  // Визначаємо шлях для видалення в Firestore
  const usersDocFirestore = doc(dbFirestore, 'users', userId);

  try {
    if (field === 'photos') {
      const urls = Array.isArray(value) ? value : [value];
      await deletePhotos(userId, urls);
    }
    await updateSearchId(field, value, userId, 'remove');

    // Видалення з users у Realtime Database
    await remove(usersRefRealtime);
    console.log(`Ключ "${field}" видалено з Realtime Database: users/${userId}`);

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

      // Функція для отримання даних користувача
      const getUserData = async userId => {
        const userSnapshotInUsers = await get(ref2(database, `users/${userId}`));
        return {
          userId,
          ...(userSnapshotInUsers.exists() ? userSnapshotInUsers.val() : {}),
        };
      };

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
      const userSnapshotInUsers = await get(ref2(database, `users/${userId}`));
      return {
        userId,
        ...(userSnapshotInUsers.exists() ? userSnapshotInUsers.val() : {}),
      };
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

      await updateProfileNodesInRTDB(mergedUsers[primaryUser].userId, mergedUsers[primaryUser], 'update');

      const db = getDatabase();
      await remove(ref2(db, `users/${donorUser}`));
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
    // Анкета може вже не мати legacy-запису: нові вузли — джерело істини,
    // тож порожній `users` не перетворює видалення на no-op.
    const [usersSnapshot, nodeProfile] = await Promise.all([
      get(ref2(db, `users/${userId}`)),
      readProfileFromNodes(userId, { includeTechnical: true }),
    ]);
    const userData = {
      ...(usersSnapshot.exists() ? usersSnapshot.val() : {}),
      ...(nodeProfile || {}),
    };
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
    // Картка йде зі стрічки разом з анкетою, інакше проєкція лишилась би
    // висіти як привид, на який нічого не вказує.
    await removeMatchingCardIndex(userId);

    // Кожен шлях видаляється окремо: правила вузлів відрізняються, тож одна
    // відмова не має залишити всі інші копії персональних даних недоторканими.
    const profilePaths = [
      PROFILE_NODES.matchingCards,
      PROFILE_NODES.profileDetails,
      PROFILE_NODES.profileContacts,
      PROFILE_NODES.profileWorkflow,
      PROFILE_NODES.profileTechnical,
      'users',
    ];
    const deletionResults = await Promise.allSettled(
      profilePaths.map(path => remove(ref2(db, `${path}/${userId}`))),
    );
    const failedPaths = profilePaths.filter((path, index) => deletionResults[index].status === 'rejected');
    if (failedPaths.length) {
      throw new Error(`Не вдалося видалити вузли анкети: ${failedPaths.join(', ')}`);
    }
    console.log(`Картка користувача та її профільні вузли видалені: ${userId}`);

    removeCard(userId);
    clearEmptySearchQueryCache();

    if (deletedFields.length) {
      toast.success(`Видалені дані:\n${deletedFields.join('\n')}`, {
        style: { whiteSpace: 'pre-line' },
      });
    } else {
      toast.success(`Картка користувача видалена з users: ${userId}`);
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

    let usersData = {};

    if (Object.keys(serverFilters).length > 0) {
      usersData = await fetchByPathWithFilters('users', serverFilters);
    } else {
      const usersSnapshot = await get(ref2(database, 'users'));
      usersData = usersSnapshot.exists() ? usersSnapshot.val() : {};
    }

    const allUsersArray = Object.keys(usersData).map(userId => [
      userId,
      { userId, ...(usersData[userId] || {}) },
    ]);

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
    const usersSnapshot = await get(ref2(database, 'users'));
    const usersData = usersSnapshot.exists() ? usersSnapshot.val() : {};

    // Формуємо масив пар [userId, userObject]
    const mergedUsersArray = Object.keys(usersData).map(userId => [
      userId,
      { userId, ...(usersData[userId] || {}) },
    ]);

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
    // eslint-disable-next-line no-await-in-loop
    await refreshMatchingCardAfterProfileWrite(id, { ...user, lastLogin2: date }, 'set');

    processed += 1;
    const progress = Math.floor((processed / total) * 100);
    if (onProgress && progress % 10 === 0 && progress !== lastProgress) {
      onProgress(progress);
      lastProgress = progress;
    }
  }
};

export { fetchFilteredUsersByPage } from './dateLoad';
export { fetchUsersByLastLoginPaged } from './lastLoginLoad';
export { fetchUsersByLastActionPaged } from './lastActionLoad';
