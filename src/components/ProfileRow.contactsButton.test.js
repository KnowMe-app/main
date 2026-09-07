import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import ProfileRow from './ProfileRow';

// Картка стрічки — це проєкція `matchingCards`, і контактів у ній немає: вони
// живуть в окремому вузлі за межею приватності. Кнопка контактів тому нічого
// не читає наперед — вона просто є, а читання (і всі перевірки права на нього)
// починається з дотику.
const feedCard = {
  userId: 'ID0001',
  name: 'Оксана',
  birth: '15.01.1996',
  city: 'Черкаси',
  height: '168',
  weight: '54',
  __matchingSummary: true,
};

const hydratedCard = {
  ...feedCard,
  phone: '380501112233',
  telegram: 'oksana',
};

const renderRow = (user, props = {}) => render(
  <ProfileRow
    user={user}
    isAdmin={false}
    expanded={false}
    onToggleExpand={jest.fn()}
    onOpen={jest.fn()}
    onCommentSave={jest.fn()}
    clientComment=""
    {...props}
  />
);

describe('кнопка контактів у рядку стрічки', () => {
  it('малюється без жодного читання і мовчить, поки її не натиснули', () => {
    const onRequestContacts = jest.fn();
    renderRow(feedCard, { onRequestContacts });

    expect(screen.getByTitle('Контакти')).toBeInTheDocument();
    expect(onRequestContacts).not.toHaveBeenCalled();
    expect(screen.queryByText('Шукаємо контакти…')).not.toBeInTheDocument();
  });

  // Свого прапорця «уже просили» рядок не тримає: дедуплікацією відає той, хто
  // читає анкету, і він же знімає позначку, коли читання впало. Інакше кнопка
  // ставала б мертвою рівно після невдалої спроби.
  it('просить анкету на кожне відкриття, а не один раз назавжди', () => {
    const onRequestContacts = jest.fn();
    const onContactsOpened = jest.fn();
    renderRow(feedCard, { onRequestContacts, onContactsOpened });

    const button = screen.getByTitle('Контакти');
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);

    expect(onRequestContacts).toHaveBeenCalledTimes(2);
    expect(onRequestContacts).toHaveBeenCalledWith(feedCard);
    expect(onContactsOpened).toHaveBeenCalledTimes(2);
  });

  it('поки читання триває, каже про це, а не вдає, що контактів немає', () => {
    renderRow(feedCard, { onRequestContacts: jest.fn(), contactsLoading: true });
    fireEvent.click(screen.getByTitle('Контакти'));

    expect(screen.getByText('Шукаємо контакти…')).toBeInTheDocument();
  });

  it('показує контакти, щойно анкета доїхала', () => {
    renderRow(hydratedCard, { onRequestContacts: jest.fn() });
    fireEvent.click(screen.getByTitle('Контакти'));

    expect(screen.getByText('oksana')).toBeInTheDocument();
    expect(screen.queryByText('Шукаємо контакти…')).not.toBeInTheDocument();
  });

  it('коли читання скінчилось і контактів немає — каже саме це', () => {
    renderRow(feedCard, { onRequestContacts: jest.fn(), contactsLoading: false });
    fireEvent.click(screen.getByTitle('Контакти'));

    expect(screen.getByText('Контактів немає або вони закриті')).toBeInTheDocument();
  });

  it('урізаній проєкції кнопки не дає: читати за неї нема чого', () => {
    renderRow({ ...feedCard, __limitedProfile: true }, { onRequestContacts: jest.fn() });
    expect(screen.queryByTitle('Контакти')).not.toBeInTheDocument();
  });

  it('без обробника кнопки немає — списку схованих вона ні до чого', () => {
    renderRow(feedCard);
    expect(screen.queryByTitle('Контакти')).not.toBeInTheDocument();
  });
});
