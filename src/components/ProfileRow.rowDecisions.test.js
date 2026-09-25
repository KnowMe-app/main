import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, within } from '@testing-library/react';
import ProfileRow, { enrichGateLabel } from './ProfileRow';
import { applyUkrainianInterface } from '../testUtils/interfaceLanguage';

const card = {
  userId: 'ID0003',
  name: 'Оксана',
  city: 'Черкаси',
  height: '168',
  weight: '54',
  publish: true,
  lastLogin2: '2026-09-01',
};

const expandLabel = 'Розгорнути анкету';

// Так пару передає стрічка (`Matching`): хрестик першим, серце другим — лайк
// стоїть праворуч, як і у відкритій картці.
const reactions = {
  primaryAction: { icon: <span>✕</span>, title: 'Приховати', active: false, onClick: jest.fn() },
  secondaryAction: { icon: <span>♥</span>, title: 'В обране', accent: true, active: false, onClick: jest.fn() },
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
    {...reactions}
    {...props}
  />
);

// «Стоїть раніше» — це порядок у документі, і питається він у самих вузлів.
const standsBefore = (first, second) =>
  first.compareDocumentPosition(second) === Node.DOCUMENT_POSITION_FOLLOWING;

// Рішення про людину стоять одним рядом унизу картки, у сталому порядку:
// олівець (дописати анкету) → хрестик і серце → розгорнути. Раніше вони жили в
// трьох різних місцях: два широкі рядки з написами під фактами, стовпчик
// значків праворуч і сам ряд реакцій.
// Ці перевірки описують український бік екрана — мову задаємо явно.
applyUkrainianInterface();

describe('ряд рішень у рядку стрічки', () => {
  it('шикує олівець, дизлайк, лайк і розгортання саме в цьому порядку', () => {
    renderRow({ onEnrich: jest.fn() });

    const pencil = screen.getByTitle(enrichGateLabel());
    const like = screen.getByTitle('В обране');
    const hide = screen.getByTitle('Приховати');
    const expand = screen.getByTitle(expandLabel);

    expect(standsBefore(pencil, hide)).toBe(true);
    expect(standsBefore(hide, like)).toBe(true);
    expect(standsBefore(like, expand)).toBe(true);
  });

  it('ставить серце й хрестик у спільну рамку — це два боки одного вибору', () => {
    renderRow();

    const pair = within(screen.getByTestId('row-reactions'));
    expect(pair.getByTitle('В обране')).toBeInTheDocument();
    expect(pair.getByTitle('Приховати')).toBeInTheDocument();
  });

  // Олівець один на обидві ролі: не-адмін ним дописує знайдену картку, адмін —
  // відкриває її на редагування. Наслідок той самий, тож і кнопка одна.
  it('веде олівцем у доповнення — а в адміна в редагування анкети', () => {
    const onEnrich = jest.fn();
    const { unmount } = renderRow({ onEnrich });
    fireEvent.click(screen.getByTitle(enrichGateLabel()));
    expect(onEnrich).toHaveBeenCalledWith(card);
    unmount();

    const onEditProfile = jest.fn();
    renderRow({ isAdmin: true, onEditProfile });
    fireEvent.click(screen.getByTitle('Редагувати анкету'));
    expect(onEditProfile).toHaveBeenCalledWith(card);
  });

  // Кнопка розгортання стоїть у рядку незалежно від того, чи передали
  // реакції або олівець: це та сама дія, що й стрілка біля контактів
  // (`onToggleExpand`), і рядок пропонує її сам, без сторонніх пропів.
  it('малює саме розгортання, коли нічого іншого не передали', () => {
    render(
      <ProfileRow
        user={card}
        isAdmin={false}
        expanded={false}
        onToggleExpand={jest.fn()}
        onOpen={jest.fn()}
        onCommentSave={jest.fn()}
        clientComment=""
      />
    );
    expect(screen.getByTitle(expandLabel)).toBeInTheDocument();
    expect(screen.queryByTitle('В обране')).not.toBeInTheDocument();
  });

  // Урізана проєкція пошуку (`__limitedProfile`) не має чого розгортати —
  // «всіх даних» у ній немає взагалі, — тож без реакцій і олівця ряду рішень
  // немає зовсім.
  it('не малює ряду взагалі в урізаній картці без інших рішень', () => {
    render(
      <ProfileRow
        user={{ ...card, __limitedProfile: true }}
        isAdmin={false}
        expanded={false}
        onToggleExpand={jest.fn()}
        onOpen={jest.fn()}
        onCommentSave={jest.fn()}
        clientComment=""
      />
    );
    expect(screen.queryByTitle(expandLabel)).not.toBeInTheDocument();
    expect(screen.queryByTitle('В обране')).not.toBeInTheDocument();
  });

  it('розгортає «всі дані» тим самим жестом, що й стрілка біля контактів', () => {
    const onToggleExpand = jest.fn();
    renderRow({ onToggleExpand });

    fireEvent.click(screen.getByTitle(expandLabel));
    expect(onToggleExpand).toHaveBeenCalledWith(card.userId);
  });
});

