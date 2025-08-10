import { CardMenuBtn } from 'components/styles';
import React from 'react';
import { createCache } from '../../hooks/cardsCache';

const { saveCache: saveSearchCache } = createCache('searchResults');

// Use already loaded card data instead of re-fetching from the server
export const btnEdit = (userData, setSearch, setState) => {
  const handleCardClick = () => {
    if (userData) {
      setSearch(`${userData.userId}`);
      setState(userData);
      saveSearchCache(JSON.stringify({ userId: userData.userId }), userData);
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
