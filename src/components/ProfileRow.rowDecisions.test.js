import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, within } from '@testing-library/react';
import ProfileRow, { enrichGateLabel, reviewsGateLabel } from './ProfileRow';
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

const reactions = {
  primaryAction: { icon: <span>♥</span>, title: 'В обране', accent: true, active: false, onClick: jest.fn() },
  secondaryAction: { icon: <span>✕</span>, title: 'Приховати', active: false, onClick: jest.fn() },
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
// олівець (дописати анкету) → серце й хрестик → відгуки. Раніше вони жили в
// трьох різних місцях: два широкі рядки з написами під фактами, стовпчик
// значків праворуч і сам ряд реакцій.
// Ці перевірки описують український бік екрана — мову задаємо явно.
applyUkrainianInterface();

describe('ряд рішень у рядку стрічки', () => {
  it('шикує олівець, лайк, дизлайк і відгуки саме в цьому порядку', () => {
    renderRow({ onEnrich: jest.fn(), reviewsAction: { count: 0, loading: false, onRequest: jest.fn() } });

    const pencil = screen.getByTitle(enrichGateLabel());
    const like = screen.getByTitle('В обране');
    const hide = screen.getByTitle('Приховати');
    const reviews = screen.getByTitle(reviewsGateLabel());

    expect(standsBefore(pencil, like)).toBe(true);
    expect(standsBefore(like, hide)).toBe(true);
    expect(standsBefore(hide, reviews)).toBe(true);
  });

  it('ставить серце й хрестик у спільну рамку — це два боки одного вибору', () => {
    renderRow({ reviewsAction: { count: 0, loading: false, onRequest: jest.fn() } });

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

  it('не малює ряду взагалі, коли в ньому не було б жодного рішення', () => {
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
    expect(screen.queryByTitle(reviewsGateLabel())).not.toBeInTheDocument();
    expect(screen.queryByTitle('В обране')).not.toBeInTheDocument();
  });
});

// Відгуки читаються на дотик, а не наперед: `matchingCards` про них не знає, і
// запит на кожен рядок списку коштував би сторінку читань заради блока, під
// яким у більшості анкет порожньо. Саме ж поле для власного відгуку читань не
// потребує — воно пише, — тож стоїть на місці без жодного дотику.
describe('відгуки в рядку стрічки', () => {
  const reviewsSlot = <div data-testid="reviews">відгук</div>;

  it('тримає доріжку відгуків відкритою, але сама нічого не читає', () => {
    const onRequest = jest.fn();
    renderRow({ reviewsSlot, reviewsAction: { count: 0, loading: false, onRequest } });

    expect(onRequest).not.toHaveBeenCalled();
    expect(screen.getByTestId('reviews')).toBeInTheDocument();
  });

  it('дотиком просить прочитати чужі відгуки', () => {
    const onRequest = jest.fn();
    renderRow({ reviewsSlot, reviewsAction: { count: 0, loading: false, onRequest } });

    fireEvent.click(screen.getByTitle(reviewsGateLabel()));
    expect(onRequest).toHaveBeenCalledWith(card.userId);
  });

  // Читання, яке впало, мусить сказати про себе: порожня доріжка тепер означає
  // «відгуків немає», бо поле для власного запису стоїть у ній завжди.
  it('не мовчить, коли читання не дало відповіді', () => {
    renderRow({ reviewsSlot, reviewsAction: { count: 0, loading: false, loaded: false, onRequest: jest.fn() } });

    fireEvent.click(screen.getByTitle(reviewsGateLabel()));
    expect(screen.getByText('Не вдалося прочитати відгуки')).toBeInTheDocument();
  });

  it('каже, що читання триває', () => {
    renderRow({ reviewsSlot, reviewsAction: { count: 0, loading: true, onRequest: jest.fn() } });
    expect(screen.getByText('Шукаємо відгуки…')).toBeInTheDocument();
  });

  it('називає кількість прочитаних відгуків просто на значку', () => {
    renderRow({ reviewsSlot, reviewsAction: { count: 3, loading: false, onRequest: jest.fn() } });
    expect(screen.getByTitle(reviewsGateLabel())).toHaveTextContent('3');
  });

  // Публічне — над власним: відгук читають, а нотатку пишуть, тож відповідь
  // мусить стояти над полем для власного запису, а не під ним.
  it('кладе відгуки над полем власної нотатки', () => {
    renderRow({ reviewsSlot, reviewsAction: { count: 1, loading: false, onRequest: jest.fn() } });

    const reviews = screen.getByTestId('reviews');
    const note = screen.getByPlaceholderText('Нотатка для себе');
    expect(standsBefore(reviews, note)).toBe(true);
  });
});
