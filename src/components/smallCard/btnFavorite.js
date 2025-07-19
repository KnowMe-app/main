import React from 'react';
import { addFavoriteUser, removeFavoriteUser, auth } from '../config';
import { color } from '../styles';

export const BtnFavorite = ({ userId, favoriteUsers = {}, setFavoriteUsers, onRemove }) => {
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
        if (onRemove) onRemove(userId);
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
        bottom: '10px',
        right: '10px',
        width: '35px',
        height: '35px',
        borderRadius: '50%',
        background: color.accent5,
        border: `${isFavorite ? 2 : 1}px solid ${
          isFavorite ? color.iconActive : color.iconInactive
        }`,
        color: isFavorite ? color.iconActive : color.iconInactive,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      disabled={!auth.currentUser}
      onClick={e => {
        e.stopPropagation();
        toggleFavorite();
      }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill={isFavorite ? color.iconActive : 'none'}
        stroke={isFavorite ? color.iconActive : color.iconInactive}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 6.5 3.5 5 5.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5 18.5 5 20 6.5 20 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
      </svg>
    </button>
  );
};
