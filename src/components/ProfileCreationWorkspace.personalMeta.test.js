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
import { applyUkrainianInterface } from '../testUtils/interfaceLanguage';

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
  addMatchingSearchQuery: jest.fn(),
  // Форма доповнення показує ще й публічні відгуки картки — вони приїжджають
  // разом з нею, тією самою воронкою, що й у стрічці.
  fetchPublicProfileComments: jest.fn(async () => ({})),
  addPublicProfileComment: jest.fn(async () => ({})),
  updatePublicProfileComment: jest.fn(async () => ({})),
  deletePublicProfileComment: jest.fn(async () => undefined),
}));

// Drafts no longer appear in an always-visible list - they only surface
// through a search match. This minimal stub stands in for the real
// SearchBar: clicking it runs a "search" that the mocked detectSearchParams
// resolves to the fixture's own cardId, so the match renders and the test
// can open it exactly as a real search would offer it.
jest.mock('./SearchBar', () => ({
  __esModule: true,
  default: ({ setSearch, onSearchExecuted }) => (
    <button type="button" onClick={() => { setSearch('Олена'); onSearchExecuted(); }}>
      Шукати (тест)
    </button>
  ),
  detectSearchParams: () => ({ key: 'name', value: 'Олена' }),
}));
jest.mock('./formFields', () => ({
  // Публічна нотатка — таке саме поле форми, як решта, тож у переліку вона є:
  // саме його форма показує в доріжці поруч із приватною.
  pickerFields: [
    { name: 'name', ukrainian: "Ім'я" },
    { name: 'publicComment', ukrainian: 'Публічний коментар' },
  ],
  getFieldLabel: field => field.ukrainian,
  getFieldPlaceholder: () => '',
  getOptionLabel: value => value,
  getOptionValue: value => value,
}));
jest.mock('utils/accessLevel', () => ({
  resolveAccess: () => ({ canCreateProfiles: true, isAdmin: false }),
}));
// The real matcher and normalizer are used here (not stubbed) so the
// search-driven flow in openOwnDraft below actually finds the fixture draft
// by name, the same way it would in the app.
jest.mock('utils/searchKeyUtils', () => ({
  ...jest.requireActual('utils/searchKeyUtils'),
  getSearchIdIndexedFields: () => [],
}));
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
  fireEvent.click(await screen.findByRole('button', { name: 'Шукати (тест)' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Відкрити' }));
  await screen.findByPlaceholderText('Нотатка для себе');
};

// Той самий шлях англійською: кнопки видачі підписані тим самим словником.
const openOwnDraftInEnglish = async () => {
  render(<ProfileCreationWorkspace />);
  fireEvent.click(await screen.findByRole('button', { name: 'Шукати (тест)' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Open' }));
  await screen.findByPlaceholderText('A note for yourself');
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

// Ці перевірки описують український бік екрана — мову задаємо явно.
applyUkrainianInterface();

it('replaces regular-user draft status and progress with personal metadata controls', async () => {
  await openOwnDraft();

  expect(screen.getByPlaceholderText('Нотатка для себе')).toBeInTheDocument();
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

  expect(screen.getByPlaceholderText('Нотатка для себе')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'В обране' })).toBeInTheDocument();
});

it('saves a personal comment on blur using the draft card id fallback', async () => {
  await openOwnDraft();
  const comment = screen.getByPlaceholderText('Нотатка для себе');

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

// Публічна нотатка й приватна — два записи про ту саму людину, і читають їх
// разом. Досі це були два різні місця екрана: публічний коментар останньою
// секцією форми, приватна нотатка — у шапці чернетки (а в доповненні картки ще
// й окремою плашкою «Ваш коментар»). Тепер тут та сама пара доріжок, що в рядку
// стрічки й у відкритій картці: публічне зверху, власне під ним.
it('ставить публічну й приватну нотатки парою, з тими самими підписами', async () => {
  await openOwnDraft();

  const publicLabel = screen.getByText('Публічна нотатка');
  const privateLabel = screen.getByText('Приватна нотатка');

  expect(screen.getByText('Бачать усі')).toBeInTheDocument();
  expect(screen.getByText('Бачите тільки ви')).toBeInTheDocument();
  // Публічне стоїть над власним: відгук читають, а нотатку пишуть.
  expect(publicLabel.compareDocumentPosition(privateLabel))
    .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  // Плейсхолдери — ті самі, що в стрічці й у відкритій картці.
  // У чернетці відгуки читати нема де — картки ще немає, — тож плейсхолдер
  // каже саму роботу, без заклику перевіряти чуже.
  expect(screen.getByPlaceholderText('Додати публічну нотатку')).toBeInTheDocument();
  expect(screen.getByPlaceholderText('Нотатка для себе')).toBeInTheDocument();
  // Власного заголовка секції в публічного коментаря більше немає — його
  // називає підпис доріжки.
  expect(screen.queryByText('💬 Публічний коментар')).not.toBeInTheDocument();
});

// Чіп «Очікує підтвердження» обіцяв гейт, якого немає: заведена картка вже
// лежить у пошуку, її знаходять і читають.
it('не показує над чернеткою стану, якого не існує', async () => {
  await openOwnDraft();

  expect(screen.queryByText('Очікує підтвердження')).not.toBeInTheDocument();
});

// Мова інтерфейсу перемикається в меню трьох крапок, і форма створення та
// доповнення картки її виконує — раніше вона лишалась українською хай що
// вибрано.
it('говорить мовою інтерфейсу', async () => {
  localStorage.setItem('appLanguage', 'en');
  await openOwnDraftInEnglish();

  expect(screen.getByText('Profile filled in')).toBeInTheDocument();
  expect(screen.getByText('Public note')).toBeInTheDocument();
  expect(screen.getByText('Private note')).toBeInTheDocument();
});