// Відгуки читаються без кліку: щойно в проєкції картки стоїть прапорець
// `hasPublicReview`, стрічка сама починає читання (ефект у `Matching.jsx`), а
// рядок лише описує його стан словом. Поле для власного відгуку читань не
// потребує — воно пише, — тож стоїть на місці незалежно від прапорця.
describe('відгуки в рядку стрічки', () => {
  const reviewsSlot = <div data-testid="reviews">відгук</div>;

  it('тримає доріжку відгуків відкритою й нічого сама не читає', () => {
    const onRequest = jest.fn();
    renderRow({ reviewsSlot, reviewsAction: { count: 0, loading: false, onRequest } });

    expect(onRequest).not.toHaveBeenCalled();
    expect(screen.getByTestId('reviews')).toBeInTheDocument();
  });

  it('мовчить, поки в картки немає прапорця hasPublicReview', () => {
    renderRow({ reviewsSlot, reviewsAction: { count: 0, loading: false, loaded: false, onRequest: jest.fn() } });
    expect(screen.queryByText('Не вдалося прочитати відгуки')).not.toBeInTheDocument();
    expect(screen.queryByText('Публічних відгуків ще немає')).not.toBeInTheDocument();
  });

  // Прапорець каже «є що читати», а читання, яке впало, мусить сказати про
  // себе: порожня доріжка тепер означає «відгуків немає», бо поле для
  // власного запису стоїть у ній завжди.
  it('не мовчить, коли позначена карткою читання не дало відповіді', () => {
    renderRow({
      user: { ...card, hasPublicReview: true },
      reviewsSlot,
      reviewsAction: { count: 0, loading: false, loaded: false, onRequest: jest.fn() },
    });
    expect(screen.getByText('Не вдалося прочитати відгуки')).toBeInTheDocument();
  });

  it('каже, що читання триває', () => {
    renderRow({
      user: { ...card, hasPublicReview: true },
      reviewsSlot,
      reviewsAction: { count: 0, loading: true, onRequest: jest.fn() },
    });
    expect(screen.getByText('Шукаємо відгуки…')).toBeInTheDocument();
  });

  // Публічне — над власним: відгук читають, а нотатку пишуть, тож відповідь
  // мусить стояти над полем для власного запису, а не під ним.
  it('кладе відгуки над полем власної нотатки', () => {
    renderRow({
      user: { ...card, hasPublicReview: true },
      reviewsSlot,
      reviewsAction: { count: 1, loading: false, loaded: true, onRequest: jest.fn() },
    });

    const reviews = screen.getByTestId('reviews');
    const note = screen.getByPlaceholderText('Додати памʼятку');
    expect(standsBefore(reviews, note)).toBe(true);
  });
});
