import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, within } from '@testing-library/react';
import ProfileRow, { ENRICH_GATE_LABEL, REVIEWS_GATE_LABEL } from './ProfileRow';

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
describe('ряд рішень у рядку стрічки', () => {
  it('шикує олівець, лайк, дизлайк і відгуки саме в цьому порядку', () => {
    renderRow({ onEnrich: jest.fn(), reviewsAction: { count: 0, loading: false, onRequest: jest.fn() } });

    const pencil = screen.getByTitle(ENRICH_GATE_LABEL);
    const like = screen.getByTitle('В обране');
    const hide = screen.getByTitle('Приховати');
    const reviews = screen.getByTitle(REVIEWS_GATE_LABEL);

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
    fireEvent.click(screen.getByTitle(ENRICH_GATE_LABEL));
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
    expect(screen.queryByTitle(REVIEWS_GATE_LABEL)).not.toBeInTheDocument();
    expect(screen.queryByTitle('В обране')).not.toBeInTheDocument();
  });
});

// Відгуки читаються на дотик, а не наперед: `matchingCards` про них не знає, і
// запит на кожен рядок списку коштував би сторінку читань заради блока, під
// яким у більшості анкет порожньо.
describe('відгуки в рядку стрічки', () => {
  const reviewsSlot = <div data-testid="reviews">відгук</div>;

  it('мовчить, поки значок не натиснули', () => {
    const onRequest = jest.fn();
    renderRow({ reviewsSlot, reviewsAction: { count: 0, loading: false, onRequest } });

    expect(onRequest).not.toHaveBeenCalled();
    expect(screen.queryByTestId('reviews')).not.toBeInTheDocument();
  });

  it('перший дотик просить прочитати, другий згортає', () => {
    const onRequest = jest.fn();
    renderRow({ reviewsSlot, reviewsAction: { count: 0, loading: false, onRequest } });

    const button = screen.getByTitle(REVIEWS_GATE_LABEL);
    fireEvent.click(button);
    expect(onRequest).toHaveBeenCalledWith(card.userId);
    expect(screen.getByTestId('reviews')).toBeInTheDocument();

    fireEvent.click(button);
    expect(screen.queryByTestId('reviews')).not.toBeInTheDocument();
  });

  it('називає кількість прочитаних відгуків просто на значку', () => {
    renderRow({ reviewsSlot, reviewsAction: { count: 3, loading: false, onRequest: jest.fn() } });
    expect(screen.getByTitle(REVIEWS_GATE_LABEL)).toHaveTextContent('3');
  });

  // Публічне — над власним: відгук читають, а нотатку пишуть, тож відповідь
  // мусить стояти над полем для власного запису, а не під ним.
  it('кладе відгуки над полем власної нотатки', () => {
    renderRow({ reviewsSlot, reviewsAction: { count: 1, loading: false, onRequest: jest.fn() } });
    fireEvent.click(screen.getByTitle(REVIEWS_GATE_LABEL));

    const reviews = screen.getByTestId('reviews');
    const note = screen.getByPlaceholderText('A note for yourself');
    expect(standsBefore(reviews, note)).toBe(true);
  });
});
