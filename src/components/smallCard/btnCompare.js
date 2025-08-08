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
    const toArray = (value) =>
      isArray(value)
        ? value.split(',').map((item) => item.trim())
        : value !== undefined && value !== null && value !== ''
        ? [String(value).trim()]
        : [];
  
    // Якщо `currentVal` порожнє, повертаємо пустий рядок
    if (!currentVal) return '';
  
    // Якщо `nextVal` порожнє, повертаємо `currentVal`
    if (!nextVal) return currentVal;
  
    // Перетворюємо значення на масиви
    const currentArray = toArray(currentVal);
    const nextArray = toArray(nextVal);
  
    // **Виправлення:** Нові значення кидаємо на початок, але не змінюємо порядок інших
    const seen = new Set();
    const uniqueValues = [...currentArray, ...nextArray].filter((val) => {
      if (seen.has(val)) return false;
      seen.add(val);
      return true;
    });
  
    // Повертаємо результат як рядок, об'єднаний комами
    return uniqueValues.join(', ');
  };
  
  

  window.handleClick = (key, nextVal, currentVal, userIdCur, userIdNext) => {
    if (key === 'myComment') {
      nextVal = decodeURIComponent(nextVal);
      currentVal = decodeURIComponent(currentVal);
    }
    const targetUserId = currentVal ? userIdNext : userIdCur;
    console.log('Target User ID:', targetUserId);
  
    if (users[targetUserId]) {
      const updatedUsers = { ...users };
  
      if (key === 'getInTouch' || key === 'lastCycle' || key === 'myComment') {
        updatedUsers[targetUserId][key] = currentVal || nextVal;
      } else {
        const mergedValue = mergeValues(key, currentVal, nextVal);
  
        if (mergedValue.includes(',')) {
          // Зберігаємо правильний порядок масиву
          updatedUsers[targetUserId][key] = mergedValue.split(',').map((item) => item.trim());
        } else {
          updatedUsers[targetUserId][key] = mergedValue;
        }
      }
  
      // Видаляємо `duplicate` перед збереженням
      if (updatedUsers[targetUserId]?.hasOwnProperty('duplicate')) {
        delete updatedUsers[targetUserId].duplicate;
      }
  
      setUsers(updatedUsers);
      handleSubmitAll(updatedUsers[targetUserId], 'overwrite');
  
      console.log('Updated user data:', updatedUsers[targetUserId]);
    } else {
      console.error(`User with ID ${targetUserId} not found`);
    }
  };
  
  
  

const handleCompareClick = (e, index, users, delKeys, setShowInfoModal, setCompare) => {
  e.stopPropagation();
  const entries = Object.entries(users);
  const currentUser = entries[index][1] || {};
  const nextUser = entries[index + 1]?.[1] || {};

  const filteredKeys = new Set([
    ...Object.keys(currentUser).filter(key => !delKeys.includes(key) && key !== 'duplicate'),
    ...Object.keys(nextUser).filter(key => !delKeys.includes(key) && key !== 'duplicate'),
]);

  let rows = '';

  const formatValue = (val) => {
    if (Array.isArray(val)) return new Set(val.map(String)); // Масив → множина унікальних строк
    if (val !== undefined && val !== null && val !== '') return new Set([String(val)]); // Рядок або число → множина
    return new Set(); // Якщо значення немає
  };

  for (const key of filteredKeys) {
    const currentSet = formatValue(currentUser[key]);
    const nextSet = formatValue(nextUser[key]);

    // Якщо поле пусте в обох користувачів – його не відображаємо
    if (currentSet.size === 0 && nextSet.size === 0) {
      continue;
    }

    // Якщо значення абсолютно однакові – його не відображаємо
    if ([...currentSet].every(val => nextSet.has(val)) && [...nextSet].every(val => currentSet.has(val))) {
      continue;
    }

    // Унікальні значення для відображення
    const uniqueCurrent = [...currentSet].filter(val => !nextSet.has(val));
    const uniqueNext = [...nextSet].filter(val => !currentSet.has(val));

    // Навіть якщо унікальні значення приховуються, все одно треба зберігати їх
    const storedCurrent = new Set([...currentSet, ...nextSet]); // Унікальний набір без дублікатів
    const storedNext = new Set([...nextSet, ...currentSet]);

    const isUserId = key === 'userId';

    const rawCurrent = [...storedCurrent].join(', ');
    const rawNext = [...storedNext].join(', ');
    const encodedCurrent = key === 'myComment' ? encodeURIComponent(rawCurrent) : rawCurrent;
    const encodedNext = key === 'myComment' ? encodeURIComponent(rawNext) : rawNext;

    rows += `
      <tr>
        <td style="width:20%; white-space: normal; word-break: break-word; cursor: pointer;">
          ${key}
        </td>
        <td
          style="width:40%; white-space: normal; word-break: break-word; cursor: ${isUserId ? 'default' : 'pointer'};"
          ${isUserId ? '' : `onclick="window.handleClick('${key}', '${encodedNext}', '${encodedCurrent}', '${currentUser.userId}', '${nextUser?.userId}')"`}
        >
          ${uniqueCurrent.join(', ') || ''}
        </td>
        <td
          style="width:40%; white-space: normal; word-break: break-word; cursor: ${isUserId ? 'default' : 'pointer'};"
          ${isUserId ? '' : `onclick="window.handleClick('${key}', '${encodedCurrent}', '${encodedNext}', '${nextUser.userId}', '${currentUser?.userId}')"`}
        >
          ${uniqueNext.join(', ') || ''}
        </td>
      </tr>`;
  }

  const message = `
  <div style="font-size:10px; font-family: Arial, sans-serif;">
    <table border="1" cellspacing="0" cellpadding="5" style="border-collapse: collapse; width: 100%;">
      <thead>
        <tr>
          <th style="width:20%;">Key</th>
          <th style="width:40%;">Current User</th>
          <th style="width:40%;">Next User</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;

  setShowInfoModal('compareCards');
  setCompare(message);
};


















  return (
    <button
      style={{ ...styles.removeButton, top: 105, backgroundColor: 'purple' }}
      onClick={(e) => handleCompareClick(e, index, users, delKeys, setShowInfoModal, setCompare)}
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
