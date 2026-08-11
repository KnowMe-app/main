import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { ProfileCreationWorkspace } from './ProfileCreationWorkspace';
import { applyOverlayToCard, buildOverlayFromDraft, saveOverlayForUserCard } from 'utils/multiAccountEdits';
import { loadOwnProfileMutations, loadSharedProfileMutations } from 'utils/profileMutations';

jest.mock('firebase/auth', () => ({
  onAuthStateChanged: (_auth, callback) => {
    callback({ uid: 'editor-1' });
    return jest.fn();
  },
}));

jest.mock('./config', () => ({
  auth: { currentUser: { uid: 'editor-1' } },
  fetchUserById: jest.fn(async () => ({ canCreateProfiles: true })),
  searchUsersOnly: jest.fn(),
}));

jest.mock('./SearchBar', () => ({
  __esModule: true,
  default: () => null,
  detectSearchParams: () => null,
}));

jest.mock('./formFields', () => ({
  pickerFields: [{ name: 'phone' }],
  getFieldLabel: field => field.name === 'phone' ? 'Телефон' : field.name,
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
  loadOwnProfileMutations: jest.fn(async () => []),
  loadSharedProfileMutations: jest.fn(async () => []),
  rejectCreateProfileMutation: jest.fn(),
  reserveProfileCardId: jest.fn(() => 'new-card'),
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
  useSearchParams: () => [new URLSearchParams(), jest.fn()],
}));

const sharedDraft = {
  cardId: 'card-1',
  createdBy: 'author-1',
  revision: 1,
  status: 'pendingReview',
  data: { userId: 'card-1', phone: ['111', '222'] },
};

const openSharedDraft = async () => {
  loadOwnProfileMutations.mockResolvedValue([]);
  loadSharedProfileMutations.mockResolvedValue([sharedDraft]);
  render(<ProfileCreationWorkspace />);
  fireEvent.click(await screen.findByRole('button', { name: /Додати свої правки/ }));
  await waitFor(() => expect(screen.getAllByRole('textbox')).toHaveLength(2));
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ProfileCreationWorkspace repeatable field behavior', () => {
  it('removes one of several visible values instead of restoring persisted history', async () => {
    await openSharedDraft();

    fireEvent.click(screen.getAllByTitle('Очистити рядок')[0]);

    await waitFor(() => expect(screen.getAllByRole('textbox')).toHaveLength(1));
    expect(screen.getByRole('textbox')).toHaveValue('222');
  });

  it('keeps exactly one empty row after clearing the last value repeatedly and blurring', async () => {
    await openSharedDraft();

    fireEvent.click(screen.getAllByTitle('Очистити рядок')[0]);
    fireEvent.click(screen.getByTitle('Очистити рядок'));
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue(''));

    fireEvent.click(screen.getByTitle('Очистити рядок'));
    fireEvent.blur(screen.getByRole('textbox'));

    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(screen.getByRole('textbox')).toHaveValue('');
    await waitFor(() => expect(saveOverlayForUserCard).toHaveBeenCalledTimes(4));
    const latestFields = saveOverlayForUserCard.mock.calls.at(-1)[0].fields;
    expect(latestFields.phone.added).toBeUndefined();
    expect(latestFields.phone.removed).toEqual(['111', '222']);
  });

  it('records one correct removal while the editor continues to see only current values', async () => {
    await openSharedDraft();

    fireEvent.click(screen.getAllByTitle('Очистити рядок')[0]);

    await waitFor(() => expect(saveOverlayForUserCard).toHaveBeenCalledTimes(1));
    expect(saveOverlayForUserCard).toHaveBeenCalledWith(expect.objectContaining({
      cardUserId: 'card-1',
      editorUserId: 'editor-1',
      fields: { phone: { removed: ['111'] } },
    }));
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(screen.getByRole('textbox')).toHaveValue('222');

    const fields = buildOverlayFromDraft(sharedDraft.data, { ...sharedDraft.data, phone: ['222'] });
    expect(applyOverlayToCard(sharedDraft.data, fields).phone).toBe('222');
  });
});
