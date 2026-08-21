import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { PublicCommentBlock, PUBLIC_COMMENT_VISIBILITY_NOTE } from './ProfileRow';

const setup = (props = {}) => {
  const onCreate = props.onCreate || jest.fn().mockResolvedValue(undefined);
  const onUpdate = props.onUpdate || jest.fn().mockResolvedValue(undefined);
  const utils = render(
    <PublicCommentBlock
      profileId="profile-1"
      viewerId="viewer-1"
      comments={props.comments || []}
      onCreate={onCreate}
      onUpdate={onUpdate}
    />
  );
  return { ...utils, onCreate, onUpdate };
};

const openComposer = () => {
  fireEvent.click(screen.getByText('Додати коментар'));
  return screen.getByRole('textbox');
};

describe('quick public comment', () => {
  it('offers a plain line of text, not a field, until it is clicked', () => {
    setup();
    expect(screen.getByText('Додати коментар')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('shows the public / signed marking before any text is typed', () => {
    setup();
    const field = openComposer();
    expect(screen.getByText(PUBLIC_COMMENT_VISIBILITY_NOTE)).toBeInTheDocument();
    expect(field).toHaveValue('');
  });

  it('saves on blur', async () => {
    const { onCreate } = setup();
    const field = openComposer();
    fireEvent.change(field, { target: { value: 'обережно' } });
    fireEvent.blur(field);
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith('profile-1', 'обережно'));
  });

  it('writes nothing for an empty field and returns to the plain line', async () => {
    const { onCreate } = setup();
    const field = openComposer();
    fireEvent.change(field, { target: { value: '   ' } });
    fireEvent.blur(field);
    expect(await screen.findByText('Додати коментар')).toBeInTheDocument();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('discards the draft on Esc', async () => {
    const { onCreate } = setup();
    const field = openComposer();
    fireEvent.change(field, { target: { value: 'не зберігати' } });
    fireEvent.keyDown(field, { key: 'Escape' });
    fireEvent.blur(field);
    expect(await screen.findByText('Додати коментар')).toBeInTheDocument();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('commits on Ctrl+Enter', async () => {
    const { onCreate } = setup();
    const field = openComposer();
    fireEvent.change(field, { target: { value: 'швидко' } });
    fireEvent.keyDown(field, { key: 'Enter', ctrlKey: true });
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith('profile-1', 'швидко'));
  });

  it('reports the save and clears the status after three seconds', async () => {
    jest.useFakeTimers();
    try {
      const { onCreate } = setup();
      const field = openComposer();
      fireEvent.change(field, { target: { value: 'готово' } });
      fireEvent.blur(field);
      await act(async () => { await Promise.resolve(); });
      expect(onCreate).toHaveBeenCalled();
      expect(screen.getByText(/^Збережено \d{2}:\d{2}$/)).toBeInTheDocument();
      act(() => { jest.advanceTimersByTime(3000); });
      expect(screen.queryByText(/^Збережено/)).not.toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps the text with a retry when the write fails', async () => {
    const onCreate = jest.fn().mockRejectedValue(new Error('offline'));
    setup({ onCreate });
    const field = openComposer();
    fireEvent.change(field, { target: { value: 'не пройшло' } });
    fireEvent.blur(field);
    expect(await screen.findByText('Повторити')).toBeInTheDocument();
    expect(screen.getByText('не пройшло')).toBeInTheDocument();

    onCreate.mockResolvedValueOnce(undefined);
    fireEvent.click(screen.getByText('Повторити'));
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(2));
  });

  it('edits the viewer\'s own comment inline but only expands someone else\'s', () => {
    setup({
      comments: [
        { id: 'c1', text: 'мій запис', authorId: 'viewer-1', authorName: 'Ольга Петрів', createdAt: Date.now() },
        { id: 'c2', text: 'чужий запис', authorId: 'viewer-2', authorName: 'Ігор Ковальчук', createdAt: Date.now() },
      ],
    });

    fireEvent.click(screen.getByText('чужий запис'));
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('мій запис'));
    expect(screen.getByRole('textbox')).toHaveValue('мій запис');
  });

  it('labels each comment with its author initials', () => {
    setup({
      comments: [
        { id: 'c1', text: 'запис', authorId: 'viewer-2', authorName: 'Ігор Ковальчук', createdAt: Date.now() },
      ],
    });
    expect(screen.getByText('ІК')).toBeInTheDocument();
  });
});
