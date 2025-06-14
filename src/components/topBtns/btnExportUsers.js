import React from 'react';
import { OrangeBtn } from 'components/styles';

export const btnExportUsers = onExport => {
  return (
    <OrangeBtn onClick={onExport}>
      Save
    </OrangeBtn>
  );
};
