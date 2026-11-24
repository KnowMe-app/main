import '@testing-library/jest-dom';
import { profileProposalService } from 'utils/profileProposalRepository';
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { ProfileCreationWorkspace } from './ProfileCreationWorkspace';
import { fetchUserById, fetchUsersByIds } from './config';
import {
  getOverlayHistoryForCard,
  getOverlaysForCard,
  purgeOverlayHistoryEntries,
} from 'utils/multiAccountEdits';
import {
  loadAllCreateProfileMutations,
  loadOwnProfileMutations,
  loadProfileMutationHistory,
  purgeProfileMutationHistoryValue,
  loadSharedProfileMutations,
} from 'utils/profileMutations';
import { createEditorSnapshot } from 'utils/profileProposalEditor';
import { READONLY_ADMIN_UIDS } from 'utils/accessLevel';
import { applyUkrainianInterface } from '../testUtils/interfaceLanguage';

jest.mock('utils/profileProposalRepository', () => ({
  profileProposalService: { getDraft: jest.fn(), createDraft: jest.fn(), saveDraft: jest.fn(), deleteDraft: jest.fn(), reviewDraft: jest.fn() },
}));

let mockViewerUid = 'admin-1';

jest.mock('firebase/auth', () => ({
  onAuthStateChanged: (_auth, callback) => {
    callback({ uid: mockViewerUid });
    return jest.fn();
  },
}));

