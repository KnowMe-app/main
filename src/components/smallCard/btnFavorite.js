import React from 'react';
import { addFavoriteUser, removeFavoriteUser } from '../config';

export const BtnFavorite = ({ userId, favoriteUsers = {}, setFavoriteUsers }) => {
  const isFavorite = !!favoriteUsers[userId];

  const toggleFavorite = async () => {
    if (isFavorite) {
      await removeFavoriteUser(userId);
      const updated = { ...favoriteUsers };
      delete updated[userId];
      setFavoriteUsers(updated);
    } else {
      await addFavoriteUser(userId);
      setFavoriteUsers({ ...favoriteUsers, [userId]: true });
    }
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
