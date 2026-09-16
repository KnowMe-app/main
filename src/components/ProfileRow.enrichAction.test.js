import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import ProfileRow, { enrichGateLabel } from './ProfileRow';
import { applyUkrainianInterface } from '../testUtils/interfaceLanguage';

const baseUser = {
  userId: 'ID0001',
  name: 'Олена',
  surname: 'Ткаченко',
  region: 'Київська область',
  city: 'Бровари',
  publish: true,
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

// Знайдена картка мусить пропонувати обидва продовження — спитати про людину
// (відгуки) і дописати те, що про неї знаєш. Друге починалось аж на окремому
// екрані пошуку, тому кнопка й з'явилась у самому рядку.
// Ці перевірки описують український бік екрана — мову задаємо явно.
applyUkrainianInterface();

describe('ProfileRow enrich action', () => {
  it('offers to add own data and hands the row card to the caller', () => {
    const onEnrich = jest.fn();
    renderRow(baseUser, { onEnrich });

    fireEvent.click(screen.getByRole('button', { name: enrichGateLabel() }));

    expect(onEnrich).toHaveBeenCalledWith(baseUser);
  });

  it('offers it on a limited card too - the unseen fields are exactly what there is to add', () => {
    const onEnrich = jest.fn();
    renderRow({ ...baseUser, __limitedProfile: true }, { onEnrich });

    expect(screen.getByRole('button', { name: enrichGateLabel() })).toBeInTheDocument();
  });

  it('renders nothing when the viewer may not create cards', () => {
    renderRow(baseUser);

    expect(screen.queryByRole('button', { name: enrichGateLabel() })).not.toBeInTheDocument();
  });

  it('does not open the card when the button is pressed', () => {
    const onOpen = jest.fn();
    renderRow(baseUser, { onEnrich: jest.fn(), onOpen });

    fireEvent.click(screen.getByRole('button', { name: enrichGateLabel() }));

    expect(onOpen).not.toHaveBeenCalled();
  });
});
