import {
  fetchUserById,
  updateDataInNewUsersRTDB,
  updateDataInRealtimeDB,
  updateDataInFiresoreDB
} from "components/config";
import { updateCachedUser } from "utils/cache";
import { formatDateAndFormula, formatDateToServer } from "components/inputValidations";
import { makeUploadedInfo } from "components/makeUploadedInfo";
import { getUserStateShape, markUserPendingRemove, updateUserInState } from "./userStateUpdate";
import { getCardStorageCollection } from "utils/multiAccountEdits";

export const handleChange = (
  setUsers,
  setState,
  userId,
  key,
  value,
  click,
  options = {}
) => {
  const triggerHistorySnapshot = payload => {
    if (typeof options?.onSubmitHistorySnapshot !== 'function') {
      return;
    }
    const snapshot = payload && typeof payload === 'object' ? { ...payload } : payload;
    options.onSubmitHistorySnapshot(snapshot);
  };

  const submitWithHistory = (payload, removalList = []) => {
    triggerHistorySnapshot(payload);
    handleSubmit(payload, 'overwrite', removalList);
  };

  const formatValue = (k, v) => {
    if (k === 'getInTouch' || k === 'lastCycle') return formatDateAndFormula(v);
    if (k === 'lastDelivery') return formatDateToServer(v);
    return v;
  };

  const invokeSetUsers = updater => {
    if (typeof setUsers === 'function') {
      setUsers(updater);
    }
  };

  const submitWithoutUsers = (data, removalList, wasClicked) => {
    if (!wasClicked || typeof setUsers === 'function') {
      return;
    }

    const payload = typeof data === 'object' && data !== null ? { ...data } : {};
    const resolvedId = userId || payload.userId;

    if (!resolvedId) {
      return;
    }

    submitWithHistory({ ...payload, userId: resolvedId }, removalList);
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
    const actionTimestamp = clickFlag ? Date.now() : undefined;
    const formattedWithAction =
      actionTimestamp !== undefined
        ? { ...formatted, lastAction: actionTimestamp }
        : formatted;
    const removeKeys = formattedEntries.filter(([k, v]) => shouldDrop(k, v)).map(([k]) => k);

    if (setState)
      setState(prev => {
        const newState = { ...prev, ...formattedWithAction };
        removeKeys.forEach(key => {
          delete newState[key];
        });
        submitWithoutUsers(newState, removeKeys, clickFlag);
        return newState;
      });
    else {
      submitWithoutUsers(formattedWithAction, removeKeys, clickFlag);
    }

    const applyUpdates = prevState => {
      return updateUserInState(prevState, userId, currentUser => {
        const updatedUser = { ...currentUser, ...formattedWithAction };
        removeKeys.forEach(key => {
          delete updatedUser[key];
        });
        clickFlag &&
          submitWithHistory(
            { ...updatedUser, userId: userId || updatedUser.userId },
            removeKeys,
          );
        return updatedUser;
      });
    };

    invokeSetUsers(applyUpdates);

    if (
      formatted.getInTouch &&
      opts.currentFilter === 'DATE2' &&
      opts.isDateInRange &&
      !opts.isDateInRange(formatted.getInTouch)
    ) {
      invokeSetUsers(prev => markUserPendingRemove(prev, userId));
    }
    return;
  }

  const newValue = formatValue(key, value);
  const removalKeys =
    (key === 'lastDelivery' || key === 'getInTouch') && !newValue ? [key] : [];

  if (setState)
    setState(prev => {
      const newState = { ...prev };
      if ((key === 'lastDelivery' || key === 'getInTouch') && !newValue) {
        delete newState[key];
      } else {
        newState[key] = newValue;
      }
      if (click) {
        newState.lastAction = Date.now();
      }
      submitWithoutUsers(newState, removalKeys, click);
      return newState;
    });
  else {
    const payload =
      (key === 'lastDelivery' || key === 'getInTouch') && !newValue
        ? {}
        : { [key]: newValue };
    submitWithoutUsers(payload, removalKeys, click);
  }

  if (setState) {
    invokeSetUsers(prevState => {
      return updateUserInState(prevState, userId, currentUser => {
        const updatedUser =
          (key === 'lastDelivery' || key === 'getInTouch') && !newValue
            ? (() => {
                const { [key]: _, ...rest } = currentUser;
                return rest;
              })()
            : { ...currentUser, [key]: newValue };
        if (click) {
          updatedUser.lastAction = Date.now();
        }
        click &&
          submitWithHistory(
            { ...updatedUser, userId: userId || updatedUser.userId },
            removalKeys,
          );
        return updatedUser;
      });
    });
  } else {
    invokeSetUsers(prevState => {
      return updateUserInState(prevState, userId, currentUser => {
        const updatedUser =
          (key === 'lastDelivery' || key === 'getInTouch') && !newValue
            ? (() => {
                const { [key]: _, ...rest } = currentUser;
                return rest;
              })()
            : { ...currentUser, [key]: newValue };
        if (click) {
          updatedUser.lastAction = Date.now();
        }
        click &&
          submitWithHistory(
            { ...updatedUser, userId: userId || updatedUser.userId },
            removalKeys,
          );
        return updatedUser;
      });
    });
  }

  if (
    key === 'getInTouch' &&
    options.currentFilter === 'DATE2' &&
    options.isDateInRange &&
    !options.isDateInRange(newValue)
  ) {
    invokeSetUsers(prev => {
      if (!prev || typeof prev !== 'object') {
        return prev;
      }
      return markUserPendingRemove(prev, userId);
    });
  }
};

