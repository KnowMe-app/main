import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import ProfileRow from './ProfileRow';
import { applyUkrainianInterface } from '../testUtils/interfaceLanguage';

const card = {
  userId: 'ID0007',
  name: 'Анна',
  city: 'Київ',
  publish: true,
  lastLogin2: '2026-09-01',
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
    reviewsSlot={<span>відгуки</span>}
    {...props}
  />
);

applyUkrainianInterface();

describe('рядок стрічки', () => {
  // Стрілка стояла двічі — під трубкою контактів і в ряду рішень — і вела
  // туди ж. Лишилась одна, внизу.
  it('має рівно одну стрілку «розгорнути», і вона в ряду рішень', () => {
    const onToggleExpand = jest.fn();
    renderRow({ onToggleExpand });
    expect(screen.queryByTitle('Показати всі дані')).not.toBeInTheDocument();
    const expanders = screen.getAllByTitle('Розгорнути анкету');
    expect(expanders).toHaveLength(1);
    fireEvent.click(expanders[0]);
    expect(onToggleExpand).toHaveBeenCalledWith(card.userId);
  });

  // Картка з відгуком мусить виділятись серед сусідніх: смужка публічної
  // доріжки стає червоною, щойно прочитано хоч один відгук.
  it('позначає доріжку відгуку, лише коли відгуки справді прочитано', () => {
    const { container, unmount } = renderRow({ reviewsAction: { count: 0, loaded: true } });
    expect(container.querySelector('[data-reviewed="true"]')).toBeNull();
    unmount();

    const reviewed = renderRow({ reviewsAction: { count: 2, loaded: true } });
    expect(reviewed.container.querySelector('[data-reviewed="true"]')).not.toBeNull();
  });
});
