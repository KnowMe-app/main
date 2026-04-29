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
  onDislikeRemoved,
  dislikeUsers = {},
  setDislikeUsers,
  customStyle = {},
  inactiveIconColor = '#fff',
  activeIconColor = color.reactionIdleIcon,
  iconSize = 18,
  title = 'В обране',
  ariaLabel = 'В обране',
}) => {
  const {
    background: customBackground,
    backgroundColor: customBackgroundColor,
    border: customBorder,
    color: customTextColor,
    boxShadow: customBoxShadow,
    ...restCustomStyle
  } = customStyle;
  const isFavorite = !!favoriteUsers[userId];
  const activeColor = color.reactionLike;
  const inactiveOpacity = 0.7;
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
        if (onRemove) onRemove(userId);
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
        opacity: isFavorite ? 1 : inactiveOpacity,
        zIndex: 1,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      title={title}
      aria-label={ariaLabel}
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
