import React from 'react';
import {
  addFavoriteUser,
  removeFavoriteUser,
  removeDislikeUser,
  auth,
} from '../config';
import { color } from '../styles';
import { updateCachedUser, setFavoriteIds } from 'utils/cache';
import { setFavorite } from 'utils/favoritesStorage';
import { setDislike } from 'utils/dislikesStorage';
import { FaHeart, FaRegHeart } from 'react-icons/fa';

export const BtnFavorite = ({
  userId,
  userData = {},
  favoriteUsers = {},
  setFavoriteUsers,
  onRemove,
  dislikeUsers = {},
  setDislikeUsers,
}) => {
  const isFavorite = !!favoriteUsers[userId];

  const toggleFavorite = async () => {
    if (!auth.currentUser) {
      alert('Please sign in to manage favorites');
      return;
    }
    if (isFavorite) {
      try {
        await removeFavoriteUser(userId);
        const updated = { ...favoriteUsers, [userId]: false };
        setFavoriteUsers(updated);
        setFavoriteIds(Object.fromEntries(Object.entries(updated).filter(([, v]) => v)));
        updateCachedUser(userData || { userId }, { removeFavorite: true });
        setFavorite(userId, false);
        if (onRemove) onRemove(userId);
      } catch (error) {
        console.error('Failed to remove favorite:', error);
      }
    } else {
      try {
        await addFavoriteUser(userId);
        const updatedFav = { ...favoriteUsers, [userId]: true };
        setFavoriteUsers(updatedFav);
        setFavoriteIds(updatedFav);
        updateCachedUser(userData || { userId });
        setFavorite(userId, true);
        if (dislikeUsers[userId]) {
          try {
            await removeDislikeUser(userId);
          } catch (err) {
            console.error('Failed to remove dislike when adding favorite:', err);
          }
          const upd = { ...dislikeUsers };
          delete upd[userId];
          if (setDislikeUsers) setDislikeUsers(upd);
          setDislike(userId, false);
          if (onRemove) onRemove(userId);
        }
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
        border: `${isFavorite ? 2 : 2}px solid ${
          isFavorite ? color.iconInactive : color.white
        }`,
        color: isFavorite ? color.iconInactive : color.white,
        zIndex: 1,
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
      {isFavorite ? (
        <FaHeart size={18} color={color.iconInactive} />
      ) : (
        <FaRegHeart size={18} color={color.white} />
      )}
    </button>
  );
};
