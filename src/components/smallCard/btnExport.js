import React from 'react';
import { saveToContact } from 'components/ExportContact';
import { CardMenuBtn } from 'components/styles';

const saveIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M6 4h9l3 3v13H6V4z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    <path d="M9 4v6h6V4" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    <path d="M9 17h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const btnExport = (userData, style = {}, content = saveIcon) => (
  <CardMenuBtn
    type="button"
    style={{
      backgroundColor: 'green',
      position: 'static',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      ...style,
    }}
    aria-label="Зберегти контакт"
    title="Зберегти контакт"
    onClick={e => {
      e.stopPropagation(); // Запобігаємо активації кліку картки
      saveToContact(userData);
    }}
  >
    {content}
  </CardMenuBtn>
);
