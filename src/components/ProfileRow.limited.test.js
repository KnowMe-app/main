import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import ProfileRow from './ProfileRow';

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
    onOpen={props.onOpen || jest.fn()}
    onEditProfile={props.onEditProfile || jest.fn()}
    onCommentSave={jest.fn()}
    clientComment=""
    primaryAction={{ icon: <span>♥</span>, title: 'В обране', onClick: jest.fn() }}
    {...props}
  />
);

describe('limited profile row', () => {
  it('shows the name, age and location it is allowed to show', () => {
    renderRow(limitedUser);
    expect(screen.getByText(/Олена Ткаченко/)).toBeInTheDocument();
    expect(screen.getByText(/31/)).toBeInTheDocument();
    expect(screen.getByText('Бровари, Київська обл.')).toBeInTheDocument();
  });

  it('shows no metrics line, no expander, no edit and no collection action', () => {
    renderRow(limitedUser);
    expect(screen.queryByTitle('Показати всі дані')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Редагувати анкету')).not.toBeInTheDocument();
    expect(screen.queryByTitle('В обране')).not.toBeInTheDocument();
    expect(screen.queryByText(/BMI/)).not.toBeInTheDocument();
  });

  it('does not open a card that has nothing more behind it', () => {
    const onOpen = jest.fn();
    const onToggleExpand = jest.fn();
    renderRow(limitedUser, { onOpen, onToggleExpand });
    fireEvent.click(screen.getByText(/Олена Ткаченко/));
    expect(onOpen).not.toHaveBeenCalled();
    expect(onToggleExpand).not.toHaveBeenCalled();
  });

  it('still renders the full row for a viewer entitled to one', () => {
    const onOpen = jest.fn();
    renderRow(fullUser, { onOpen });
    expect(screen.getByTitle('Показати всі дані')).toBeInTheDocument();
    expect(screen.getByTitle('Редагувати анкету')).toBeInTheDocument();
    expect(screen.getByTitle('В обране')).toBeInTheDocument();
    expect(screen.getByText('172/59')).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Олена Ткаченко/));
    expect(onOpen).toHaveBeenCalledWith(fullUser);
  });
});
