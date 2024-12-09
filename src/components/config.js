import { initializeApp } from 'firebase/app';
import { getAuth, deleteUser } from 'firebase/auth';
import { collection, deleteDoc, doc, getDoc, getDocs, getFirestore, setDoc, updateDoc, deleteField } from 'firebase/firestore';
import { getDownloadURL, getStorage, uploadBytes, ref, deleteObject, listAll } from 'firebase/storage';
import { getDatabase, ref as ref2, get, remove, set, update, push, orderByChild } from 'firebase/database';
import { query, orderByKey, equalTo } from 'firebase/database';
import { startAt, endAt } from 'firebase/database';

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

const keysToCheck = ['instagram', 'facebook', 'email', 'phone', 'telegram', 'tiktok', 'vk', 'name', 'surname' ];

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

export const getUrlofUploadedPhoto = async photo => {
  const file = await getFileBlob(photo); // перетворюємо отриману фотографію на об'єкт Blob
  const uniqueId = Date.now().toString(); // генеруємо унікальне ім"я для фото
  const linkToFile = ref(storage, `imgPost/${uniqueId}`); // створюємо посилання на місце збереження фото в Firebase
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

        console.log('Остаточний розмір стисненого фото:', compressedFile.size);
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
  console.log('userId :>> ', userId);
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

// const decodeEmail = (encodedEmail) => {
//   return encodedEmail
//     .replace(/_at_/g, '@')
//     .replace(/_dot_/g, '.')
//     .replace(/_hash_/g, '#')
//     .replace(/_dollar_/g, '$')
//     .replace(/_slash_/g, '/')
//     .replace(/_lbracket_/g, '[')
//     .replace(/_rbracket_/g, ']');
// };

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

  console.log('Створений новий користувач і доданий у searchId: ', newUser);

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
  console.log('userId:', userId);
  try {
    const collections = ['users', 'newUsers']; // Масив колекцій, де здійснюється пошук

    for (const collection of collections) {
      const refToCollection = ref2(database, collection);
      const partialUserIdQuery = query(
        refToCollection,
        orderByKey(),
        startAt(userId),
        endAt(userId + '\uf8ff')
      );

      const snapshot = await get(partialUserIdQuery);

      if (snapshot.exists()) {
        const userPromises = []; // Масив для збереження обіцянок `addUserToResults`

        snapshot.forEach((userSnapshot) => {
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
          console.log('Користувачі знайдені:', users);
          return users;
        }
      }
    }

    console.log('Користувача з частковим userId не знайдено.');
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

  console.log('userFromUsers :>> ', userFromUsers);
  console.log('userFromNewUsers :>> ', userFromNewUsers);
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

    console.log('users44444 :>> ', users);
};

const searchBySearchId = async (modifiedSearchValue, uniqueUserIds, users) => {
  const searchPromises = keysToCheck.flatMap(prefix => {
    const searchKeys = [
      `${prefix}_${modifiedSearchValue.toLowerCase()}`,
      ...(modifiedSearchValue.startsWith('0') ? [`${prefix}_38${modifiedSearchValue.toLowerCase()}`] : []),
      ...(modifiedSearchValue.startsWith('+') ? [`${prefix}_${modifiedSearchValue.slice(1).toLowerCase()}`] : []),
    ];
console.log('searchBySearchId :>> ',);
    return searchKeys.map(async searchKeyPrefix => {
      const searchIdSnapshot = await get(query(ref2(database, 'newUsers/searchId'), orderByKey(), startAt(searchKeyPrefix), endAt(`${searchKeyPrefix}\uf8ff`)));


      if (searchIdSnapshot.exists()) {
        const matchingKeys = searchIdSnapshot.val();

        console.log('matchingKeys11111111111111 :>> ', matchingKeys);

        for (const [, userIdOrArray] of Object.entries(matchingKeys)) {
          if (Array.isArray(userIdOrArray)) {
            console.log('userIdOrArray2222222222 :>> ', userIdOrArray);
            for (const userId of userIdOrArray) {
              console.log('userId33333333333333 :>> ', userId);
              if (!uniqueUserIds.has(userId)) {
                uniqueUserIds.add(userId);
                await addUserToResults(userId, users);
              }
            }
          } else {
            if (!uniqueUserIds.has(userIdOrArray)) {
              uniqueUserIds.add(userIdOrArray);
              console.log('uniqueUserIds.add(userIdOrArray) :>> ');
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
console.log('searchValue :>> ', searchValue);
  for (const prefix of keysToCheck) {
    const queryByPrefix = query(
      ref2(database, 'newUsers'),
      orderByChild(prefix),
      startAt(searchValue.toLowerCase()),
      endAt(`${searchValue.toLowerCase()}\uf8ff`)
    );

    const snapshotByPrefix = await get(queryByPrefix);
    if (snapshotByPrefix.exists()) {
      snapshotByPrefix.forEach(userSnapshot => {
        const userId = userSnapshot.key;
        const userData = userSnapshot.val();
        if (
          userData[prefix] &&
          typeof userData[prefix] === 'string' &&
          userData[prefix].toLowerCase().includes(searchValue.toLowerCase()) &&
          !uniqueUserIds.has(userId)
        ) {
          uniqueUserIds.add(userId);
          users[userId] = {
            userId,
            ...userData,
          };
          // users.push({ userId, ...userData });
        }
      });
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

export const deleteObjectFromFSDB = async objectPath => {
  try {
    const firestore = getFirestore();
    // Створюємо посилання на документ, який потрібно видалити
    const documentRef = doc(firestore, objectPath);
    // Викликаємо метод deleteDoc для видалення документа з Firestore
    await deleteDoc(documentRef);
    console.log('Документ успішно видалено з Firestore');
  } catch (error) {
    console.error('Сталася помилка під час видалення документа:', error);
    throw error; // Прокидуємо помилку для обробки на рівні викликаючого коду
  }
};

export const deleteObjectFromRTDB = async objectPath => {
  try {
    const db = getDatabase();
    // Створюємо посилання на об'єкт, який потрібно видалити
    const objectRef = ref2(db, objectPath);
    // Викликаємо метод remove для видалення об'єкта з бази даних
    await remove(objectRef);
    console.log("Об'єкт успішно видалено з бази даних");
  } catch (error) {
    console.error("Сталася помилка під час видалення об'єкта:", error);
    throw error; // Прокидуємо помилку для обробки на рівні викликаючого коду
  }
};

export const deleteObjectFromStorage = async folderPath => {
  try {
    const storage = getStorage();
    const listRef = ref(storage, folderPath);
    const { items } = await listAll(listRef);
    const deletePromises = items.map(itemRef => deleteObject(itemRef));
    await Promise.all(deletePromises);
    console.log('Папку успішно видалено з Firebase Storage');
  } catch (error) {
    console.error('Сталася помилка під час видалення папки з Firebase Storage:', error);
    throw error;
  }
};

export const deleteUserFromAuth = async userId => {
  try {
    const auth = getAuth();
    await deleteUser(auth, userId); // Передаємо userId для видалення користувача за його ID
    console.log('Користувача успішно видалено з Authentication Firebase');
  } catch (error) {
    console.error('Сталася помилка під час видалення користувача з Authentication Firebase:', error);
    throw error;
  }
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
        .filter(([key, value]) => value !== undefined)
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
        console.log(`${key} uploadedInfo[key] :>> `, uploadedInfo[key]);

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

        console.log(`${key} currentValues :>> `, currentValues);
        console.log(`${key} newValues :>> `, newValues);

        // Видаляємо значення, яких більше немає у новому масиві
        for (const value of currentValues) {
          let cleanedValue = value;

          // Якщо ключ — це 'phone', прибираємо пробіли у значенні
          if (key === 'phone') {
            cleanedValue = value.replace(/\s+/g, '');
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
            cleanedValue = value.replace(/\s+/g, '');
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
    if (condition === 'update') {
      await update(userRefRTDB, { ...uploadedInfo });
    } else {
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

export const createSearchIdsInCollection = async collection => {
  
  const ref = ref2(database, collection);

  const [newUsersSnapshot] = await Promise.all([get(ref)]);

  if (newUsersSnapshot.exists()) {
    const usersData = newUsersSnapshot.val();
    const userIds = Object.keys(usersData);
    // const userIds = ['AA0041'];

    const updatePromises = [];

    for (const userId of userIds) {
      const user = usersData[userId];
      for (const key of keysToCheck) {
        if (user.hasOwnProperty(key)) {
          let value = user[key];

          // Якщо value - масив
          if (Array.isArray(value)) {
            value.forEach(item => {
              if (item && typeof item === 'string') {
                let cleanedValue = item.toString().trim(); // Видаляємо зайві пробіли

                if (key === 'phone' || key === 'name'|| key === 'surname') {
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
            if (key === 'phone' || key === 'name'|| key === 'surname') {
              cleanedValue = value.replace(/\s+/g, '');
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

// Фільтр за групою крові
const filterByNegativeBloodType = value => {
  if (!value.blood) return true; // Пропускаємо, якщо дані про кров відсутні
  const negativeBloodTypes = ['1-', '2-', '3-', '4-', '-']; // Негативні групи крові
  return !negativeBloodTypes.includes(value.blood);
};

// Фільтр за віком і статусом шлюбу (комбінований)
const filterByAgeAndMaritalStatus = (value, ageLimit = 30, requiredStatuses = ['Yes', '+']) => {
  if (!value.birth || !value.maritalStatus) return true; // Пропускаємо, якщо дані відсутні
  const birthDate = value.birth.split('.');
  const birthYear = parseInt(birthDate[2], 10);
  const currentYear = new Date().getFullYear();
  const age = currentYear - birthYear;

  // Перевіряємо, чи maritalStatus входить у список потрібних статусів
  return !(requiredStatuses.includes(value.maritalStatus) && age > ageLimit);
};

// Фільтр за csection
const filterByCSection = value => {
  if (!value.csection) return true; // Пропускаємо, якщо дані відсутні
  return value.csection !== '2' && value.csection !== '3';
};

// Основна функція фільтрації
const filterMain = usersData => {
  let excludedUsersCount = 0; // Лічильник відфільтрованих користувачів

  const filteredUsers = Object.entries(usersData).filter(([key, value]) => {
    // console.log('value :>> ', value[1]);
    const filters = {
      filterByKeyCount: Object.keys(value[1]).length >= 10, // Фільтр за кількістю ключів
      filterByAgeAndMaritalStatus: filterByAgeAndMaritalStatus(value[1], 30, ['Yes', '+']), // Віковий і шлюбний фільтр
      filterByUserRole: filterByUserRole(value[1]), // Фільтр за роллю користувача
      filterByNegativeBloodType: filterByNegativeBloodType(value[1]), // Фільтр за групою крові
      filterByCSection: filterByCSection(value[1]), // Фільтр за csection
    };

    const failedFilters = Object.entries(filters).filter(([filterName, result]) => !result);

    if (failedFilters.length > 0) {
      // console.log(`User excluded by filter: ${key}`);
      failedFilters.forEach(([filterName]) => {
        // console.log(`Failed filter: ${filterName}`);
      });
      excludedUsersCount++; // Збільшуємо лічильник відфільтрованих користувачів
    }

    return failedFilters.length === 0;
  });

  console.log(`Total excluded users: ${excludedUsersCount}`); // Виводимо загальну кількість відфільтрованих користувачів

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

  return filteredUsers.sort(([_, a], [__, b]) => {
    // console.log('a :>> ', a);
    // console.log('a.getInTouch :>> ', a.getInTouch);
    const aDate = a[1].getInTouch || '9999-12-31';
    const bDate = b[1].getInTouch || '9999-12-31';

    // Якщо сьогоднішня дата в a, але не в b
    if (aDate === today && bDate !== today) return -1;
    if (bDate === today && aDate !== today) return 1;

    // Перевіряємо коректність дати (має формат рррр-мм-дд)
    if (isValidDate(aDate) && isValidDate(bDate)) {
      return aDate.localeCompare(bDate); // Сортування в порядку зростання
    }

    // Ставимо некоректні дати в кінець списку
    if (!isValidDate(aDate)) return 1;
    if (!isValidDate(bDate)) return -1;

    return 0; // Якщо немає чіткої умови
  });
};

export const fetchPaginatedNewUsers = async lastKey => {
  const db = getDatabase();
  const usersRef = ref2(db, 'newUsers');
  const todayActual = new Date(); // Поточна дата
  const today = new Date(todayActual); // Копія дати
  today.setDate(todayActual.getDate() + 1); // Збільшуємо дату на 1 день
  const todayString = today.toISOString().split('T')[0]; // Формат YYYY-MM-DD
  // const todayString = today.toISOString().split('T')[0];

  try {
    // Функція для отримання користувачів до сьогоднішнього дня
    const getUsersBeforeToday = async () => {
      const allUsersQuery = query(
        usersRef,
        orderByChild('getInTouch'),
        endAt(todayString) // Отримуємо користувачів до сьогоднішнього дня
      );

      const allUsersSnapshot = await get(allUsersQuery);
      return allUsersSnapshot.exists() ? Object.entries(allUsersSnapshot.val()) : [];
    };

    // Функція для отримання користувачів з пустими або некоректними датами
    const getUsersWithInvalidDates = async () => {
      const invalidDatesQuery = query(
        usersRef,
        orderByChild('getInTouch'),
        equalTo(null) // Отримуємо користувачів з відсутніми або некоректними датами
      );

      const invalidDatesSnapshot = await get(invalidDatesQuery);
      return invalidDatesSnapshot.exists() ? Object.entries(invalidDatesSnapshot.val()) : [];
    };

    // Функція для отримання користувачів з майбутніми датами
    const getUsersAfterToday = async () => {
      const futureUsersQuery = query(
        usersRef,
        orderByChild('getInTouch'),
        startAt(todayString) // Отримуємо користувачів з датою від сьогодні
      );

      const futureUsersSnapshot = await get(futureUsersQuery);
      return futureUsersSnapshot.exists() ? Object.entries(futureUsersSnapshot.val()) : [];
    };

    let allUsers = [];

    // Спочатку намагаємось отримати користувачів до сьогоднішнього дня
    allUsers = await getUsersBeforeToday();
    // allUsers = await getUsersAfterToday();
    console.log('allUsers :>> ', allUsers);
    // 2. Якщо немає користувачів зі старими датами, отримуємо з некоректними датами
    if (allUsers.length === 0) {
      allUsers = await getUsersWithInvalidDates();
    }
    // Якщо користувачів до сьогоднішнього дня не знайшли, перевіряємо майбутні
    if (allUsers.length === 0) {
      allUsers = await getUsersAfterToday();
    }

    // Якщо ні тих, ні інших не знайшли, allUsers буде порожнім
    if (allUsers.length === 0) {
      console.log('Немає користувачів.');
      return []; // Повертаємо порожній список
    }

    // Фільтрація та сортування користувачів
    const sortedUsers2 = allUsers.filter(([key, value]) => {
      const getInTouch = value.getInTouch;

      console.log('getInTouch :>> ', getInTouch);

      // Якщо поле getInTouch відсутнє або дата неправильна, повертаємо true (для другої групи)
      if (!getInTouch || !isValidDate(getInTouch)) {
        return true;
      }

      if (getInTouch === '2099-99-99' || getInTouch === '9999-99-99') {
        return false;
      }
      // Переводимо дату в формат Date для порівняння
      let date;
      if (getInTouch.includes('-')) {
        // Формат YYYY-MM-DD
        date = new Date(getInTouch);
      } else if (getInTouch.includes('.')) {
        // Формат DD.MM.YYYY
        const [day, month, year] = getInTouch.split('.');
        date = new Date(year, month - 1, day);
      } else {
        // Якщо формат невідомий
        console.error('Невідомий формат дати:', getInTouch);
        return true;
      }

      // Порівнюємо дату і повертаємо true, якщо вона сьогоднішня або в минулому
      // return date <= new Date();

      // Порівнюємо без урахування дат
      return date;
    });

    console.log('sortedUsers2 :>> ', sortedUsers2);

    // 3. Об'єднуємо результати (вже відсортовані)
    const combinedUsers = sortedUsers2;

    // 5. Фільтруємо користувачів
    const filteredUsers = filterMain(combinedUsers);

    // 6. Сортуємо за логікою: сьогодні -> без дати -> майбутні
    const sortedUsers = sortUsers(filteredUsers);

    // 7. Перетворюємо масив [key, value] у формат об'єкта
    const paginatedUsers = sortedUsers.slice(0, 30).reduce((acc, [key, value]) => {
      const userId = value[0]; // Перший елемент масиву - userId
      const userData = value[1]; // Другий елемент - об'єкт даних користувача
      acc[userId] = userData;
      return acc;
    }, {});

    // Далі, після вибору 10 карток, отримуємо дані з колекції users для кожного userId
    const userIds = Object.keys(paginatedUsers); // Отримуємо список userId з paginatedUsers
    const usersData = {};

    const userPromises = userIds.map(userId => {
      return fetchUserById(userId); // Оскільки fetchUserById повертає проміс, ми можемо отримати результат
    });

    // Чекаємо, поки всі проміси виконуються
    const userResults = await Promise.all(userPromises);

    // Збираємо дані по кожному користувачеві в об'єкт
    userResults.forEach((userData, index) => {
      const userId = userIds[index];
      if (userData) {
        usersData[userId] = userData;
      }
    });

    // Об'єднуємо дані з newUsers та users для кожного userId
    const finalUsers = userIds.reduce((acc, userId) => {
      const newUserData = paginatedUsers[userId]; // Дані з newUsers
      const userDataFromUsers = usersData[userId] || {}; // Дані з users
      acc[userId] = { ...newUserData, ...userDataFromUsers }; // Об'єднуємо дані
      return acc;
    }, {});

    const nextKey = sortedUsers.length > 20 ? sortedUsers[20][0] : null;

    return {
      users: finalUsers, // Об'єкт із користувачами, що містить дані з newUsers і users
      lastKey: nextKey,
      hasMore: sortedUsers.length > 20,
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
