import React from 'react';

jest.mock('components/config', () => ({
  fetchUserById: jest.fn(),
  updateDataInNewUsersRTDB: jest.fn(),
  updateDataInRealtimeDB: jest.fn(),
  updateDataInFiresoreDB: jest.fn(),
  addDislikeUser: jest.fn(),
  removeDislikeUser: jest.fn(),
  addFavoriteUser: jest.fn(),
  removeFavoriteUser: jest.fn(),
  auth: { currentUser: null },
}));

jest.mock('utils/cache', () => ({
  updateCachedUser: jest.fn(),
  setFavoriteIds: jest.fn(),
}));

jest.mock('utils/favoritesStorage', () => ({
  setFavorite: jest.fn(),
}));

jest.mock('utils/dislikesStorage', () => ({
  setDislike: jest.fn(),
}));

jest.mock('../smallCard/actions', () => ({
  handleChange: jest.fn(),
  handleSubmit: jest.fn(),
}));

import { fieldGetInTouch } from '../smallCard/fieldGetInTouch';
import { handleChange, handleSubmit } from '../smallCard/actions';

describe('fieldGetInTouch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses the current input value when submitting on blur', () => {
    const userData = { userId: 'user-123', getInTouch: '2024-01-10' };
    const setUsers = jest.fn();
    const setState = jest.fn();
    const currentFilter = 'DATE2';
    const isDateInRange = jest.fn().mockReturnValue(true);

    const element = fieldGetInTouch(
      userData,
      setUsers,
      setState,
      currentFilter,
      isDateInRange,
      {},
      jest.fn(),
      {},
      jest.fn(),
      true,
    );

    const inputElement = React.Children.toArray(element.props.children).find(
      child => child?.props?.onBlur,
    );

    expect(inputElement).toBeDefined();

    inputElement.props.onBlur({ target: { value: '15.07.2024' } });

    const expectedDate = '2024-07-15';

    expect(handleChange).toHaveBeenCalledWith(
      setUsers,
      setState,
      userData.userId,
      'getInTouch',
      expectedDate,
      false,
      { currentFilter, isDateInRange },
      true,
    );

    expect(handleSubmit).toHaveBeenCalledWith(
      { ...userData, getInTouch: expectedDate },
      'overwrite',
      true,
    );
  });
});
