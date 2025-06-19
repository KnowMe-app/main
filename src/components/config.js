import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, getFirestore, setDoc, updateDoc, deleteField } from 'firebase/firestore';
import { getDownloadURL, getStorage, uploadBytes, ref, deleteObject } from 'firebase/storage';
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
  startAt,
  endAt,
  equalTo,
} from 'firebase/database';

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

export const PAGE_SIZE = 20;

const keysToCheck = ['instagram', 'facebook', 'email', 'phone', 'telegram', 'tiktok', 'other', 'vk', 'name', 'surname', 'lastAction', 'getInTouch'];

export const getUrlofUploadedAvatar = async (photo, userId) => {
  const compressedPhoto = await compressPhoto(photo, 50); // Стиснення фото до 50 кБ
  const file = await getFileBlob(compressedPhoto); // Перетворюємо стиснене фото на об'єкт Blob

  const uniqueId = Date.now().toString(); // генеруємо унікальне ім"я для фото
  const fileName = `${uniqueId}.jpg`; // Використовуємо унікальне ім'я для файлу
  const linkToFile = ref(storage, `avatar/${userId}/${fileName}`); // створюємо посилання на місце збереження фото в Firebase
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

export const makeNewUser = async searchedValue => {
  const db = getDatabase();
  const newUsersRef = ref2(db, 'newUsers');
  const searchIdRef = ref2(db, 'newUsers/searchId');

  const { searchKey, searchValue, searchIdKey } = makeSearchKeyValue(searchedValue);

  const newUserRef = push(newUsersRef); // Генеруємо унікальний ключ
  const newUserId = newUserRef.key;

  // Форматування дати у форматі дд.мм.рррр
  const createdAt = new Date().toLocaleDateString('uk-UA');

  const newUser = {
    userId: newUserId,
    [searchKey]: searchValue,
    createdAt,
  };

  // Записуємо нового користувача в базу даних
  await set(newUserRef, newUser);

  // 6. Додаємо пару ключ-значення у searchId
  await update(searchIdRef, { [searchIdKey]: newUserId });

  return {
    userId: newUserId,
    ...newUser,
  };
};

const makeSearchKeyValue = searchedValue => {
  const [searchKey, searchValue] = Object.entries(searchedValue)[0];
  let modifiedSearchValue = searchValue;
  modifiedSearchValue = encodeKey(searchValue);
  const searchIdKey = `${searchKey}_${modifiedSearchValue.toLowerCase()}`; // Формуємо ключ для пошуку у searchId
  return { searchKey, searchValue, modifiedSearchValue, searchIdKey };
};

const searchUserByPartialUserId = async (userId, users) => {
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

const addUserToResults = async (userId, users, userIdOrArray = null) => {
  const userSnapshotInNewUsers = await get(ref2(database, `newUsers/${userId}`));
  const userFromNewUsers = userSnapshotInNewUsers.exists() ? userSnapshotInNewUsers.val() : {};

  const userSnapshotInUsers = await get(ref2(database, `users/${userId}`));
  const userFromUsers = userSnapshotInUsers.exists() ? userSnapshotInUsers.val() : {};
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
    ...(userIdOrArray ? { duplicate: userIdOrArray } : {}), // Додаємо ключ duplicate, якщо userIdOrArray не null
  };
};

const searchBySearchId = async (modifiedSearchValue, uniqueUserIds, users) => {
  const searchPromises = keysToCheck.flatMap(prefix => {
    const searchKeys = [
      `${prefix}_${modifiedSearchValue.toLowerCase()}`,
      ...(modifiedSearchValue.startsWith('0') ? [`${prefix}_38${modifiedSearchValue.toLowerCase()}`] : []),
      ...(modifiedSearchValue.startsWith('+') ? [`${prefix}_${modifiedSearchValue.slice(1).toLowerCase()}`] : []),
    ];
    // console.log('searchBySearchId :>> ',);
    return searchKeys.map(async searchKeyPrefix => {
      const searchIdSnapshot = await get(query(ref2(database, 'newUsers/searchId'), orderByKey(), startAt(searchKeyPrefix), endAt(`${searchKeyPrefix}\uf8ff`)));

      if (searchIdSnapshot.exists()) {
        const matchingKeys = searchIdSnapshot.val();

        // console.log('matchingKeys11111111111111 :>> ', matchingKeys);

        for (const [, userIdOrArray] of Object.entries(matchingKeys)) {
          if (Array.isArray(userIdOrArray)) {
            // console.log('userIdOrArray2222222222 :>> ', userIdOrArray);
            for (const userId of userIdOrArray) {
              // console.log('userId33333333333333 :>> ', userId);
              if (!uniqueUserIds.has(userId)) {
                uniqueUserIds.add(userId);
                await addUserToResults(userId, users, userIdOrArray);
              }
            }
          } else {
            if (!uniqueUserIds.has(userIdOrArray)) {
              uniqueUserIds.add(userIdOrArray);
              // console.log('uniqueUserIds.add(userIdOrArray) :>> ');
              await addUserToResults(userIdOrArray, users);
            }
          }
        }
      }
    });
  });

  await Promise.all(searchPromises);
};

const searchByPrefixes = async (searchValue, uniqueUserIds, users) => {
  // console.log('🔍 searchValue :>> ', searchValue);

  for (const prefix of keysToCheck) {
    // console.log('🛠 Searching by prefix:', prefix);

    let formattedSearchValue = searchValue.trim().toLowerCase();

    // Якщо шукаємо за "surname", робимо пошук з урахуванням першої великої літери
    if (prefix === 'name' || prefix === 'surname') {
      formattedSearchValue = searchValue.trim().charAt(0).toUpperCase() + searchValue.trim().slice(1).toLowerCase();
    }

    //     if (prefix === 'telegram') {
    //       formattedSearchValue = `telegram_ук_см_${searchValue.trim().toLowerCase()}`;
    // }

    const queryByPrefix = query(ref2(database, 'newUsers'), orderByChild(prefix), startAt(formattedSearchValue), endAt(`${formattedSearchValue}\uf8ff`));

    try {
      const snapshotByPrefix = await get(queryByPrefix);
      // console.log(`📡 Firebase Query Executed for '${prefix}'`);

      if (snapshotByPrefix.exists()) {
        // console.log(`✅ Found results for '${prefix}'`);

        snapshotByPrefix.forEach(userSnapshot => {
          const userId = userSnapshot.key;
          const userData = userSnapshot.val();

          let fieldValue = userData[prefix];

          // Переконаємося, що значення є рядком і не містить зайвих пробілів
          if (typeof fieldValue === 'string') {
            fieldValue = fieldValue.trim();
          } else {
            return; // Пропускаємо, якщо поле не є рядком
          }

          // console.log('📌 Checking user:', userId);
          // console.log(`🧐 userData['${prefix}']:`, fieldValue);
          // console.log('📏 Type of fieldValue:', typeof fieldValue);
          // console.log(
          //   '🔍 Includes searchValue?',
          //   fieldValue.toLowerCase().includes(formattedSearchValue.toLowerCase())
          // );
          // console.log('🛑 Already in uniqueUserIds?', uniqueUserIds.has(userId));

          if (
            fieldValue &&
            typeof fieldValue === 'string' &&
            fieldValue.toLowerCase().includes(formattedSearchValue.toLowerCase()) &&
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
      } else {
        // console.log(`🚫 No results found for '${prefix}'`);
      }
    } catch {
      // console.error(`❌ Error fetching data for '${prefix}'`);
    }
  }
};

export const fetchNewUsersCollectionInRTDB = async searchedValue => {
  const { searchValue, modifiedSearchValue } = makeSearchKeyValue(searchedValue);
  const users = {};
  const uniqueUserIds = new Set();

  // console.log('modifiedSearchValue3333333333333 :>> ', modifiedSearchValue);

  try {
    await searchBySearchId(modifiedSearchValue, uniqueUserIds, users);
    await searchByPrefixes(searchValue, uniqueUserIds, users);
    await searchUserByPartialUserId(searchValue, users);

    // if (users.length === 1) {
    //   console.log('Знайдено одного користувача:', users[0]);
    //   return users[0];
    // } else if (users.length > 1) {
    //   console.log('Знайдено кілька користувачів:', users);
    //   return users;
    // }

    // Якщо знайдено одного користувача
    if (Object.keys(users).length === 1) {
      const singleUserId = Object.keys(users)[0];
      console.log('Знайдено одного користувача:', users[singleUserId]);
      return users[singleUserId];
    }

    // Якщо знайдено кілька користувачів
    if (Object.keys(users).length > 1) {
      console.log('Знайдено кілька користувачів:', users);
      return users;
    }

    // const userFromUsers = await searchUserByPartialUserId(searchValue, users);
    // if (userFromUsers) {
    //   return userFromUsers;
    // }

    console.log('Користувача не знайдено.');
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


export const updateDataInFiresoreDB = async (userId, uploadedInfo, condition) => {
  console.log(`upl555555555oadedInfo`);
  const cleanedUploadedInfo = removeUndefined(uploadedInfo);
  console.log(`uploadedInfo!!!!`, uploadedInfo);
  console.log('userId :>> ', userId);
  console.log('db:', db);
  try {
    const userRef = doc(db, `users/${userId}`);
    console.log(`rrrrrrrrrrrrr`);
    if (condition === 'update') {
      console.log(`uploadedInfo`, uploadedInfo);
      await updateDoc(userRef, cleanedUploadedInfo);
    } else if (condition === 'set') {
      await setDoc(userRef, cleanedUploadedInfo);
    } else if (condition === 'check') {
      const userDoc = await getDoc(userRef);
      if (userDoc.exists()) {
        await updateDoc(userRef, cleanedUploadedInfo);
      } else {
        await setDoc(userRef, cleanedUploadedInfo);
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

export const updateDataInRealtimeDB = async (userId, uploadedInfo, condition) => {
  try {
    const userRefRTDB = ref2(database, `users/${userId}`);
    const cleanedUploadedInfo = removeUndefined(uploadedInfo);
    if (condition === 'update') {
      await update(userRefRTDB, { ...cleanedUploadedInfo });
    }
    await set(userRefRTDB, { ...cleanedUploadedInfo });
  } catch (error) {
    console.error('Сталася помилка під час збереження даних в Realtime Database2:', error);
    throw error;
  }
};

export const updateDataInNewUsersRTDB = async (userId, uploadedInfo, condition) => {
  try {
    const userRefRTDB = ref2(database, `newUsers/${userId}`);
    const snapshot = await get(userRefRTDB);
    const currentUserData = snapshot.exists() ? snapshot.val() : {};

    // Перебір ключів та їх обробка
    for (const key of keysToCheck) {
      const isEmptyString = uploadedInfo[key] === '';

      if (isEmptyString) {
        console.log(`${key} має пусте значення. Видаляємо.`);
        await updateSearchId(key, currentUserData[key], userId, 'remove'); // Видаляємо з searchId
        uploadedInfo[key] = null; // Видаляємо ключ з newUsers/${userId}
        continue; // Переходимо до наступного ключа
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
            if (typeof value === 'number') {
              cleanedValue = String(value).replace(/\s+/g, '');
            } else if (typeof value === 'string') {
              cleanedValue = value.replace(/\s+/g, '');
            } else if (Array.isArray(value)) {
              // Якщо value є масивом телефонів
              cleanedValue = value.map(v => (typeof v === 'number' ? String(v) : v)).map(v => v.replace(/\s+/g, ''));
            } else {
              console.warn(`Неправильний тип даних для ключа 'phone':`, value);
              cleanedValue = ''; // Запобігаємо помилці та уникаємо некоректного значення
            }
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
            if (typeof value === 'number') {
              cleanedValue = String(value).replace(/\s+/g, '');
            } else if (typeof value === 'string') {
              cleanedValue = value.replace(/\s+/g, '');
            } else if (Array.isArray(value)) {
              // Якщо value є масивом телефонів
              cleanedValue = value.map(v => (typeof v === 'number' ? String(v) : v)).map(v => v.replace(/\s+/g, ''));
            } else {
              console.warn(`Неправильний тип даних для ключа 'phone':`, value);
              cleanedValue = ''; // Запобігаємо помилці та уникаємо некоректного значення
            }
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
    // Оновлення користувача в базі

    console.log('uploadedInfo :>> ', uploadedInfo);
    console.log('currentUserData :>> ', currentUserData);

    // if (condition === 'update' && !(Object.keys(uploadedInfo).length < Object.keys(currentUserData).length)) {
    if (condition === 'update') {
      console.log('update :>> ');
      await update(userRefRTDB, { ...uploadedInfo });
    } else {
      console.log('set :>> ');
      await set(userRefRTDB, { ...uploadedInfo });
    }
  } catch (error) {
    console.error('Сталася помилка під час збереження даних в Realtime Database3:', error);
    throw error;
  }
};
// export const auth = getAuth(app);

export const deletePhotos = async (userId, photoUrls) => {
  try {
    await Promise.all(
      photoUrls.map(async photoUrl => {
        const urlParts = photoUrl.split('%2F');
        const fileNameWithExtension = urlParts[urlParts.length - 1];
        const partsAfterQuestionMark = fileNameWithExtension.split('?');
        const fileName = partsAfterQuestionMark[0];
        const filePath = `avatar/${userId}/${fileName}`;
        const fileRef = ref(storage, filePath);
        await deleteObject(fileRef);
      })
    );
  } catch (error) {
    console.error(`Photo delete error:`, error);
  }
  // }
};

const encodeKey = key => {
  return key
    .replace(/\s/g, '_space_')
    .replace(/@/g, '_at_')
    .replace(/\./g, '_dot_')
    .replace(/#/g, '_hash_')
    .replace(/\$/g, '_dollar_')
    .replace(/\//g, '_slash_')
    .replace(/\[/g, '_lbracket_')
    .replace(/\]/g, '_rbracket_');
};

// Функція для оновлення або видалення пар у searchId
export const updateSearchId = async (searchKey, searchValue, userId, action) => {
  console.log('searchKey!!!!!!!!! :>> ', searchKey);
  console.log('searchValue!!!!!!!!! :>> ', searchValue);
  console.log('action!!!!!!!!!!! :>> ', action);
  try {
    if (!searchValue || !searchKey || !userId) {
      console.error('Invalid parameters provided:', { searchKey, searchValue, userId });
      return;
    }

    if (searchKey === 'getInTouch' || searchKey === 'lastAction') {
      console.log('Пропускаємо непотрібні ключі :>> ', searchKey);
      return;
    }

    const searchIdKey = `${searchKey}_${encodeKey(searchValue)}`;
    const searchIdRef = ref2(database, `newUsers/searchId/${searchIdKey}`);
    console.log('searchIdKey in updateSearchId :>> ', searchIdKey);

    if (action === 'add') {
      const searchIdSnapshot = await get(searchIdRef);

      if (searchIdSnapshot.exists()) {
        const existingValue = searchIdSnapshot.val();

        if (Array.isArray(existingValue)) {
          if (!existingValue.includes(userId)) {
            const updatedValue = [...existingValue, userId];
            await update(ref2(database, 'newUsers/searchId'), { [searchIdKey]: updatedValue });
            console.log(`Додано userId до масиву: ${searchIdKey}:`, updatedValue);
          } else {
            console.log(`userId вже існує в масиві для ключа: ${searchIdKey}`);
          }
        } else if (existingValue !== userId) {
          const updatedValue = [existingValue, userId];
          await update(ref2(database, 'newUsers/searchId'), { [searchIdKey]: updatedValue });
          console.log(`Перетворено значення на масив і додано userId: ${searchIdKey}:`, updatedValue);
        } else {
          console.log(`Ключ вже містить userId: ${searchIdKey}`);
        }
      } else {
        await update(ref2(database, 'newUsers/searchId'), { [searchIdKey]: userId });
        console.log(`Додано нову пару в searchId: ${searchIdKey}: ${userId}`);
      }
    } else if (action === 'remove') {
      const searchIdSnapshot = await get(searchIdRef);

      if (searchIdSnapshot.exists()) {
        const existingValue = searchIdSnapshot.val();

        if (Array.isArray(existingValue)) {
          const updatedValue = existingValue.filter(id => id !== userId);

          if (updatedValue.length === 1) {
            await update(ref2(database, 'newUsers/searchId'), { [searchIdKey]: updatedValue[0] });
            console.log(`Оновлено значення ключа до одиничного значення: ${searchIdKey}:`, updatedValue[0]);
          } else if (updatedValue.length === 0) {
            await remove(searchIdRef);
            console.log(`Видалено ключ: ${searchIdKey}`);
          } else {
            await update(ref2(database, 'newUsers/searchId'), { [searchIdKey]: updatedValue });
            console.log(`Оновлено масив ключа: ${searchIdKey}:`, updatedValue);
          }
        } else if (existingValue === userId) {
          await remove(searchIdRef);
          console.log(`Видалено ключ, що мав одиничне значення: ${searchIdKey}`);
        } else {
          console.log(`userId не знайдено для видалення: ${searchIdKey}`);
        }
      } else {
        console.log(`Ключ не знайдено для видалення: ${searchIdKey}`);
      }
    } else {
      console.error('Unknown action provided:', action);
    }
  } catch (error) {
    console.error('Error in updateSearchId:', error);
  }
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
//   const searchIdRef = ref2(database, `newUsers/searchId/${searchIdKey}`);
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

export const createSearchIdsInCollection = async collection => {
  const ref = ref2(database, collection);

  const [newUsersSnapshot] = await Promise.all([get(ref)]);

  if (newUsersSnapshot.exists()) {
    const usersData = newUsersSnapshot.val();
    const userIds = Object.keys(usersData);
    console.log('userIds :>> ', userIds);
    // const userIds = ['AA9834'];

    const updatePromises = [];

    for (const userId of userIds) {
      const user = usersData[userId];
      for (const key of keysToCheck) {
        if (user.hasOwnProperty(key)) {
          let value = user[key];

          // Якщо value - масив
          if (Array.isArray(value)) {
            console.log('Array.isArray(value) :>> ', value);
            value.forEach(item => {
              if (item && typeof item === 'string') {
                let cleanedValue = item.toString().trim(); // Видаляємо зайві пробіли

                if (key === 'phone' || key === 'name' || key === 'surname') {
                  cleanedValue = cleanedValue.replace(/\s+/g, ''); // Видалення пробілів
                }

                if (key === 'telegram') {
                  cleanedValue = encodeKey(cleanedValue); // Кодування
                }

                updatePromises.push(updateSearchId(key, cleanedValue.toLowerCase(), userId, 'add'));
              }
            });
          }
          // Якщо value - рядок або число
          else if (value && (typeof value === 'string' || typeof value === 'number')) {
            // Перевірка на існування значення та типу string
            let cleanedValue = value.toString(); // Перетворюємо і цифри і букви в рядок, щоб працювало toLowerCase

            // Якщо ключ 'phone', видаляємо всі пробіли
            if (key === 'phone' || key === 'name' || key === 'surname') {
              cleanedValue = cleanedValue.replace(/\s+/g, '');
            }
            // Якщо ключ 'telegram', кодуємо рядок
            if (key === 'telegram') {
              cleanedValue = encodeKey(value);
            }

            // Додаємо новий ID
            updatePromises.push(updateSearchId(key, cleanedValue.toLowerCase(), userId, 'add'));
            // await updateSearchId(key, cleanedValue.toLowerCase(), userId, 'add');
          }
        }
      }
    }
    // Виконуємо всі оновлення паралельно
    await Promise.all(updatePromises);
  }
};

// Функція для видалення пар у searchId
export const removeSearchId = async userId => {
  const db = getDatabase();

  // Отримуємо всі пари в searchId
  const searchIdSnapshot = await get(ref2(db, `newUsers/searchId`));

  if (searchIdSnapshot.exists()) {
    const searchIdData = searchIdSnapshot.val();

    // Перебираємо всі ключі у searchId
    const keysToRemove = Object.keys(searchIdData).filter(key => searchIdData[key] === userId);

    // Видаляємо пари, що відповідають userId
    for (const key of keysToRemove) {
      await remove(ref2(db, `newUsers/searchId/${key}`));
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
  const searchIdKey = `${searchKey}_${searchValue.toLowerCase()}`; // Формуємо ключ для пошуку у searchId
  console.log(`searchIdKey`, searchIdKey);
  // Отримуємо всі пари в searchId
  const searchIdSnapshot = await get(ref2(db, `newUsers/searchId`));
  console.log(`5555555555`);
  if (searchIdSnapshot.exists()) {
    const searchIdData = searchIdSnapshot.val();
    console.log(`searchIdData`, searchIdData);

    // Перебираємо всі ключі у searchId
    const keysToRemove = Object.keys(searchIdData).filter(key => key === searchIdKey && searchIdData[key] === userId);
    console.log(`keysToRemove`, keysToRemove);
    // Видаляємо пари, що відповідають userId
    for (const key of keysToRemove) {
      await remove(ref2(db, `newUsers/searchId/${key}`));
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



const categorizeCsection = val => {
  if (!val) return 'other';
  const c = val.toString().trim().toLowerCase();
  if (!isNaN(parseInt(c, 10))) {
    const num = parseInt(c, 10);
    if (num >= 2) return 'cs2plus';
    if (num === 1) return 'cs1';
    if (num === 0) return 'cs0';
  }
  if (['-', 'no', 'ні'].includes(c)) return 'cs0';
  return 'other';
};

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

const getMaritalStatusCategory = value => {
  if (!value.maritalStatus || typeof value.maritalStatus !== 'string') return 'other';
  const m = value.maritalStatus.trim().toLowerCase();
  if (['yes', '+', 'married', 'одружена', 'заміжня'].includes(m)) return 'married';
  if (['no', '-', 'unmarried', 'single', 'ні', 'незаміжня'].includes(m)) return 'unmarried';
  return 'other';
};

const getBloodCategory = value => {
  const b = (value.blood || '').toString().trim().toLowerCase();
  if (!b) return 'other';
  const normalized = b.replace(/\s+/g, '');
  const positive = ['rh+', 'рк+', 'pos', '+'];
  const negative = ['rh-', 'рк-', 'neg', '-'];

  if (positive.includes(normalized)) return 'pos';
  if (negative.includes(normalized)) return 'neg';

  if (normalized.endsWith('+')) return 'pos';
  if (normalized.endsWith('-')) return 'neg';
  return 'other';
};



const getAgeCategory = value => {
  if (!value.birth || typeof value.birth !== 'string') return 'other';
  const birthParts = value.birth.split('.');
  const birthYear = parseInt(birthParts[2], 10);
  const currentYear = new Date().getFullYear();
  const age = currentYear - birthYear;
  if (age <= 25) return 'le25';
  if (age >= 26 && age <= 29) return '26_29';
  if (age >= 31 && age <= 36) return '31_36';
  if (age >= 37 && age <= 42) return '37_42';
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
  if (count < 4) return 'lt4';
  if (count < 8) return 'lt8';
  if (count < 12) return 'lt12';
  return 'other';
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
const filterMain = (usersData, filterForload, filterSettings = {}) => {
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

    if (filterSettings.role && Object.values(filterSettings.role).some(v => !v)) {
      const cat = getRoleCategory(value);
      filters.role = !!filterSettings.role[cat];
    }

    if (filterSettings.maritalStatus && Object.values(filterSettings.maritalStatus).some(v => !v)) {
      const cat = getMaritalStatusCategory(value);
      filters.maritalStatus = !!filterSettings.maritalStatus[cat];
    }

    if (filterSettings.blood && Object.values(filterSettings.blood).some(v => !v)) {
      const cat = getBloodCategory(value);
      filters.blood = !!filterSettings.blood[cat];
    }

    if (filterSettings.age && Object.values(filterSettings.age).some(v => !v)) {
      const cat = getAgeCategory(value);
      filters.age = !!filterSettings.age[cat];
    }

    if (filterSettings.userId && Object.values(filterSettings.userId).some(v => !v)) {
      const cat = getUserIdCategory(userId);
      filters.userId = !!filterSettings.userId[cat];
    }

    if (filterSettings.fields && Object.values(filterSettings.fields).some(v => !v)) {
      const cat = getFieldCountCategory(value);
      filters.fields = !!filterSettings.fields[cat];
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
const sortUsers = filteredUsers => {
  // const today = new Date().toLocaleDateString('uk-UA'); // "дд.мм.рррр"
  // const today = new Date().toISOString().split('T')[0]; // Формат рррр-мм-дд
  const currentDate = new Date(); // Поточна дата
  const tomorrow = new Date(currentDate); // Копія поточної дати
  tomorrow.setDate(currentDate.getDate() + 1); // Збільшуємо дату на 1 день
  const today = tomorrow.toISOString().split('T')[0]; // Формат YYYY-MM-DD
  const twoWeeksAheadDate = (() => {
    const twoWeeksAhead = new Date(tomorrow);
    twoWeeksAhead.setDate(tomorrow.getDate() + 14);
    return twoWeeksAhead.toISOString().split('T')[0];
  })();
  const getGroup = date => {
    if (!date) return 4; // порожня дата
    if (date === '2099-99-99' || date === '9999-99-99') return 6; // спецдати
    if (!isValidDate(date)) return 3; // некоректні дати
    if (date === today) return 0; // сьогодні
    if (date < today) return 1; // минулі
    if (date <= twoWeeksAheadDate) return 2; // майбутні до 2х тижнів
    return 5; // інші майбутні дати
  };

    return filteredUsers.sort(([, a], [, b]) => {
    const groupA = getGroup(a.getInTouch);
    const groupB = getGroup(b.getInTouch);

    if (groupA !== groupB) return groupA - groupB;

    // Усередині груп із коректними датами сортуємо за зростанням
    if (groupA <= 2 || groupA === 5) {
      const aDate = a.getInTouch || '';
      const bDate = b.getInTouch || '';
      return aDate.localeCompare(bDate);
    }

    return 0;
  });
};

export const fetchPaginatedNewUsers = async (lastKey, filterForload, filterSettings = {}) => {
  const db = getDatabase();
  const usersRef = ref2(db, 'newUsers');
  const limit = PAGE_SIZE + 1;

  const noExplicitFilters =
    (!filterForload || filterForload === 'NewLoad') &&
    (!filterSettings || Object.values(filterSettings).every(value => value === 'off'));

  if (filterForload === "DATE") {
    if (!noExplicitFilters) {
      try {
        const filtered = await fetchAllFilteredUsers(filterForload, filterSettings);
        const fetchedUsers = Object.entries(filtered);

        const sortedUsers = sortUsers(fetchedUsers);

        const offset = lastKey || 0;
        const paginatedSlice = sortedUsers.slice(offset, offset + PAGE_SIZE);
        const nextOffset = offset + PAGE_SIZE;
        const hasMore = sortedUsers.length > nextOffset;

        const paginatedUsers = paginatedSlice.reduce((acc, [userId, userData]) => {
          acc[userId] = userData;
          return acc;
        }, {});

        let totalCount;
        if (!lastKey) {
          totalCount = sortedUsers.length;
        }

        return {
          users: paginatedUsers,
          lastKey: nextOffset,
          hasMore,
          totalCount,
        };
      } catch (error) {
        console.error('Error fetching date filtered users:', error);
        return {
          users: {},
          lastKey: null,
          hasMore: false,
        };
      }
    }

    try {
      const { data } = await fetchSortedUsersByDate(limit, lastKey || 0);
      let fetchedUsers = Object.entries(data);

      const filteredUsers = filterMain(fetchedUsers, filterForload, filterSettings);

      const sortedUsers = sortUsers(filteredUsers);

      const paginatedSlice = sortedUsers.slice(0, PAGE_SIZE);
      const nextOffset = (lastKey || 0) + PAGE_SIZE;
      const hasMore = sortedUsers.length > PAGE_SIZE;

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
        totalCount = await fetchTotalFilteredUsersCount(filterForload, filterSettings);
      }

      return {
        users: finalUsers,
        lastKey: nextOffset,
        hasMore,
        totalCount,
      };
    } catch (error) {
      console.error('Error fetching sorted users by date with filters:', error);
      return {
        users: {},
        lastKey: null,
        hasMore: false,
      };
    }
  }

  try {
    const baseQuery = lastKey ? query(usersRef, orderByKey(), startAfter(lastKey), limitToFirst(limit)) : query(usersRef, orderByKey(), limitToFirst(limit));

    const snapshot = await get(baseQuery);
    if (!snapshot.exists()) {
      return { users: {}, lastKey: null, hasMore: false };
    }

    let fetchedUsers = Object.entries(snapshot.val()).filter(([id]) => id !== 'searchId');

    const noExplicitFilters =
      (!filterForload || filterForload === 'NewLoad') && (!filterSettings || Object.values(filterSettings).every(value => value === 'off'));

    const filteredUsers = noExplicitFilters ? fetchedUsers : filterMain(fetchedUsers, filterForload, filterSettings);

    const sortedUsers = sortUsers(filteredUsers);

    const paginatedSlice = sortedUsers.slice(0, PAGE_SIZE);
    const nextKey = sortedUsers.length > PAGE_SIZE ? sortedUsers[PAGE_SIZE][0] : null;

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
      totalCount = await fetchTotalFilteredUsersCount(filterForload, filterSettings);
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
      // console.log('Знайдено користувача у newUsers: ', newUserSnapshot.val());
      // return newUserSnapshot.val();
      // console.log('Знайдено користувача у newUsers: ', newUserSnapshot.val());
      // Додатковий пошук в колекції users
      // console.log('userId222222222 :>> ', userId);
      const userSnapshotInUsers = await get(ref2(db, `users/${userId}`));
      // Якщо знайдено користувача в users
      if (userSnapshotInUsers.exists()) {
        // console.log('Знайдено користувача у users: ', userSnapshotInUsers.val());
        // Об'єднання даних з newUsers і users
        return {
          userId,
          ...newUserSnapshot.val(),
          ...userSnapshotInUsers.val(),
        };
      }
      // Повертаємо дані тільки з newUsers, якщо користувач не знайдений у users
      return {
        userId,
        ...newUserSnapshot.val(),
      };
    }

    // Пошук у users, якщо не знайдено в newUsers
    const userSnapshot = await get(userRefInUsers);
    if (userSnapshot.exists()) {
      console.log('Знайдено користувача у users: ', userSnapshot.val());
      return userSnapshot.val();
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
//     const searchIdSnapshot = await get(ref2(database, 'newUsers/searchId'));

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
    const searchIdSnapshot = await get(ref2(database, 'newUsers/searchId'));

    if (!searchIdSnapshot.exists()) {
      console.log('No duplicates found in searchId.');
      return {};
    }

    const searchIdData = searchIdSnapshot.val();

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
    const searchIdSnapshot = await get(ref2(database, 'newUsers/searchId'));

    if (!searchIdSnapshot.exists()) {
      console.log('No duplicates found in searchId.');
      return {};
    }

    const searchIdData = searchIdSnapshot.val();

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

    // Перебір ключів для перевірки
    for (const key of keysToCheck) {
      const valueToCheck = userData[key];

      if (!valueToCheck) continue; // Пропускаємо, якщо значення відсутнє

      // Якщо значення — рядок
      if (typeof valueToCheck === 'string') {
        console.log(`Видалення рядкового значення: ${key} -> ${valueToCheck}`);
        await updateSearchId(key, valueToCheck, userId, 'remove');
      }

      // Якщо значення — масив
      if (Array.isArray(valueToCheck)) {
        console.log(`Видалення масиву значень для ключа: ${key} -> ${valueToCheck}`);
        for (const item of valueToCheck) {
          if (typeof item === 'string' || typeof item === 'number') {
            await updateSearchId(key, item, userId, 'remove');
          } else {
            console.warn(`Пропущено непідтримуване значення в масиві для ключа: ${key}`, item);
          }
        }
      }
    }
    // console.warn(`Видаляємо картку користувача з newUsers: ${userId}`);
    // Видаляємо картку користувача з newUsers
    await remove(ref2(db, `newUsers/${userId}`));
    console.log(`Картка користувача видалена з newUsers: ${userId}`);
  } catch (error) {
    console.error(`Помилка під час видалення searchId для userId: ${userId}`, error);
  }
};

export const fetchAllFilteredUsers = async (filterForload, filterSettings = {}) => {
  try {
    const [newUsersSnapshot, usersSnapshot] = await Promise.all([get(ref2(database, 'newUsers')), get(ref2(database, 'users'))]);

    const newUsersData = newUsersSnapshot.exists() ? newUsersSnapshot.val() : {};
    const usersData = usersSnapshot.exists() ? usersSnapshot.val() : {};

    const allUserIds = new Set([...Object.keys(newUsersData), ...Object.keys(usersData)]);

      const allUsersArray = Array.from(allUserIds).map(userId => {
        const newUserRaw = newUsersData[userId] || {};
        const newUserDataWithoutSearchId = { ...newUserRaw };
        delete newUserDataWithoutSearchId.searchId;

      return [
        userId,
        {
          userId,
          ...newUserDataWithoutSearchId,
          ...(usersData[userId] || {}),
        },
      ];
    });

    const filteredUsers = filterMain(allUsersArray, filterForload, filterSettings);
    const sortedUsers = sortUsers(filteredUsers);
    return Object.fromEntries(sortedUsers);
  } catch (error) {
    console.error('Error fetching filtered users:', error);
    return {};
  }
};

export const fetchTotalFilteredUsersCount = async (filterForload, filterSettings = {}) => {
  const allUsers = await fetchAllFilteredUsers(filterForload, filterSettings);
  return Object.keys(allUsers).length;
};

export const fetchTotalNewUsersCount = async () => {
  try {
    const snapshot = await get(ref2(database, 'newUsers'));
    if (snapshot.exists()) {
      const data = snapshot.val();
      const userKeys = Object.keys(data).filter(key => key !== 'searchId');
      return userKeys.length;
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
        // Видаляємо поле searchId
        const newUserDataWithoutSearchId = { ...newUserRaw };
        delete newUserDataWithoutSearchId.searchId;

      return [
        userId,
        {
          userId,
          ...newUserDataWithoutSearchId,
          ...(usersData[userId] || {}),
        },
      ];
    });

    // Обмежуємо результати першими 3
    const limitedUsersArray = mergedUsersArray;
    // .slice(0, 40);

    // Перетворюємо назад в об’єкт
    const limitedUsers = Object.fromEntries(limitedUsersArray);

    console.log('Отримано перших 3 користувачів без поля searchId:', limitedUsers);
    return limitedUsers;
  } catch (error) {
    console.error('Помилка при отриманні даних:', error);
    return null;
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
  entries = await fetchData(
    query(
      usersRef,
      orderByChild('getInTouch'),
      startAt(twoWeeksAgoDate),
      endAt(today)
    )
  );
  entries = entries.filter(([, u]) => u.getInTouch < today);
  pushUnique(entries);

  // Upcoming records within two weeks
  entries = await fetchData(
    query(
      usersRef,
      orderByChild('getInTouch'),
      startAt(today),
      endAt(twoWeeksAheadDate)
    )
  );
  entries = entries.filter(([, u]) => u.getInTouch > today && u.getInTouch <= twoWeeksAheadDate);
  pushUnique(entries);

  // Records outside two week range (past and future)
  entries = await fetchData(query(usersRef, orderByChild('getInTouch'), endAt(beforeTwoWeeksAgoDate)));
  entries = entries.filter(([, u]) => isValidDate(u.getInTouch) && u.getInTouch < twoWeeksAgoDate);
  pushUnique(entries);

  entries = await fetchData(query(usersRef, orderByChild('getInTouch'), startAt(twoWeeksAheadDate)));
  entries = entries.filter(([, u]) =>
    isValidDate(u.getInTouch) &&
    u.getInTouch > twoWeeksAheadDate &&
    u.getInTouch !== '2099-99-99' &&
    u.getInTouch !== '9999-99-99'
  );
  pushUnique(entries);

  // Empty dates
  entries = await fetchData(query(usersRef, orderByChild('getInTouch'), equalTo('')));
  pushUnique(entries);

  // Records with invalid dates (non-empty and not YYYY-MM-DD)
  entries = await fetchData(query(usersRef, orderByChild('getInTouch')));
  entries = entries.filter(([id, u]) => {
    const d = u.getInTouch;
    return (
      d &&
      !isValidDate(d) &&
      d !== '2099-99-99' &&
      d !== '9999-99-99' &&
      !fetchedIds.has(id)
    );
  });
  pushUnique(entries);

  // Records with special future dates
  entries = await fetchData(query(usersRef, orderByChild('getInTouch'), equalTo('2099-99-99')));
  pushUnique(entries);
  entries = await fetchData(query(usersRef, orderByChild('getInTouch'), equalTo('9999-99-99')));
  pushUnique(entries);

  const sliced = result.slice(offset, offset + limit);
  return { data: Object.fromEntries(sliced), totalCount: result.length };
}

