import React from 'react';
import {
  addDislikeUser,
  removeDislikeUser,
  removeFavoriteUser,
  auth,
} from '../config';
import { color } from '../styles';
import { setDislike, cacheDislikedUsers } from 'utils/dislikesStorage';
import { setFavorite } from 'utils/favoritesStorage';
import { removeCardFromList } from 'utils/cardsStorage';
import { FaTimes } from 'react-icons/fa';

const getReactionButtonStyle = isActive => ({
  position: 'absolute',
  bottom: '10px',
  width: '35px',
  height: '35px',
  borderRadius: '50%',
  background: isActive ? color.white : color.accent5,
  border: `2px solid ${isActive ? color.accent5 : 'rgba(255, 255, 255, 0.92)'}`,
  boxShadow: isActive
    ? '0 0 0 2px rgba(255, 140, 0, 0.45), 0 8px 18px rgba(0, 0, 0, 0.35)'
    : '0 4px 12px rgba(0, 0, 0, 0.28)',
  color: isActive ? color.iconActive : color.white,
  zIndex: 1,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transform: isActive ? 'scale(1.06)' : 'scale(1)',
  transition: 'background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease',
});

export const BtnDislike = ({
  userId,
  userData = {},
  dislikeUsers = {},
  setDislikeUsers,
  onRemove,
  favoriteUsers = {},
  setFavoriteUsers,
}) => {
  const isDisliked = !!dislikeUsers[userId];

  const toggleDislike = async () => {
    if (!auth.currentUser) {
      alert('Please sign in to manage dislikes');
      return;
    }
    if (isDisliked) {
      try {
        await removeDislikeUser(userId);
        const updated = { ...dislikeUsers };
        delete updated[userId];
        setDislikeUsers(updated);
        setDislike(userId, false);
        removeCardFromList(userId, 'dislike');
        if (onRemove) onRemove(userId);
      } catch (error) {
        console.error('Failed to remove dislike:', error);
      }
    } else {
      try {
        await addDislikeUser(userId);
        const updated = { ...dislikeUsers, [userId]: true };
        setDislikeUsers(updated);
        setDislike(userId, true);
        cacheDislikedUsers({ [userId]: userData });
        if (favoriteUsers[userId]) {
          try {
            await removeFavoriteUser(userId);
          } catch (err) {
            console.error('Failed to remove favorite when adding dislike:', err);
          }
          const upd = { ...favoriteUsers };
          delete upd[userId];
          if (setFavoriteUsers) setFavoriteUsers(upd);
          setFavorite(userId, false);
          if (onRemove) onRemove(userId);
        } else if (onRemove) {
          onRemove(userId);
        }
      } catch (error) {
        console.error('Failed to add dislike:', error);
      }
    }
  };

  return (
    <button
      style={{
        ...getReactionButtonStyle(isDisliked),
        left: '10px',
      }}
      disabled={!auth.currentUser}
      onClick={e => {
        e.stopPropagation();
        toggleDislike();
      }}
    >
      <FaTimes size={18} color={isDisliked ? color.iconActive : color.white} />
    </button>
  );
};
