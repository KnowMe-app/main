import '@testing-library/jest-dom';
import { profileProposalService } from 'utils/profileProposalRepository';
import React from 'react';
import toast from 'react-hot-toast';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';

import { ProfileCreationWorkspace } from './ProfileCreationWorkspace';
import { fetchUserById, fetchUsersByIds } from './config';
import { getOverlayHistoryForCard, getOverlaysForCard } from 'utils/multiAccountEdits';
import { loadAllCreateProfileMutations, loadOwnProfileMutations } from 'utils/profileMutations';
import { createEditorSnapshot, proposalEditorKey } from 'utils/profileProposalEditor';
import { readCardFormPending, rememberCardFormPending } from 'utils/cardFormPendingEdits';
import { applyUkrainianInterface } from '../testUtils/interfaceLanguage';
import { renderWithNavigationSlot } from '../testUtils/renderWithNavigationSlot';

// Без звʼязку запис форми висить у памʼяті вкладки, і закрита вкладка губила
// набране (`utils/cardFormPendingEdits`, 13.11). Каркас — той самий, що в
// `closeRefresh`: адмін відкриває чернетку з черги.
jest.mock('utils/profileProposalRepository', () => ({
  profileProposalService: { getDraft: jest.fn(), createDraft: jest.fn(), saveDraft: jest.fn(), deleteDraft: jest.fn(), reviewDraft: jest.fn() },
}));

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() }),
}));

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

