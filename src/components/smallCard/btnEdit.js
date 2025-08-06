import { CardMenuBtn } from 'components/styles';
import React from 'react';

// Use already loaded card data instead of re-fetching from the server
export const btnEdit = (userData, setSearch, setState) => {
  const handleCardClick = () => {
    if (userData) {
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
