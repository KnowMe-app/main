import { CardMenuBtn } from 'components/styles';
import React from 'react';

export const btnDel = (
  userData,
  setShowInfoModal,
  setUserIdToDelete,
  isFromListOfUsers,
) => (
  <CardMenuBtn
    style={{
      backgroundColor: 'red',
      top: '42px',
    }}
    onClick={e => {
      e.stopPropagation(); // Запобігаємо активації кліку картки
      if (isFromListOfUsers === 'isFromListOfUsers') {
        setUserIdToDelete(userData.userId);
      }
      setShowInfoModal('delConfirm');
    }}
  >
    del
  </CardMenuBtn>
);
