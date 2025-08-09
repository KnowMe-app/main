import React from 'react';
import {
  addDislikeUser,
  removeDislikeUser,
  removeFavoriteUser,
  auth,
} from '../config';
import { color } from '../styles';

export const BtnDislike = ({
  userId,
  dislikeUsers = {},
  setDislikeUsers = () => {},
  onRemove,
  onAdd,
  favoriteUsers = {},
  setFavoriteUsers = () => {},
  style = {},
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
        if (onRemove) onRemove(userId);
      } catch (error) {
        console.error('Failed to remove dislike:', error);
      }
    } else {
      try {
        await addDislikeUser(userId);
        setDislikeUsers({ ...dislikeUsers, [userId]: true });
        if (onAdd) onAdd(userId);
        if (favoriteUsers[userId]) {
          try {
            await removeFavoriteUser(userId);
          } catch (err) {
            console.error('Failed to remove favorite when adding dislike:', err);
          }
          const upd = { ...favoriteUsers };
          delete upd[userId];
          if (setFavoriteUsers) setFavoriteUsers(upd);
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
        background: color.accent5,
        border: `${isDisliked ? 2 : 1}px solid ${
          isDisliked ? color.iconActive : color.iconInactive
        }`,
        color: isDisliked ? color.iconActive : color.iconInactive,
        zIndex: 1,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...style,
      }}
      disabled={!auth.currentUser}
      onClick={e => {
        e.stopPropagation();
        toggleDislike();
      }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill={isDisliked ? color.iconActive : 'none'}
        stroke={isDisliked ? color.iconActive : color.iconInactive}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  );
};
