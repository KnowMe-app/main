import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { ProfileCreationWorkspace } from './ProfileCreationWorkspace';
import { fetchUserById, fetchUsersByIds } from './config';
import { getOverlayHistoryForCard, getOverlaysForCard } from 'utils/multiAccountEdits';
import { loadAllCreateProfileMutations, loadOwnProfileMutations, saveCreateProfileMutation } from 'utils/profileMutations';

// Regression test for: an admin opens a draft from the review queue, edits a
// field, and closes the editor. The queue card for that draft was rendered
// from a `mutations` list snapshotted once on mount - editing and closing
// only updated the open editor's own refs, so the card kept showing the
// pre-edit name/revision until a full page reload re-ran the auth effect and
// re-fetched the list. Closing the editor must re-fetch the queue itself.
jest.mock('firebase/auth', () => ({
  onAuthStateChanged: (_auth, callback) => {
    callback({ uid: 'admin-1' });
    return jest.fn();
  },
}));

jest.mock('./config', () => ({
  auth: { currentUser: { uid: 'admin-1' } },
  fetchUserById: jest.fn(async () => ({ canCreateProfiles: true })),
  fetchUsersByIds: jest.fn(async () => ({})),
  fetchFavoriteUsers: jest.fn(async () => ({})),
  fetchDislikeUsers: jest.fn(async () => ({})),
  searchUsersOnly: jest.fn(),
}));

jest.mock('./SearchBar', () => ({
  __esModule: true,
  default: () => null,
  detectSearchParams: () => null,
}));

jest.mock('./formFields', () => ({
  pickerFields: [{ name: 'name', ukrainian: "Ім'я" }],
  getFieldLabel: field => field.ukrainian || field.name,
  getFieldPlaceholder: () => '',
  getOptionLabel: value => value,
  getOptionValue: value => value,
}));

jest.mock('utils/accessLevel', () => ({
  resolveAccess: () => ({ canCreateProfiles: true, isAdmin: true }),
}));

jest.mock('utils/profileCreationSearch', () => ({ findMatchingProfileMutation: jest.fn(() => null) }));
jest.mock('utils/searchKeyUtils', () => ({ getSearchIdIndexedFields: () => [] }));

const originalDraft = {
  cardId: 'card-1',
  createdBy: 'author-1',
  revision: 3,
  status: 'pendingReview',
  data: { userId: 'card-1', name: "Ім'я6" },
};

const editedDraft = { ...originalDraft, revision: 4, data: { userId: 'card-1', name: "Ім'я9" } };

jest.mock('utils/profileMutations', () => ({
  acceptCreateProfileMutation: jest.fn(),
  getEffectiveProfile: ({ mutation }) => mutation.data,
  loadAllCreateProfileMutations: jest.fn(),
  loadOwnProfileMutations: jest.fn(),
  loadProfileMutationHistory: jest.fn(async () => []),
  purgeProfileMutationHistoryValue: jest.fn(),
  loadSharedProfileMutations: jest.fn(),
  rejectCreateProfileMutation: jest.fn(),
  reserveProfileCardId: jest.fn(() => 'new-card'),
  saveCreateProfileMutation: jest.fn(),
}));

jest.mock('utils/multiAccountEdits', () => {
  const actual = jest.requireActual('utils/multiAccountEdits');
  return {
    ...actual,
    getOverlayHistoryForCard: jest.fn(),
    getOverlaysForCard: jest.fn(),
    removeAllOverlaysForCard: jest.fn(),
    purgeOverlayHistoryEntries: jest.fn(),
    saveOverlayForUserCard: jest.fn(),
    settleOverlayFieldValue: jest.fn(),
  };
});

// A stable reference (unlike `() => jest.fn()`) so the mount-time auth
// effect - which depends on [navigate, refresh] - fires exactly once. With an
// unstable navigate, React re-runs that effect on every render for reasons
// unrelated to the bug under test, which would re-fetch the queue on its own
// and mask whether closeEditor is the thing actually triggering the refetch.
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ pathname: '/create-profile' }),
  useSearchParams: () => [new URLSearchParams(), jest.fn()],
}));

beforeEach(() => {
  fetchUserById.mockResolvedValue({ canCreateProfiles: true });
  fetchUsersByIds.mockResolvedValue({});
  loadOwnProfileMutations.mockResolvedValue([]);
  getOverlayHistoryForCard.mockResolvedValue([]);
  getOverlaysForCard.mockResolvedValue({});

  // The queue list reflects whatever was last saved, however many times the
  // effect chain happens to re-fetch it (react-router's mocked useNavigate
  // returns a fresh function each render, so the auth effect can legitimately
  // re-run more than once - that is a test-harness artifact, not the bug
  // under test, so the fixture tracks real state instead of call counts).
  let saved = false;
  saveCreateProfileMutation.mockImplementation(async () => {
    saved = true;
    return editedDraft;
  });
  loadAllCreateProfileMutations.mockImplementation(async () => [saved ? editedDraft : originalDraft]);
});

it('re-fetches the review queue when the editor is closed, so the card reflects the just-saved edit', async () => {
  render(<ProfileCreationWorkspace />);

  expect(await screen.findByText("Ім'я6")).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /Відкрити профіль/ }));
  const nameInput = await screen.findByDisplayValue("Ім'я6");
  fireEvent.change(nameInput, { target: { value: "Ім'я9" } });
  fireEvent.blur(nameInput);
  await waitFor(() => expect(saveCreateProfileMutation).toHaveBeenCalled());

  const queueCallsBeforeClose = loadAllCreateProfileMutations.mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: 'Закрити' }));

  await waitFor(() => expect(loadAllCreateProfileMutations.mock.calls.length).toBeGreaterThan(queueCallsBeforeClose));
  expect(await screen.findByText("Ім'я9")).toBeInTheDocument();
  expect(screen.queryByText("Ім'я6")).not.toBeInTheDocument();
});
