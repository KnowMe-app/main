import React from 'react';

const moreIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="5" cy="12" r="1.8" fill="currentColor" />
    <circle cx="12" cy="12" r="1.8" fill="currentColor" />
    <circle cx="19" cy="12" r="1.8" fill="currentColor" />
  </svg>
);

export const btnMore = (userData, onOpenMore, style = {}, content = moreIcon) => {
  if (!userData?.userId || typeof onOpenMore !== 'function') return null;

  return (
    <button
      type="button"
      style={{ ...styles.moreButton, ...style }}
      aria-label="Більше дій"
      title="Більше дій"
      onClick={e => {
        e.stopPropagation();
        onOpenMore(userData);
      }}
    >
      {content}
    </button>
  );
};

const styles = {
  moreButton: {
    width: '30px',
    height: '30px',
    minHeight: '30px',
    padding: 0,
    backgroundColor: '#1976d2',
    color: 'white',
    border: 'none',
    borderRadius: '9px',
    cursor: 'pointer',
    position: 'static',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 3px 8px rgba(17, 24, 39, 0.25)',
  },
};
