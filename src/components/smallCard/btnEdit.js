import { fetchUserById } from 'components/config';
import { CardMenuBtn } from 'components/styles';
import React from 'react';

export const btnEdit = (userId, setSearch, setState) => {
  const handleCardClick = async () => {
    const userData = await fetchUserById(userId);
    if (userData) {
      console.log('Дані знайденого користувача: ', userData);
      setSearch(`${userData.userId}`);
      setState(userData);
    } else {
      console.log('Користувача не знайдено.');
    }
  };

  return (
    <CardMenuBtn
      onClick={e => {
        e.stopPropagation(); // Запобігаємо активації кліку картки
        handleCardClick();
      }}
    >
      edit
    </CardMenuBtn>
  );
};
