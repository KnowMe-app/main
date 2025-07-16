import React from 'react';
import { addDislikeUser, removeDislikeUser, auth } from '../config';

export const BtnDislike = ({
  userId,
  dislikeUsers = {},
  setDislikeUsers,
  style = {},
  onToggle,
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
      } catch (error) {
        console.error('Failed to remove dislike:', error);
      }
    } else {
      try {
        await addDislikeUser(userId);
        setDislikeUsers({ ...dislikeUsers, [userId]: true });
      } catch (error) {
        console.error('Failed to add dislike:', error);
      }
    }
    if (onToggle) onToggle(!isDisliked);
  };

  return (
    <button
      style={{
        position: 'absolute',
        top: '10px',
        right: '10px',
        width: '35px',
        height: '35px',
        borderRadius: '50%',
        background: 'white',
        border: `2px solid ${isDisliked ? 'blue' : 'gray'}`,
        color: isDisliked ? 'blue' : 'gray',
        cursor: 'pointer',
        ...style,
      }}
      disabled={!auth.currentUser}
      onClick={e => {
        e.stopPropagation();
        toggleDislike();
      }}
    >
      {isDisliked ? '👎' : '👍'}
    </button>
  );
};