export const removeField = (
  userId,
  nestedKey,
  setUsers,
  setState,
  removedKey = nestedKey,
  options = {},
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
          if (newArray.length === 1) {
            return { changed: true, value: newArray[0] };
          }
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

  const removalKey = removedKey ?? nestedKey;
  const removalList = removalKey ? [removalKey] : [];
  const topLevelKey = keys[0];
  const triggerHistorySnapshot = payload => {
    if (typeof options?.onSubmitHistorySnapshot !== 'function') {
      return;
    }
    const snapshot = payload && typeof payload === 'object' ? { ...payload } : payload;
    options.onSubmitHistorySnapshot(snapshot);
  };

  // Запис у бекенд шлемо рівно один раз на виклик: нижче є два незалежні
  // джерела зміненої картки (синхронний знімок і колбек setUsers), і без цього
  // прапорця вони могли б відправити одне й те саме видалення двічі.
  let submitted = false;

  // Пейлоад містить лише той один top-level ключ, який реально змінився
  // (+ lastAction). Ці записи не впорядковані між собою, тож видалення двох
  // полів поспіль можуть лягти в будь-якому порядку — але мінімальний пейлоад
  // фізично не несе чужих (застарілих) значень, тому жодне видалення не може
  // воскресити інше поле.
  const sendRemoval = (resolvedUserId, cardAfterRemoval) => {
    const topLevelValue = Object.prototype.hasOwnProperty.call(cardAfterRemoval, topLevelKey)
      ? cardAfterRemoval[topLevelKey]
      : null;

    triggerHistorySnapshot({ ...cardAfterRemoval, userId: resolvedUserId });
    handleSubmit(
      { userId: resolvedUserId, [topLevelKey]: topLevelValue },
      'overwrite',
      removalList,
    );
  };

  const submitRemoval = (resolvedUserId, cardAfterRemoval) => {
    if (submitted || !resolvedUserId) {
      return;
    }
    submitted = true;
    sendRemoval(resolvedUserId, cardAfterRemoval);
  };

  // Те саме, але відкладене в мікротаску: викликається лише з середини
  // updater-колбека setUsers, щоб мережевий запис не стартував під час рендеру
  // React. Місце в черзі займаємо одразу, тож повторний прогін того самого
  // колбека (React має право його переграти) другого запису не зробить.
  const submitRemovalAsync = (resolvedUserId, cardAfterRemoval) => {
    if (submitted || !resolvedUserId) {
      return;
    }
    submitted = true;
    const run = () => sendRemoval(resolvedUserId, cardAfterRemoval);
    if (typeof queueMicrotask === 'function') {
      queueMicrotask(run);
    } else {
      Promise.resolve().then(run);
    }
  };

  // Головний шлях: рахуємо видалення прямо з переданого знімка картки —
  // звичайним синхронним JS, без жодного React-планувальника. Раніше пейлоад
  // знімався всередині updater-колбека setUsers, а React виконує такий колбек
  // синхронно лише через внутрішню оптимізацію "eager state" — і лише поки на
  // цьому fiber немає інших запланованих оновлень. У списку карток setUsers і
  // setState живуть в одному компоненті (AddNewProfile), тож setState вище вже
  // помічав fiber як брудний, колбек setUsers відкладався до рендеру, і
  // перевірка "чи є що слати" бачила ще незаповнені змінні: локально ключ
  // зникав, а в базу не летіло нічого. Саме тому не видалялись поля, наявні у
  // відкритій анкеті (name, writer), і "видалялись" ті, яких у ній не було.
  const cardSnapshot =
    options?.cardData && typeof options.cardData === 'object' ? options.cardData : null;

  if (cardSnapshot) {
    const { changed, value } = removePath(cardSnapshot);
    if (changed) {
      const updated = value ?? {};
      submitRemoval(userId || updated.userId || cardSnapshot.userId, updated);
    }
  }

  if (typeof setUsers === 'function') {
    // Резервний шлях для викликачів без cardData: там пейлоад доводиться брати
    // з updater-колбека, тож сам запис відкладаємо в мікротаску (колбек може
    // виконатись під час рендеру).
    let capturedChanged = false;

    setUsers(prev => {
      const shape = getUserStateShape(prev);
      const next = updateUserInState(prev, userId, currentUser => {
        const { changed, value } = removePath(currentUser);
        if (!changed) return currentUser;
        const updated = value ?? {};
        const resolvedUserId = userId || updated.userId;
        if (resolvedUserId) {
          capturedChanged = true;
          submitRemovalAsync(resolvedUserId, updated);
        }
        return updated;
      });

      if (shape === 'unknown' || capturedChanged || next !== prev) {
        return next;
      }

      return prev;
    });
  }

  if (typeof setState === 'function') {
    setState(prev => {
      const { changed, value } = removePath(prev);
      return changed ? value : prev;
    });
  }
};

