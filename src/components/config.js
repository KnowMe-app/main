import { initializeApp } from 'firebase/app';
import { getAuth, deleteUser } from 'firebase/auth';
import { collection, deleteDoc, doc, getDoc, getDocs, getFirestore, setDoc, updateDoc } from 'firebase/firestore';
import { getDownloadURL, getStorage, uploadBytes, ref, deleteObject, listAll } from 'firebase/storage';
import { getDatabase, ref as ref2, get, remove, set, update } from 'firebase/database';

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
  const file = await getFileBlob(photo); // перетворюємо отриману фотографію на об'єкт Blob
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
  try {
    const userRef = doc(db, `users/${userId}`);
    if (condition==='update') {
      await updateDoc(userRef, uploadedInfo);
    } 
    else if (condition==='set') {
      await setDoc(userRef, uploadedInfo);
    }
    else if (condition==='check') {
      const userDoc = await getDoc(userRef);
      if (userDoc.exists()) {
        await updateDoc(userRef, uploadedInfo);
      } else {
        await setDoc(userRef, uploadedInfo);
      }
    }
  } catch (error) {
    console.error('Сталася помилка під час збереження даних в Firestore Database:', error);
    throw error;
  }
};

export const updateDataInRealtimeDB = async (userId, uploadedInfo, condition) => {
  try {
    const userRefRTDB = ref2(database, `users/${userId}`);
    if (condition==='update') {
      await update(userRefRTDB, { ...uploadedInfo });
    } 
    await set(userRefRTDB, { ...uploadedInfo });
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
