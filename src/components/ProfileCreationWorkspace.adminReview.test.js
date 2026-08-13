import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { ProfileCreationWorkspace } from './ProfileCreationWorkspace';
import { fetchUserById, fetchUsersByIds } from './config';
import { getOverlayHistoryForCard, getOverlaysForCard, settleOverlayFieldValue } from 'utils/multiAccountEdits';
import {
  loadAllCreateProfileMutations,
  loadOwnProfileMutations,
  loadProfileMutationHistory,
  loadSharedProfileMutations,
  saveCreateProfileMutation,
} from 'utils/profileMutations';

jest.mock('firebase/auth', () => ({
  onAuthStateChanged: (_auth, callback) => {
    callback({ uid: 'admin-1' });
    return jest.fn();
  },
}));

jest.mock('./config', () => ({
  auth: { currentUser: { uid: 'admin-1' } },
  fetchUserById: jest.fn(async () => ({ canCreateProfiles: true })),
  fetchUsersByIds: jest.fn(async () => ({ 'editor-1': { name: 'Оля', surname: 'Р.' } })),
  searchUsersOnly: jest.fn(),
}));

jest.mock('./SearchBar', () => ({
  __esModule: true,
  default: () => null,
  detectSearchParams: () => null,
}));

jest.mock('./formFields', () => ({
  pickerFields: [{ name: 'name', ukrainian: "Ім'я" }, { name: 'phone', ukrainian: 'Телефон' }],
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

const draftMutation = {
  cardId: 'card-1',
  createdBy: 'author-1',
  revision: 3,
  status: 'pendingReview',
  data: { userId: 'card-1', name: "Ім'я6" },
};

jest.mock('utils/profileMutations', () => ({
  acceptCreateProfileMutation: jest.fn(),
  getEffectiveProfile: ({ mutation }) => mutation.data,
  loadAllCreateProfileMutations: jest.fn(),
  loadOwnProfileMutations: jest.fn(),
  loadProfileMutationHistory: jest.fn(),
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
    saveOverlayForUserCard: jest.fn(),
    settleOverlayFieldValue: jest.fn(),
  };
});

jest.mock('react-router-dom', () => ({
  useNavigate: () => jest.fn(),
  useLocation: () => ({ pathname: '/create-profile' }),
  useSearchParams: () => [new URLSearchParams(), jest.fn()],
}));

const openDraftAsAdmin = async () => {
  render(<ProfileCreationWorkspace />);
  fireEvent.click(await screen.findByRole('button', { name: /Відкрити профіль/ }));
  await screen.findByLabelText("Ім'я: запропоноване значення");
};

// create-react-app resets mock implementations between tests, so every run
// re-arms the same draft: author data Ім'я6, one pending proposal Ім'я7.
beforeEach(() => {
  fetchUserById.mockResolvedValue({ canCreateProfiles: true });
  fetchUsersByIds.mockResolvedValue({ 'editor-1': { name: 'Оля', surname: 'Р.' } });
  loadAllCreateProfileMutations.mockResolvedValue([draftMutation]);
  loadOwnProfileMutations.mockResolvedValue([]);
  loadSharedProfileMutations.mockResolvedValue([]);
  loadProfileMutationHistory.mockResolvedValue([]);
  saveCreateProfileMutation.mockImplementation(async ({ data }) => ({ ...draftMutation, data, revision: 4 }));
  getOverlayHistoryForCard.mockResolvedValue([
    { entryId: 'h1', fieldName: 'name', at: 10, action: 'edit', editorUserId: 'author-1', change: { from: '', to: "Ім'я5" } },
    { entryId: 'h2', fieldName: 'name', at: 20, action: 'edit', editorUserId: 'author-1', change: { from: "Ім'я5", to: "Ім'я6" } },
  ]);
  getOverlaysForCard.mockResolvedValue({
    'editor-1': { updatedAt: 30, editorUserId: 'editor-1', fields: { name: { from: "Ім'я6", to: "Ім'я7" } } },
  });
  settleOverlayFieldValue.mockResolvedValue(undefined);
});

describe('ProfileCreationWorkspace admin review', () => {
  it('shows the author value in the field and the proposal right under it', async () => {
    await openDraftAsAdmin();

    // The questionnaire keeps the author's own data - the pending edit is a
    // separate, clearly marked row next to it, not a silent overwrite.
    expect(screen.getByDisplayValue("Ім'я6")).toBeInTheDocument();
    expect(screen.getByLabelText("Ім'я: запропоноване значення")).toHaveValue("Ім'я7");
    expect(screen.getByText(/замість/)).toBeInTheDocument();
    // The proposal is attributed to the editor who made it.
    expect(await screen.findByText('Оля Р.')).toBeInTheDocument();
  });

  it('saves one proposed value into the draft and clears it from the backend', async () => {
    await openDraftAsAdmin();

    fireEvent.click(screen.getByLabelText("Зберегти правку: Ім'я"));

    await waitFor(() => expect(saveCreateProfileMutation).toHaveBeenCalled());
    expect(saveCreateProfileMutation.mock.calls[0][0].data.name).toBe("Ім'я7");
    expect(settleOverlayFieldValue).toHaveBeenCalledWith(expect.objectContaining({
      cardUserId: 'card-1',
      editorUserId: 'editor-1',
      fieldName: 'name',
      historyAction: 'accept',
      settledChange: { from: "Ім'я6", to: "Ім'я7" },
      purgeHistory: true,
    }));
  });

  it('saves the corrected value when the admin edits the proposal first', async () => {
    await openDraftAsAdmin();

    fireEvent.change(screen.getByLabelText("Ім'я: запропоноване значення"), { target: { value: "Ім'я8" } });
    fireEvent.click(screen.getByLabelText("Зберегти правку: Ім'я"));

    await waitFor(() => expect(saveCreateProfileMutation).toHaveBeenCalled());
    expect(saveCreateProfileMutation.mock.calls[0][0].data.name).toBe("Ім'я8");
    expect(settleOverlayFieldValue).toHaveBeenCalledWith(expect.objectContaining({
      settledChange: { from: "Ім'я6", to: "Ім'я8" },
      historyAction: 'accept',
      purgeHistory: true,
    }));
  });

  it('deletes a proposal, and its memo, without touching the draft data', async () => {
    await openDraftAsAdmin();

    fireEvent.click(screen.getByLabelText("Видалити правку: Ім'я"));

    await waitFor(() => expect(settleOverlayFieldValue).toHaveBeenCalledWith(expect.objectContaining({
      historyAction: 'discard',
      settledChange: { from: "Ім'я6", to: "Ім'я7" },
      purgeHistory: true,
    })));
    expect(saveCreateProfileMutation).not.toHaveBeenCalled();
  });

  it('lists superseded versions above the field, oldest first', async () => {
    await openDraftAsAdmin();

    fireEvent.click(screen.getByRole('button', { name: /Історія правок/ }));

    // Ім'я6 is the current value and Ім'я7 the pending proposal, so only the
    // genuinely superseded Ім'я5 remains as history.
    const restoreButtons = await screen.findAllByLabelText(/Повернути значення в анкету/);
    expect(restoreButtons).toHaveLength(1);
    expect(screen.getByText("Ім'я5")).toBeInTheDocument();
  });
});
