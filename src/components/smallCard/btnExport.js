import { saveToContact } from 'components/ExportContact';
import { CardMenuBtn } from 'components/styles';

export const btnExport = userData => (
  <CardMenuBtn
    style={{
      backgroundColor: 'green',
      position: 'static',
    }}
    onClick={e => {
      e.stopPropagation(); // Запобігаємо активації кліку картки
      saveToContact(userData);
    }}
  >
    save
  </CardMenuBtn>
);