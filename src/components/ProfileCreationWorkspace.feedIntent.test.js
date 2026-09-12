import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { ProfileCreationWorkspace } from './ProfileCreationWorkspace';
import {
  fetchDislikeUsers,
  fetchFavoriteUsers,
  fetchUserById,
  fetchUserComment,
  fetchUsersByIds,
  readProfileFromNodes,
} from './config';
import {
  loadOwnProfileMutations,
  loadProfileMutationHistory,
  loadSharedProfileMutations,
  reserveProfileCardId,
  saveCreateProfileMutation,
} from 'utils/profileMutations';
import { getOverlayHistoryForCard, getOverlaysForCard, saveOverlayForUserCard } from 'utils/multiAccountEdits';

jest.mock('firebase/auth', () => ({
  onAuthStateChanged: (_auth, callback) => {
    callback({ uid: 'editor-1' });
    return jest.fn();
  },
}));

jest.mock('./config', () => ({
  auth: { currentUser: { uid: 'editor-1' } },
  fetchUserById: jest.fn(async () => ({ canCreateProfiles: true })),
  fetchUsersByIds: jest.fn(async () => ({})),
  readProfileFromNodes: jest.fn(async () => null),
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
}));

jest.mock('./SearchBar', () => ({
  __esModule: true,
  default: () => <button type="button">Шукати (тест)</button>,
  detectSearchParams: value => (/^\d+$/.test(String(value || ''))
    ? { key: 'phone', value: String(value) }
    : { key: 'surname', value: String(value || '') }),
}));

jest.mock('./formFields', () => ({
  pickerFields: [
    { name: 'surname', ukrainian: 'Прізвище' },
    { name: 'name', ukrainian: "Ім'я" },
    { name: 'phone', ukrainian: 'Телефон' },
  ],
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
  saveCreateProfileMutation: jest.fn(async () => ({ cardId: 'new-card', revision: 1, createdBy: 'editor-1' })),
}));

// Справжній `buildOverlayFromDraft` — саме він і має довести, що підставлене й
// не змінене значення не стає «правкою» читача.
jest.mock('utils/multiAccountEdits', () => ({
  ...jest.requireActual('utils/multiAccountEdits'),
  getOverlayHistoryForCard: jest.fn(async () => []),
  getOverlaysForCard: jest.fn(async () => ({})),
  saveOverlayForUserCard: jest.fn(async () => undefined),
}));

let mockLocationState = {};
let mockSearchParams = '';
jest.mock('react-router-dom', () => ({
  useNavigate: () => jest.fn(),
  useLocation: () => ({ pathname: '/matching/create-profile', state: mockLocationState }),
  useSearchParams: () => [new URLSearchParams(mockSearchParams), jest.fn()],
}));

const canonicalCard = {
  userId: 'card-9',
  surname: 'Бугаренко',
  name: ['Віолетта', 'Василіса'],
  phone: ['380501112233', '380930001122'],
};

// CRA скидає реалізації моків перед кожним тестом (`resetMocks`), тож їх
// доводиться ставити тут, а не в фабриці `jest.mock`.
beforeEach(() => {
  mockLocationState = {};
  mockSearchParams = '';
  fetchUserById.mockResolvedValue({ canCreateProfiles: true });
  fetchUsersByIds.mockResolvedValue({});
  fetchFavoriteUsers.mockResolvedValue({});
  fetchDislikeUsers.mockResolvedValue({});
  fetchUserComment.mockResolvedValue(null);
  readProfileFromNodes.mockResolvedValue(null);
  loadOwnProfileMutations.mockResolvedValue([]);
  loadSharedProfileMutations.mockResolvedValue([]);
  loadProfileMutationHistory.mockResolvedValue([]);
  getOverlaysForCard.mockResolvedValue({});
  getOverlayHistoryForCard.mockResolvedValue([]);
  saveOverlayForUserCard.mockResolvedValue(undefined);
  reserveProfileCardId.mockReturnValue('new-card');
  saveCreateProfileMutation.mockResolvedValue({ cardId: 'new-card', revision: 1, createdBy: 'editor-1' });
});

