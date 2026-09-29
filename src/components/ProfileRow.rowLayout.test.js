import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
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
      clientComment: 'Дзвонила в понеділок',
      primaryAction: { icon: <span>♥</span>, title: 'В обране', accent: true, active: false, onClick: jest.fn() },
      secondaryAction: { icon: <span>✕</span>, title: 'Не цікаво', active: false, onClick: jest.fn() },
    });

    const note = screen.getByDisplayValue('Дзвонила в понеділок');
    const favorite = screen.getByTitle('В обране');
    const hide = screen.getByTitle('Не цікаво');

    // Обидві реакції стоять в одному ряду — тобто на одній висоті, — і нижче
    // за поле нотатки. Саме порядок і спільний ряд тут і перевіряються.
    expect(favorite.getBoundingClientRect().top).toBe(hide.getBoundingClientRect().top);
    expect(note.compareDocumentPosition(favorite))
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  // Порожні доріжки згорнуті в один рядок: шістдесят порожніх полів на
  // сторінку робили кожну картку довшою за екран. Записане видно одразу.
  it('порожні доріжки згорнуті в рядок «+ Відгук · + Памʼятка»', () => {
    renderRow();
    expect(screen.getByTestId('notes-add-row')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Додати памʼятку')).not.toBeInTheDocument();
    expect(screen.queryByTestId('public-note-lane')).not.toBeInTheDocument();
  });

  it('дотик до «+ Памʼятка» відкриває порожнє поле під тим самим підписом, що й у відкритій картці', () => {
    renderRow();
    fireEvent.click(screen.getByRole('button', { name: /Памʼятка/ }));
    expect(screen.getByPlaceholderText('Додати памʼятку')).toHaveValue('');
    // Підпис береться з того самого словника, що й у відкритій картці
    // (`profileTexts`), а не з рядка в коді, — тож іде мовою інтерфейсу.
    expect(screen.getByText('Памʼятка для себе')).toBeInTheDocument();
    expect(screen.queryByText('Бачите тільки ви')).not.toBeInTheDocument();
  });

  it('записана памʼятка видна без дотику', () => {
    renderRow({ clientComment: 'Дзвонила в понеділок' });
    expect(screen.getByDisplayValue('Дзвонила в понеділок')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Відгук/ })).toBeInTheDocument();
  });

  it('урізаній проєкції реакцій не дає', () => {
    renderRow({
      user: { ...card, __limitedProfile: true },
      primaryAction: { icon: <span>♥</span>, title: 'В обране', active: false, onClick: jest.fn() },
    });
    expect(screen.queryByTitle('В обране')).not.toBeInTheDocument();
  });
});
