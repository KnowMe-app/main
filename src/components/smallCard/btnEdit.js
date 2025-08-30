import { CardMenuBtn } from 'components/styles';
import React from 'react';
import { getCacheKey } from '../../utils/cache';
import { normalizeQueryKey, setIdsForQuery } from '../../utils/cardIndex';
import { saveCard } from '../../utils/cardsStorage';

// Use already loaded card data instead of re-fetching from the server
export const btnEdit = (userData, setSearch, setState, isDuplicateView = false) => {
  const handleCardClick = () => {
    if (userData) {
      if (!isDuplicateView) {
        setSearch(`${userData.userId}`);
      }
      setState(userData);
      const cacheKey = getCacheKey('search', normalizeQueryKey(`userId=${userData.userId}`));
      saveCard({ ...userData, id: userData.userId });
      setIdsForQuery(cacheKey, [userData.userId]);
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
