import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { HistoricalFieldEdit, ProfileCreationWorkspace } from './ProfileCreationWorkspace';
import { buildFieldVersionHistory } from 'utils/draftFieldEdits';
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
  fetchFavoriteUsers: jest.fn(async () => ({})),
  fetchDislikeUsers: jest.fn(async () => ({})),
}));

// Drafts no longer appear in an always-visible list - they only surface
// through a search match. This minimal stub stands in for the real
// SearchBar: clicking it runs a "search" that the mocked detectSearchParams
// resolves to the fixture's own cardId, so the match renders and the test
// can open it exactly as a real search would offer it.
jest.mock('./SearchBar', () => ({
  __esModule: true,
  default: ({ setSearch, onSearchExecuted }) => (
    <button type="button" onClick={() => { setSearch('card-1'); onSearchExecuted(); }}>
      Шукати (тест)
    </button>
  ),
  detectSearchParams: () => ({ key: 'userId', value: 'card-1' }),
}));
jest.mock('./smallCard/FieldComment', () => ({ FieldComment: () => null }));

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

// The real matcher is used here (not stubbed) so the search-driven flow in
// openSharedDraft below actually finds the fixture draft, the same way it
// would in the app.
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
  useLocation: () => ({ pathname: '/create-profile' }),
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
  fireEvent.click(await screen.findByRole('button', { name: 'Шукати (тест)' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Відкрити чернетку' }));
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

describe('ProfileCreationWorkspace history tones', () => {
  it('shows replaced surnames in green and only the latest cleared surname struck through in red', () => {
    const history = buildFieldVersionHistory([
      { entryId: 'a', fieldName: 'surname', at: 10, change: { added: ['A'] } },
      { entryId: 'ab', fieldName: 'surname', at: 20, change: { added: ['B'], removed: ['A'] } },
      { entryId: 'bc', fieldName: 'surname', at: 30, change: { added: ['C'], removed: ['B'] } },
      { entryId: 'clear', fieldName: 'surname', at: 40, change: { removed: ['C'] } },
    ]).surname;

    render(<>{history.map(row => <HistoricalFieldEdit
      key={row.key}
      row={row}
      label="Прізвище"
      authorName="Редактор"
      onRestore={jest.fn()}
      onDelete={jest.fn()}
      onOpenAuthor={jest.fn()}
    />)}</>);

    const [a, b, c] = screen.getAllByLabelText('Прізвище: значення з історії');
    expect(a).toHaveStyle('text-decoration: none');
    expect(b).toHaveStyle('text-decoration: none');
    expect(c).toHaveStyle('text-decoration: line-through');
    expect(screen.getByTestId('history-value-A')).toHaveStyle('border-color: #2e9b55');
    expect(screen.getByTestId('history-value-B')).toHaveStyle('border-color: #2e9b55');
    expect(screen.getByTestId('history-value-C')).toHaveStyle('border-color: #d94b4b');
  });
});
