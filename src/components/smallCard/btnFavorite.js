import React from 'react';
import { addFavoriteUser, removeFavoriteUser, auth } from '../config';

export const BtnFavorite = ({ userId, favoriteUsers = {}, setFavoriteUsers }) => {
  const isFavorite = !!favoriteUsers[userId];

  const toggleFavorite = async () => {
    if (!auth.currentUser) {
      alert('Please sign in to manage favorites');
      return;
    }
    if (isFavorite) {
      try {
        await removeFavoriteUser(userId);
        const updated = { ...favoriteUsers };
        delete updated[userId];
        setFavoriteUsers(updated);
      } catch (error) {
        console.error('Failed to remove favorite:', error);
      }
    } else {
      try {
        await addFavoriteUser(userId);
        setFavoriteUsers({ ...favoriteUsers, [userId]: true });
      } catch (error) {
        console.error('Failed to add favorite:', error);
      }
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
      disabled={!auth.currentUser}
      onClick={e => {
        e.stopPropagation();
        toggleFavorite();
      }}
    >
      {isFavorite ? '❤' : '♡'}
    </button>
  );
};
