import { fetchUserById, updateDataInNewUsersRTDB } from "components/config";
import { formatDateAndFormula } from "components/inputValidations";
import { makeUploadedInfo } from "components/makeUploadedInfo";

export const handleChange = (
  setUsers,
  setState,
  userId,
  key,
  value,
  click,
  options = {}
) => {
  const newValue = key === 'getInTouch' || key === 'lastCycle' ? formatDateAndFormula(value) : value;

  if (setState) setState(prev => ({ ...prev, [key]: newValue }));

  if (setState) {
    setUsers(prevState => {
      // console.log('prevState!!!!!!!!! :>> ', prevState);
      // Зроблено в основному для видалення юзера серед масиву карточок, а не з середини

      const isMultiple = typeof prevState === 'object' && !Array.isArray(prevState) && Object.keys(prevState).every(id => typeof prevState[id] === 'object');

      if (!isMultiple) {
        const newState = { ...prevState, [key]: newValue };
        click && handleSubmit({ ...newState, userId: userId || newState.userId });
        return newState;
      } else {
        const newState = {
          ...prevState,
          [userId]: {
            ...prevState[userId],
            [key]: newValue,
          },
        };
        click && handleSubmit({ ...newState[userId], userId }, 'overwrite');
        return newState;
      }
    });
  } else {
    setUsers(prevState => {
      const newState = {
        ...prevState,
        [userId]: {
          ...prevState[userId],
          [key]: newValue,
        },
      };
      click && handleSubmit({ ...newState[userId], userId }, 'overwrite');
      return newState;
    });
  }

  if (
    key === 'getInTouch' &&
    options.currentFilter === 'DATE2' &&
    options.isDateInRange &&
    !options.isDateInRange(newValue)
  ) {
    setUsers(prev => {
      const copy = { ...prev };
      if (copy[userId]) {
        copy[userId]._pendingRemove = true;
      }
      return copy;
    });
  }
};

export const handleSubmit = async userData => {
  const fieldsForNewUsersOnly = ['role', 'getInTouch', 'lastCycle', 'myComment', 'writer'];
  const contacts = ['instagram', 'facebook', 'email', 'phone', 'telegram', 'tiktok', 'vk', 'userId'];
  const commonFields = ['lastAction'];
  const dublicateFields = ['weight', 'height'];

  // console.log('userData В handleSubmit', userData);
  //  const { existingData } = await fetchUserData(userData.userId);
  // console.log('userData.userId :>> ', userData.userId);
  // const { existingData } = await fetchUserById(userData.userId);
  // console.log('1111 :>> ');
  // const uploadedInfo = makeUploadedInfo(existingData, userData);
  console.log('userData!!!!!!!!!!!!!!!!!!!!!!!!! :>> ', userData);
  const uploadedInfo = userData;

  // Оновлюємо поле lastAction поточною датою у форматі рррр-мм-дд
  const currentDate = new Date();
  currentDate.setDate(currentDate.getDate());

  // Форматуємо дату в локальному часі замість використання UTC
  const year = currentDate.getFullYear();
  const month = String(currentDate.getMonth() + 1).padStart(2, '0'); // Додаємо 1, оскільки місяці в Date починаються з 0
  const day = String(currentDate.getDate()).padStart(2, '0');
  const formattedDate = `${year}-${month}-${day}`; // Формат YYYY-MM-DD

  uploadedInfo.lastAction = formattedDate;

  // Фільтруємо ключі, щоб видалити зайві поля
  const cleanedStateForNewUsers = Object.fromEntries(
    Object.entries(uploadedInfo).filter(([key]) => [...fieldsForNewUsersOnly, ...contacts, ...commonFields, ...dublicateFields].includes(key))
  );

  console.log('cleanedStateForNewUsers!!!!!!!!!!!!!!', cleanedStateForNewUsers);

  await updateDataInNewUsersRTDB(userData.userId, cleanedStateForNewUsers, 'update');
};

export const handleSubmitAll = async userData => {
  const { existingData } = await fetchUserById(userData.userId);
  const uploadedInfo = makeUploadedInfo(existingData, userData);
  const currentDate = new Date();
  currentDate.setDate(currentDate.getDate());

  // Форматуємо дату в локальному часі замість використання UTC
  const year = currentDate.getFullYear();
  const month = String(currentDate.getMonth() + 1).padStart(2, '0'); // Додаємо 1, оскільки місяці в Date починаються з 0
  const day = String(currentDate.getDate()).padStart(2, '0');
  const formattedDate = `${year}-${month}-${day}`; // Формат YYYY-MM-DD
  uploadedInfo.lastAction = formattedDate;
  await updateDataInNewUsersRTDB(userData.userId, uploadedInfo, 'update');
};