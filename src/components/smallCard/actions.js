import {
  fetchUserById,
  updateDataInNewUsersRTDB,
  updateDataInRealtimeDB,
  updateDataInFiresoreDB
} from "components/config";
import { updateCachedUser } from "utils/cache";
import { formatDateAndFormula, formatDateToServer } from "components/inputValidations";
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
  const formatValue = (k, v) => {
    if (k === 'getInTouch' || k === 'lastCycle') return formatDateAndFormula(v);
    if (k === 'lastDelivery') return formatDateToServer(v);
    return v;
  };

  if (typeof key === 'object' && key !== null) {
    const updates = key;
    const clickFlag = value;
    const opts = click || {};
    const formattedEntries = Object.entries(updates).map(([k, v]) => [k, formatValue(k, v)]);
    const shouldDrop = (key, value) =>
      (key === 'lastDelivery' || key === 'getInTouch') && !value;
    const formatted = Object.fromEntries(
      formattedEntries.filter(([k, v]) => !shouldDrop(k, v))
    );
    const removeKeys = formattedEntries.filter(([k, v]) => shouldDrop(k, v)).map(([k]) => k);

    if (setState)
      setState(prev => {
        const newState = { ...prev, ...formatted };
        removeKeys.forEach(key => {
          delete newState[key];
        });
        return newState;
      });

    const applyUpdates = prevState => {
      const isMultiple =
        typeof prevState === 'object' &&
        !Array.isArray(prevState) &&
        Object.keys(prevState).every(id => typeof prevState[id] === 'object');

      if (!isMultiple) {
        const newState = { ...prevState, ...formatted };
        removeKeys.forEach(key => {
          delete newState[key];
        });
        clickFlag &&
          handleSubmit(
            { ...newState, userId: userId || newState.userId },
            'overwrite',
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
        removeKeys.forEach(key => {
          if (newState[userId]) {
            delete newState[userId][key];
          }
        });
        clickFlag &&
          handleSubmit({ ...newState[userId], userId }, 'overwrite');
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

  if (setState)
    setState(prev => {
      const newState = { ...prev };
      if ((key === 'lastDelivery' || key === 'getInTouch') && !newValue) {
        delete newState[key];
      } else {
        newState[key] = newValue;
      }
      return newState;
    });

  if (setState) {
    setUsers(prevState => {
      // console.log('prevState!!!!!!!!! :>> ', prevState);
      // Зроблено в основному для видалення юзера серед масиву карточок, а не з середини

      const isMultiple =
        typeof prevState === 'object' &&
        !Array.isArray(prevState) &&
        Object.keys(prevState).every(id => typeof prevState[id] === 'object');

      if (!isMultiple) {
        const newState = { ...prevState };
        if ((key === 'lastDelivery' || key === 'getInTouch') && !newValue) {
          delete newState[key];
        } else {
          newState[key] = newValue;
        }
        click &&
          handleSubmit(
            { ...newState, userId: userId || newState.userId },
            'overwrite',
          );
        return newState;
      } else {
        const newState = {
          ...prevState,
          [userId]: {
            ...prevState[userId],
            ...((key === 'lastDelivery' || key === 'getInTouch') && !newValue
              ? (() => {
                  const { [key]: _, ...rest } = prevState[userId];
                  return rest;
                })()
              : { [key]: newValue }),
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
          ...((key === 'lastDelivery' || key === 'getInTouch') && !newValue
            ? (() => {
                const { [key]: _, ...rest } = prevState[userId];
                return rest;
              })()
            : { [key]: newValue }),
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

export const removeField = (
  userId,
  nestedKey,
  setUsers,
  setState,
  removedKey = nestedKey,
) => {
  const keys = nestedKey.split('.');

  const removePath = obj => {
    if (obj === undefined || obj === null) {
      return { changed: false, value: obj };
    }

    const removeRecursive = (current, depth) => {
      if (current === undefined || current === null) {
        return { changed: false, value: current };
      }

      const key = keys[depth];
      const isLast = depth === keys.length - 1;

      if (Array.isArray(current)) {
        if (!/^\d+$/.test(key)) {
          return { changed: false, value: current };
        }

        const index = Number(key);
        if (index < 0 || index >= current.length) {
          return { changed: false, value: current };
        }

        if (isLast) {
          const newArray = current.slice();
          newArray.splice(index, 1);
          return { changed: true, value: newArray };
        }

        const { changed, value } = removeRecursive(current[index], depth + 1);
        if (!changed) {
          return { changed: false, value: current };
        }

        const newArray = current.slice();
        newArray[index] = value;
        return { changed: true, value: newArray };
      }

      if (typeof current === 'object') {
        if (!Object.prototype.hasOwnProperty.call(current, key)) {
          return { changed: false, value: current };
        }

        if (isLast) {
          const { [key]: _, ...rest } = current;
          return { changed: true, value: rest };
        }

        const { changed, value } = removeRecursive(current[key], depth + 1);
        if (!changed) {
          return { changed: false, value: current };
        }

        return { changed: true, value: { ...current, [key]: value } };
      }

      return { changed: false, value: current };
    };

    return removeRecursive(obj, 0);
  };

  if (typeof setState === 'function') {
    setState(prev => {
      const { changed, value } = removePath(prev);
      return changed ? value : prev;
    });
  }

  if (typeof setUsers !== 'function') {
    return;
  }

  const removalKey = removedKey ?? nestedKey;
  const removalList = removalKey ? [removalKey] : [];

  setUsers(prev => {
    const isMultiple =
      prev &&
      typeof prev === 'object' &&
      !Array.isArray(prev) &&
      Object.keys(prev).every(id => typeof prev[id] === 'object');

    if (isMultiple) {
      const targetUser = prev[userId];
      const { changed, value } = removePath(targetUser);
      if (!changed) {
        return prev;
      }
      const updatedUser = value ?? {};
      const newState = { ...prev, [userId]: updatedUser };
          handleSubmit({ ...updatedUser, userId }, 'overwrite', removalList);
      return newState;
    }

    const { changed, value } = removePath(prev);
    if (!changed) {
      return prev;
    }
    const updated = value ?? {};
    const resolvedUserId = userId || updated.userId;
    if (!resolvedUserId) {
      return updated;
    }
    handleSubmit({ ...updated, userId: resolvedUserId }, 'overwrite', removalList);
    return updated;
  });
};

export const handleSubmit = (userData, condition, removeKeys = []) => {
  const fieldsForNewUsersOnly = [
    'role',
    'getInTouch',
    'lastCycle',
    'myComment',
    'writer',
    'cycleStatus',
    'stimulationSchedule',
  ];
  const contacts = ['instagram', 'facebook', 'email', 'phone', 'telegram', 'tiktok', 'vk', 'userId'];
  const commonFields = [
    'lastAction',
    'lastLogin2',
    'getInTouch',
    'lastDelivery',
    'ownKids',
    'cycleStatus',
    'stimulationSchedule',
  ];
  const dublicateFields = ['weight', 'height'];

  const uploadedInfo = { ...userData };
  if (uploadedInfo.lastDelivery) {
    uploadedInfo.lastDelivery = formatDateToServer(uploadedInfo.lastDelivery);
  } else {
    delete uploadedInfo.lastDelivery;
  }

  if (uploadedInfo.getInTouch) {
    uploadedInfo.getInTouch = formatDateToServer(uploadedInfo.getInTouch);
  } else {
    delete uploadedInfo.getInTouch;
  }

  // Оновлюємо поле lastAction поточною датою в мілісекундах
  uploadedInfo.lastAction = Date.now();

  // Фільтруємо ключі, щоб видалити зайві поля
  const cleanedStateForNewUsers = Object.fromEntries(
    Object.entries(uploadedInfo).filter(([key]) =>
      [...fieldsForNewUsersOnly, ...contacts, ...commonFields, ...dublicateFields].includes(key)
    )
  );

  const removalTargets = Array.isArray(removeKeys)
    ? removeKeys.map(key => String(key)).filter(Boolean)
    : [];

  const backendPayload = { ...cleanedStateForNewUsers };
  const nestedRemovalPayload = {};

  removalTargets.forEach(path => {
    if (path.includes('.')) {
      const [topLevel] = path.split('.');
      if (!(topLevel in backendPayload)) {
        nestedRemovalPayload[path.replace(/\./g, '/')] = null;
      }
    } else if (path !== 'userId') {
      backendPayload[path] = null;
    }
  });

  const payloadForBackend = {
    ...backendPayload,
    ...nestedRemovalPayload,
  };

  updateCachedUser(
    { ...backendPayload, userId: userData.userId },
    { removeKeys: removalTargets },
  );
  void updateDataInNewUsersRTDB(
    userData.userId,
    payloadForBackend,
    'update',
  );
};

export const handleSubmitAll = async (userData, overwrite) => {
  const fieldsForNewUsersOnly = [
    'role',
    'getInTouch',
    'lastCycle',
    'myComment',
    'writer',
    'cycleStatus',
    'stimulationSchedule',
  ];
  const contacts = ['instagram', 'facebook', 'email', 'phone', 'telegram', 'tiktok', 'vk', 'userId'];
  const commonFields = [
    'lastAction',
    'lastLogin2',
    'getInTouch',
    'lastDelivery',
    'ownKids',
    'cycleStatus',
    'stimulationSchedule',
  ];

  const { existingData } = await fetchUserById(userData.userId);
  const uploadedInfo =
    makeUploadedInfo(existingData, userData, overwrite) || {};
  if (uploadedInfo.lastDelivery) {
    uploadedInfo.lastDelivery = formatDateToServer(uploadedInfo.lastDelivery);
  } else {
    delete uploadedInfo.lastDelivery;
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