describe('доповнення знайденої картки зі стрічки', () => {
  beforeEach(() => {
    mockLocationState = { enrichCardId: 'card-9' };
    readProfileFromNodes.mockResolvedValue(canonicalCard);
  });

  it('відкриває форму доповнення одразу, без другого пошуку', async () => {
    render(<ProfileCreationWorkspace />);

    await screen.findByDisplayValue('380501112233');
    expect(screen.getByDisplayValue('380930001122')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Бугаренко')).toBeInTheDocument();
    expect(readProfileFromNodes).toHaveBeenCalledWith('card-9', { includeWorkflow: false });
  });

  it('називає людину іменем, а не ідентифікатором картки й не словом «оверлей»', async () => {
    render(<ProfileCreationWorkspace />);

    await screen.findByDisplayValue('Бугаренко');
    // Поточне значення поля — остання версія, а не всі одразу.
    expect(screen.getByText('Бугаренко Василіса')).toBeInTheDocument();
    expect(screen.queryByText(/оверлей/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/card-9/)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Що варто знати адміністратору про цей профіль')).not.toBeInTheDocument();
  });

  it('лишає особистий коментар тим самим особистим коментарем, що й у стрічці', async () => {
    render(<ProfileCreationWorkspace />);

    expect(await screen.findByPlaceholderText('Додайте свій коментар')).toBeInTheDocument();
  });

  it('записує в оверлей лише дописане, а не підставлене з картки', async () => {
    render(<ProfileCreationWorkspace />);
    const existing = await screen.findByDisplayValue('380501112233');

    fireEvent.blur(existing);
    await waitFor(() => expect(saveOverlayForUserCard).toHaveBeenCalled());
    expect(saveOverlayForUserCard.mock.calls.at(-1)[0].fields).toEqual({});

    const added = screen.getByDisplayValue('380930001122');
    fireEvent.change(added, { target: { value: '380670009988' } });
    fireEvent.blur(added);

    await waitFor(() => expect(saveOverlayForUserCard.mock.calls.length).toBeGreaterThan(1));
    expect(saveOverlayForUserCard.mock.calls.at(-1)[0]).toEqual(expect.objectContaining({
      cardUserId: 'card-9',
      editorUserId: 'editor-1',
      fields: { phone: { added: ['380670009988'] } },
    }));
  });

  // Оновлена сторінка — той самий намір: адресу форма поставила собі сама.
  it('повертається у форму доповнення після оновлення сторінки', async () => {
    mockLocationState = {};
    mockSearchParams = 'cardId=card-9&overlay=1';
    render(<ProfileCreationWorkspace />);

    expect(await screen.findByDisplayValue('Бугаренко')).toBeInTheDocument();
    expect(readProfileFromNodes).toHaveBeenCalledWith('card-9', { includeWorkflow: false });
  });

  it('відкриває форму навіть тоді, коли картку прочитати не вдалося', async () => {
    readProfileFromNodes.mockRejectedValue(new Error('PERMISSION_DENIED'));
    render(<ProfileCreationWorkspace />);

    expect(await screen.findByText('Картка без імені')).toBeInTheDocument();
  });
});

describe('створення картки з набраного у стрічці', () => {
  it('відкриває форму нової картки одразу, з підставленим прізвищем', async () => {
    mockLocationState = { createFromQuery: 'Бугаренко', queryMatchedCards: 0 };
    render(<ProfileCreationWorkspace />);

    expect(await screen.findByDisplayValue('Бугаренко')).toBeInTheDocument();
    expect(reserveProfileCardId).toHaveBeenCalled();
    await waitFor(() => expect(saveCreateProfileMutation).toHaveBeenCalled());
  });

  // Контакт, за яким стрічка вже показала картку, зайнятий: підставлений у нову
  // картку, він перетворив би перше ж автозбереження на DUPLICATE_PROFILE.
  it('не підставляє в нову картку контакт, за яким пошук уже щось знайшов', async () => {
    mockLocationState = { createFromQuery: '380501112233', queryMatchedCards: 2 };
    render(<ProfileCreationWorkspace />);

    await waitFor(() => expect(saveCreateProfileMutation).toHaveBeenCalled());
    expect(saveCreateProfileMutation.mock.calls[0][0].data).toEqual({ userId: 'new-card' });
  });

  it('підставляє контакт, коли пошук нічого не знайшов', async () => {
    mockLocationState = { createFromQuery: '380501112233', queryMatchedCards: 0 };
    render(<ProfileCreationWorkspace />);

    await waitFor(() => expect(saveCreateProfileMutation).toHaveBeenCalled());
    expect(saveCreateProfileMutation.mock.calls[0][0].data).toEqual({ userId: 'new-card', phone: '380501112233' });
  });
});
