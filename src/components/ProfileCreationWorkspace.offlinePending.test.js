import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import { ProfileCreationWorkspace } from './ProfileCreationWorkspace';
import { fetchUserById, fetchUsersByIds } from './config';
import { getOverlayHistoryForCard, getOverlaysForCard } from 'utils/multiAccountEdits';
import { loadAllCreateProfileMutations, loadOwnProfileMutations, saveCreateProfileMutation } from 'utils/profileMutations';
import { readCardFormPending, rememberCardFormPending } from 'utils/cardFormPendingEdits';
import { applyUkrainianInterface } from '../testUtils/interfaceLanguage';
import { renderWithNavigationSlot } from '../testUtils/renderWithNavigationSlot';

// Без звʼязку запис форми висить у памʼяті вкладки, і закрита вкладка губила
// набране (`utils/cardFormPendingEdits`, 13.11). Каркас — той самий, що в
// `closeRefresh`: адмін відкриває чернетку з черги.
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
  addMatchingSearchQuery: jest.fn(),
  // Форма доповнення показує ще й публічні відгуки картки — вони приїжджають
  // разом з нею, тією самою воронкою, що й у стрічці.
  fetchPublicProfileComments: jest.fn(async () => ({})),
  addPublicProfileComment: jest.fn(async () => ({})),
  updatePublicProfileComment: jest.fn(async () => ({})),
  deletePublicProfileComment: jest.fn(async () => undefined),
}));

// Приватна нотатка стоїть у парі з публічною в кожній відкритій чернетці, а
// читає вона власний вузол `multiData/comments` — сюїта не про неї.
jest.mock('./smallCard/FieldComment', () => ({ FieldComment: () => null }));

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
  ...jest.requireActual('utils/accessLevel'),
  resolveAccess: () => ({ canCreateProfiles: true, isAdmin: true }),
}));

jest.mock('utils/profileCreationSearch', () => ({ findMatchingProfileMutations: jest.fn(() => []) }));
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
  localStorage.clear();
  fetchUserById.mockResolvedValue({ canCreateProfiles: true });
  fetchUsersByIds.mockResolvedValue({});
  loadOwnProfileMutations.mockResolvedValue([]);
  getOverlayHistoryForCard.mockResolvedValue([]);
  getOverlaysForCard.mockResolvedValue({});
  loadAllCreateProfileMutations.mockResolvedValue([originalDraft]);
  saveCreateProfileMutation.mockReset();
});

applyUkrainianInterface();

it('незбережене з минулого разу лягає поверх чернетки й дописується', async () => {
  rememberCardFormPending('admin-1', 'draft:card-1', { userId: 'card-1', name: 'Офлайн' });
  saveCreateProfileMutation.mockImplementation(async ({ data }) => ({ ...editedDraft, data }));

  renderWithNavigationSlot(<ProfileCreationWorkspace />);
  fireEvent.click(await screen.findByRole('button', { name: /Відкрити профіль/ }));

  await waitFor(() => expect(saveCreateProfileMutation).toHaveBeenCalled());
  expect(saveCreateProfileMutation.mock.calls[0][0].data.name).toBe('Офлайн');
  expect(await screen.findByDisplayValue('Офлайн')).toBeInTheDocument();
  await waitFor(() => expect(readCardFormPending('admin-1', 'draft:card-1')).toBeNull());
});

it('поки запис висить без звʼязку, набране лежить на пристрої', async () => {
  saveCreateProfileMutation.mockImplementation(() => new Promise(() => {}));

  renderWithNavigationSlot(<ProfileCreationWorkspace />);
  fireEvent.click(await screen.findByRole('button', { name: /Відкрити профіль/ }));
  const nameInput = await screen.findByDisplayValue("Ім'я6");
  fireEvent.change(nameInput, { target: { value: 'Без звʼязку' } });
  fireEvent.blur(nameInput);

  await waitFor(() => expect(saveCreateProfileMutation).toHaveBeenCalled());
  expect(readCardFormPending('admin-1', 'draft:card-1')?.draft?.name).toEqual(['Без звʼязку']);
});