jest.mock('./config', () => ({
  auth: { get currentUser() { return { uid: mockViewerUid }; } },
  fetchUserById: jest.fn(async () => ({ canCreateProfiles: true })),
  fetchUsersByIds: jest.fn(async () => ({ 'editor-1': { name: 'Оля', surname: 'Р.' } })),
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

// Приватна нотатка стоїть у парі з публічною в кожній відкритій чернетці — і
// читає власний вузол `multiData/comments`. Ця сюїта про чергу правок, тож
// сам редактор нотатки тут заглушений, як і в решті сюїт форми.
jest.mock('./smallCard/FieldComment', () => ({ FieldComment: () => null }));

jest.mock('./SearchBar', () => ({
  __esModule: true,
  default: () => null,
  detectSearchParams: () => null,
}));

jest.mock('./formFields', () => ({
  pickerFields: [
    { name: 'name', ukrainian: "Ім'я" },
    { name: 'phone', ukrainian: 'Телефон' },
    { name: 'publicComment', ukrainian: 'Публічний коментар', placeholder: 'Будьте чемні, Ваш коментар побачать усі' },
    { name: 'role', ukrainian: 'Роль', options: ['A', 'B'] },
  ],
  getFieldLabel: field => field.ukrainian || field.name,
  getFieldPlaceholder: field => field.placeholder || '',
  getOptionLabel: value => value,
  getOptionValue: value => value,
}));

jest.mock('utils/accessLevel', () => ({
  ...jest.requireActual('utils/accessLevel'),
  resolveAccess: () => ({ canCreateProfiles: true, isAdmin: true }),
}));

jest.mock('utils/profileCreationSearch', () => ({ findMatchingProfileMutations: jest.fn(() => []) }));
jest.mock('utils/searchKeyUtils', () => ({ getSearchIdIndexedFields: () => [] }));

const draftMutation = {
  cardId: 'card-1',
  createdBy: 'author-1',
  revision: 3,
  status: 'pendingReview',
  data: { userId: 'card-1', name: "Ім'я6" },
};

const proposedName = {
  updatedAt: 30,
  cardUserId: 'card-1',
  editorUserId: 'editor-1',
  fields: { name: { from: "Ім'я6", to: "Ім'я7" } },
};
const nameOverlay = { ...proposedName, expectedCurrent: proposedName };
const draftSnapshot = createEditorSnapshot(draftMutation);
const expectedNameReview = {
  operation: 'update',
  cardUserId: 'card-1',
  editorUserId: 'editor-1',
  fieldName: 'name',
  value: "Ім'я7",
  expectedCurrent: proposedName,
  expectedDraft: draftSnapshot,
};

const mockResolvedReview = (draft, remaining = {}) => {
  profileProposalService.reviewDraft.mockImplementationOnce(async () => {
    getOverlaysForCard.mockResolvedValue(remaining);
    return { draft };
  });
};

jest.mock('utils/profileMutations', () => ({
  getEffectiveProfile: ({ mutation }) => mutation.data,
  loadAllCreateProfileMutations: jest.fn(),
  loadOwnProfileMutations: jest.fn(),
  loadProfileMutationHistory: jest.fn(),
  purgeProfileMutationHistoryValue: jest.fn(),
  loadSharedProfileMutations: jest.fn(),
  reserveProfileCardId: jest.fn(() => 'new-card'),
}));

jest.mock('utils/multiAccountEdits', () => {
  const actual = jest.requireActual('utils/multiAccountEdits');
  return {
    ...actual,
    getOverlayHistoryForCard: jest.fn(),
    getOverlaysForCard: jest.fn(),
    removeAllOverlaysForCard: jest.fn(),
    purgeOverlayHistoryEntries: jest.fn(),
  };
});

jest.mock('react-router-dom', () => {
  const navigate = jest.fn();
  const location = { pathname: '/create-profile' };
  const searchParams = [new URLSearchParams(), jest.fn()];
  return {
    useNavigate: () => navigate,
    useLocation: () => location,
    useSearchParams: () => searchParams,
  };
});

const openDraftForReview = async () => {
  render(<ProfileCreationWorkspace />);
  fireEvent.click(await screen.findByRole('button', { name: /Відкрити профіль/ }));
  await screen.findByLabelText("Ім'я: запропоноване значення");
};

// create-react-app resets mock implementations between tests, so every run
// re-arms the same draft: author data Ім'я6, one pending proposal Ім'я7.
beforeEach(() => {
  mockViewerUid = 'admin-1';
  localStorage.clear();
  profileProposalService.saveDraft.mockImplementation(async (proposal, { expected }) => ({ ...proposal, revision: expected.revision + 1 }));
  fetchUserById.mockResolvedValue({ canCreateProfiles: true });
  fetchUsersByIds.mockResolvedValue({ 'editor-1': { name: 'Оля', surname: 'Р.' } });
  loadAllCreateProfileMutations.mockResolvedValue([draftMutation]);
  loadOwnProfileMutations.mockResolvedValue([]);
  loadSharedProfileMutations.mockResolvedValue([]);
  loadProfileMutationHistory.mockResolvedValue([]);
  getOverlayHistoryForCard.mockResolvedValue([
    { entryId: 'h1', fieldName: 'name', at: 10, action: 'edit', editorUserId: 'author-1', change: { from: '', to: "Ім'я5" } },
    { entryId: 'h2', fieldName: 'name', at: 20, action: 'edit', editorUserId: 'author-1', change: { from: "Ім'я5", to: "Ім'я6" } },
  ]);
  getOverlaysForCard.mockResolvedValue({ 'editor-1': nameOverlay });
  purgeOverlayHistoryEntries.mockResolvedValue(undefined);
  purgeProfileMutationHistoryValue.mockResolvedValue(undefined);
});

// Ці перевірки описують український бік екрана — мову задаємо явно.
applyUkrainianInterface();

describe('ProfileCreationWorkspace admin review', () => {
  it('lets an admin review and correct the public comment before publication', async () => {
    loadAllCreateProfileMutations.mockResolvedValue([{
      ...draftMutation,
      data: { ...draftMutation.data, publicComment: 'Авторський коментар' },
    }]);

    render(<ProfileCreationWorkspace />);
    fireEvent.click(await screen.findByRole('button', { name: /Відкрити профіль/ }));

    const comment = await screen.findByDisplayValue('Авторський коментар');
    expect(comment).toBeInTheDocument();
    // Публічний коментар стоїть у доріжці нотаток поруч із приватною, тож і
    // запрошення в порожньому полі в нього зі спільного словника
    // (`profileTexts`), а не власний текст цієї форми. Заклику перевірити
    // відгуки в ньому немає: у чернетці картки ще немає, читати нема чого.
    expect(comment).toHaveAttribute('placeholder', 'Додати анонімний відгук');
    expect(screen.queryByText(/анкета зникає із загального списку Matching/)).not.toBeInTheDocument();

    fireEvent.change(comment, { target: { value: 'Виправлений коментар' } });
    fireEvent.blur(comment);

    await waitFor(() => expect(profileProposalService.saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ publicComment: ['Виправлений коментар'] }),
      }),
      { expected: expect.objectContaining({ revision: draftMutation.revision }) },
    ));
  });

  it('shows the author value in the field and the proposal right under it', async () => {
    await openDraftForReview();

    // The questionnaire keeps the author's own data - the pending edit is a
    // separate, clearly marked row next to it, not a silent overwrite.
    expect(screen.getByDisplayValue("Ім'я6")).toBeInTheDocument();
    expect(screen.getByLabelText("Ім'я: запропоноване значення")).toHaveValue("Ім'я7");
    expect(screen.getByText(/замість/)).toBeInTheDocument();
    // The proposal is attributed to the editor who made it.
    expect(await screen.findByRole('button', { name: 'Оля Р.' })).toBeInTheDocument();
  });

  it('keeps every unmatched array and stacked proposal individually reviewable', async () => {
    getOverlaysForCard.mockResolvedValue({
      'editor-1': {
        updatedAt: 30,
        editorUserId: 'editor-1',
        fields: { phone: { added: ['111', '222'] } },
      },
      'editor-2': {
        updatedAt: 40,
        editorUserId: 'editor-2',
        fields: { name: { from: "Ім'я7", to: "Ім'я8" } },
      },
    });

    render(<ProfileCreationWorkspace />);
    fireEvent.click(await screen.findByRole('button', { name: /Відкрити профіль/ }));

    expect(await screen.findByLabelText('Телефон: запропоноване значення', { selector: 'input[value="111"]' }))
      .toBeInTheDocument();
    expect(screen.getByLabelText('Телефон: запропоноване значення', { selector: 'input[value="222"]' }))
      .toBeInTheDocument();
    expect(screen.getByLabelText("Ім'я: запропоноване значення")).toHaveValue("Ім'я8");
    expect(screen.getAllByLabelText(/Зберегти правку/)).toHaveLength(3);
    expect(screen.getAllByLabelText(/Видалити правку/)).toHaveLength(3);
  });

  it('shows the foreign draft and its proposal to an inspector with review controls disabled', async () => {
    [mockViewerUid] = READONLY_ADMIN_UIDS;
    await openDraftForReview();

    const current = screen.getByDisplayValue("Ім'я6");
    expect(current).toHaveAttribute('readonly');
    const proposed = screen.getByLabelText("Ім'я: запропоноване значення");
    expect(proposed).toHaveValue("Ім'я7");
    expect(proposed).toHaveAttribute('readonly');
    const accept = screen.getByLabelText("Зберегти правку: Ім'я");
    const reject = screen.getByLabelText("Видалити правку: Ім'я");
    const publish = screen.getByRole('button', { name: 'Опублікувати анкету' });
    const remove = screen.getByRole('button', { name: 'Видалити чернетку' });
    expect(accept).toBeDisabled();
    expect(reject).toBeDisabled();
    expect(publish).toBeDisabled();
    expect(remove).toBeDisabled();

    fireEvent.click(accept);
    fireEvent.click(reject);
    fireEvent.click(publish);
    fireEvent.click(remove);
    fireEvent.blur(current);
    fireEvent.keyDown(proposed, { key: 'Enter' });
    expect(profileProposalService.reviewDraft).not.toHaveBeenCalled();
    expect(profileProposalService.deleteDraft).not.toHaveBeenCalled();
    expect(profileProposalService.saveDraft).not.toHaveBeenCalled();
  });

  it('lets an inspector save their own draft while keeping publication disabled', async () => {
    [mockViewerUid] = READONLY_ADMIN_UIDS;
    const ownedDraft = { ...draftMutation, createdBy: mockViewerUid };
    loadAllCreateProfileMutations.mockResolvedValue([ownedDraft]);
    loadOwnProfileMutations.mockResolvedValue([ownedDraft]);

    await openDraftForReview();

    const current = screen.getByDisplayValue("Ім'я6");
    expect(current).not.toHaveAttribute('readonly');
    expect(screen.getByRole('button', { name: 'Опублікувати анкету' })).toBeDisabled();
    fireEvent.change(current, { target: { value: 'Власна чернетка' } });
    fireEvent.blur(current);
    await waitFor(() => expect(profileProposalService.saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({ createdBy: mockViewerUid, data: { userId: 'card-1', name: ['Власна чернетка'] } }),
      { expected: createEditorSnapshot(ownedDraft) },
    ));
  });

  it('uses the user id as the clickable author only when a name is unavailable', async () => {
    await openDraftForReview();
    fireEvent.click(screen.getByRole('button', { name: /Історія правок/ }));

    expect((await screen.findAllByRole('button', { name: 'author-1' })).length).toBeGreaterThan(0);
    expect(screen.queryByText('правка')).not.toBeInTheDocument();
  });

  it('reviews exactly one value against both snapshots and keeps an unrelated proposal visible', async () => {
    const otherOverlay = {
      updatedAt: 40,
      editorUserId: 'editor-2',
      fields: { phone: { added: ['111'] } },
    };
    getOverlaysForCard.mockResolvedValue({ 'editor-1': nameOverlay, 'editor-2': otherOverlay });
    mockResolvedReview(
      { ...draftMutation, revision: 4, data: { ...draftMutation.data, name: "Ім'я7" } },
      { 'editor-2': otherOverlay },
    );
    await openDraftForReview();

    fireEvent.click(screen.getByLabelText("Зберегти правку: Ім'я"));

    await waitFor(() => expect(profileProposalService.reviewDraft).toHaveBeenCalledWith({
      ...expectedNameReview, action: 'accept', acceptedValue: "Ім'я7", replacement: undefined,
    }));
    await waitFor(() => expect(screen.queryByLabelText("Ім'я: запропоноване значення")).not.toBeInTheDocument());
    expect(screen.getByDisplayValue("Ім'я7")).toBeInTheDocument();
    expect(screen.getByLabelText('Телефон: запропоноване значення')).toHaveValue('111');
  });

  it('passes the corrected value while retaining the original proposal identity', async () => {
    mockResolvedReview({ ...draftMutation, revision: 4, data: { ...draftMutation.data, name: "Ім'я8" } });
    await openDraftForReview();

    fireEvent.change(screen.getByLabelText("Ім'я: запропоноване значення"), { target: { value: "Ім'я8" } });
    fireEvent.click(screen.getByLabelText("Зберегти правку: Ім'я"));

    await waitFor(() => expect(profileProposalService.reviewDraft).toHaveBeenCalledWith({
      ...expectedNameReview, action: 'accept', acceptedValue: "Ім'я8", replacement: undefined,
    }));
    await waitFor(() => expect(screen.queryByLabelText("Ім'я: запропоноване значення")).not.toBeInTheDocument());
    expect(screen.getByDisplayValue("Ім'я8")).toBeInTheDocument();
  });

  it('rejects one proposal without changing the draft data', async () => {
    mockResolvedReview(null);
    await openDraftForReview();

    fireEvent.click(screen.getByLabelText("Видалити правку: Ім'я"));

    await waitFor(() => expect(profileProposalService.reviewDraft).toHaveBeenCalledWith({
      ...expectedNameReview, action: 'reject', acceptedValue: undefined, replacement: undefined,
    }));
    await waitFor(() => expect(screen.queryByLabelText("Ім'я: запропоноване значення")).not.toBeInTheDocument());
    expect(screen.getByDisplayValue("Ім'я6")).toBeInTheDocument();
    expect(profileProposalService.saveDraft).not.toHaveBeenCalled();
  });

  it('keeps the displayed draft and proposal after a stale review response', async () => {
    const newerDraft = { ...draftMutation, revision: 4, data: { ...draftMutation.data, name: 'Нове ім’я автора' } };
    loadAllCreateProfileMutations.mockResolvedValue([newerDraft]);
    profileProposalService.reviewDraft.mockRejectedValueOnce(Object.assign(new Error('REVISION_CONFLICT'), {
      code: 'REVISION_CONFLICT',
    }));
    await openDraftForReview();

    const approveField = screen.getByLabelText("Зберегти правку: Ім'я");
    fireEvent.click(approveField);
    expect(approveField).toBeDisabled();
    await waitFor(() => expect(approveField).toBeEnabled());

    expect(profileProposalService.reviewDraft).toHaveBeenCalledWith({
      ...expectedNameReview,
      action: 'accept',
      acceptedValue: "Ім'я7",
      replacement: undefined,
      expectedDraft: createEditorSnapshot(newerDraft),
    });
    expect(profileProposalService.saveDraft).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue('Нове ім’я автора')).toBeInTheDocument();
    expect(screen.getByLabelText("Ім'я: запропоноване значення")).toHaveValue("Ім'я7");
  });

  it('waits for autosave, then approves the exact create draft without incorporating a pending overlay', async () => {
    let finishSave;
    let acceptedDraft;
    profileProposalService.saveDraft.mockImplementationOnce(proposal => new Promise(resolve => {
      acceptedDraft = { ...proposal, revision: 4 };
      finishSave = () => resolve(acceptedDraft);
    }));
    profileProposalService.reviewDraft.mockResolvedValueOnce({});
    await openDraftForReview();

    const name = screen.getByDisplayValue("Ім'я6");
    fireEvent.change(name, { target: { value: 'Перевірене ім’я' } });
    fireEvent.blur(name);
    await waitFor(() => expect(profileProposalService.saveDraft).toHaveBeenCalledTimes(1));
    const approveDraft = screen.getByRole('button', { name: 'Опублікувати анкету' });
    fireEvent.click(approveDraft);
    expect(approveDraft).toBeDisabled();
    expect(profileProposalService.reviewDraft).not.toHaveBeenCalled();

    await act(async () => finishSave());

    expect(profileProposalService.reviewDraft).toHaveBeenCalledWith({
      operation: 'create',
      action: 'accept',
      cardId: 'card-1',
      creatorUid: 'author-1',
      expectedRevision: 4,
      expected: acceptedDraft,
      finalData: { userId: 'card-1', name: ['Перевірене ім’я'] },
    });
  });

  it('puts the current input first and the timeline underneath it', async () => {
    await openDraftForReview();

    fireEvent.click(screen.getByRole('button', { name: /Історія правок/ }));

    // Ім'я6 is the current value and Ім'я7 the pending proposal, so only the
    // genuinely superseded Ім'я5 remains as history.
    const restoreButtons = await screen.findAllByLabelText(/Зберегти редакцію в анкету/);
    expect(restoreButtons).toHaveLength(1);
    const currentInput = screen.getByDisplayValue("Ім'я6");
    const pendingInput = screen.getByLabelText("Ім'я: запропоноване значення");
    const historicalInput = screen.getByLabelText("Ім'я: значення з історії");
    expect(historicalInput).toHaveValue("Ім'я5");
    expect(currentInput.compareDocumentPosition(pendingInput) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(pendingInput.compareDocumentPosition(historicalInput) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows option-field history below the selected option', async () => {
    // Поле ролі — власне поле форми («Хто це», `ROLE_FIELD`), а не текстове «роль» довідника.
    loadAllCreateProfileMutations.mockResolvedValue([{ ...draftMutation, data: { ...draftMutation.data, role: 'B' } }]);
    getOverlayHistoryForCard.mockResolvedValue([
      { entryId: 'role-a', fieldName: 'role', at: 10, action: 'edit', change: { from: '', to: 'A' } },
      { entryId: 'role-b', fieldName: 'role', at: 20, action: 'edit', change: { from: 'A', to: 'B' } },
    ]);

    await openDraftForReview();
    fireEvent.click(screen.getByRole('button', { name: /Історія правок/ }));

    expect(await screen.findByLabelText('Хто це: значення з історії')).toHaveValue('A');
  });

  it('restores the value edited directly in the historical input', async () => {
    await openDraftForReview();
    fireEvent.click(screen.getByRole('button', { name: /Історія правок/ }));

    fireEvent.change(await screen.findByLabelText("Ім'я: значення з історії"), { target: { value: " Ім'я8 " } });
    fireEvent.click(screen.getByLabelText(/Зберегти редакцію в анкету/));

    await waitFor(() => expect(profileProposalService.saveDraft).toHaveBeenCalled());
    expect(profileProposalService.saveDraft.mock.calls[0][0].data.name).toEqual(["Ім'я6", "Ім'я8"]);
    expect(purgeOverlayHistoryEntries).toHaveBeenCalledWith({
      cardUserId: 'card-1', fieldName: 'name', values: ["Ім'я5", "Ім'я8"],
    });
    expect(purgeProfileMutationHistoryValue).toHaveBeenCalledWith({
      cardId: 'card-1', fieldName: 'name', values: ["Ім'я5", "Ім'я8"],
    });
  });

  it('deletes the value from both complete backend histories when its cross is clicked', async () => {
    await openDraftForReview();
    fireEvent.click(screen.getByRole('button', { name: /Історія правок/ }));

    fireEvent.click(await screen.findByLabelText("Видалити з історії: Ім'я5"));

    await waitFor(() => expect(screen.queryByLabelText("Ім'я: значення з історії")).not.toBeInTheDocument());
    expect(purgeOverlayHistoryEntries).toHaveBeenCalledWith({
      cardUserId: 'card-1', fieldName: 'name', values: ["Ім'я5"],
    });
    expect(purgeProfileMutationHistoryValue).toHaveBeenCalledWith({
      cardId: 'card-1', fieldName: 'name', values: ["Ім'я5"],
    });
  });

  it('uses the same whole-history purge for a direct revision', async () => {
    getOverlayHistoryForCard.mockResolvedValue([]);
    loadProfileMutationHistory.mockResolvedValue([{
      entryId: 'revision-r1',
      backendEntryId: 'r1',
      historySource: 'revision',
      fieldName: 'name',
      at: 10,
      action: 'edit',
      actorUid: 'author-1',
      change: { from: '', to: "Ім'я5" },
    }]);

    await openDraftForReview();
    fireEvent.click(screen.getByRole('button', { name: /Історія правок/ }));
    fireEvent.click(await screen.findByLabelText("Видалити з історії: Ім'я5"));

    await waitFor(() => expect(purgeProfileMutationHistoryValue).toHaveBeenCalledWith({
      cardId: 'card-1', fieldName: 'name', values: ["Ім'я5"],
    }));
    expect(purgeOverlayHistoryEntries).toHaveBeenCalled();
  });
});
