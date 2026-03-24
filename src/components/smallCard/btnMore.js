import React from 'react';

export const btnMore = (userData, onOpenMore, style = {}) => {
  if (!userData?.userId || typeof onOpenMore !== 'function') return null;

  return (
    <button
      style={{ ...styles.moreButton, ...style }}
      onClick={e => {
        e.stopPropagation();
        onOpenMore(userData);
      }}
    >
      more
    </button>
  );
};

const styles = {
  moreButton: {
    padding: '3px 6px',
    backgroundColor: '#1976d2',
    color: 'white',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    position: 'static',
  },
};