export const handleSubmit = async (userData, condition, removeKeys = []) => {
  const fieldsForNewUsersOnly = [
    'role',
    'getInTouch',
    'lastCycle',
    'myComment',
    'writer',
    'cycleStatus',
    'stimulationSchedule',
  ];
  const contacts = ['instagram', 'facebook', 'email', 'phone', 'telegram', 'tiktok', 'linkedin', 'youtube', 'twitter', 'line', 'otherLink', 'other', 'vk', 'userId'];
  const ppTechnicalInputFields = ['name', 'surname', ...contacts];
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

  // Картки, опубліковані з чернеток, мають короткий push id, але вже живуть у
  // users. Тому вибираємо сховище за наявним записом, а не лише за довжиною id.
  const storageCollection = await getCardStorageCollection(userData?.userId);
  const writesToUsers = storageCollection === 'users';
  const basePayload = writesToUsers
    ? { ...uploadedInfo }
    : Object.fromEntries(
        Object.entries(uploadedInfo).filter(([key]) =>
          [...fieldsForNewUsersOnly, ...ppTechnicalInputFields, ...commonFields, ...dublicateFields].includes(key)
        )
      );

  const removalTargets = Array.isArray(removeKeys)
    ? removeKeys.map(key => String(key)).filter(Boolean)
    : [];

  const backendPayload = { ...basePayload };
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

  if (writesToUsers) {
    await updateDataInRealtimeDB(userData.userId, payloadForBackend, 'update');
  } else {
    await updateDataInNewUsersRTDB(userData.userId, payloadForBackend, 'update');
  }
};

export const handleSubmitAll = async (userData, overwrite) => {
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

  const storageCollection = await getCardStorageCollection(userData?.userId);
  if (storageCollection === 'users') {
    await updateDataInRealtimeDB(userData.userId, uploadedInfo, 'update');
    await updateDataInFiresoreDB(userData.userId, uploadedInfo, 'check');
  } else {
    await updateDataInNewUsersRTDB(userData.userId, uploadedInfo, 'update');
  }
};
