import React from 'react';
import { fetchUserById, removeSearchId } from './config';

// Компонент для рендерингу кожної картки
const UserCard = ({ userData }) => {

  console.log('userData :>> ', userData);
  const renderFields = (data, parentKey = '') => {
    return Object.entries(data).map(([key, value]) => {
      const nestedKey = parentKey ? `${parentKey}.${key}` : key;

       // Пропускаємо ключ 'attitude'
       if (key === 'attitude') {
        return null;
      }

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
    <div 
    style={styles.card2}
    >
      {renderFields(userData)}
    </div>
  );
};

// Компонент для рендерингу всіх карток
const UsersList = ({ users, setUsers, setSearch, setState  }) => {

  const gradients = [
    'linear-gradient(to right, #fc466b, #3f5efb)',
    'linear-gradient(to right, #6a11cb, #2575fc)',
    'linear-gradient(to right, #ff7e5f, #feb47b)'
  ];
  
  // Функція для отримання градієнта на основі індексу картки
  const getCardStyle = (index) => ({
    position: 'relative',
    margin: '10px',
    // color: 'white',
    marginTop: '20px',
    cursor: 'pointer',
    background: gradients[index % gradients.length],
    width: '100%'
  });

    // Обробник кліку на картці користувача
    const handleCardClick = async (userId) => {
      const userData = await fetchUserById(userId);
      if (userData) {

        console.log('Дані знайденого користувача: ', userData);
        setSearch(`id: ${userData.userId}`);
        setState(userData)
        // setUsers(userData)
        // Додаткова логіка обробки даних користувача
      } else {
        console.log('Користувача не знайдено.');
      }
    };

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
    {Object.entries(users).map(([userId, userData], index) => (
            <div 
            key={userId} 
            style={getCardStyle(index)}
            onClick={() => handleCardClick(userId)} // Додаємо обробник кліку
          >
            <button
              style={styles.removeButton}
              onClick={(e) => {
                e.stopPropagation(); // Запобігаємо активації кліку картки
                handleRemoveUser(userId);
              }}
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
    color: 'black',
    marginTop: '20px',
    cursor: 'pointer',
    background: 'linear-gradient(to right, #ff7e5f, #feb47b)', // Виправлено
    width: '100%'
  },
  card2: {
    position: 'relative', // Додаємо для розташування кнопки
    margin: '10px', // Відстань між картками
    color:'white',
  },
  removeButton: {
    // position: 'absolute',
    // top: '10px', // Відступ від верхнього краю
    // left: '100%', // Центруємо по горизонталі
    // transform: 'translateX(-50%)', // Центруємо кнопку
    // marginLeft: 'auto',
    padding: '5px 10px',
    backgroundColor: 'red',
    color: 'white',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    // left: '100%',
    position: 'absolute',
    top: '10px', // Відступ від верхнього краю
    right: '10px', // Відступ зліва
    zIndex: 999,
  },
};

export default UsersList;
