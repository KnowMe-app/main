import { initializeApp } from 'firebase/app';
import { getAuth, deleteUser } from 'firebase/auth';
import { collection, deleteDoc, doc, getDoc, getDocs, getFirestore, setDoc, updateDoc, deleteField } from 'firebase/firestore';
import { getDownloadURL, getStorage, uploadBytes, ref, deleteObject, listAll } from 'firebase/storage';
import { getDatabase, ref as ref2, get, remove, set, update, push, orderByChild,} from 'firebase/database';
import { query, orderByKey, limitToFirst,} from 'firebase/database';
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
  const db = getDatabase();
  const usersRef = ref2(db, 'users');
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

// export const fetchNewUsersCollectionInRTDBIn2Folders = async (searchedValue) => {
//   const db = getDatabase();
//   const usersRef = ref2(db, 'newUsers');
//   const searchIdRef = ref2(db, 'newUsers/searchId');  // Референс для пошуку в searchId

//   // Логування значення, яке шукаємо
//   console.log('searchedValue :>> ', searchedValue);

//   const [searchKey, searchValue] = Object.entries(searchedValue)[0];

//   const searchIdKey = `${searchKey}_${searchValue.toLowerCase()}`; // Формуємо ключ для пошуку у searchId

//   try {
//     // 1. Шукаємо в searchId, чи є вже відповідний userId
//     const searchIdSnapshot = await get(ref2(db, `newUsers/searchId/${searchIdKey}`));

//     if (searchIdSnapshot.exists()) {
//       const userId = searchIdSnapshot.val();  // Отримуємо userId

//       // 2. Якщо userId знайдений, шукаємо його картку в newUsers
//       const userRef = ref2(db, `newUsers/${userId}`);
//       const userSnapshot = await get(userRef);

//       if (userSnapshot.exists()) {
//         console.log('Знайдений користувач: ', userSnapshot.val());
//         return {
//           userId,
//           ...userSnapshot.val(),
//         };
//       } else {
//         console.log('Не вдалося знайти картку користувача за userId.');
//         return null;
//       }
//     } else {
//       // 3. Якщо userId не знайдено, створюємо нового користувача
//       const newUserRef = push(usersRef);  // Генеруємо унікальний ключ
//       const newUser = {
//         [searchKey]: searchValue, // Додаємо значення пошукового ключа
//         createdAt: Date.now(),    // Додаємо час створення або інші поля, якщо потрібно
//       };

//       // Записуємо нового користувача в базу даних
//       await set(newUserRef, newUser);

//       const newUserId = newUserRef.key;

//       // 4. Додаємо пару ключ-значення у searchId
//       await update(searchIdRef, { [searchIdKey]: newUserId });

//       console.log('Створений новий користувач і доданий у searchId: ', newUser);

//       return {
//         userId: newUserId,
//         ...newUser,
//       };
//     }
//   } catch (error) {
//     console.error('Error fetching data:', error);
//     return [];
//   }
// };

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

export const makeNewUser = async (searchedValue)=>{
  const db = getDatabase();
  const newUsersRef = ref2(db, 'newUsers');
  const searchIdRef = ref2(db, 'newUsers/searchId');

  const { searchKey, searchValue, searchIdKey, } = makeSearchKeyValue(searchedValue)

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
}

const makeSearchKeyValue = (searchedValue) =>{
  const [searchKey, searchValue] = Object.entries(searchedValue)[0];
  let modifiedSearchValue = searchValue;
    modifiedSearchValue = encodeEmail(searchValue);
    const searchIdKey = `${searchKey}_${modifiedSearchValue.toLowerCase()}`; // Формуємо ключ для пошуку у searchId
    console.log('searchedValue :>> ', searchedValue);
    console.log('searchKey :>> ', searchKey);
    console.log('searchIdKey :>> ', searchIdKey);
    return {searchKey, searchValue, modifiedSearchValue, searchIdKey}
}

