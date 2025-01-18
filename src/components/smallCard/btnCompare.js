import React from 'react';

export const btnCompare = (index, users, setShowInfoModal, setCompare) => {
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

  return (
    <button
      style={{ ...styles.removeButton, top: 105, backgroundColor: 'purple' }}
      onClick={e => {
        e.stopPropagation();
        const entries = Object.entries(users);
        const currentUser = entries[index][1];
        const nextUser = entries[index + 1]?.[1]; // Перевірка чи існує наступний юзер

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
            <td style="width:20%; white-space: normal; word-break: break-word;">${key}</td>
            <td style="width:40%; white-space: normal; word-break: break-word;">${currentVal}</td>
            <td style="width:40%; white-space: normal; word-break: break-word;">${nextVal}</td>
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
