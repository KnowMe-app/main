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

export const BtnDislike = ({
  userId,
  userData = {},
  dislikeUsers = {},
  setDislikeUsers,
  onRemove,
  favoriteUsers = {},
  setFavoriteUsers,
  customStyle = {},
  iconSize = 18,
  title = 'Дизлайк',
  ariaLabel = 'Дизлайк',
}) => {
  const isDisliked = !!dislikeUsers[userId];
  const activeColor = color.reactionDislike;
  const inactiveOpacity = 0.7;

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
        position: 'absolute',
        bottom: '10px',
        left: '10px',
        width: '35px',
        height: '35px',
        borderRadius: '50%',
        background: isDisliked ? color.reactionDislikeBg : color.accent5,
        border: `2px solid ${isDisliked ? activeColor : color.reactionIdleBorder}`,
        color: isDisliked ? activeColor : color.reactionIdleIcon,
        opacity: isDisliked ? 1 : inactiveOpacity,
        zIndex: 1,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...customStyle,
      }}
      title={title}
      aria-label={ariaLabel}
      disabled={!auth.currentUser}
      onClick={e => {
        e.stopPropagation();
        toggleDislike();
      }}
    >
      <FaTimes size={iconSize} color={isDisliked ? activeColor : color.reactionIdleIcon} />
    </button>
  );
};