const searchUserByPartialUserId = async (db, userId) => {
  console.log('userId:', userId);
  try {
    const usersRef = ref2(db, 'users');
    const partialUserIdQuery = query(usersRef, orderByKey(), startAt(userId), endAt(userId + "\uf8ff"));
    const usersSnapshot = await get(partialUserIdQuery);

    if (usersSnapshot.exists()) {
      let foundUsers = [];
      usersSnapshot.forEach((snapshot) => {
        const currentUserId = snapshot.key;
        const userData = snapshot.val();

        if (currentUserId.includes(userId)) {
          foundUsers.push({ userId: currentUserId, ...userData });
        }
      });

      if (foundUsers.length === 1) {
        console.log('Знайдено єдиного користувача з частковим збігом userId:', foundUsers[0]);
        return foundUsers[0]; // Повертаємо об'єкт, якщо знайдено лише одного користувача
      } else if (foundUsers.length > 1) {
        console.log('Знайдено кількох користувачів з частковим збігом userId:', foundUsers);
        return foundUsers; // Повертаємо масив, якщо знайдено кілька користувачів
      }
    }

    console.log('Користувача з частковим userId не знайдено.');
    return null;
  } catch (error) {
    console.error('Error fetching data by partial userId:', error);
    return null;
  }
};

