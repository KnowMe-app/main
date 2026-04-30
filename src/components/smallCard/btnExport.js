import { saveToContact } from 'components/ExportContact';
import { CardMenuBtn } from 'components/styles';

export const btnExport = userData => (
  <CardMenuBtn
    style={{
      backgroundColor: '#1b5e20',
      position: 'static',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '28px',
      height: '28px',
      borderRadius: '8px',
      padding: 0,
      fontSize: '10px',
      color: '#a5d6a7',
    }}
    onClick={e => {
      e.stopPropagation(); // Запобігаємо активації кліку картки
      saveToContact(userData);
    }}
    aria-label="Зберегти контакт"
    title="Зберегти контакт"
  >
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 16l-4-4h2.5V4h3v8H16l-4 4z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
      <path d="M4 18h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  </CardMenuBtn>
);
