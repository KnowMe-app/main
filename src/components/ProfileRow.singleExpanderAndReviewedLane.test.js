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
    onCommentSave={jest.fn()}
    clientComment=""
    reviewsSlot={<span>відгуки</span>}
    {...props}
  />
);

applyUkrainianInterface();

describe('рядок стрічки', () => {
  // Стрілка стояла двічі — під трубкою контактів і в ряду рішень — і вела
  // туди ж. Тепер розгортання одне, і воно не стрілка в ряду, а «Детальніше»
  // під описом людини.
  it('має рівно одне розгортання — «Детальніше»', () => {
    const onToggleExpand = jest.fn();
    renderRow({ onToggleExpand });
    expect(screen.queryByTitle('Показати всі дані')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Розгорнути анкету')).not.toBeInTheDocument();
    const expanders = screen.getAllByTestId('row-details-toggle');
    expect(expanders).toHaveLength(1);
    fireEvent.click(expanders[0]);
    expect(onToggleExpand).toHaveBeenCalledWith(card.userId);
  });

  // Картка з відгуком мусить виділятись серед сусідніх: смужка публічної
  // доріжки стає червоною, щойно прочитано хоч один відгук.
  it('позначає доріжку відгуку, лише коли відгуки справді прочитано', () => {
    // Без відгуків доріжка згорнута в «+ Відгук»; відкрита дотиком, вона не
    // позначена.
    const { unmount } = renderRow({ reviewsAction: { count: 0, loaded: true } });
    expect(screen.queryByTestId('public-note-lane')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Відгук/ }));
    expect(screen.getByTestId('public-note-lane')).not.toHaveAttribute('data-reviewed');
    unmount();

    renderRow({ reviewsAction: { count: 2, loaded: true } });
    expect(screen.getByTestId('public-note-lane')).toHaveAttribute('data-reviewed', 'true');
  });
});