export const fetchNewUsersCollectionInRTDB = async (searchedValue) => {
  const db = getDatabase();
  const { searchValue, modifiedSearchValue } = makeSearchKeyValue(searchedValue)
  // Список ключів для обробки
  const prefixes = ['instagram', 'facebook', 'email', 'phone', 'telegram', 'tiktok', 'vk'];

  try {

    let users = []; // Масив для збереження знайдених користувачів

  for (const prefix of prefixes) {

    // Множинний пошук: основний і з додатковим префіксом для телефонних номерів
  const searchKeys = [
    `${prefix}_${modifiedSearchValue.toLowerCase()}`,
    ...(modifiedSearchValue.startsWith('0') 
      ? [`${prefix}_38${modifiedSearchValue.toLowerCase()}`] 
      : [])
  ];

  for (const searchKeyPrefix of searchKeys) {
    const searchIdSnapshot = await get(
      query(
        ref2(db, 'newUsers/searchId'),
        orderByKey(),
        startAt(searchKeyPrefix),
        endAt(`${searchKeyPrefix}\uf8ff`)
      )
    );

    if (searchIdSnapshot.exists()) {
      const matchingKeys = searchIdSnapshot.val();

      for (const [searchIdKey, userId] of Object.entries(matchingKeys)) {
        console.log(`Знайдено користувача з ключем ${searchIdKey}: `, userId);

        const userSnapshotInNewUsers = await get(ref2(db, `newUsers/${userId}`));
        if (userSnapshotInNewUsers.exists()) {
          const userFromNewUsers = userSnapshotInNewUsers.val();

          const userSnapshotInUsers = await get(ref2(db, `users/${userId}`));
          const userFromUsers = userSnapshotInUsers.exists() ? userSnapshotInUsers.val() : {};

          // Перевірка на унікальність userId
          if (!users.some(user => user.userId === userId)) {
            users.push({
              userId,
              ...userFromNewUsers,
              ...userFromUsers,
            });
          } else {
            console.log(`Користувач із userId ${userId} вже існує, пропускаємо.`);
          }
        }
      }
    }
  }

  
  }

  if (users.length === 1) {
    console.log('Знайдено одного користувача: ', users[0]);
    return users[0]; // Повертаємо одного користувача
  } else if (users.length > 1) {
    console.log('Знайдено кілька користувачів: ', users);
    return users; // Повертаємо масив користувачів
  } 
  
  // else {
  //   console.log('Користувачів не знайдено.');
  //   return null; // Повертаємо null, якщо користувачів не знайдено
  // }


    // if (searchKey ==='userId') {
      // console.log('userIduserIduserIduserIduserId userId:', searchValue);
     // Перевірка у users, якщо користувача не знайдено у newUsers по скороченому userId
     const userFromUsers = await searchUserByPartialUserId(db, searchValue);
     if (userFromUsers) {
       return userFromUsers;
     }
    // }

    console.log('Користувача не знайдено в жодній колекції.2.');
    
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
  console.log(`uploadedInfo`, uploadedInfo);
  try {
    const userRef = doc(db, `users/${userId}`);
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
    console.error('Сталася помилка під час збереження даних в Firestore Database:', error);
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
    console.error('Сталася помилка під час збереження даних в Realtime Database:', error);
    throw error;
  }
};

export const updateDataInNewUsersRTDB = async (userId, uploadedInfo, condition) => {
  try {
    const userRefRTDB = ref2(database, `newUsers/${userId}`);
    const snapshot = await get(userRefRTDB);
    const currentUserData = snapshot.exists() ? snapshot.val() : {};

    // Список ключів для обробки
    const keysToCheck = ['instagram', 'facebook', 'email', 'phone', 'telegram', 'tiktok', 'vk'];

    // Перебір ключів та їх обробка
    for (const key of keysToCheck) {
      if (uploadedInfo[key]) {
        console.log(`${key} uploadedInfo[key] :>> `, uploadedInfo[key]);
        // Отримуємо старі значення з сервера (масив або строку)
        const currentValues = Array.isArray(currentUserData?.[key])
          ? currentUserData[key]
          : typeof currentUserData?.[key] === 'object'
          ? Object.values(currentUserData[key])
          : typeof currentUserData?.[key] === 'string'
          ? [currentUserData[key]]
          : [];

        // Нові значення з uploadedInfo (масив або строку)
        let newValues = Array.isArray(uploadedInfo[key])
          ? uploadedInfo[key]
          : typeof uploadedInfo[key] === 'object'
          ? Object.values(uploadedInfo[key])
          : typeof uploadedInfo[key] === 'string'
          ? [uploadedInfo[key]]
          : [];

          // Якщо ключ — це 'phone', прибираємо пробіли у нових значеннях
          // if (key === 'phone') {
          //   newValues = newValues.map((value) => 
          //     typeof value === 'string' ? value.replace(/\s+/g, '') : value
          //   );
          // }

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
    console.error('Сталася помилка під час збереження даних в Realtime Database:', error);
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

const encodeEmail = email => {
  return email
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
  const db = getDatabase();
  const searchIdRef = ref2(db, 'newUsers/searchId');

  let modifiedSearchValue = searchValue;

  // Якщо searchKey є email, замінюємо @ на [at] у searchValue
  // if (searchKey.toLowerCase() === 'email') {
    modifiedSearchValue = encodeEmail(searchValue);
  // }

  const searchIdKey = `${searchKey}_${modifiedSearchValue}`;
  // const searchIdKey = `${searchKey}_${searchValue}`;

  console.log('searchIdKey in updateSearchId :>> ', searchIdKey);
  console.log(`Додано нову пару в searchId!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!`);
  if (action === 'add') {
    // Додаємо нову пару
    await update(searchIdRef, { [searchIdKey]: userId });
    console.log(`Додано нову пару в searchId: ${searchIdKey}: ${userId}`);
  } else if (action === 'remove') {
    // Видаляємо існуючу пару
    const searchIdSnapshot = await get(ref2(db, `newUsers/searchId/${searchIdKey}`));

    if (searchIdSnapshot.exists() && searchIdSnapshot.val() === userId) {
      await remove(ref2(db, `newUsers/searchId/${searchIdKey}`));
      console.log(`Видалено пару в searchId: ${searchIdKey}`);
    }
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

  // Видалення картки в newUsers
  // const userRef = ref2(db, `newUsers/${userId}`);
  // await remove(userRef);
  // console.log(`Видалено картку користувача з newUsers: ${userId}`);
};

// export const fetchPaginatedNewUsers = async (lastKey) => {
//   const db = getDatabase();
//   const newUsersRef  = ref2(db, 'newUsers');
//   // const usersRef = ref2(db, 'users');

//   try {
//     // Формуємо запит для отримання даних з 'newUsers', виключаючи 'searchId'
//     let newUsersQuery = query(newUsersRef, orderByKey(), limitToFirst(10 + 1));

//     // Якщо є останній ключ (lastKey), беремо наступну сторінку даних
//     if (lastKey) {
//       newUsersQuery = query(newUsersRef, orderByKey(), startAfter(lastKey), limitToFirst(10 + 1));
//     }

//     // Паралельне виконання обох запитів
//     const [newUsersSnapshot,
//       // usersSnapshot
//     ] = await Promise.all([
//       get(newUsersQuery),
//       // get(usersRef)
//     ]);

//     // Перевірка наявності даних у 'newUsers'
//     let newUsersData = {};
//     let lastUserKey = null;
//     let hasMoreNewUsers = false;

//     if (newUsersSnapshot.exists()) {
//       const usersData = newUsersSnapshot.val();

//       // Виключаємо 'searchId' з результатів
//       const filteredData = Object.entries(usersData)
//         .filter(([key]) => key !== 'searchId')
//         .slice(0, 10); // Обмежуємо до 10 записів

//       // Визначаємо останній ключ для пагінації
//       lastUserKey = filteredData.length > 0 ? filteredData[filteredData.length - 1][0] : null;

//       // Визначаємо, чи є ще сторінки
//       hasMoreNewUsers = newUsersSnapshot.size > 10;

//       // Перетворюємо дані в об'єкт
//       newUsersData = Object.fromEntries(filteredData);
//     }

//     // Перевірка наявності даних у 'users'
//     // let usersData = {};
//     // if (usersSnapshot.exists()) {
//     //   usersData = usersSnapshot.val();
//     // }

//     console.log('yyyyyyy :>> ', newUsersData);
//     // Повертаємо об'єднані результати
//     return {
//       // newUsers: newUsersData,
//       // users: usersData,
//       users: newUsersData,
//       lastKey: lastUserKey,  // Ключ для наступної сторінки
//       hasMore: hasMoreNewUsers // Показує, чи є наступна сторінка в 'newUsers'
//     };
//   } catch (error) {
//     console.error('Error fetching paginated data:', error);
//     return {
//       // newUsers: {},
//       users: {},
//       lastKey: null,
//       hasMore: false
//     };
//   }
// };

// Додаткова фільтрація користувачів
// const filterMarriedAndAbove30 = (usersData) => {


//   return Object.entries(usersData).filter(([key, value]) => {
//     console.log('value', value);
//     console.log('key', key);
    
//     if (!value.birth || !value.maritalStatus) return true; // Пропускаємо, якщо дані відсутні
//     console.log('value', value);
//     console.log('key', key);
//     const birthDate = value.birth.split('.'); // Розділяємо дату на день, місяць, рік
//     const birthYear = parseInt(birthDate[2], 10);
//     const currentYear = new Date().getFullYear();
//     const age = currentYear - birthYear;

//     const failsFilter = value.maritalStatus === "Yes" && age > 30;
//     if (failsFilter) {
//       console.log(`User excluded by filter: ${key}`);
//     }

//     return !failsFilter; // Відфільтровуємо одружених старше 30 років
//   });
// };

// Окрема функція для фільтрації за віком
// const filterByAge = (value, ageLimit = 30) => {
//   if (!value.birth) return true; // Пропускаємо, якщо дата народження відсутня
//   const birthDate = value.birth.split('.'); // Розділяємо дату на день, місяць, рік
//   const birthYear = parseInt(birthDate[2], 10);
//   const currentYear = new Date().getFullYear();
//   const age = currentYear - birthYear;
//   return age <= ageLimit;
// };

// Окрема функція для фільтрації за статусом шлюбу
// const filterByMaritalStatus = (value, requiredStatus = "Yes") => {
//   if (!value.maritalStatus) return true; // Пропускаємо, якщо статус шлюбу відсутній
//   return value.maritalStatus !== requiredStatus;
// };

// Фільтр за роллю користувача
const filterByUserRole = (value) => {
  const excludedRoles = ['ag', 'ip']; // Ролі, які потрібно виключити
  return !excludedRoles.includes(value.userRole);
};

// Фільтр за групою крові
const filterByNegativeBloodType = (value) => {
  if (!value.blood) return true; // Пропускаємо, якщо дані про кров відсутні
  const negativeBloodTypes = ['1-', '2-', '3-', '4-', '-']; // Негативні групи крові
  return !negativeBloodTypes.includes(value.blood);
};

// Фільтр за віком і статусом шлюбу (комбінований)
const filterByAgeAndMaritalStatus = (value, ageLimit = 30, requiredStatus = "Yes") => {
  if (!value.birth || !value.maritalStatus) return true; // Пропускаємо, якщо дані відсутні
  const birthDate = value.birth.split('.');
  const birthYear = parseInt(birthDate[2], 10);
  const currentYear = new Date().getFullYear();
  const age = currentYear - birthYear;

  return !(value.maritalStatus === requiredStatus && age > ageLimit); // Відфільтровуємо, якщо одружений і старший 30 років
};

// Фільтр за csection
const filterByCSection = (value) => {
  if (!value.csection) return true; // Пропускаємо, якщо дані відсутні
  return value.csection !== '2' && value.csection !== '3';
};

// Основна функція фільтрації
const filterMain = (usersData) => {
  let excludedUsersCount = 0; // Лічильник відфільтрованих користувачів

  const filteredUsers = Object.entries(usersData).filter(([key, value]) => {
    const filters = {
      filterByAgeAndMaritalStatus: filterByAgeAndMaritalStatus(value, 30, "Yes"), // Віковий і шлюбний фільтр
      filterByUserRole: filterByUserRole(value),                                 // Фільтр за роллю користувача
      filterByNegativeBloodType: filterByNegativeBloodType(value),               // Фільтр за групою крові
      filterByCSection: filterByCSection(value),                                 // Фільтр за csection
    };

    const failedFilters = Object.entries(filters).filter(([filterName, result]) => !result);

    if (failedFilters.length > 0) {
      console.log(`User excluded by filter: ${key}`);
      failedFilters.forEach(([filterName]) => {
        console.log(`Failed filter: ${filterName}`);
      });
      excludedUsersCount++; // Збільшуємо лічильник відфільтрованих користувачів
    }

    return failedFilters.length === 0;
  });

  console.log(`Total excluded users: ${excludedUsersCount}`); // Виводимо загальну кількість відфільтрованих користувачів

  return filteredUsers;
};

// Сортування
const sortUsers = (filteredUsers) => {
  const today = new Date().toLocaleDateString('uk-UA'); // "дд.мм.рррр"

  return filteredUsers.sort(([_, a], [__, b]) => {
    const aDate = a.getInTouch || "99.99.9999";
    const bDate = b.getInTouch || "99.99.9999";

    if (aDate === today && bDate !== today) return -1;
    if (bDate === today && aDate !== today) return 1;

    if (aDate === "99.99.9999" && bDate !== "99.99.9999") return -1;
    if (bDate === "99.99.9999" && aDate !== "99.99.9999") return 1;

    return new Date(aDate.split('.').reverse().join('-')) - new Date(bDate.split('.').reverse().join('-'));
  });
};

export const fetchPaginatedNewUsers = async (lastKey) => {
  const db = getDatabase();
  const usersRef = ref2(db, 'newUsers');
  const today = new Date().toLocaleDateString('uk-UA'); // "дд.мм.рррр"

  try {
    // 1. Отримуємо картки з getInTouch = сьогодні
    // const todayQuery = query(usersRef, orderByChild('getInTouch'), endAt(today));
    const todayQuery = query(usersRef, orderByChild('getInTouch'), endAt(today));
    const todaySnapshot = await get(todayQuery);
    const todayUsers = todaySnapshot.exists() ? Object.entries(todaySnapshot.val()) : [];

    // 2. Отримуємо картки без getInTouch
    const withoutGetInTouchQuery = query(usersRef, orderByChild('getInTouch'), startAt(null), limitToFirst(50));
    const withoutGetInTouchSnapshot = await get(withoutGetInTouchQuery);
    const withoutGetInTouchUsers = withoutGetInTouchSnapshot.exists()
      ? Object.entries(withoutGetInTouchSnapshot.val()).filter(([_, value]) => !value.getInTouch)
      : [];

    // 3. Отримуємо картки з майбутніми getInTouch
    const futureQuery = query(usersRef, orderByChild('getInTouch'), startAt(today), limitToFirst(50));
    const futureSnapshot = await get(futureQuery);
    const futureUsers = futureSnapshot.exists()
      ? Object.entries(futureSnapshot.val()).filter(([_, value]) => value.getInTouch > today)
      : [];

    // 4. Об'єднуємо всі результати у форматі [key, value]
    const combinedUsers = [
      ...todayUsers,
      ...withoutGetInTouchUsers,
      ...futureUsers,
    ];

    // 5. Фільтруємо користувачів
    const filteredUsers = filterMain(combinedUsers);

    // 6. Сортуємо за логікою: сьогодні -> без дати -> майбутні
    const sortedUsers = sortUsers(filteredUsers);

    // 7. Перетворюємо масив [key, value] у формат об'єкта
    const paginatedUsers = sortedUsers.slice(0, 10).reduce((acc, [key, value]) => {
      const userId = value[0]; // Перший елемент масиву - userId
      const userData = value[1]; // Другий елемент - об'єкт даних користувача
      acc[userId] = userData;
      return acc;
    }, {});

    const nextKey = sortedUsers.length > 10 ? sortedUsers[10][0] : null;

    console.log('paginatedUsers :>> ', paginatedUsers);

    return {
      users: paginatedUsers, // Об'єкт із ключами userId
      lastKey: nextKey,
      hasMore: sortedUsers.length > 10,
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

// Функція для пошуку користувача за userId у двох колекціях
// __вДвохКолекціях не працює лоад море
// export const fetchPaginatedNewUsers = async lastKey => {
//   const db = getDatabase();
//   const newUsersRef = ref2(db, 'newUsers');
//   const usersRef = ref2(db, 'users');

//   try {
//     // Запит для отримання даних з 'newUsers'
//     let newUsersQuery = query(newUsersRef, orderByKey(), limitToFirst(10 + 1));

//     // Якщо є останній ключ (lastKey), беремо наступну сторінку даних
//     if (lastKey) {
//       newUsersQuery = query(newUsersRef, orderByKey(), startAfter(lastKey), limitToFirst(10 + 1));
//     }

//     // Паралельне виконання обох запитів
//     const [newUsersSnapshot, usersSnapshot] = await Promise.all([get(newUsersQuery), get(usersRef)]);

//     // Перевірка наявності даних у 'newUsers'
//     let newUsersData = {};
//     let lastUserKey = null;
//     let hasMoreNewUsers = false;

//     if (newUsersSnapshot.exists()) {
//       const usersData = newUsersSnapshot.val();

//       // Виключаємо 'searchId' з результатів
//       //const filteredData = Object.entries(usersData).filter(([key]) => key !== 'searchId ');
//       const filteredData = filterMain(
//         Object.fromEntries(Object.entries(usersData)
//         .filter(([key]) => key !== 'searchId '))
//       );

    

//       // Визначаємо останній ключ для пагінації
//       lastUserKey = filteredData.length > 0 ? filteredData[filteredData.length - 1][0] : null;

//       // Визначаємо, чи є ще сторінки
//       hasMoreNewUsers = filteredData.length > 10;

//       // Обмежуємо результати до 10 карток
//       newUsersData = Object.fromEntries(filteredData.slice(0, 10));
//     }

//     // Перевірка наявності даних у 'users'
//     let usersData = {};
//     const targetUserId = 'vtDxkDMjCwYuTDqTUnZsO29bpQr1';
//     // const targetUserId = 'S0VhDLCYjuTFDNLalRa85u7fPcg2';
//     if (usersSnapshot.exists()) {
//       const usersArray = Object.entries(usersSnapshot.val());

//       // Виділяємо цільового користувача
//   const targetUser = usersArray.find(([key]) => key === targetUserId);
//   const otherUsers = usersArray.filter(([key]) => key !== targetUserId);




//   //      // Розділяємо користувачів на дві частини
//   // const withoutLastAction = usersArray.filter(([key, value]) => !value.lastAction);
//   // const withLastAction = usersArray.filter(([key, value]) => value.lastAction);

//     // Розділяємо інші користувачі на дві частини
//     const withoutLastAction = otherUsers.filter(([key, value]) => !value.lastAction);
//     const withLastAction = otherUsers.filter(([key, value]) => value.lastAction);
  

//   // // Об'єднуємо масиви, з користувачами з lastAction в кінці
//   // usersData = [...withoutLastAction, ...withLastAction].slice(0, 10); // Лімітуємо результати до 10
//   //   }

//     // Додаємо цільового користувача першим і комбінуємо масиви
//     const combinedUsers = [
//       ...(targetUser ? [targetUser] : []),
//       ...withoutLastAction,
//       ...withLastAction,
//     ].slice(0, 10);

//     usersData = Object.fromEntries(filterMain(Object.fromEntries(combinedUsers)));
//   }

//   const combinedData = [
//     ...Object.entries(usersData),
//     ...Object.entries(newUsersData).slice(0, 10 - Object.keys(usersData).length)
//   ];

//   const paginatedData = Object.fromEntries(combinedData.slice(0, 10));

//   return {
//     users: paginatedData,
//     lastKey: lastUserKey,
//     hasMore: hasMoreNewUsers,
//   };
//   } catch (error) {
//     console.error('Error fetching paginated data:', error);
//     return {
//       users: {},
//       lastKey: null,
//       hasMore: false,
//     };
//   }
// };

///////////////////////////ПРАЦЮЄ для тестування, мій перший
// export const fetchPaginatedNewUsers = async (lastKey) => {
//   const db = getDatabase();
//   const newUsersRef = ref2(db, 'newUsers');
//   const usersRef = ref2(db, 'users');
//   const targetUserId = 'vtDxkDMjCwYuTDqTUnZsO29bpQr1';

//   try {
//     // Отримуємо всі дані з newUsers
//     const [newUsersSnapshot, usersSnapshot] = await Promise.all([
//       get(newUsersRef), // Отримуємо ВСІ дані з newUsers
//       get(usersRef),    // Отримуємо ВСІ дані з users
//     ]);

//     if (!newUsersSnapshot.exists() && !usersSnapshot.exists()) {
//       return {
//         users: {},
//         lastKey: null,
//         hasMore: false,
//       };
//     }

//     const newUsersData = newUsersSnapshot.exists() ? newUsersSnapshot.val() : {};
//     const usersData = usersSnapshot.exists() ? usersSnapshot.val() : {};

//     // Об'єднуємо всі дані
//     const mergedData = mergeUsersData(newUsersData, usersData, targetUserId);

//     // Визначаємо останній ключ для пагінації
//     const lastUserKey = mergedData.length > 0 ? mergedData[mergedData.length - 1][0] : null;

//     // Обмежуємо результати до 10 записів
//     const paginatedData = Object.fromEntries(mergedData.slice(0, 10));

//     console.log('paginatedData', paginatedData);

//     return {
//       users: paginatedData,
//       lastKey: lastUserKey,
//       hasMore: mergedData.length > 10,
//     };
//   } catch (error) {
//     console.error('Error fetching paginated data:', error);
//     return {
//       users: {},
//       lastKey: null,
//       hasMore: false,
//     };
//   }
// };

///////////////////////////ПРАЦЮЄ лише з newUsers
// export const fetchPaginatedNewUsers = async (lastKey) => {
//   const db = getDatabase();
//   const newUsersRef = ref2(db, 'newUsers');
//   const targetUserId = 'vtDxkDMjCwYuTDqTUnZsO29bpQr1';

//   try {
//     // Формуємо запит до newUsers
//     let newUsersQuery = query(newUsersRef, orderByKey(), limitToFirst(10 + 1));

//     if (lastKey) {
//       newUsersQuery = query(newUsersRef, orderByKey(), startAfter(lastKey), limitToFirst(10 + 1));
//     }

//     // Отримуємо дані з newUsers
//     const newUsersSnapshot = await get(newUsersQuery);

//     if (!newUsersSnapshot.exists()) {
//       return {
//         users: {},
//         lastKey: null,
//         hasMore: false,
//       };
//     }

//     const newUsersData = newUsersSnapshot.val();
    
//     // Перетворюємо дані в масив [userId, userData]
//     let sortedUsers = Object.entries(newUsersData);

//     // Виділяємо targetUser і ставимо його першим
//     sortedUsers = sortedUsers.filter(([key]) => key !== targetUserId); // Видаляємо targetUser з масиву
//     const targetUser = Object.entries(newUsersData).find(([key]) => key === targetUserId); 

//     if (targetUser) {
//       sortedUsers.unshift(targetUser); // Додаємо targetUser на початок
//     }

//     // Визначаємо останній ключ для пагінації
//     const lastUserKey = sortedUsers.length > 0 ? sortedUsers[sortedUsers.length - 1][0] : null;

//     // Перевіряємо, чи є ще дані
//     const hasMoreNewUsers = Object.keys(newUsersData).length > 10;

//     // Обмежуємо результати до 10 записів
//     const paginatedData = Object.fromEntries(sortedUsers.slice(0, 10));

//     console.log('paginatedData', paginatedData);

//     return {
//       users: paginatedData,
//       lastKey: lastUserKey,
//       hasMore: hasMoreNewUsers,
//     };
//   } catch (error) {
//     console.error('Error fetching paginated data:', error);
//     return {
//       users: {},
//       lastKey: null,
//       hasMore: false,
//     };
//   }
// };


// const fetchTargetUserData = async (targetUserId) => {
//   const db = getDatabase();
//   const newUsersRef = ref2(db, `newUsers/${targetUserId}`);
//   const usersRef = ref2(db, `users/${targetUserId}`);

//   try {
//     // Отримуємо дані з двох колекцій
//     const [newUserSnapshot, userSnapshot] = await Promise.all([
//       get(newUsersRef),
//       get(usersRef),
//     ]);

//     // Перевіряємо, чи існують дані
//     const newUserData = newUserSnapshot.exists() ? newUserSnapshot.val() : null;
//     const userData = userSnapshot.exists() ? userSnapshot.val() : null;

//     console.log('Дані користувача з newUsers:', newUserData);
//     console.log('Дані користувача з users:', userData);

//     return {
//       newUserData,
//       userData,
//     };
//   } catch (error) {
//     console.error('Помилка при отриманні даних користувача:', error);
//     return null;
//   }
// };

// Функція для об'єднання користувачів за userId

// const mergeUsersData = (newUsersData, usersData, targetUserId) => {
//   const mergedUsers = {};

//   // Об'єднуємо дані з newUsers і users, враховуючи всі поля
//   Object.keys({ ...newUsersData, ...usersData }).forEach((key) => {
//     const newUserFields = newUsersData[key] || {};
//     const userFields = usersData[key] || {};

//     // Об'єднуємо дані, де пріоритет має newUsers
//     mergedUsers[key] = { ...userFields, ...newUserFields };
//   });

//   // Сортуємо: targetUserId завжди на першому місці
//   const sortedUsers = Object.entries(mergedUsers);
//   const targetUser = sortedUsers.find(([key]) => key === targetUserId);
//   const otherUsers = sortedUsers.filter(([key]) => key !== targetUserId);

//   return targetUser ? [targetUser, ...otherUsers] : otherUsers;
// };

export const fetchListOfUsers = async () => {
  const db = getDatabase();
  const usersRef = ref2(db, 'users');

  try {
    // Паралельне виконання обох запитів
    const [usersSnapshot] = await Promise.all([ get(usersRef)]);

    // Перевірка наявності даних у 'users'
    let userIds = [];
    if (usersSnapshot.exists()) {
      const usersData = usersSnapshot.val();
      userIds = Object.keys(usersData)
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

  console.log('userId в fetchUserById: ',userId);

  // Референси для пошуку в newUsers і users
  const userRefInNewUsers = ref2(db, `newUsers/${userId}`);
  const userRefInUsers = ref2(db, `users/${userId}`);

  try {
    // Пошук у newUsers
    const newUserSnapshot = await get(userRefInNewUsers);
    if (newUserSnapshot.exists()) {
      // console.log('Знайдено користувача у newUsers: ', newUserSnapshot.val());
      // return newUserSnapshot.val();
      console.log('Знайдено користувача у newUsers: ', newUserSnapshot.val());
      // Додатковий пошук в колекції users
      console.log('userId222222222 :>> ', userId);
      const userSnapshotInUsers = await get(ref2(db, `users/${userId}`));
      // Якщо знайдено користувача в users
      if (userSnapshotInUsers.exists()) {
        console.log('Знайдено користувача у users: ', userSnapshotInUsers.val());
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
export const removeKeyFromFirebase = async (field, userId) => {
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
