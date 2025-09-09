import {
  fetchUserById,
  updateDataInNewUsersRTDB,
  updateDataInRealtimeDB,
  updateDataInFiresoreDB
} from "components/config";
import { updateCachedUser } from "utils/cache";
import { formatDateAndFormula, formatDateToServer } from "components/inputValidations";
import { makeUploadedInfo } from "components/makeUploadedInfo";
import toast from 'react-hot-toast';

export const handleChange = (
  setUsers,
  setState,
  userId,
  key,
  value,
  click,
  options = {},
  isToastOn = false
) => {
  const formatValue = (k, v) => {
    if (k === 'getInTouch' || k === 'lastCycle') return formatDateAndFormula(v);
    if (k === 'lastDelivery') return formatDateToServer(v);
    return v;
  };

  if (typeof key === 'object' && key !== null) {
    const updates = key;
    const clickFlag = value;
    const opts = click || {};
    const toast = options === undefined ? false : isToastOn;
    const formatted = Object.fromEntries(
      Object.entries(updates).map(([k, v]) => [k, formatValue(k, v)])
    );

    if (setState) setState(prev => ({ ...prev, ...formatted }));

    const applyUpdates = prevState => {
      const isMultiple =
        typeof prevState === 'object' &&
        !Array.isArray(prevState) &&
        Object.keys(prevState).every(id => typeof prevState[id] === 'object');

      if (!isMultiple) {
        const newState = { ...prevState, ...formatted };
        clickFlag &&
          handleSubmit(
            { ...newState, userId: userId || newState.userId },
            'overwrite',
            toast,
          );
        return newState;
      } else {
        const newState = {
          ...prevState,
          [userId]: {
            ...prevState[userId],
            ...formatted,
          },
        };
        clickFlag &&
          handleSubmit({ ...newState[userId], userId }, 'overwrite', toast);
        return newState;
      }
    };

    setUsers(applyUpdates);

    if (
      formatted.getInTouch &&
      opts.currentFilter === 'DATE2' &&
      opts.isDateInRange &&
      !opts.isDateInRange(formatted.getInTouch)
    ) {
      setUsers(prev => {
        const copy = { ...prev };
        if (copy[userId]) {
          copy[userId]._pendingRemove = true;
        }
        return copy;
      });
    }
    return;
  }

  const newValue = formatValue(key, value);

  if (setState) setState(prev => ({ ...prev, [key]: newValue }));

  if (setState) {
    setUsers(prevState => {
      // console.log('prevState!!!!!!!!! :>> ', prevState);
      // Зроблено в основному для видалення юзера серед масиву карточок, а не з середини

      const isMultiple =
        typeof prevState === 'object' &&
        !Array.isArray(prevState) &&
        Object.keys(prevState).every(id => typeof prevState[id] === 'object');

      if (!isMultiple) {
        const newState = { ...prevState, [key]: newValue };
        click &&
          handleSubmit(
            { ...newState, userId: userId || newState.userId },
            'overwrite',
            isToastOn,
          );
        return newState;
      } else {
        const newState = {
          ...prevState,
          [userId]: {
            ...prevState[userId],
            [key]: newValue,
          },
        };
        click &&
          handleSubmit({ ...newState[userId], userId }, 'overwrite', isToastOn);
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
      click &&
        handleSubmit({ ...newState[userId], userId }, 'overwrite', isToastOn);
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

export const handleSubmit = async (userData, condition, isToastOn) => {
  const fieldsForNewUsersOnly = ['role', 'getInTouch', 'lastCycle', 'myComment', 'writer'];
  const contacts = ['instagram', 'facebook', 'email', 'phone', 'telegram', 'tiktok', 'vk', 'userId'];
  const commonFields = ['lastAction', 'lastLogin2', 'getInTouch', 'lastDelivery', 'ownKids'];
  const dublicateFields = ['weight', 'height'];

  // console.log('userData В handleSubmit', userData);
  //  const { existingData } = await fetchUserData(userData.userId);
  // console.log('userData.userId :>> ', userData.userId);
  // const { existingData } = await fetchUserById(userData.userId);
  // console.log('1111 :>> ');
  // const uploadedInfo = makeUploadedInfo(existingData, userData);
  console.log('userData!!!!!!!!!!!!!!!!!!!!!!!!! :>> ', userData);
  const uploadedInfo = { ...userData };
  if (uploadedInfo.lastDelivery) {
    uploadedInfo.lastDelivery = formatDateToServer(uploadedInfo.lastDelivery);
  }

  // Оновлюємо поле lastAction поточною датою в мілісекундах
  uploadedInfo.lastAction = Date.now();

  // Фільтруємо ключі, щоб видалити зайві поля
  const cleanedStateForNewUsers = Object.fromEntries(
    Object.entries(uploadedInfo).filter(([key]) =>
      [...fieldsForNewUsersOnly, ...contacts, ...commonFields, ...dublicateFields].includes(key)
    )
  );

  console.log('cleanedStateForNewUsers!!!!!!!!!!!!!!', cleanedStateForNewUsers);

  updateCachedUser({ ...cleanedStateForNewUsers, userId: userData.userId });
  await updateDataInNewUsersRTDB(userData.userId, cleanedStateForNewUsers, 'update');
  if (isToastOn) {
    toast.success('Дані збережено', { duration: 2000 });
  }
};

export const handleSubmitAll = async (userData, overwrite) => {
  const fieldsForNewUsersOnly = ['role', 'getInTouch', 'lastCycle', 'myComment', 'writer'];
  const contacts = ['instagram', 'facebook', 'email', 'phone', 'telegram', 'tiktok', 'vk', 'userId'];
  const commonFields = ['lastAction', 'lastLogin2', 'getInTouch', 'lastDelivery', 'ownKids'];

  const { existingData } = await fetchUserById(userData.userId);
  const uploadedInfo =
    makeUploadedInfo(existingData, userData, overwrite) || {};
  if (uploadedInfo.lastDelivery) {
    uploadedInfo.lastDelivery = formatDateToServer(uploadedInfo.lastDelivery);
  }

  uploadedInfo.lastAction = Date.now();

  updateCachedUser({ ...uploadedInfo, userId: userData.userId });

  if (userData?.userId?.length > 20) {
    await updateDataInRealtimeDB(userData.userId, uploadedInfo, 'update');
    await updateDataInFiresoreDB(userData.userId, uploadedInfo, 'check');

    const cleanedStateForNewUsers = Object.fromEntries(
      Object.entries(uploadedInfo).filter(([key]) =>
        [...fieldsForNewUsersOnly, ...contacts, ...commonFields].includes(key)
      )
    );

    await updateDataInNewUsersRTDB(userData.userId, cleanedStateForNewUsers, 'update');
  } else {
    await updateDataInNewUsersRTDB(userData.userId, uploadedInfo, 'update');
  }
};