jest.mock('utils/profileMutations', () => ({
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
  profileProposalService.saveDraft.mockImplementation(async (proposal, { expected }) => ({ ...proposal, revision: expected.revision + 1 }));
});

applyUkrainianInterface();

const target = 'draft:card-1';
const expected = createEditorSnapshot(originalDraft);
const targetKey = proposalEditorKey({ operation: 'create', cardId: 'card-1', createdBy: 'author-1' });

const openEditor = async () => {
  renderWithNavigationSlot(<ProfileCreationWorkspace />);
  fireEvent.click(await screen.findByRole('button', { name: /Відкрити профіль/ }));
};

const typeAndBlur = (input, value) => {
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
};

it('replays a pending edit against the same proposal and field baseline', async () => {
  rememberCardFormPending('admin-1', target, { userId: 'card-1', name: 'Офлайн' }, {
    expected, targetKey, basis: originalDraft.data,
  });

  await openEditor();
  expect(await screen.findByDisplayValue('Офлайн')).toBeInTheDocument();
  await waitFor(() => expect(profileProposalService.saveDraft).toHaveBeenCalledWith(
    expect.objectContaining({ data: { userId: 'card-1', name: 'Офлайн' } }), { expected },
  ));
  await waitFor(() => expect(readCardFormPending('admin-1', target)).toBeNull());
});

it.each([
  ['an older revision', { expected: { ...expected, revision: 2 }, targetKey, basis: originalDraft.data }],
  ['a pre-upgrade snapshot', undefined],
])('does not replay %s against the latest proposal', async (_reason, metadata) => {
  rememberCardFormPending('admin-1', target, { userId: 'card-1', name: 'Офлайн' }, metadata);

  await openEditor();
  expect(await screen.findByDisplayValue("Ім'я6")).toBeInTheDocument();
  await waitFor(() => expect(screen.getByTestId('draft-autosave')).toHaveTextContent(/Профіль уже змінено/));
  expect(profileProposalService.saveDraft).not.toHaveBeenCalled();
  expect(readCardFormPending('admin-1', target)?.draft?.name).toBe('Офлайн');
});

it('keeps typed text on the device before blur and while a save waits for the network', async () => {
  profileProposalService.saveDraft.mockImplementation(() => new Promise(() => {}));

  await openEditor();
  const nameInput = await screen.findByDisplayValue("Ім'я6");
  fireEvent.change(nameInput, { target: { value: 'Без звʼязку' } });
  expect(profileProposalService.saveDraft).not.toHaveBeenCalled();
  expect(readCardFormPending('admin-1', target)).toMatchObject({
    draft: { name: ['Без звʼязку'] }, needsBlur: true, expected,
  });
  fireEvent.blur(nameInput);

  await waitFor(() => expect(profileProposalService.saveDraft).toHaveBeenCalled());
  expect(readCardFormPending('admin-1', target)).toMatchObject({ draft: { name: ['Без звʼязку'] }, expected });
  expect(readCardFormPending('admin-1', target)).not.toHaveProperty('needsBlur');
});

it('restores unblurred text without sending an unnormalized save', async () => {
  rememberCardFormPending('admin-1', target, { userId: 'card-1', name: ['Ще набираю'] }, {
    expected, targetKey, basis: originalDraft.data, needsBlur: true,
  });

  await openEditor();
  const input = await screen.findByDisplayValue('Ще набираю');
  expect(profileProposalService.saveDraft).not.toHaveBeenCalled();

  fireEvent.blur(input);
  await waitFor(() => expect(profileProposalService.saveDraft).toHaveBeenCalledWith(
    expect.objectContaining({ data: { userId: 'card-1', name: ['Ще набираю'] } }), { expected },
  ));
  await waitFor(() => expect(readCardFormPending('admin-1', target)).toBeNull());
});

it('preserves a newer pending edit until it commits and saves it against the preceding result', async () => {
  let finishFirst;
  let finishSecond;
  profileProposalService.saveDraft
    .mockImplementationOnce(proposal => new Promise(resolve => {
      finishFirst = () => resolve({ ...proposal, revision: 4 });
    }))
    .mockImplementationOnce(proposal => new Promise(resolve => {
      finishSecond = () => resolve({ ...proposal, revision: 5 });
    }));

  await openEditor();
  const input = await screen.findByDisplayValue("Ім'я6");
  typeAndBlur(input, 'Перша зміна');
  await waitFor(() => expect(profileProposalService.saveDraft).toHaveBeenCalledTimes(1));
  typeAndBlur(input, 'Друга зміна');
  expect(readCardFormPending('admin-1', target)?.draft?.name).toEqual(['Друга зміна']);

  await act(async () => finishFirst());
  await waitFor(() => expect(profileProposalService.saveDraft).toHaveBeenCalledTimes(2));
  expect(profileProposalService.saveDraft.mock.calls[1][1].expected).toMatchObject({
    data: { name: ['Перша зміна'] }, revision: 4,
  });
  expect(screen.getByTestId('draft-autosave')).toHaveTextContent('Зберігаємо');
  expect(readCardFormPending('admin-1', target)).toMatchObject({
    draft: { name: ['Друга зміна'] }, expected: { revision: 4 },
  });

  await act(async () => finishSecond());
  expect(screen.getByTestId('draft-autosave')).toHaveTextContent('Збережено');
  expect(readCardFormPending('admin-1', target)).toBeNull();
});

it('keeps a late acknowledgment scoped to the editor that started the save', async () => {
  const secondDraft = { ...originalDraft, cardId: 'card-2', data: { name: 'Інша чернетка', userId: 'card-2' } };
  loadAllCreateProfileMutations.mockResolvedValue([originalDraft, secondDraft]);
  let finishFirst;
  profileProposalService.saveDraft.mockImplementationOnce(proposal => new Promise(resolve => {
    finishFirst = () => resolve({ ...proposal, revision: 4 });
  }));

  renderWithNavigationSlot(<ProfileCreationWorkspace />);
  fireEvent.click((await screen.findAllByRole('button', { name: /Відкрити профіль/ }))[0]);
  typeAndBlur(await screen.findByDisplayValue("Ім'я6"), 'Зміна першої чернетки');
  await waitFor(() => expect(profileProposalService.saveDraft).toHaveBeenCalledTimes(1));

  fireEvent.click(screen.getByRole('button', { name: 'Назад' }));
  fireEvent.click((await screen.findAllByRole('button', { name: /Відкрити профіль/ }))[1]);
  expect(await screen.findByDisplayValue('Інша чернетка')).toBeInTheDocument();

  await act(async () => finishFirst());

  expect(screen.getByDisplayValue('Інша чернетка')).toBeInTheDocument();
  expect(screen.queryByDisplayValue('Зміна першої чернетки')).not.toBeInTheDocument();
  expect(screen.getByTestId('draft-autosave')).not.toHaveTextContent('Збережено о');
  expect(readCardFormPending('admin-1', target)).toBeNull();
});

it('retains the edit and blocks publication if its last save conflicts', async () => {
  profileProposalService.saveDraft.mockRejectedValueOnce(Object.assign(new Error('REVISION_CONFLICT'), { code: 'REVISION_CONFLICT' }));

  await openEditor();
  typeAndBlur(await screen.findByDisplayValue("Ім'я6"), 'Конфлікт');
  await waitFor(() => expect(screen.getByTestId('draft-autosave')).toHaveTextContent(/Профіль уже змінено/));
  toast.error.mockClear();
  fireEvent.click(screen.getByRole('button', { name: 'Зберегти чернетку' }));
  await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));

  expect(profileProposalService.reviewDraft).not.toHaveBeenCalled();
  expect(readCardFormPending('admin-1', target)?.draft?.name).toEqual(['Конфлікт']);
});
