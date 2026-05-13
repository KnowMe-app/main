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
  ownDislikeUsers,
  setOwnDislikeUsers,
  onDislikeAdded,
  onDislikeRemoved,
  onRemove,
  favoriteUsers = {},
  setFavoriteUsers,
  ownFavoriteUsers,
  setOwnFavoriteUsers,
  customStyle = {},
  inactiveIconColor = '#fff',
  activeIconColor = color.reactionIdleIcon,
  iconSize = 18,
  title = 'Дизлайк',
  ariaLabel = 'Дизлайк',
  multiDataOwnerId,
}) => {
  const {
    background: customBackground,
    backgroundColor: customBackgroundColor,
    border: customBorder,
    color: customTextColor,
    boxShadow: customBoxShadow,
    ...restCustomStyle
  } = customStyle;
  const viewerDislikeUsers = ownDislikeUsers || dislikeUsers;
  const updateOwnDislikeUsers = setOwnDislikeUsers || setDislikeUsers;
  const viewerFavoriteUsers = ownFavoriteUsers || favoriteUsers;
  const updateOwnFavoriteUsers = setOwnFavoriteUsers || setFavoriteUsers;
  const isDisliked = !!viewerDislikeUsers[userId];
  const isSharedDisliked = !isDisliked && !!dislikeUsers[userId];
  const activeColor = color.reactionDislike;
  const resolvedActiveIconColor = activeIconColor || customTextColor || color.reactionIdleIcon;
  const resolvedInactiveIconColor = inactiveIconColor || '#fff';
  const activeBorderColor = '#fff';

  const toggleDislike = async () => {
    if (!auth.currentUser) {
      alert('Please sign in to manage dislikes');
      return;
    }
    if (isDisliked) {
      try {
        await removeDislikeUser(userId, multiDataOwnerId);
        const updatedOwn = { ...viewerDislikeUsers };
        delete updatedOwn[userId];
        if (updateOwnDislikeUsers) updateOwnDislikeUsers(updatedOwn);
        const updated = { ...dislikeUsers };
        delete updated[userId];
        setDislikeUsers(updated);
        setDislike(userId, false);
        removeCardFromList(userId, 'dislike');
        if (typeof onDislikeRemoved === 'function') {
          await onDislikeRemoved(userId);
        }
        if (onRemove) onRemove(userId);
      } catch (error) {
        console.error('Failed to remove dislike:', error);
      }
    } else {
      try {
        await addDislikeUser(userId, multiDataOwnerId);
        const updatedOwn = { ...viewerDislikeUsers, [userId]: true };
        if (updateOwnDislikeUsers) updateOwnDislikeUsers(updatedOwn);
        const updated = { ...dislikeUsers, [userId]: true };
        setDislikeUsers(updated);
        setDislike(userId, true);
        cacheDislikedUsers({ [userId]: userData });
        if (typeof onDislikeAdded === 'function') {
          await onDislikeAdded(userId);
        }
        if (favoriteUsers[userId] || viewerFavoriteUsers[userId]) {
          if (viewerFavoriteUsers[userId]) {
            try {
              await removeFavoriteUser(userId, multiDataOwnerId);
            } catch (err) {
              console.error('Failed to remove favorite when adding dislike:', err);
            }
          }
          const updatedOwnFavorites = { ...viewerFavoriteUsers };
          delete updatedOwnFavorites[userId];
          if (updateOwnFavoriteUsers) updateOwnFavoriteUsers(updatedOwnFavorites);
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
        ...restCustomStyle,
        background: isDisliked
          ? activeColor
          : customBackground || customBackgroundColor || color.accent5,
        border: isDisliked
          ? `4px solid ${activeBorderColor}`
          : customBorder || `2px solid ${color.reactionIdleBorder}`,
        color: isDisliked ? resolvedActiveIconColor : resolvedInactiveIconColor,
        boxShadow: isDisliked
          ? `0 0 0 2px ${activeColor}`
          : customBoxShadow || 'none',
        opacity: 1,
        zIndex: 1,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      title={isSharedDisliked ? `${title} (shared)` : title}
      aria-label={ariaLabel}
      aria-pressed={isDisliked}
      data-shared-disliked={isSharedDisliked ? 'true' : undefined}
      disabled={!auth.currentUser}
      onClick={e => {
        e.stopPropagation();
        toggleDislike();
      }}
    >
      <FaTimes size={iconSize} color={isDisliked ? resolvedActiveIconColor : resolvedInactiveIconColor} />
    </button>
  );
};
