import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { btnCompare } from './btnCompare';
import { copyProfilePhotosBetweenCards, getAllUserPhotos, photoComparisonKey, saveComparisonField } from '../config';

jest.mock('react-hot-toast', () => ({ success: jest.fn(), error: jest.fn() }));
jest.mock('../config', () => ({
  auth: { currentUser: { uid: 'admin' } },
  getAllUserPhotos: jest.fn(),
  photoComparisonKey: jest.fn(),
  copyProfilePhotosBetweenCards: jest.fn(),
  fetchPublicProfileComments: jest.fn(async () => ({})),
  fetchUserComment: jest.fn(async () => null),
  saveComparisonField: jest.fn(),
  saveMyCardComment: jest.fn(),
}));
jest.mock('../../utils/cache', () => ({ updateCachedUser: jest.fn() }));
jest.mock('../../utils/legacyImportCommentMigration', () => ({ copyPublicCommentsBetweenCards: jest.fn() }));

const photosOf = {
  A: ['https://s/A/1.jpg', 'https://s/A/2.jpg'],
  B: ['https://s/B/2.jpg'],
};

const open = async () => {
  const users = { A: { userId: 'A', photos: photosOf.A }, B: { userId: 'B', photos: photosOf.B } };
  const setCompare = jest.fn();
  render(btnCompare(0, users, jest.fn(), jest.fn(), setCompare, { current: users }));
  fireEvent.click(screen.getByTitle('Порівняти'));
  await waitFor(() => expect(setCompare).toHaveBeenCalledTimes(2));
  render(setCompare.mock.calls[1][0]);
};

beforeEach(() => {
  jest.clearAllMocks();
  getAllUserPhotos.mockImplementation(async id => photosOf[id]);
  // Як справжній ключ: перенесена копія має те саме імʼя файлу в іншій теці.
  photoComparisonKey.mockImplementation((url, userId) => url.replace(`/${userId}/`, '/'));
  copyProfilePhotosBetweenCards.mockResolvedValue(['https://s/B/1.jpg']);
  saveComparisonField.mockImplementation(async (_id, _key, value) => value);
});

it('shows only photos missing from the other card and transfers them on tap', async () => {
  await open();
  const cell = screen.getByTitle('Перенести 1 фото в B');
  const images = within(cell).getAllByRole('img', { hidden: true });
  expect(images.map(image => image.getAttribute('src'))).toEqual(['https://s/A/1.jpg']);

  fireEvent.click(cell);
  await waitFor(() => expect(copyProfilePhotosBetweenCards).toHaveBeenCalledWith({
    sourceUserId: 'A',
    targetUserId: 'B',
    photoUrls: ['https://s/A/1.jpg'],
  }));
  await waitFor(() => expect(saveComparisonField)
    .toHaveBeenCalledWith('B', 'photos', ['https://s/B/2.jpg', 'https://s/B/1.jpg']));
});
