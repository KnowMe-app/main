import { CardMenuBtn } from 'components/styles';
import React from 'react';

export const btnDel = (
  userData,
  setShowInfoModal,
  setUserIdToDelete,
  isFromListOfUsers = false,
  content = 'del',
  customStyle = {},
  ariaLabel = 'Видалити',
  title = 'Видалити',
) => (
  <CardMenuBtn
    style={{
      backgroundColor: 'red',
      position: 'static',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      ...customStyle,
    }}
    aria-label={ariaLabel}
    title={title}
    onClick={e => {
      e.stopPropagation(); // Запобігаємо активації кліку картки
      if (isFromListOfUsers) {
        setUserIdToDelete(userData.userId);
      }
      setShowInfoModal('delConfirm');
    }}
  >
    {content}
  </CardMenuBtn>
);
