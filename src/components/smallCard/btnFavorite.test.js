import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import { BtnFavorite } from './btnFavorite';
import { addFavoriteUser, removeDislikeUser } from '../config';

global.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('../config', () => ({
  addFavoriteUser: jest.fn(() => Promise.resolve()),
  removeFavoriteUser: jest.fn(() => Promise.resolve()),
  removeDislikeUser: jest.fn(() => Promise.resolve()),
  auth: { currentUser: { uid: 'viewer' } },
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

describe('BtnFavorite', () => {
  let container;
  let root;

  beforeEach(() => {
    jest.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.removeChild(container);
  });

  it('creates viewer-owned favorite and locally overrides a shared-only dislike', async () => {
    const setFavoriteUsers = jest.fn();
    const setOwnFavoriteUsers = jest.fn();
    const setDislikeUsers = jest.fn();
    const setOwnDislikeUsers = jest.fn();

    const mountComponent = ui => root.render(ui);

    await act(async () => {
      mountComponent(
        <BtnFavorite
          userId="ID0001"
          userData={{ userId: 'ID0001' }}
          favoriteUsers={{}}
          ownFavoriteUsers={{}}
          setFavoriteUsers={setFavoriteUsers}
          setOwnFavoriteUsers={setOwnFavoriteUsers}
          dislikeUsers={{ ID0001: true }}
          ownDislikeUsers={{}}
          setDislikeUsers={setDislikeUsers}
          setOwnDislikeUsers={setOwnDislikeUsers}
          multiDataOwnerId="viewer"
        />
      );
    });

    const button = container.querySelector('button[aria-label="В обране"]');
    expect(button).not.toBeNull();
    expect(button.getAttribute('aria-pressed')).toBe('false');

    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(addFavoriteUser).toHaveBeenCalledWith('ID0001', 'viewer');
    expect(removeDislikeUser).not.toHaveBeenCalled();
    expect(setOwnFavoriteUsers).toHaveBeenCalledWith({ ID0001: true });
    expect(setFavoriteUsers).toHaveBeenCalledWith({ ID0001: true });
    expect(setOwnDislikeUsers).toHaveBeenCalledWith({});
    expect(setDislikeUsers).toHaveBeenCalledWith({});
  });
});
