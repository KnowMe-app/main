import React, { useState } from 'react';
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { loadOwnProfilePhotos } from './config';
import { Photos } from './Photos';

jest.mock('./config', () => ({ loadOwnProfilePhotos: jest.fn() }));
jest.mock('./PhotoViewer', () => () => null);

const thumbnail = 'https://example.com/test-photo.jpg';

const Gallery = ({ photos = [], photoProfile, loadStorage = true, onPhotosHydrated }) => {
  const [state, setState] = useState({ userId: 'test-profile', photos });
  return (
    <>
      <Photos state={state} setState={setState} photoProfile={photoProfile} loadStorage={loadStorage} onPhotosHydrated={onPhotosHydrated} compact />
      <button type="button" onClick={() => setState(previous => ({ ...previous, city: 'Київ' }))}>Змінити місто</button>
    </>
  );
};

afterEach(() => {
  loadOwnProfilePhotos.mockReset();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test('a successful empty load stays distinct from a failure and the upload opens from the keyboard', async () => {
  loadOwnProfilePhotos.mockResolvedValue({ photos: [], unavailable: false });
  render(<Gallery />);
  expect(screen.getByRole('status')).toHaveTextContent('Перевіряємо фото');
  await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());

  const openPicker = jest.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
  userEvent.tab();
  expect(screen.getByRole('button', { name: 'Додати фото' })).toHaveFocus();
  userEvent.keyboard('{Enter}');
  expect(openPicker).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Змінити місто' }));
  expect(loadOwnProfilePhotos).toHaveBeenCalledTimes(1);
});

test('a Storage failure preserves a known photo, with an independent retry and recovered focus', async () => {
  loadOwnProfilePhotos
    .mockResolvedValueOnce({ photos: [thumbnail], unavailable: true })
    .mockResolvedValueOnce({ photos: [thumbnail], unavailable: false });
  render(<Gallery photos={[thumbnail]} />);
  expect(screen.getByRole('button', { name: 'Відкрити фото 1' })).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Не вдалося перевірити всі фото'));

  const retry = screen.getByRole('button', { name: 'Повторити завантаження' });
  retry.focus();
  userEvent.keyboard('{Enter}');
  await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  expect(screen.getByRole('button', { name: 'Додати фото' })).toHaveFocus();
  expect(screen.getByRole('button', { name: 'Відкрити фото 1' })).toBeInTheDocument();
  expect(loadOwnProfilePhotos).toHaveBeenLastCalledWith('test-profile', [thumbnail], { fallbackPhotos: [thumbnail], retry: true });
});

test('an authoritative empty list drops a cached thumbnail after a successful Storage check', async () => {
  const onPhotosHydrated = jest.fn();
  loadOwnProfilePhotos.mockResolvedValue({ photos: [], unavailable: false });
  render(<Gallery photos={[thumbnail]} photoProfile={{ userId: 'test-profile', photos: [] }} onPhotosHydrated={onPhotosHydrated} />);

  expect(screen.getByRole('button', { name: 'Відкрити фото 1' })).toBeInTheDocument();
  expect(loadOwnProfilePhotos).toHaveBeenCalledWith('test-profile', [], { fallbackPhotos: [thumbnail], retry: false });
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Відкрити фото 1' })).not.toBeInTheDocument());
  expect(onPhotosHydrated).toHaveBeenCalledWith('test-profile', { photos: [] });
});

test('retry after a hung listing ignores the stale response and waits for profile fields before making requests', async () => {
  jest.useFakeTimers();
  let resolveOldListing;
  loadOwnProfilePhotos
    .mockReturnValueOnce(new Promise(resolve => { resolveOldListing = resolve; }))
    .mockResolvedValueOnce({ photos: [], unavailable: false });
  const { rerender } = render(<Gallery loadStorage={false} />);
  expect(loadOwnProfilePhotos).not.toHaveBeenCalled();

  rerender(<Gallery />);
  act(() => jest.advanceTimersByTime(8000));
  expect(screen.getByRole('status')).toHaveTextContent('Фото тимчасово недоступні');
  fireEvent.click(screen.getByRole('button', { name: 'Повторити завантаження' }));
  await act(async () => resolveOldListing({ photos: [thumbnail], unavailable: false }));

  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Відкрити фото 1' })).not.toBeInTheDocument();
  expect(loadOwnProfilePhotos).toHaveBeenCalledTimes(2);
});
