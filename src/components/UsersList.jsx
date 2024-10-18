import React from 'react';
import { removeSearchId } from './config';

// Компонент для рендерингу кожної картки
const UserCard = ({ userData }) => {

  console.log('userData :>> ', userData);
  const renderFields = (data, parentKey = '') => {
    return Object.entries(data).map(([key, value]) => {
      const nestedKey = parentKey ? `${parentKey}.${key}` : key;

      // Якщо значення — це об'єкт або масив, рекурсивно обробляємо
      if (typeof value === 'object' && value !== null) {
        return (
          <div key={nestedKey}>
            <strong>{key}:</strong>
            <div style={{ marginLeft: '20px' }}>
              {renderFields(value, nestedKey)}
            </div>
          </div>
        );
      }

      // Якщо значення — це просте значення, просто виводимо його
      return (
        <div key={nestedKey}>
          <strong>{key}:</strong> {value.toString()}
        </div>
      );
    });
  };

  return (
    <div style={styles.card}>
      {renderFields(userData)}
    </div>
  );
};

// Компонент для рендерингу всіх карток
const UsersList = ({ users, setUsers }) => {

  const handleRemoveUser = async (userId) => {
    await removeSearchId(userId); // Виклик функції для видалення
    // Оновлення стану користувачів
    setUsers(prevUsers => {
      const updatedUsers = { ...prevUsers };
      delete updatedUsers[userId]; // Видалення користувача за userId
      return updatedUsers; // Повертаємо оновлений об'єкт користувачів
    });
  };

  return (
    <div style={styles.container}>
    {Object.entries(users).map(([userId, userData]) => (
      <div key={userId} style={styles.card}>
        <button
          style={styles.removeButton}
          onClick={() => handleRemoveUser(userId)} // Виклик функції при натисканні
       
        >
          del
        </button>
        <UserCard userData={userData} />
        
      </div>
    ))}
  </div>
  );
};

// Стилі
const styles = {
  container: {
    display: 'flex',
    flexWrap: 'wrap',
    // justifyContent: 'center',
  },
  card: {
    position: 'relative', // Додаємо для розташування кнопки
    margin: '10px', // Відстань між картками
    color:'black',
  },
  removeButton: {
    // position: 'absolute',
    // top: '10px', // Відступ від верхнього краю
    // left: '100%', // Центруємо по горизонталі
    // transform: 'translateX(-50%)', // Центруємо кнопку
    marginLeft: 'auto',
    padding: '5px 10px',
    backgroundColor: 'red',
    color: 'white',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
  },
};

export default UsersList;
