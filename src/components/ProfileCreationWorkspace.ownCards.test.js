import '@testing-library/jest-dom';
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { ProfileCreationWorkspace } from './ProfileCreationWorkspace';
import { loadOwnProfileMutations, loadSharedProfileMutations } from 'utils/profileMutations';

/**
 * Екран називається тим, що на ньому лежить, — картками, які завів цей читач.
 *
 * «Додати профіль» називало дію, а не місце: людина, яка щойно завела картку,
 * не мала підстав вертатись сюди по неї, бо підпис нічого про неї не обіцяв, а
 * порожній рядок пошуку давав порожній екран. Тепер тут лежить список власних
 * карток — разом із уже прийнятими, бо «що я завів» не перестає бути правдою
 * після того, як картку опублікували.
 *
 * І вихід звідси — один жест: стрілка в шапці робить рівно те саме, що
 * апаратна кнопка «назад» телефона. Доти кнопка «Закрити» внизу вела до видачі
 * пошуку, а апаратна кнопка тим часом висаджувала читача на порожній екран
 * майстерні.
 */
jest.mock('firebase/auth', () => ({
  onAuthStateChanged: (_auth, callback) => {
    callback({ uid: 'owner-1' });
    return jest.fn();
  },
  signOut: jest.fn(async () => undefined),
}));

jest.mock('./config', () => ({
  auth: { currentUser: { uid: 'owner-1' } },
  fetchUserById: jest.fn(async () => ({ canCreateProfiles: true })),
  fetchUsersByIds: jest.fn(async () => ({})),
  searchUsersOnly: jest.fn(),
  fetchFavoriteUsers: jest.fn(async () => ({})),
  fetchDislikeUsers: jest.fn(async () => ({})),
  readProfileFromNodes: jest.fn(async () => null),
  addMatchingSearchQuery: jest.fn(),
}));
jest.mock('./smallCard/FieldComment', () => ({ FieldComment: () => null }));

jest.mock('./SearchBar', () => ({
  __esModule: true,
  default: ({ setSearch, onSearchExecuted, onSearchSettled }) => (
    <button
      type="button"
      onClick={() => { setSearch('Олена'); onSearchExecuted(); onSearchSettled(); }}
    >
      Шукати (тест)
    </button>
  ),
  detectSearchParams: () => ({ key: 'name', value: 'Олена' }),
}));
jest.mock('./formFields', () => ({
  pickerFields: [{ name: 'name', ukrainian: "Ім'я" }],
  getFieldLabel: field => field.ukrainian || field.name,
  getFieldPlaceholder: () => '',
  getOptionLabel: value => value,
  getOptionValue: value => value,
}));
jest.mock('utils/accessLevel', () => ({
  resolveAccess: () => ({ canCreateProfiles: true, isAdmin: false }),
}));
jest.mock('utils/searchKeyUtils', () => ({
  ...jest.requireActual('utils/searchKeyUtils'),
  getSearchIdIndexedFields: () => [],
}));
jest.mock('utils/profileMutations', () => ({
  acceptCreateProfileMutation: jest.fn(),
  getEffectiveProfile: ({ mutation }) => mutation.data,
  loadAllCreateProfileMutations: jest.fn(async () => []),
  loadOwnProfileMutations: jest.fn(async () => []),
  loadProfileMutationHistory: jest.fn(async () => []),
  purgeProfileMutationHistoryValue: jest.fn(),
  loadSharedProfileMutations: jest.fn(async () => []),
  reserveProfileCardId: jest.fn(() => 'new-card'),
  saveCreateProfileMutation: jest.fn(),
}));
jest.mock('utils/multiAccountEdits', () => ({
  applyOverlayToCard: card => card,
  applyOverlaysToCard: card => card,
  buildOverlayFromDraft: jest.fn(() => ({})),
  getOverlayHistoryForCard: jest.fn(async () => []),
  getOverlaysForCard: jest.fn(async () => ({})),
  getStackedCardViews: ({ canonical }) => ({ stacked: canonical, baseWithoutOwnOverlay: canonical }),
  purgeOverlayHistoryEntries: jest.fn(),
  saveOverlayForUserCard: jest.fn(),
  settleOverlayFieldValue: jest.fn(),
}));

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ pathname: '/matching/create-profile', state: null }),
  useSearchParams: () => [new URLSearchParams(), jest.fn()],
}));

const DRAFT = {
  cardId: 'draft-card', createdBy: 'owner-1', status: 'pendingReview', revision: 1, updatedAt: 123,
  data: { userId: 'draft-card', name: 'Олена' },
};
const PUBLISHED = {
  cardId: 'published-card', createdBy: 'owner-1', status: 'accepted', revision: 4, updatedAt: 456,
  data: { userId: 'published-card', name: 'Марія' },
};

beforeEach(() => {
  jest.clearAllMocks();
  loadOwnProfileMutations.mockResolvedValue([DRAFT, PUBLISHED]);
  loadSharedProfileMutations.mockResolvedValue([]);
});

it('називає екран власними картками і показує їх без жодного пошуку', async () => {
  render(<ProfileCreationWorkspace />);

  expect(await screen.findByRole('heading', { name: 'Створені мною' })).toBeInTheDocument();
  expect(await screen.findByText('Олена')).toBeInTheDocument();
  expect(screen.getByText('Марія')).toBeInTheDocument();
  expect(screen.getByText('Очікує перевірки')).toBeInTheDocument();
  // Прийнята картка зі списку не зникає: «що я завів» лишається правдою й після
  // публікації, а дією над нею стає доповнення, а не редагування чернетки.
  expect(screen.getByText('Опубліковано')).toBeInTheDocument();
});

it('питає індекс разом із прийнятими картками, щоб список не губив опубліковане', async () => {
  render(<ProfileCreationWorkspace />);

  await waitFor(() => expect(loadOwnProfileMutations)
    .toHaveBeenCalledWith('owner-1', { includeAccepted: true }));
});

it('порожній список пояснює, з чого почати, а не лишає порожній екран', async () => {
  loadOwnProfileMutations.mockResolvedValue([]);
  render(<ProfileCreationWorkspace />);

  expect(await screen.findByText('Ви ще не завели жодної картки.')).toBeInTheDocument();
});

it('першим рядком видачі пропонує завести картку з набраного', async () => {
  render(<ProfileCreationWorkspace />);

  fireEvent.click(await screen.findByRole('button', { name: 'Шукати (тест)' }));

  const draftRow = await screen.findByTestId('query-draft-card');
  expect(draftRow).toHaveTextContent("Ім'я");
  expect(draftRow).toHaveTextContent('Олена');
  expect(screen.getByRole('button', { name: /Створити/ })).toBeEnabled();
});

it('апаратна кнопка «назад» закриває форму так само, як стрілка в шапці', async () => {
  render(<ProfileCreationWorkspace />);

  fireEvent.click(await screen.findByRole('button', { name: 'Шукати (тест)' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Відкрити' }));
  await screen.findByRole('heading', { name: 'Олена' });

  // Відкрита форма поклала в історію рівно один запис — саме його знімає
  // апаратна кнопка.
  expect(window.history.state?.profileCreationForm).toBe(true);
  await act(async () => {
    window.history.back();
    await new Promise(resolve => setTimeout(resolve, 0));
  });

  expect(await screen.findByRole('heading', { name: 'Створені мною' })).toBeInTheDocument();
  // Читач лишається на своєму екрані, а не виїжджає з нього навігацією.
  expect(mockNavigate).not.toHaveBeenCalled();
});
