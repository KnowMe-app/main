import { fetchUserById } from 'components/config';
import { CardMenuBtn } from 'components/styles';
import React, { useState } from 'react';
import { RotatingLines } from 'react-loader-spinner';

export const btnEdit = (userId, setSearch, setState) => {
  const [loading, setLoading] = useState(false);

  const handleCardClick = async () => {
    setLoading(true);
    const userData = await fetchUserById(userId);
    setLoading(false);
    if (userData) {
      console.log('Дані знайденого користувача: ', userData);
      setSearch(`id: ${userData.userId}`);
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
      disabled={loading}
    >
      {loading ? (
        <RotatingLines width="18" strokeColor="white" />
      ) : (
        'edit'
      )}
    </CardMenuBtn>
  );
};
