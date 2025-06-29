import { fetchUserById } from 'components/config';
import { CardMenuBtn } from 'components/styles';
import React from 'react';

export const btnEdit = (userId, setSearch, setState) => {
  const handleCardClick = async () => {
    const { existingData } = await fetchUserById(userId);
    if (existingData) {
      console.log('Дані знайденого користувача: ', existingData);
      setSearch(`id: ${existingData.userId}`);
      setState(existingData);
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
