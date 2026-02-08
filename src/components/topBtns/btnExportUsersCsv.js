import React from 'react';
import { OrangeBtn } from 'components/styles';

export const btnExportUsersCsv = onExport => {
  return (
    <OrangeBtn onClick={onExport}>
      SaveCSV
    </OrangeBtn>
  );
};
