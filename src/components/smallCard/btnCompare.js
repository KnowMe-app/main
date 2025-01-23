import React from 'react';
import { handleSubmitAll } from './actions';

export const btnCompare = (index, users, setUsers, setShowInfoModal, setCompare) => {
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
    'photos',
  ];

  const mergeValues = (key, currentVal, nextVal) => {
    // Функція для перевірки, чи значення є масивом, завдяки комам
    const isArray = (value) => typeof value === 'string' && value.includes(',');
  
    // Перетворення значення на масив
    const toArray = (value) => (isArray(value) ? value.split(',').map((item) => item.trim()) : [value].map((item) => item.trim()));
  
    // Якщо `currentVal` порожнє, повертаємо пустий рядок
    if (!currentVal) {
      return '';
    }
  
    // Якщо `nextVal` порожнє, повертаємо `currentVal`
    if (!nextVal) {
      return currentVal;
    }
  
    // Перетворюємо значення на масиви
    const currentArray = toArray(currentVal);
    const nextArray = toArray(nextVal);
  
    // Об'єднуємо масиви та видаляємо дублікати
    const uniqueValues = Array.from(new Set([...currentArray, ...nextArray]));
  
    // Повертаємо результат як рядок, об'єднаний комами
    return uniqueValues.join(', ');
  };
  

  window.handleClick = (key, nextVal, currentVal, userIdCur, userIdNext) => {

  // Логіка: визначення `targetUserId`
  const targetUserId = currentVal ? userIdNext : userIdCur;
  console.log('Target User ID:', targetUserId);

  // Перевіряємо, чи існує потрібний користувач
  if (users[targetUserId]) {
    // Створюємо копію users, щоб уникнути мутації
    const updatedUsers = { ...users };

    // Логіка для полів `getInTouch` та `lastCycle` - перезапис значення
    if (key === 'getInTouch' || key === 'lastCycle') {
      updatedUsers[targetUserId][key] = currentVal || nextVal;
    } else {
      // Отримуємо результат з `mergeValues`
      const mergedValue = mergeValues(key, currentVal, nextVal);

      // Логіка запису результату:
      if (mergedValue.includes(',')) {
        // Якщо результат містить кілька значень (на основі ком), записуємо як масив
        updatedUsers[targetUserId][key] = mergedValue.split(',').map((item) => item.trim());
      } else {
        // Якщо результат одне значення, записуємо його як ключ-значення
        updatedUsers[targetUserId][key] = mergedValue;
      }
    }

    // Оновлюємо стан
    setUsers(updatedUsers);

    // Відправляємо оновлені дані користувача на сервер
    handleSubmitAll(updatedUsers[targetUserId], 'overwrite');

    console.log('Updated user data:', updatedUsers[targetUserId]);
  } else {
    console.error(`User with ID ${targetUserId} not found`);
  }
};

  return (
    <button
      style={{ ...styles.removeButton, top: 105, backgroundColor: 'purple' }}
      onClick={e => {
        e.stopPropagation();
        const entries = Object.entries(users);
        const currentUser = entries[index][1];
        console.log('currentUser :>> ', currentUser?.userId);
        const nextUser = entries[index + 1]?.[1]; // Перевірка чи існує наступний юзер
        // const prevUser = entries[index - 1]?.[1]; // Попередній юзер
        // console.log('prevUser :>> ', prevUser?.userId);

        // Тут ми НЕ виймаємо photos, щоб він залишився в currentUser та nextUser
        const restCurrentUser = currentUser || {};
        const restNextUser = nextUser || {};

        // Виберемо лише ключі, які містяться у whiteList
        const filteredCurrentKeys = Object.keys(restCurrentUser).filter(key => !delKeys.includes(key));
        const filteredNextKeys = nextUser ? Object.keys(restNextUser).filter(key => !delKeys.includes(key)) : [];

        const keys = new Set([...filteredCurrentKeys, ...filteredNextKeys]);

        let rows = '';
        for (const key of keys) {
          const currentVal = restCurrentUser[key] !== undefined ? restCurrentUser[key] : '';
          const nextVal = nextUser ? (restNextUser[key] !== undefined ? restNextUser[key] : '') : 'No next user';

          // Пропускаємо рядок, якщо є наступний користувач і значення однакові
          if (nextUser && String(currentVal).trim() === String(nextVal).trim()) {
            continue;
          }

          rows += `
          <tr>
 <td style="width:20%; white-space: normal; word-break: break-word; cursor: pointer;">
              ${key}
            </td>
              <td 
      style="width:40%; white-space: normal; word-break: break-word; cursor: pointer;" 
      onclick="window.handleClick('${key}', '${nextVal}', '${currentVal}', '${currentUser.userId}', '${nextUser?.userId}')"
    >
      ${currentVal || ''}
    </td>
    <td 
      style="width:40%; white-space: normal; word-break: break-word; cursor: pointer;" 
      onclick="window.handleClick('${key}', '${currentVal}', '${nextVal}', '${nextUser.userId}', '${currentUser?.userId}')"
    >
      ${nextVal || ''}
    </td>
          </tr>
        `;
        }

        const message = `
        <div style="font-size:10px; font-family: Arial, sans-serif;">
          <table border="1" cellspacing="0" cellpadding="5" style="border-collapse: collapse; table-layout: fixed; width: 100%;">
            <thead>
              <tr>
                <th style="width:20%; white-space: normal; word-break: break-word;">Key</th>
                <th style="width:40%; white-space: normal; word-break: break-word;">Current User</th>
                <th style="width:40%; white-space: normal; word-break: break-word;">Next User</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        </div>
      `;

        setShowInfoModal('compareCards');
        setCompare(message);
      }}
    >
      comp
    </button>
  );
};

// Стилі
const styles = {
  removeButton: {
    padding: '3px 6px',
    backgroundColor: 'orange',
    color: 'white',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    position: 'absolute',
    top: '73px',
    right: '10px',
    zIndex: 999,
  },
};
