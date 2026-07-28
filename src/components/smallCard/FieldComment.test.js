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
});
