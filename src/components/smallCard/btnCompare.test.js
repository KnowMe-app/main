import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

jest.mock('react-hot-toast', () => ({
  success: jest.fn(),
  error: jest.fn(),
}));

jest.mock('./actions', () => ({
  handleSubmitAll: jest.fn(),
}));

jest.mock('../config', () => ({
  auth: { currentUser: { uid: 'admin-1' } },
  fetchUserComment: jest.fn(),
  saveMyCardComment: jest.fn(),
}));

const toast = require('react-hot-toast');
const { handleSubmitAll } = require('./actions');
const { fetchUserComment, saveMyCardComment } = require('../config');
const { btnCompare } = require('./btnCompare');

describe('btnCompare: myComment lives in multiData/comments, not on the card', () => {
  beforeEach(() => {
    fetchUserComment.mockReset();
    saveMyCardComment.mockReset();
    handleSubmitAll.mockReset();
    toast.success.mockReset();
    toast.error.mockReset();
  });

  const users = {
    'user-1': { userId: 'user-1', name: 'A' },
    'user-2': { userId: 'user-2', name: 'B' },
  };

  it('fetches each card\'s multiData comment (not userData.myComment) and shows a diff row when they differ', async () => {
    fetchUserComment.mockImplementation(async (ownerId, cardId) => {
      if (cardId === 'user-1') return { text: 'comment from card 1', lastAction: 1 };
      if (cardId === 'user-2') return { text: 'comment from card 2', lastAction: 2 };
      return null;
    });

    const setUsers = jest.fn();
    const setShowInfoModal = jest.fn();
    const setCompare = jest.fn();

    render(
      <div>{btnCompare(0, users, setUsers, setShowInfoModal, setCompare)}</div>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Порівняти' }));

    await waitFor(() => expect(setCompare).toHaveBeenCalled());
    expect(fetchUserComment).toHaveBeenCalledWith('admin-1', 'user-1');
    expect(fetchUserComment).toHaveBeenCalledWith('admin-1', 'user-2');
    const html = setCompare.mock.calls[0][0];
    expect(html).toContain('myComment');
    expect(html).toContain('comment from card 1');
    expect(html).toContain('comment from card 2');
    expect(setShowInfoModal).toHaveBeenCalledWith('compareCards');
  });

  it('does not show a myComment row when both cards have the same comment (or none)', async () => {
    fetchUserComment.mockResolvedValue(null);
    const setCompare = jest.fn();

    render(
      <div>{btnCompare(0, users, jest.fn(), jest.fn(), setCompare)}</div>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Порівняти' }));

    await waitFor(() => expect(setCompare).toHaveBeenCalled());
    expect(setCompare.mock.calls[0][0]).not.toContain('myComment');
  });

  it('copies a comment via saveMyCardComment (multiData), never through handleSubmitAll/updated card state', async () => {
    fetchUserComment.mockResolvedValue(null);
    render(<div>{btnCompare(0, users, jest.fn(), jest.fn(), jest.fn())}</div>);

    window.handleClick('myComment', encodeURIComponent(''), encodeURIComponent('the comment'), 'user-1', 'user-2');
    await waitFor(() => expect(saveMyCardComment).toHaveBeenCalledWith('user-2', 'the comment', 'admin-1'));
    expect(handleSubmitAll).not.toHaveBeenCalled();
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });

  it('shows an error toast when saving the copied comment fails', async () => {
    fetchUserComment.mockResolvedValue(null);
    saveMyCardComment.mockRejectedValueOnce(new Error('PERMISSION_DENIED'));
    render(<div>{btnCompare(0, users, jest.fn(), jest.fn(), jest.fn())}</div>);

    window.handleClick('myComment', encodeURIComponent(''), encodeURIComponent('the comment'), 'user-1', 'user-2');
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(
      'Не вдалося скопіювати коментар: PERMISSION_DENIED'
    ));
  });
});
