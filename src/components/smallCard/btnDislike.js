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
import { FaThumbsDown } from 'react-icons/fa';

// The dislike write path, shared by the card's round button and the list row's
// swipe gesture so both go through the same Firebase calls, the same local
// caches and the same "adding a dislike clears an existing favourite" rule.
export const toggleDislikeUser = async ({
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
  multiDataOwnerId,
  cacheUserData = true,
}) => {
  if (!auth.currentUser) {
    alert('Please sign in to manage dislikes');
    return;
  }
  const viewerDislikeUsers = ownDislikeUsers || dislikeUsers;
  const updateOwnDislikeUsers = setOwnDislikeUsers || setDislikeUsers;
  const viewerFavoriteUsers = ownFavoriteUsers || favoriteUsers;
  const updateOwnFavoriteUsers = setOwnFavoriteUsers || setFavoriteUsers;
  const isDisliked = !!viewerDislikeUsers[userId];

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
    return;
  }

  try {
    await addDislikeUser(userId, multiDataOwnerId);
    const updatedOwn = { ...viewerDislikeUsers, [userId]: true };
    if (updateOwnDislikeUsers) updateOwnDislikeUsers(updatedOwn);
    const updated = { ...dislikeUsers, [userId]: true };
    setDislikeUsers(updated);
    setDislike(userId, true);
    if (cacheUserData) cacheDislikedUsers({ [userId]: userData });
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
};

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
  activeBorderWidth = 4,
  activeBoxShadowWidth = 2,
  title = 'Дизлайк',
  ariaLabel = 'Дизлайк',
  multiDataOwnerId,
  cacheUserData = true,
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
  const isDisliked = !!viewerDislikeUsers[userId];
  const isSharedDisliked = !isDisliked && !!dislikeUsers[userId];
  const activeColor = color.reactionDislike;
  const resolvedActiveIconColor = activeIconColor || customTextColor || color.reactionIdleIcon;
  const resolvedInactiveIconColor = inactiveIconColor || '#fff';
  const activeBorderColor = '#fff';

  const toggleDislike = () => toggleDislikeUser({
    userId,
    userData,
    dislikeUsers,
    setDislikeUsers,
    ownDislikeUsers,
    setOwnDislikeUsers,
    onDislikeAdded,
    onDislikeRemoved,
    onRemove,
    favoriteUsers,
    setFavoriteUsers,
    ownFavoriteUsers,
    setOwnFavoriteUsers,
    multiDataOwnerId,
    cacheUserData,
  });

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
          ? `${activeBorderWidth}px solid ${activeBorderColor}`
          : customBorder || `2px solid ${color.reactionIdleBorder}`,
        color: isDisliked ? resolvedActiveIconColor : resolvedInactiveIconColor,
        boxShadow: isDisliked
          ? `0 0 0 ${activeBoxShadowWidth}px ${activeColor}`
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
      <FaThumbsDown size={iconSize} color={isDisliked ? resolvedActiveIconColor : resolvedInactiveIconColor} />
    </button>
  );
};
