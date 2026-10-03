import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import ProfileRow from './ProfileRow';
import { applyUkrainianInterface } from '../testUtils/interfaceLanguage';

const thisYear = new Date().getFullYear();

const limitedUser = {
  userId: 'ID0001',
  name: 'Олена',
  surname: 'Ткаченко',
  birth: `15.01.${thisYear - 31}`,
  region: 'Київська область',
  city: 'Бровари',
  __limitedProfile: true,
  publish: true,
};

const fullUser = {
  ...limitedUser,
  __limitedProfile: false,
  height: '172',
  weight: '59',
  bloodGroup: '1',
  rh: '+',
  maritalStatus: 'unmarried',
  phone: '380501112233',
  education: 'вища',
};

const renderRow = (user, props = {}) => render(
  <ProfileRow
    user={user}
    isAdmin
    expanded={false}
    onToggleExpand={props.onToggleExpand || jest.fn()}
    onEditProfile={props.onEditProfile || jest.fn()}
    onCommentSave={jest.fn()}
    clientComment=""
    primaryAction={{ icon: <span>♥</span>, title: 'В обране', onClick: jest.fn() }}
    {...props}
  />
);

// Ці перевірки описують український бік екрана — мову задаємо явно.
applyUkrainianInterface();

describe('limited profile row', () => {
  it('shows the name, age and location it is allowed to show', () => {
    renderRow(limitedUser);
    expect(screen.getByText(/Олена Ткаченко/)).toBeInTheDocument();
    expect(screen.getByText(/31/)).toBeInTheDocument();
    expect(screen.getByText('Бровари, Київська обл.')).toBeInTheDocument();
  });

  it('shows no metrics line, no expander, no edit and no collection action', () => {
    renderRow(limitedUser);
    expect(screen.queryByTitle('Розгорнути анкету')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Редагувати анкету')).not.toBeInTheDocument();
    expect(screen.queryByTitle('В обране')).not.toBeInTheDocument();
    expect(screen.queryByText(/BMI/)).not.toBeInTheDocument();
    expect(screen.queryByText('Зріст')).not.toBeInTheDocument();
  });

  // Розгортати урізану проєкцію нема чим — метрик і контактів у ній немає,
  // а відкритої картки, куди дотик вів раніше, більше немає взагалі.
  it('never expands the row on a tap', () => {
    const onToggleExpand = jest.fn();
    renderRow(limitedUser, { onToggleExpand });
    fireEvent.click(screen.getByText(/Олена Ткаченко/));
    expect(onToggleExpand).not.toHaveBeenCalled();
    expect(screen.queryByTestId('row-details-toggle')).not.toBeInTheDocument();
  });

  it('still renders the full row for a viewer entitled to one', () => {
    const onToggleExpand = jest.fn();
    renderRow(fullUser, { onToggleExpand });
    expect(screen.getByTestId('row-details-toggle')).toBeInTheDocument();
    expect(screen.getByTitle('Редагувати анкету')).toBeInTheDocument();
    expect(screen.getByTitle('В обране')).toBeInTheDocument();
    // Показники стоять смугою з підписами (`ProfileStatStrip`), а не рядком
    // «172/59».
    expect(screen.getByText('Зріст')).toBeInTheDocument();
    expect(screen.getByText('Вага')).toBeInTheDocument();
    // Дотик до картки розгортає її.
    fireEvent.click(screen.getByText(/Олена Ткаченко/));
    expect(onToggleExpand).toHaveBeenCalledWith(fullUser.userId);
  });
});
