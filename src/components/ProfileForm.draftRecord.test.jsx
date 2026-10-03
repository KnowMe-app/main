import '@testing-library/jest-dom';
import { render, screen, waitFor, act } from '@testing-library/react';

/**
 * Форма адміна над чернеткою.
 *
 * Чернетка лежить одним записом у `multiData/profileMutations`, а її журнал —
 * у `multiData/profileMutationHistory`. Форма знала лише готову анкету:
 * посилання блоку «Контакти» вело в `profileContacts/{id}` (там `null`), а
 * історію правок брала з шару редакторів, де правок чернетки немає зовсім.
 */
jest.mock('./config', () => ({
  auth: { currentUser: { uid: '3LiD7JGCJTSJoVMU7fdR1ZrcIZH2' } },
  database: {},
}));

jest.mock('firebase/database', () => ({
  get: jest.fn(async () => ({ exists: () => false, val: () => null })),
  ref: jest.fn(() => ({})),
}));

jest.mock('./smallCard/actions', () => ({ removeField: jest.fn() }));

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { success: jest.fn(), error: jest.fn() },
}));

jest.mock('utils/profileMutations', () => ({
  loadProfileMutationHistory: jest.fn(),
}));

const { loadProfileMutationHistory } = require('utils/profileMutations');
const { PROFILE_DRAFT_SAVED_EVENT } = require('utils/profileRecordSource');
const { ProfileForm } = require('./ProfileForm');

const NO_OVERLAY_ADDITIONS = {};
const ADMIN_UID = '3LiD7JGCJTSJoVMU7fdR1ZrcIZH2';

const DRAFT = {
  userId: '-P1u_atIyOwAe4zAqL5_',
  name: ['44'],
  phone: ['380505554409', '380505554417'],
  __profileMutationOperation: 'create',
  __profileMutationCreatedBy: 'author-1',
  __profileMutationRevision: 28,
};

const renderForm = (state, props = {}) => render(
  <ProfileForm
    state={state}
    overlayFieldAdditions={NO_OVERLAY_ADDITIONS}
    setState={jest.fn()}
    handleBlur={jest.fn()}
    handleSubmit={jest.fn()}
    handleClear={jest.fn()}
    handleDelKeyValue={jest.fn()}
    isAdmin
    {...props}
  />,
);

beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
  loadProfileMutationHistory.mockResolvedValue([
    { entryId: 'revision-3', actorUid: ADMIN_UID, fieldName: 'phone', change: { removed: ['380505554400'] }, at: 3 },
    { entryId: 'revision-2', actorUid: 'author-1', fieldName: 'phone', change: { added: ['380505554417'], removed: ['380505554416'] }, at: 2 },
    { entryId: 'revision-1', actorUid: 'author-1', fieldName: 'phone', change: { added: ['380505554400'] }, at: 1 },
  ]);
});

it('показує журнал чернетки: хто і що додав, замінив і видалив', async () => {
  renderForm(DRAFT);

  await waitFor(() => expect(screen.getAllByTestId('draft-history-entry')).toHaveLength(3));
  expect(loadProfileMutationHistory).toHaveBeenCalledWith(DRAFT.userId);
  const rows = screen.getAllByTestId('draft-history-entry').map(row => row.textContent);
  expect(rows[0]).toContain('адмін');
  expect(rows[0]).toContain('видалено: 380505554400');
  expect(rows[1]).toContain('автор');
  expect(rows[1]).toContain('380505554416 → 380505554417');
  expect(rows[2]).toContain('додано: 380505554400');
});

it('перечитує журнал, щойно чернетку записано', async () => {
  renderForm(DRAFT);
  await waitFor(() => expect(loadProfileMutationHistory).toHaveBeenCalledTimes(1));

  act(() => {
    window.dispatchEvent(new CustomEvent(PROFILE_DRAFT_SAVED_EVENT, { detail: { cardId: DRAFT.userId, revision: 29 } }));
  });

  await waitFor(() => expect(loadProfileMutationHistory).toHaveBeenCalledTimes(2));
});

it('веде посилання анкети чернетки в її запис, а не в profileContacts', async () => {
  renderForm(DRAFT);
  await screen.findByTestId('draft-history');

  const hrefs = screen.getAllByRole('link').map(link => link.getAttribute('href'));
  expect(hrefs.some(href => href.includes('~2FprofileMutations~2Fauthor-1~2F-P1u_atIyOwAe4zAqL5_~2Fdata'))).toBe(true);
  expect(hrefs.some(href => href.includes('~2FprofileContacts~2F'))).toBe(false);
});

it('для готової анкети журналу чернетки не читає й не показує', () => {
  renderForm({ userId: 'AC00042', name: 'Анна', phone: ['380501112233'] });

  expect(loadProfileMutationHistory).not.toHaveBeenCalled();
  expect(screen.queryByTestId('draft-history')).not.toBeInTheDocument();
});
