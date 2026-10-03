import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import ProfileRow from './ProfileRow';
import { applyUkrainianInterface } from '../testUtils/interfaceLanguage';

// Картка стрічки — це проєкція `matchingCards`, і контактів у ній немає: вони
// живуть в окремому вузлі за межею приватності. Кнопки «Контакти» більше немає:
// рядок, щойно зʼявився на екрані, сам просить контакти (`onRequestContacts`),
// і лише там, де за ними щось стоїть (`canViewContacts`).
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
    onCommentSave={jest.fn()}
    clientComment=""
    {...props}
  />
);

// Ці перевірки описують український бік екрана — мову задаємо явно.
applyUkrainianInterface();

describe('контакти в рядку стрічки', () => {
  it('кнопки «Контакти» немає', () => {
    renderRow(hydratedCard, { onRequestContacts: jest.fn() });
    expect(screen.queryByTitle('Контакти')).not.toBeInTheDocument();
  });

  // У тестовому оточенні `IntersectionObserver` немає — рядок просить одразу.
  it('сам просить контакти для картки, де їх ще немає, і лише раз', () => {
    const onRequestContacts = jest.fn();
    const { rerender } = renderRow(feedCard, { onRequestContacts });
    expect(onRequestContacts).toHaveBeenCalledTimes(1);
    expect(onRequestContacts).toHaveBeenCalledWith(feedCard);
    rerender(
      <ProfileRow user={{ ...feedCard }} isAdmin={false} expanded={false} onToggleExpand={jest.fn()}
        onCommentSave={jest.fn()} clientComment="" onRequestContacts={onRequestContacts} />
    );
    expect(onRequestContacts).toHaveBeenCalledTimes(1);
  });

  it('не просить там, де контакти вже є', () => {
    const onRequestContacts = jest.fn();
    renderRow(hydratedCard, { onRequestContacts });
    expect(onRequestContacts).not.toHaveBeenCalled();
  });

  // Право вирішує `canOfferProfileContacts`: картка поза стрічкою (без
  // `feedDate`) контактів не віддасть, і питати за неї базу нема чого.
  it('не просить і не показує там, де права на них немає', () => {
    const onRequestContacts = jest.fn();
    renderRow(feedCard, { onRequestContacts, canViewContacts: false });
    expect(onRequestContacts).not.toHaveBeenCalled();
  });

  it('урізана проєкція контактів не просить', () => {
    const onRequestContacts = jest.fn();
    renderRow({ ...feedCard, __limitedProfile: true }, { onRequestContacts });
    expect(onRequestContacts).not.toHaveBeenCalled();
  });

  // Цифр номера на екрані немає: трубка — це дзвінок, а поруч месенджери з
  // того самого номера. Кожен дотик рахується.
  it('трубка дзвонить, номер текстом не показується, дотики рахуються', () => {
    const onContactAction = jest.fn();
    renderRow(hydratedCard, { onRequestContacts: jest.fn(), onContactAction });

    expect(screen.queryByText('+380501112233')).not.toBeInTheDocument();
    expect(screen.queryByText('Показати номер')).not.toBeInTheDocument();
    expect(screen.queryByTitle(/380501112233/)).not.toBeInTheDocument();

    const call = screen.getByTitle('Подзвонити');
    expect(call).toHaveAttribute('href', expect.stringMatching(/^tel:/));
    fireEvent.click(call);
    expect(onContactAction).toHaveBeenLastCalledWith(hydratedCard, 'phone');

    fireEvent.click(screen.getByTitle('Viber за номером'));
    expect(onContactAction).toHaveBeenLastCalledWith(hydratedCard, 'phone-viber');
    fireEvent.click(screen.getByTitle('Telegram'));
    expect(onContactAction).toHaveBeenLastCalledWith(hydratedCard, 'telegram');
    expect(onContactAction).toHaveBeenCalledTimes(3);
  });

  // Без лічильника (шапка форми доповнення) підказка називає й значення.
  it('поруч із трубкою дає месенджери, зібрані з номера', () => {
    renderRow(hydratedCard, { onRequestContacts: jest.fn() });

    expect(screen.getByTitle('Viber: +380501112233')).toHaveAttribute('href', 'viber://chat?number=%2B380501112233');
    expect(screen.getByTitle('WhatsApp: +380501112233')).toHaveAttribute('href', 'https://wa.me/380501112233');
    expect(screen.getByTitle('Telegram: oksana')).toBeInTheDocument();
  });

  // Нік Telegram, записаний в анкеті, — той самий канал, що й Telegram з
  // номера: два однакові значки поруч не казали, котрий із них куди веде.
  it('не дублює Telegram з номера, коли в анкеті є власний нік', () => {
    renderRow(hydratedCard, { onRequestContacts: jest.fn() });
    expect(screen.queryByTitle('Telegram: +380501112233')).toBeNull();
    expect(screen.getAllByTitle(/^Telegram/)).toHaveLength(1);
  });

  it('без власного ніка Telegram збирає з номера', () => {
    renderRow({ ...feedCard, phone: '380501112233' }, { onRequestContacts: jest.fn() });
    expect(screen.getByTitle('Telegram: +380501112233')).toHaveAttribute('href', 'https://t.me/+380501112233');
  });

  // Розгорнутий блок «усі дані» другим списком контакти не показує.
  it('не дублює контакти в блоці «показати всі дані»', () => {
    renderRow(hydratedCard, { onRequestContacts: jest.fn(), expanded: true });
    expect(screen.getAllByTitle('WhatsApp: +380501112233')).toHaveLength(1);
  });
});
