import React from 'react';
import { saveToContact } from 'components/ExportContact';
import { OrangeBtn } from 'components/styles';

export const btnExportUsers = users => {
  return (
    <OrangeBtn
      onClick={() => {
        saveToContact(users);
      }}
    >
      Export Users
    </OrangeBtn>
  );
};
