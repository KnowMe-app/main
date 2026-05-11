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
  ownFavoriteUsers,
  setOwnFavoriteUsers,
  onRemove,
  onDislikeRemoved,
  dislikeUsers = {},
  setDislikeUsers,
  ownDislikeUsers,
  setOwnDislikeUsers,
  customStyle = {},
  inactiveIconColor = '#fff',
  activeIconColor = color.reactionIdleIcon,
  iconSize = 18,
  title = 'В обране',
  ariaLabel = 'В обране',
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
  const viewerFavoriteUsers = ownFavoriteUsers || favoriteUsers;
  const updateOwnFavoriteUsers = setOwnFavoriteUsers || setFavoriteUsers;
  const viewerDislikeUsers = ownDislikeUsers || dislikeUsers;
  const updateOwnDislikeUsers = setOwnDislikeUsers || setDislikeUsers;
  const isFavorite = !!viewerFavoriteUsers[userId];
  const isSharedFavorite = !isFavorite && !!favoriteUsers[userId];
  const activeColor = color.reactionLike;
  const resolvedActiveIconColor = activeIconColor || customTextColor || color.reactionIdleIcon;
  const resolvedInactiveIconColor = inactiveIconColor || '#fff';
  const activeBorderColor = '#fff';

  const toggleFavorite = async () => {
    if (!auth.currentUser) {
      alert('Please sign in to manage favorites');
      return;
    }
    if (isFavorite) {
      try {
        await removeFavoriteUser(userId, multiDataOwnerId);
        const updatedOwn = { ...viewerFavoriteUsers };
        delete updatedOwn[userId];
        if (updateOwnFavoriteUsers) updateOwnFavoriteUsers(updatedOwn);
        const updated = { ...favoriteUsers };
        delete updated[userId];
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
        await addFavoriteUser(userId, multiDataOwnerId);
        const updatedOwnFav = { ...viewerFavoriteUsers, [userId]: true };
        if (updateOwnFavoriteUsers) updateOwnFavoriteUsers(updatedOwnFav);
        const updatedFav = { ...favoriteUsers, [userId]: true };
        setFavoriteUsers(updatedFav);
        setFavoriteIds(updatedFav);
        updateCachedUser(userData || { userId });
        setFavorite(userId, true);
        if (onRemove) onRemove(userId);
        if (dislikeUsers[userId] || viewerDislikeUsers[userId]) {
          if (viewerDislikeUsers[userId]) {
            try {
              await removeDislikeUser(userId, multiDataOwnerId);
            } catch (err) {
              console.error('Failed to remove dislike when adding favorite:', err);
            }
          }
          const updatedOwnDislikes = { ...viewerDislikeUsers };
          delete updatedOwnDislikes[userId];
          if (updateOwnDislikeUsers) updateOwnDislikeUsers(updatedOwnDislikes);
          const upd = { ...dislikeUsers };
          delete upd[userId];
          if (setDislikeUsers) setDislikeUsers(upd);
          setDislike(userId, false);
          if (typeof onDislikeRemoved === 'function') {
            await onDislikeRemoved(userId);
          }
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
        ...restCustomStyle,
        background: isFavorite
          ? activeColor
          : customBackground || customBackgroundColor || color.accent5,
        border: isFavorite
          ? `4px solid ${activeBorderColor}`
          : customBorder || `2px solid ${color.reactionIdleBorder}`,
        color: isFavorite ? resolvedActiveIconColor : resolvedInactiveIconColor,
        boxShadow: isFavorite
          ? `0 0 0 2px ${activeColor}`
          : customBoxShadow || 'none',
        opacity: 1,
        zIndex: 1,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      title={isSharedFavorite ? `${title} (shared)` : title}
      aria-label={ariaLabel}
      aria-pressed={isFavorite}
      data-shared-favorite={isSharedFavorite ? 'true' : undefined}
      disabled={!auth.currentUser}
      onClick={e => {
        e.stopPropagation();
        toggleFavorite();
      }}
    >
      {isFavorite ? (
        <FaHeart size={iconSize} color={resolvedActiveIconColor} />
      ) : (
        <FaRegHeart size={iconSize} color={resolvedInactiveIconColor} />
      )}
    </button>
  );
};
