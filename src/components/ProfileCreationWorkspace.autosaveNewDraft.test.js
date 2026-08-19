import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { ProfileCreationWorkspace } from './ProfileCreationWorkspace';
import { findMatchingProfileMutations } from 'utils/profileCreationSearch';
import {
  loadAllCreateProfileMutations,
  loadOwnProfileMutations,
  loadSharedProfileMutations,
  reserveProfileCardId,
  saveCreateProfileMutation,
} from 'utils/profileMutations';

// Regression test for: clicking "Додати профіль" only updated local React
// state (reserveProfileCardId merely allocates a key, it writes nothing) -
// a brand new draft that nobody ever blurred a field on was silently lost,
// never reaching profileMutations at all. Creating the draft must persist it
// immediately instead of waiting for the first field blur.
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
  fetchFavoriteUsers: jest.fn(async () => ({})),
  fetchDislikeUsers: jest.fn(async () => ({})),
  searchUsersOnly: jest.fn(),
}));
jest.mock('./smallCard/FieldComment', () => ({ FieldComment: () => null }));

// Drafts no longer appear in an always-visible list - they only surface
// through a search match. This stub stands in for the real SearchBar: it
// exposes just enough of the search flow (a not-found search) so "Додати
// профіль" becomes clickable, the same way it would after a real search.
jest.mock('./SearchBar', () => ({
  __esModule: true,
  default: ({ setSearch, setUserNotFound, onSearchExecuted }) => (
    <button type="button" onClick={() => { setSearch('0501234567'); setUserNotFound(true); onSearchExecuted(); }}>
      Шукати (тест)
    </button>
  ),
  detectSearchParams: () => ({ key: 'phone', value: '0501234567' }),
}));

jest.mock('./formFields', () => ({
  pickerFields: [],
  getFieldLabel: field => field.name,
  getFieldPlaceholder: () => '',
  getOptionLabel: value => value,
  getOptionValue: value => value,
}));

jest.mock('utils/accessLevel', () => ({
  resolveAccess: () => ({ canCreateProfiles: true, isAdmin: false }),
}));

jest.mock('utils/profileCreationSearch', () => ({ findMatchingProfileMutations: jest.fn(() => []) }));
jest.mock('utils/searchKeyUtils', () => ({ getSearchIdIndexedFields: () => [] }));

jest.mock('utils/profileMutations', () => ({
  acceptCreateProfileMutation: jest.fn(),
  getEffectiveProfile: ({ mutation }) => mutation.data,
  loadAllCreateProfileMutations: jest.fn(async () => []),
  loadOwnProfileMutations: jest.fn(async () => []),
  loadProfileMutationHistory: jest.fn(async () => []),
  purgeProfileMutationHistoryValue: jest.fn(),
  loadSharedProfileMutations: jest.fn(async () => []),
  reserveProfileCardId: jest.fn(() => 'new-card-1'),
  saveCreateProfileMutation: jest.fn(),
}));

jest.mock('utils/multiAccountEdits', () => {
  const actual = jest.requireActual('utils/multiAccountEdits');
  return {
    ...actual,
    getOverlayHistoryForCard: jest.fn(async () => []),
    getOverlaysForCard: jest.fn(async () => ({})),
    saveOverlayForUserCard: jest.fn(async () => undefined),
  };
});

jest.mock('react-router-dom', () => ({
  useNavigate: () => jest.fn(),
  useLocation: () => ({ pathname: '/create-profile' }),
  useSearchParams: () => [new URLSearchParams(), jest.fn()],
}));

beforeEach(() => {
  jest.clearAllMocks();
  loadOwnProfileMutations.mockResolvedValue([]);
  loadSharedProfileMutations.mockResolvedValue([]);
  loadAllCreateProfileMutations.mockResolvedValue([]);
  findMatchingProfileMutations.mockReturnValue([]);
  reserveProfileCardId.mockReturnValue('new-card-1');
  saveCreateProfileMutation.mockImplementation(async ({ cardId, data }) => ({
    cardId,
    operation: 'create',
    data,
    createdBy: 'owner-1',
    createdAt: 1,
    updatedAt: 1,
    revision: 1,
    status: 'pendingReview',
  }));
});

it('persists a brand new draft immediately, without waiting for a field blur', async () => {
  render(<ProfileCreationWorkspace />);

  fireEvent.click(await screen.findByRole('button', { name: 'Шукати (тест)' }));
  fireEvent.click(await screen.findByRole('button', { name: /Додати профіль/ }));

  await waitFor(() => expect(saveCreateProfileMutation).toHaveBeenCalledWith(expect.objectContaining({
    cardId: 'new-card-1',
    creatorUid: 'owner-1',
    actorUid: 'owner-1',
    expectedRevision: 0,
  })));
});
