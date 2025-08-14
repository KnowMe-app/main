import React from 'react';
import { color } from '../styles';

export const BtnToast = ({ isToastOn, setIsToastOn }) => {
  const toggle = () => setIsToastOn(prev => !prev);

  return (
    <button
      style={{
        position: 'absolute',
        top: '74px',
        right: '10px',
        width: '35px',
        height: '35px',
        borderRadius: '50%',
        background: color.accent5,
        border: `${isToastOn ? 2 : 1}px solid ${
          isToastOn ? color.iconActive : color.iconInactive
        }`,
        color: isToastOn ? color.iconActive : color.iconInactive,
        zIndex: 1,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={e => {
        e.stopPropagation();
        toggle();
      }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill={isToastOn ? color.iconActive : 'none'}
        stroke={isToastOn ? color.iconActive : color.iconInactive}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 7h16a2 2 0 012 2v9a2 2 0 01-2 2H4a2 2 0 01-2-2V9a2 2 0 012-2z" />
        <path d="M4 7a4 4 0 018-2 4 4 0 018 2" />
      </svg>
    </button>
  );
};
