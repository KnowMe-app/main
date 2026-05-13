import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import { BtnDislike } from './btnDislike';
import { addDislikeUser, removeDislikeUser } from '../config';

global.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('../config', () => ({
  addDislikeUser: jest.fn(() => Promise.resolve()),
  removeDislikeUser: jest.fn(() => Promise.resolve()),
  removeFavoriteUser: jest.fn(() => Promise.resolve()),
  auth: { currentUser: { uid: 'viewer' } },
}));

jest.mock('utils/dislikesStorage', () => ({
  setDislike: jest.fn(),
  cacheDislikedUsers: jest.fn(),
}));

jest.mock('utils/favoritesStorage', () => ({
  setFavorite: jest.fn(),
}));

jest.mock('utils/cardsStorage', () => ({
  removeCardFromList: jest.fn(),
}));

describe('BtnDislike', () => {
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

  it('uses viewer-owned dislikes for active state and creates own dislike for shared-only disliked cards', async () => {
    const setDislikeUsers = jest.fn();
    const setOwnDislikeUsers = jest.fn();

    const mountComponent = ui => root.render(ui);

    await act(async () => {
      mountComponent(
        <BtnDislike
          userId="card1"
          userData={{ userId: 'card1' }}
          dislikeUsers={{ card1: true }}
          ownDislikeUsers={{}}
          setDislikeUsers={setDislikeUsers}
          setOwnDislikeUsers={setOwnDislikeUsers}
          favoriteUsers={{}}
          ownFavoriteUsers={{}}
          setFavoriteUsers={jest.fn()}
          setOwnFavoriteUsers={jest.fn()}
          multiDataOwnerId="viewer"
        />
      );
    });

    const button = container.querySelector('button[aria-label="Дизлайк"]');
    expect(button).not.toBeNull();
    expect(button.style.background).toBe('rgb(255, 140, 0)');
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.getAttribute('data-shared-disliked')).toBe('true');
    expect(button.getAttribute('title')).toBe('Дизлайк (shared)');

    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(addDislikeUser).toHaveBeenCalledWith('card1', 'viewer');
    expect(removeDislikeUser).not.toHaveBeenCalled();
    expect(setOwnDislikeUsers).toHaveBeenCalledWith({ card1: true });
    expect(setDislikeUsers).toHaveBeenCalledWith({ card1: true });
  });

  it('marks BtnDislike active only for viewer-owned dislikes', async () => {
    const mountComponent = ui => root.render(ui);

    await act(async () => {
      mountComponent(
        <BtnDislike
          userId="card2"
          userData={{ userId: 'card2' }}
          dislikeUsers={{ card2: true }}
          ownDislikeUsers={{ card2: true }}
          setDislikeUsers={jest.fn()}
          setOwnDislikeUsers={jest.fn()}
          favoriteUsers={{}}
          ownFavoriteUsers={{}}
          setFavoriteUsers={jest.fn()}
          setOwnFavoriteUsers={jest.fn()}
          multiDataOwnerId="viewer"
        />
      );
    });

    const button = container.querySelector('button[aria-label="Дизлайк"]');
    expect(button).not.toBeNull();
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.getAttribute('data-shared-disliked')).toBeNull();
  });

});
