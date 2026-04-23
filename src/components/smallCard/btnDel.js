import { CardMenuBtn } from 'components/styles';
import React from 'react';

export const btnDel = (
  userData,
  setShowInfoModal,
  setUserIdToDelete,
  isFromListOfUsers = false,
  content = 'del',
  customStyle = {},
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
