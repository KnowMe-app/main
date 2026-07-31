import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

jest.mock('react-hot-toast', () => ({
  error: jest.fn(),
}));

jest.mock('../config', () => ({
  COMMENTS_ROOT_PATH: 'multiData/comments',
  auth: { currentUser: { uid: 'admin-1' } },
  fetchUserComment: jest.fn(),
  migrateMyCardComment: jest.fn(),
  saveMyCardComment: jest.fn(),
}));

const { fetchUserComment, migrateMyCardComment, saveMyCardComment } = require('../config');
const toast = require('react-hot-toast');
const { FieldComment } = require('./FieldComment');

describe('FieldComment', () => {
  beforeEach(() => {
    fetchUserComment.mockReset();
    saveMyCardComment.mockReset();
    migrateMyCardComment.mockReset();
    fetchUserComment.mockResolvedValue(null);
    saveMyCardComment.mockResolvedValue({ lastAction: 123 });
    migrateMyCardComment.mockResolvedValue({ lastAction: 123 });
    toast.error.mockReset();
  });

  it("combines the legacy card comment and current admin's multiData comment", async () => {
    fetchUserComment.mockResolvedValue({ text: 'my private note', updatedAt: 123 });

    render(<FieldComment userData={{ userId: 'user-1', myComment: 'legacy card value' }} />);

    expect(fetchUserComment).toHaveBeenCalledWith('admin-1', 'user-1');
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Додайте свій коментар').value).toBe('legacy card value\n\nmy private note');
    });
  });

  it('migrates an edited legacy comment and notifies the card state', async () => {
    const onMigrated = jest.fn();
    render(
      <FieldComment
        userData={{ userId: 'user-1', myComment: 'legacy' }}
        onLegacyCommentMigrated={onMigrated}
      />
    );

    const textarea = await screen.findByPlaceholderText('Додайте свій коментар');
    fireEvent.change(textarea, { target: { value: 'legacy edited' } });
    fireEvent.blur(textarea);

    await waitFor(() => {
      expect(migrateMyCardComment).toHaveBeenCalledWith('user-1', 'legacy edited', 'admin-1');
    });
    expect(saveMyCardComment).not.toHaveBeenCalled();
    expect(onMigrated).toHaveBeenCalledTimes(1);
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

  it('saves the current draft before opening the comment backend URL', async () => {
    const backendWindow = { location: { href: '' }, close: jest.fn(), opener: window };
    const openSpy = jest.spyOn(window, 'open').mockReturnValue(backendWindow);
    render(<FieldComment userData={{ userId: 'user-1' }} extendedMode />);

    const arrow = await screen.findByLabelText('Відкрити запис коментаря у Firebase');
    const textarea = screen.getByPlaceholderText('Додайте свій коментар');
    fireEvent.change(textarea, { target: { value: 'unsaved draft' } });
    fireEvent.click(arrow);

    await waitFor(() => expect(openSpy).toHaveBeenCalledTimes(1));
    expect(openSpy).toHaveBeenCalledWith('about:blank', '_blank');
    expect(saveMyCardComment).toHaveBeenCalledWith('user-1', 'unsaved draft', 'admin-1');
    const url = backendWindow.location.href;
    expect(url).toContain('admin-1');
    expect(url).toContain('user-1');
    expect(url).toContain('multiData');
    expect(url).toContain('comments');
    expect(backendWindow.opener).toBeNull();
    expect(backendWindow.close).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });

  it('shows a toast and does not open the backend URL when saving fails', async () => {
    const error = new Error('PERMISSION_DENIED');
    saveMyCardComment.mockRejectedValue(error);
    const backendWindow = { location: { href: '' }, close: jest.fn(), opener: window };
    const openSpy = jest.spyOn(window, 'open').mockReturnValue(backendWindow);
    render(<FieldComment userData={{ userId: 'user-1' }} extendedMode />);

    fireEvent.click(await screen.findByLabelText('Відкрити запис коментаря у Firebase'));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Не вдалося зберегти коментар: PERMISSION_DENIED'
      );
    });
    expect(openSpy).toHaveBeenCalledWith('about:blank', '_blank');
    expect(backendWindow.location.href).toBe('');
    expect(backendWindow.close).toHaveBeenCalledTimes(1);
    openSpy.mockRestore();
  });
});
