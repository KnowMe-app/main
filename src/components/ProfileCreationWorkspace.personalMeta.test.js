import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { ProfileCreationWorkspace } from './ProfileCreationWorkspace';
import {
  addDislikeUser,
  addFavoriteUser,
  fetchDislikeUsers,
  fetchFavoriteUsers,
  fetchUserComment,
  removeFavoriteUser,
  saveMyCardComment,
} from './config';
import { loadOwnProfileMutations, loadSharedProfileMutations } from 'utils/profileMutations';

jest.mock('firebase/auth', () => ({
  onAuthStateChanged: (_auth, callback) => {
    callback({ uid: 'owner-1' });
    return jest.fn();
  },
}));

jest.mock('./config', () => ({
  auth: { currentUser: { uid: 'owner-1' } },
  fetchUserById: jest.fn(async () => ({ canCreateProfiles: true })),
  fetchUsersByIds: jest.fn(async () => ({})),
  searchUsersOnly: jest.fn(),
  fetchFavoriteUsers: jest.fn(async () => ({})),
  fetchDislikeUsers: jest.fn(async () => ({})),
  fetchUserComment: jest.fn(async () => null),
  saveMyCardComment: jest.fn(async () => undefined),
  migrateMyCardComment: jest.fn(async () => undefined),
  COMMENTS_ROOT_PATH: 'multiData/comments',
  addFavoriteUser: jest.fn(async () => undefined),
  removeFavoriteUser: jest.fn(async () => undefined),
  addDislikeUser: jest.fn(async () => undefined),
  removeDislikeUser: jest.fn(async () => undefined),
}));

jest.mock('./SearchBar', () => ({
  __esModule: true,
  default: () => null,
  detectSearchParams: () => null,
}));
jest.mock('./formFields', () => ({
  pickerFields: [{ name: 'name', ukrainian: "Ім'я" }],
  getFieldLabel: field => field.ukrainian,
  getFieldPlaceholder: () => '',
  getOptionLabel: value => value,
  getOptionValue: value => value,
}));
jest.mock('utils/accessLevel', () => ({
  resolveAccess: () => ({ canCreateProfiles: true, isAdmin: false }),
}));
jest.mock('utils/profileCreationSearch', () => ({ findMatchingProfileMutation: jest.fn(() => null) }));
jest.mock('utils/searchKeyUtils', () => ({ getSearchIdIndexedFields: () => [] }));
jest.mock('utils/profileMutations', () => ({
  acceptCreateProfileMutation: jest.fn(),
  getEffectiveProfile: ({ mutation }) => mutation.data,
  loadAllCreateProfileMutations: jest.fn(async () => []),
  loadOwnProfileMutations: jest.fn(async () => [{
    cardId: 'draft-card', createdBy: 'owner-1', status: 'private', revision: 1, updatedAt: 123,
    data: { name: 'Олена' },
  }]),
  loadProfileMutationHistory: jest.fn(async () => []),
  purgeProfileMutationHistoryValue: jest.fn(),
  loadSharedProfileMutations: jest.fn(async () => []),
  reserveProfileCardId: jest.fn(() => 'new-card'),
  saveCreateProfileMutation: jest.fn(),
}));
jest.mock('utils/multiAccountEdits', () => ({
  applyOverlayToCard: card => card,
  applyOverlaysToCard: card => card,
  buildOverlayFromDraft: jest.fn(),
  getOverlayHistoryForCard: jest.fn(async () => []),
  getOverlaysForCard: jest.fn(async () => ({})),
  purgeOverlayHistoryEntries: jest.fn(),
  saveOverlayForUserCard: jest.fn(),
  settleOverlayFieldValue: jest.fn(),
}));
jest.mock('react-router-dom', () => ({
  useNavigate: () => jest.fn(),
  useLocation: () => ({ pathname: '/create-profile' }),
  useSearchParams: () => [new URLSearchParams(), jest.fn()],
}));

const openOwnDraft = async () => {
  render(<ProfileCreationWorkspace />);
  fireEvent.click(await screen.findByRole('button', { name: /Відкрити профіль/ }));
  await screen.findByPlaceholderText('Додайте свій коментар');
};

beforeEach(() => {
  fetchFavoriteUsers.mockResolvedValue({});
  fetchDislikeUsers.mockResolvedValue({});
  fetchUserComment.mockResolvedValue(null);
  loadOwnProfileMutations.mockResolvedValue([{
    cardId: 'draft-card', createdBy: 'owner-1', status: 'private', revision: 1, updatedAt: 123,
    data: { name: 'Олена' },
  }]);
  loadSharedProfileMutations.mockResolvedValue([]);
});

it('replaces regular-user draft status and progress with personal metadata controls', async () => {
  await openOwnDraft();

  expect(screen.getByPlaceholderText('Додайте свій коментар')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'В обране' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Дизлайк' })).toBeInTheDocument();
  expect(screen.queryByText(/Чернетка · оновлено/)).not.toBeInTheDocument();
  expect(screen.getByText('Заповнено анкету')).toBeInTheDocument();
});

it('shows personal metadata for persisted drafts without revision metadata', async () => {
  loadOwnProfileMutations.mockResolvedValue([{
    cardId: 'legacy-draft', createdBy: 'owner-1', status: 'private', updatedAt: 123,
    data: { name: 'Олена' },
  }]);

  await openOwnDraft();

  expect(screen.getByPlaceholderText('Додайте свій коментар')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'В обране' })).toBeInTheDocument();
});

it('saves a personal comment on blur using the draft card id fallback', async () => {
  await openOwnDraft();
  const comment = screen.getByPlaceholderText('Додайте свій коментар');

  fireEvent.change(comment, { target: { value: 'Моя нотатка' } });
  fireEvent.blur(comment);

  await waitFor(() => expect(saveMyCardComment).toHaveBeenCalledWith('draft-card', 'Моя нотатка', 'owner-1'));
});

it('switches mutually exclusive reactions through the reused controls', async () => {
  await openOwnDraft();
  const favorite = screen.getByRole('button', { name: 'В обране' });
  const dislike = screen.getByRole('button', { name: 'Дизлайк' });

  fireEvent.click(favorite);
  await waitFor(() => expect(favorite).toHaveAttribute('aria-pressed', 'true'));
  expect(addFavoriteUser).toHaveBeenCalledWith('draft-card', undefined);

  fireEvent.click(dislike);
  await waitFor(() => expect(dislike).toHaveAttribute('aria-pressed', 'true'));
  expect(favorite).toHaveAttribute('aria-pressed', 'false');
  expect(addDislikeUser).toHaveBeenCalledWith('draft-card', undefined);
  expect(removeFavoriteUser).toHaveBeenCalledWith('draft-card', undefined);
});
