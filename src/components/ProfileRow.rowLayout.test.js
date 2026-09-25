import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import ProfileRow from './ProfileRow';
import { applyUkrainianInterface } from '../testUtils/interfaceLanguage';

const card = {
  userId: 'ID0002',
  name: 'Оксана',
  city: 'Черкаси',
  height: '168',
  weight: '54',
};

const renderRow = (props = {}) => render(
  <ProfileRow
    user={card}
    isAdmin={false}
    expanded={false}
    onToggleExpand={jest.fn()}
    onOpen={jest.fn()}
    onCommentSave={jest.fn()}
    clientComment=""
    {...props}
  />
);

// Реакції стоять після всього, що картка каже про людину, і після власної
// нотатки: спершу рішення, потім жест. У стовпчику праворуч вони тиснулись
// раніше, ніж читач устигав дочитати рядок.
// Ці перевірки описують український бік екрана — мову задаємо явно.
applyUkrainianInterface();

describe('розкладка рядка стрічки', () => {
  it('тримає реакції нижче за нотатку, в одному ряду', () => {
    renderRow({
      primaryAction: { icon: <span>♥</span>, title: 'В обране', accent: true, active: false, onClick: jest.fn() },
      secondaryAction: { icon: <span>✕</span>, title: 'Приховати', active: false, onClick: jest.fn() },
    });

    const note = screen.getByPlaceholderText('Додати памʼятку');
    const favorite = screen.getByTitle('В обране');
    const hide = screen.getByTitle('Приховати');

    // Обидві реакції стоять в одному ряду — тобто на одній висоті, — і нижче
    // за поле нотатки. Саме порядок і спільний ряд тут і перевіряються.
    expect(favorite.getBoundingClientRect().top).toBe(hide.getBoundingClientRect().top);
    expect(note.compareDocumentPosition(favorite))
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  // Поле нотатки стоїть відкритим: читач гортає список, аби вирішити, і те,
  // що він про цю людину вже знає, має бути видно тут само, де рішення.
  it('поле власної нотатки відкрите й порожнє, поки нотатки немає', () => {
    renderRow();
    expect(screen.getByPlaceholderText('Додати памʼятку')).toHaveValue('');
  });

  // Хто побачить запис, каже підпис над доріжкою — той самий, що й у
  // відкритій картці. Поки його не було, порожнє поле казало «Додати
  // коментар» і про видимість мовчало.
  it('підписує доріжку власної нотатки так само, як відкрита картка', () => {
    renderRow();
    // Підпис береться з того самого словника, що й у відкритій картці
    // (`profileTexts`), а не з рядка в коді, — тож іде мовою інтерфейсу.
    expect(screen.getByText('Памʼятка для себе')).toBeInTheDocument();
    expect(screen.queryByText('Бачите тільки ви')).not.toBeInTheDocument();
  });

  it('урізаній проєкції реакцій не дає', () => {
    renderRow({
      user: { ...card, __limitedProfile: true },
      primaryAction: { icon: <span>♥</span>, title: 'В обране', active: false, onClick: jest.fn() },
    });
    expect(screen.queryByTitle('В обране')).not.toBeInTheDocument();
  });
});
