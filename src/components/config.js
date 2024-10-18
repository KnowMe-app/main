import { initializeApp } from 'firebase/app';
import { getAuth, deleteUser } from 'firebase/auth';
import { collection, deleteDoc, doc, getDoc, getDocs, getFirestore, setDoc, updateDoc } from 'firebase/firestore';
import { getDownloadURL, getStorage, uploadBytes, ref, deleteObject, listAll } from 'firebase/storage';
import { getDatabase, ref as ref2, get, remove, set, update, push,} from 'firebase/database';
import { query, orderByKey, limitToFirst, startAfter} from 'firebase/database';

const firebaseConfig = {
  apiKey: process.env.REACT_APP_API_KEY,
  authDomain: process.env.REACT_APP_AUTH_DOMAIN,
  databaseURL: process.env.REACT_APP_DATABASE_URL,
  projectId: process.env.REACT_APP_PROJECT_ID,
  storageBucket: process.env.REACT_APP_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_APP_ID
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

const getFileBlob = (file) => {
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
    reader.onload = (event) => {
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

        console.log("Остаточний розмір стисненого фото:", compressedFile.size);
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
const dataURLToFile = (dataUrl) => {
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

export const fetchNewUsersCollectionInRTDB = async (searchedValue) => {
  const db = getDatabase();
  const usersRef = ref2(db, 'newUsers');
  const searchIdRef = ref2(db, 'newUsers/searchId');  // Референс для пошуку в searchId
  
  
  // Логування значення, яке шукаємо
  console.log('searchedValue :>> ', searchedValue);

  const [searchKey, searchValue] = Object.entries(searchedValue)[0];

  const searchIdKey = `${searchKey}_${searchValue.toLowerCase()}`; // Формуємо ключ для пошуку у searchId

  try {
    // 1. Шукаємо в searchId, чи є вже відповідний userId
    const searchIdSnapshot = await get(ref2(db, `newUsers/searchId/${searchIdKey}`));
    
    if (searchIdSnapshot.exists()) {
      const userId = searchIdSnapshot.val();  // Отримуємо userId

      // 2. Якщо userId знайдений, шукаємо його картку в newUsers
      const userRef = ref2(db, `newUsers/${userId}`);
      const userSnapshot = await get(userRef);

      if (userSnapshot.exists()) {
        console.log('Знайдений користувач: ', userSnapshot.val());
        return {
          userId,
          ...userSnapshot.val(),
        };
      } else {
        console.log('Не вдалося знайти картку користувача за userId.');
        return null;
      }
    } else {
      // 3. Якщо userId не знайдено, створюємо нового користувача
      const newUserRef = push(usersRef);  // Генеруємо унікальний ключ
      const newUser = {
        [searchKey]: searchValue, // Додаємо значення пошукового ключа
        createdAt: Date.now(),    // Додаємо час створення або інші поля, якщо потрібно
      };

      // Записуємо нового користувача в базу даних
      await set(newUserRef, newUser);

      const newUserId = newUserRef.key;

      // 4. Додаємо пару ключ-значення у searchId
      await update(searchIdRef, { [searchIdKey]: newUserId });

      console.log('Створений новий користувач і доданий у searchId: ', newUser);

      return {
        userId: newUserId,
        ...newUser,
      };
    }
  } catch (error) {
    console.error('Error fetching data:', error);
    return [];
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
  const cleanedUploadedInfo = removeUndefined(uploadedInfo);
  try {
    const userRef = doc(db, `users/${userId}`);
    if (condition==='update') {
      await updateDoc(userRef, cleanedUploadedInfo);
    } 
    else if (condition==='set') {
      await setDoc(userRef, cleanedUploadedInfo);
    }
    else if (condition==='check') {
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

const removeUndefined = (obj) => {
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
    if (condition==='update') {
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
    const keysToCheck = ['facebook', 'instagram', 'phone', 'tiktok', 'telegram'];

    // Перебір ключів та їх обробка
    for (const key of keysToCheck) {
      if (uploadedInfo[key]) {
        // Отримуємо старі значення з сервера (масив або строку)
        const currentValues = Array.isArray(currentUserData?.[key])
          ? currentUserData[key]
          : typeof currentUserData?.[key] === 'object'
            ? Object.values(currentUserData[key])
            : typeof currentUserData?.[key] === 'string'
              ? [currentUserData[key]]
              : [];

        // Нові значення з uploadedInfo (масив або строку)
        const newValues = Array.isArray(uploadedInfo[key])
          ? uploadedInfo[key]
          : typeof uploadedInfo[key] === 'object'
            ? Object.values(uploadedInfo[key])
            : typeof uploadedInfo[key] === 'string'
              ? [uploadedInfo[key]]
              : [];

        console.log(`${key} currentValues :>> `, currentValues);
        console.log(`${key} newValues :>> `, newValues);

        // Видаляємо значення, яких більше немає у новому масиві
        for (const value of currentValues) {
          if (!newValues.includes(value)) {
            await updateSearchId(key, value.toLowerCase(), userId, 'remove'); // Видаляємо конкретний ID
          }
        }

        // Додаємо нові значення, яких не було в старому масиві
        for (const value of newValues) {
          if (!currentValues.includes(value)) {
            await updateSearchId(key, value.toLowerCase(), userId, 'add'); // Додаємо новий ID
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

// Функція для оновлення або видалення пар у searchId
export const updateSearchId = async (searchKey, searchValue, userId, action) => {

  const db = getDatabase();
  const searchIdRef = ref2(db, 'newUsers/searchId');
  const searchIdKey = `${searchKey}_${searchValue}`;
  console.log('searchIdKey in updateSearchId :>> ', searchIdKey);

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
export const removeSearchId = async (userId) => {
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

export const fetchPaginatedNewUsers = async (lastKey) => {
  const db = getDatabase();
  const usersRef = ref2(db, 'newUsers');
  
  try {
    // Формуємо запит для отримання даних, виключаючи 'searchId'
    let usersQuery = query(usersRef, orderByKey(), limitToFirst(10 + 1)); // Отримуємо на один запис більше для визначення наявності наступної сторінки
    
    // Якщо є останній ключ (lastKey), беремо наступну сторінку даних
    if (lastKey) {
      usersQuery = query(usersRef, orderByKey(), limitToFirst(10 + 1), startAfter(lastKey));
    }

    // Виконуємо запит
    const snapshot = await get(usersQuery);

    if (snapshot.exists()) {
      const usersData = snapshot.val();

      // Виключаємо 'searchId' з результатів
      const filteredData = Object.entries(usersData)
        .filter(([key, value]) => key !== 'searchId')
        .slice(0, 10); // Обмежуємо до 10 записів, решту використовуємо для визначення наступної сторінки

      // Отримуємо останній ключ для пагінації
      const lastUserKey = filteredData.length > 0 ? filteredData[filteredData.length - 1][0] : null;

      return {
        users: Object.fromEntries(filteredData),  // Повертаємо відфільтровані дані користувачів
        lastKey: lastUserKey,  // Повертаємо ключ для наступної сторінки
        hasMore: snapshot.size > 10, // Якщо більше 10 записів, є наступна сторінка
      };
    }

    return {
      users: {},
      lastKey: null,
      hasMore: false,
    };
  } catch (error) {
    console.error('Error fetching paginated data:', error);
    return {
      users: {},
      lastKey: null,
      hasMore: false,
    };
  }
};

