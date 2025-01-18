import { saveToContact } from 'components/ExportContact';
import { CardMenuBtn } from 'components/styles';

export const btnExport = userData => (
  <CardMenuBtn
    style={{
      backgroundColor: 'green',
      top: '10px',
      right: '10px',
    }}
    onClick={e => {
      e.stopPropagation(); // Запобігаємо активації кліку картки
      saveToContact(userData);
    }}
  >
    save
  </CardMenuBtn>
);