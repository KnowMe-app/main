import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

jest.mock('../config', () => ({
  auth: { currentUser: { uid: 'admin-1' } },
  fetchUserComment: jest.fn(),
  saveMyCardComment: jest.fn(),
}));

const { fetchUserComment, saveMyCardComment } = require('../config');
const { FieldComment } = require('./FieldComment');

describe('FieldComment', () => {
  beforeEach(() => {
    fetchUserComment.mockReset();
    saveMyCardComment.mockReset();
    fetchUserComment.mockResolvedValue(null);
  });

  it("loads the current admin's own comment for this card, not a card field", async () => {
    fetchUserComment.mockResolvedValue({ text: 'my private note', updatedAt: 123 });

    render(<FieldComment userData={{ userId: 'user-1', myComment: 'legacy card value' }} />);

    expect(fetchUserComment).toHaveBeenCalledWith('admin-1', 'user-1');
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Додайте свій коментар').value).toBe('my private note');
    });
  });

  it('saves via saveMyCardComment on blur, keyed by the admin uid, not the card object', async () => {
    render(<FieldComment userData={{ userId: 'user-1' }} />);

    const textarea = await screen.findByPlaceholderText('Додайте свій коментар');
    fireEvent.change(textarea, { target: { value: 'new note' } });
    fireEvent.blur(textarea);

    expect(saveMyCardComment).toHaveBeenCalledWith('user-1', 'new note', 'admin-1');
  });

  it('clearing the comment persists an empty value', async () => {
    fetchUserComment.mockResolvedValue({ text: 'existing', updatedAt: 123 });
    render(<FieldComment userData={{ userId: 'user-1' }} />);

    const clearButton = await screen.findByLabelText('Очистити коментар');
    fireEvent.click(clearButton);

    expect(saveMyCardComment).toHaveBeenCalledWith('user-1', '', 'admin-1');
  });

  it('batch 26 §8: the backend-navigation arrow is hidden by default, shown only in extended mode', async () => {
    const { rerender } = render(<FieldComment userData={{ userId: 'user-1' }} />);
    await screen.findByPlaceholderText('Додайте свій коментар');
    expect(screen.queryByLabelText('Відкрити запис коментаря у Firebase')).toBeNull();

    rerender(<FieldComment userData={{ userId: 'user-1' }} extendedMode />);
    expect(await screen.findByLabelText('Відкрити запис коментаря у Firebase')).toBeTruthy();
  });

  it('the backend-navigation arrow opens the comment\'s own comments/{ownerId}/{cardId} console URL', async () => {
    const openSpy = jest.spyOn(window, 'open').mockImplementation(() => {});
    render(<FieldComment userData={{ userId: 'user-1' }} extendedMode />);

    const arrow = await screen.findByLabelText('Відкрити запис коментаря у Firebase');
    fireEvent.click(arrow);

    expect(openSpy).toHaveBeenCalledTimes(1);
    const [url] = openSpy.mock.calls[0];
    expect(url).toContain('admin-1');
    expect(url).toContain('user-1');
    expect(url).toContain('comments');
    openSpy.mockRestore();
  });
});
