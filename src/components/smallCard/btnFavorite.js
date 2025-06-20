import React, { useEffect, useState } from 'react';

export const BtnFavorite = ({ userId }) => {
  const [isFavorite, setIsFavorite] = useState(false);

  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem('favoriteUsers') || '{}');
    setIsFavorite(!!stored[userId]);
  }, [userId]);

  const toggleFavorite = () => {
    const stored = JSON.parse(localStorage.getItem('favoriteUsers') || '{}');
    if (stored[userId]) {
      delete stored[userId];
      setIsFavorite(false);
    } else {
      stored[userId] = true;
      setIsFavorite(true);
    }
    localStorage.setItem('favoriteUsers', JSON.stringify(stored));
  };

  return (
    <button
      style={{
        position: 'absolute',
        top: '10px',
        right: '50px',
        width: '35px',
        height: '35px',
        borderRadius: '50%',
        background: 'white',
        border: `2px solid ${isFavorite ? 'red' : 'gray'}`,
        color: isFavorite ? 'red' : 'gray',
        cursor: 'pointer',
      }}
      onClick={e => {
        e.stopPropagation();
        toggleFavorite();
      }}
    >
      {isFavorite ? '❤' : '♡'}
    </button>
  );
};
