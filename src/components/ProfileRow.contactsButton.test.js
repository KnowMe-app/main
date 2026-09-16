import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import ProfileRow from './ProfileRow';
import { applyUkrainianInterface } from '../testUtils/interfaceLanguage';

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

// Ці перевірки описують український бік екрана — мову задаємо явно.
applyUkrainianInterface();

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

  // Номер читають очима — його переписують і диктують, — тож він стоїть
  // рядком повністю й суцільним, без пробілів: однаковий вигляд важить більше
  // за групування трійками, а пробіли в базі в різних анкет різні. Решта
  // каналів у тапають, і кожен з них коштував цілого рядка; тепер вони йдуть
  // значками, а значення лишається в підказці.
  it('показує контакти, щойно анкета доїхала: номер текстом, решта значками', () => {
    renderRow(hydratedCard, { onRequestContacts: jest.fn() });
    fireEvent.click(screen.getByTitle('Контакти'));

    expect(screen.getByText('+380501112233')).toBeInTheDocument();
    expect(screen.getByTitle('Telegram: oksana')).toBeInTheDocument();
    expect(screen.queryByText('Шукаємо контакти…')).not.toBeInTheDocument();
  });

  // Три швидкі кнопки збираються з самого номера й стоять біля нього: нового
  // контакту вони не несуть.
  it('поруч із номером дає месенджери, зібрані з нього ж', () => {
    renderRow(hydratedCard, { onRequestContacts: jest.fn() });
    fireEvent.click(screen.getByTitle('Контакти'));

    expect(screen.getByTitle('Telegram: +380501112233')).toHaveAttribute('href', 'https://t.me/380501112233');
    expect(screen.getByTitle('Viber: +380501112233')).toHaveAttribute('href', 'viber://chat?number=%2B380501112233');
    expect(screen.getByTitle('WhatsApp: +380501112233')).toHaveAttribute('href', 'https://wa.me/380501112233');
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

  // Картка поза стрічкою, на яку читач права не має, контактів не віддасть —
  // ані кнопці, ані розгорнутому блоку. Значок при цьому обіцяв, що віддасть,
  // і кожен дотик коштував круга до бази заради «Контактів немає або вони
  // закриті». Хто саме має право, вирішує `canOfferProfileContacts`.
  it('не пропонує контактів там, де права на них немає', () => {
    renderRow(feedCard, { onRequestContacts: jest.fn(), canViewContacts: false });
    expect(screen.queryByTitle('Контакти')).not.toBeInTheDocument();
  });

  // Розгорнутий блок «усі дані» другим списком контакти не показує: поки він
  // це робив, у чернетці той самий номер стояв двічі.
  it('не дублює контакти в блоці «показати всі дані»', () => {
    renderRow(hydratedCard, { onRequestContacts: jest.fn(), expanded: true });
    fireEvent.click(screen.getByTitle('Контакти'));

    expect(screen.getAllByText('+380501112233')).toHaveLength(1);
  });
});
