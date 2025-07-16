import React from 'react';
import { addDislikeUser, removeDislikeUser, auth } from '../config';

export const BtnDislike = ({ userId, dislikeUsers = {}, setDislikeUsers, onRemove }) => {
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
        if (onRemove) onRemove(userId);
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
        background: 'white',
        border: `2px solid ${isDisliked ? 'blue' : 'gray'}`,
        color: isDisliked ? 'blue' : 'gray',
        cursor: 'pointer',
      }}
      disabled={!auth.currentUser}
      onClick={e => {
        e.stopPropagation();
        toggleDislike();
      }}
    >
      {'👎'}
    </button>
  );
};
