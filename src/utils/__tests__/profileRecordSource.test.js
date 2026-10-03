import {
  buildDraftRecordData,
  describeDraftHistoryChange,
  fetchProfileRecordById,
  forgetDraftRecordRevisions,
  getDraftRecordDataSegments,
  isDraftProfileRecord,
  rememberDraftRecordRevision,
  saveDraftProfileRecord,
  DRAFT_CHANGED_ELSEWHERE,
  PROFILE_DRAFT_SAVED_EVENT,
} from '../profileRecordSource';
import { buildProfileRevisionHistory, loadProfileMutation, saveCreateProfileMutation } from 'utils/profileMutations';
import { fetchProfileDraftById, fetchUserById, setOwnerGetInTouch } from 'components/config';

jest.mock('components/config', () => ({
  fetchProfileDraftById: jest.fn(),
  fetchUserById: jest.fn(),
  setOwnerGetInTouch: jest.fn(async () => undefined),
  setOwnerWriter: jest.fn(async () => undefined),
  database: {},
  updateSearchId: jest.fn(),
}));

// Журнал рахує справжня `buildProfileRevisionHistory`: тест має довести, що
// збереження адміна дає ті самі записи «додано / замінено / видалено», що й
// збереження автора. Мокаються лише читання й запис чернетки.
jest.mock('utils/profileMutations', () => ({
  ...jest.requireActual('utils/profileMutations'),
  loadProfileMutation: jest.fn(),
  saveCreateProfileMutation: jest.fn(),
}));

const DRAFT_DATA = { userId: 'draft-1', name: ['44'], phone: ['380505554409', '380505554416'] };
const draftRecord = (overrides = {}) => ({
  ...DRAFT_DATA,
  __profileMutationOperation: 'create',
  __profileMutationStatus: 'pendingReview',
  __profileMutationCreatedBy: 'author-1',
  __profileMutationRevision: 28,
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  forgetDraftRecordRevisions();
});

describe('source of a profile record', () => {
  it('knows a draft by its own marker and points to its data, not to profileContacts', () => {
    expect(isDraftProfileRecord(draftRecord())).toBe(true);
    expect(isDraftProfileRecord({ userId: 'card-1', phone: '1' })).toBe(false);
    expect(getDraftRecordDataSegments(draftRecord()))
      .toEqual(['multiData', 'profileMutations', 'author-1', 'draft-1', 'data']);
    expect(getDraftRecordDataSegments({ userId: 'card-1' })).toBeNull();
  });

  it('reads a known draft from its own address and never asks the finalized nodes first', async () => {
    fetchProfileDraftById.mockResolvedValue(draftRecord({ __profileMutationRevision: 29 }));

    const record = await fetchProfileRecordById('draft-1', { prefer: 'draft', creatorUid: 'author-1' });

    expect(fetchProfileDraftById).toHaveBeenCalledWith('draft-1', { creatorUid: 'author-1' });
    expect(fetchUserById).not.toHaveBeenCalled();
    expect(record.__profileMutationRevision).toBe(29);
  });

  it('falls back to the nodes once a draft was published', async () => {
    fetchProfileDraftById.mockResolvedValue(null);
    fetchUserById.mockResolvedValue({ userId: 'draft-1', phone: ['380505554409'] });

    const record = await fetchProfileRecordById('draft-1', { prefer: 'draft', creatorUid: 'author-1' });

    expect(record).toEqual({ userId: 'draft-1', phone: ['380505554409'] });
  });

  it('keeps finalized cards on the nodes and only then looks for a draft', async () => {
    fetchUserById.mockResolvedValueOnce({ userId: 'card-1', name: 'A' });
    await expect(fetchProfileRecordById('card-1')).resolves.toEqual({ userId: 'card-1', name: 'A' });
    expect(fetchProfileDraftById).not.toHaveBeenCalled();

    // `profileContacts/{id}` порожній — це не «контактів немає», а чернетка.
    fetchUserById.mockResolvedValueOnce(null);
    fetchProfileDraftById.mockResolvedValueOnce(draftRecord());
    await expect(fetchProfileRecordById('draft-1')).resolves.toEqual(draftRecord());
  });
});

describe('draft data built from the admin form', () => {
  it('keeps form-only keys out of the draft and keeps the draft own values of them', () => {
    const next = buildDraftRecordData(
      { ...DRAFT_DATA, myComment: 'нотатка автора' },
      {
        ...draftRecord(),
        phone: ['380505554409', '380505554417'],
        lastAction: 1700000000000,
        age: 31,
        photos: [],
        myComment: 'памʼятка адміна',
        cacheVersion: 3,
      },
    );

    expect(next).toEqual({
      userId: 'draft-1',
      name: ['44'],
      phone: ['380505554409', '380505554417'],
      myComment: 'нотатка автора',
    });
  });

  it('drops deleted and null fields so the history records their removal', () => {
    const next = buildDraftRecordData(DRAFT_DATA, { ...draftRecord(), email: null, name: ['44'] }, ['phone']);
    expect(next).toEqual({ userId: 'draft-1', name: ['44'] });
  });
});

describe('admin save into the draft', () => {
  const saveFrom = async (submittedPhones, deletedKeys = []) => {
    loadProfileMutation.mockResolvedValue({ createdBy: 'author-1', revision: 28, data: DRAFT_DATA });
    saveCreateProfileMutation.mockImplementation(async ({ data }) => ({ revision: 29, data }));
    await saveDraftProfileRecord({
      submitted: { ...draftRecord(), phone: submittedPhones, lastAction: 1 },
      deletedKeys,
      actorUid: 'admin-1',
    });
    const [{ data }] = saveCreateProfileMutation.mock.calls.at(-1);
    return buildProfileRevisionHistory({
      cardId: 'draft-1', actorUid: 'admin-1', previousData: DRAFT_DATA, nextData: data, at: 1, revision: 29,
    });
  };

  it('writes through the draft writer with the author, the admin and the read revision', async () => {
    await saveFrom(['380505554409', '380505554416']);

    expect(saveCreateProfileMutation).toHaveBeenCalledWith(expect.objectContaining({
      cardId: 'draft-1',
      creatorUid: 'author-1',
      actorUid: 'admin-1',
      expectedRevision: 28,
    }));
  });

  it('records an added contact', async () => {
    const history = await saveFrom(['380505554409', '380505554416', '380505554400']);
    expect(history).toEqual([expect.objectContaining({ fieldName: 'phone', change: { added: ['380505554400'] } })]);
  });

  it('records an edited contact as one replacement entry', async () => {
    const history = await saveFrom(['380505554409', '380505554417']);
    expect(history).toEqual([expect.objectContaining({
      fieldName: 'phone',
      change: { added: ['380505554417'], removed: ['380505554416'] },
    })]);
    expect(describeDraftHistoryChange(history[0].change)).toBe('380505554416 → 380505554417');
  });

  it('records a deleted contact, and nothing for the form-only keys', async () => {
    const history = await saveFrom(['380505554409']);
    expect(history).toEqual([expect.objectContaining({ fieldName: 'phone', change: { removed: ['380505554416'] } })]);
  });

  it('records the removal of a whole field the admin cleared', async () => {
    const history = await saveFrom(undefined, ['phone']);
    expect(history).toEqual([expect.objectContaining({
      fieldName: 'phone',
      change: { removed: ['380505554409', '380505554416'] },
    })]);
  });

  it('refuses to overwrite a revision the form never showed', async () => {
    loadProfileMutation.mockResolvedValue({ createdBy: 'author-1', revision: 30, data: DRAFT_DATA });

    await expect(saveDraftProfileRecord({ submitted: draftRecord(), actorUid: 'admin-1' }))
      .rejects.toMatchObject({ code: DRAFT_CHANGED_ELSEWHERE });
    expect(saveCreateProfileMutation).not.toHaveBeenCalled();
  });

  it('lets queued saves follow each other: the next one builds on the revision just written', async () => {
    rememberDraftRecordRevision(draftRecord());
    loadProfileMutation.mockResolvedValueOnce({ createdBy: 'author-1', revision: 28, data: DRAFT_DATA });
    saveCreateProfileMutation.mockResolvedValueOnce({ revision: 29, data: DRAFT_DATA });
    await saveDraftProfileRecord({ submitted: draftRecord(), actorUid: 'admin-1' });

    // Стан форми лишився з ревізією 28 — але записав її цей таб, тож друге
    // збереження з черги не відмовляє.
    loadProfileMutation.mockResolvedValueOnce({ createdBy: 'author-1', revision: 29, data: DRAFT_DATA });
    saveCreateProfileMutation.mockResolvedValueOnce({ revision: 30, data: DRAFT_DATA });
    await expect(saveDraftProfileRecord({ submitted: draftRecord(), actorUid: 'admin-1' })).resolves.toBeTruthy();
    expect(saveCreateProfileMutation).toHaveBeenLastCalledWith(expect.objectContaining({ expectedRevision: 29 }));
  });

  it('trusts the caller base revision over the form memory (accepted overlay built on a fresh read)', async () => {
    rememberDraftRecordRevision(draftRecord());
    loadProfileMutation.mockResolvedValue({ createdBy: 'author-1', revision: 31, data: DRAFT_DATA });
    saveCreateProfileMutation.mockResolvedValue({ revision: 32, data: DRAFT_DATA });

    await expect(saveDraftProfileRecord({
      submitted: draftRecord({ __profileMutationRevision: 31 }), actorUid: 'admin-1', baseRevision: 31,
    })).resolves.toBeTruthy();
  });

  // Позначка «звʼязатись» — особиста позначка адміна. У готової анкети вона
  // лежить під ним у `multiData/getInTouch`, і чернетка тут не виняток: в її
  // даних її побачив би автор, а журнал записав би як правку анкети.
  it('keeps the admin own marks out of the draft and stores them under the admin', async () => {
    loadProfileMutation.mockResolvedValue({ createdBy: 'author-1', revision: 28, data: DRAFT_DATA });
    saveCreateProfileMutation.mockResolvedValue({ revision: 29, data: DRAFT_DATA });

    await saveDraftProfileRecord({
      submitted: { ...draftRecord(), getInTouch: '2026-11-01', writer: 'Ірина' },
      actorUid: 'admin-1',
    });

    expect(setOwnerGetInTouch).toHaveBeenCalledWith('admin-1', 'draft-1', '2026-11-01');
    const [{ data }] = saveCreateProfileMutation.mock.calls.at(-1);
    expect(data).not.toHaveProperty('getInTouch');
    expect(data).not.toHaveProperty('writer');
  });

  it('tells the open admin form that the draft history changed', async () => {
    const listener = jest.fn();
    window.addEventListener(PROFILE_DRAFT_SAVED_EVENT, listener);
    loadProfileMutation.mockResolvedValue({ createdBy: 'author-1', revision: 28, data: DRAFT_DATA });
    saveCreateProfileMutation.mockResolvedValue({ revision: 29, data: DRAFT_DATA });

    await saveDraftProfileRecord({ submitted: draftRecord(), actorUid: 'admin-1' });

    window.removeEventListener(PROFILE_DRAFT_SAVED_EVENT, listener);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ detail: { cardId: 'draft-1', revision: 29 } }));
  });
});

describe('draft history in words', () => {
  it.each([
    [{ added: ['400'] }, 'додано: 400'],
    [{ removed: ['416'] }, 'видалено: 416'],
    [{ added: ['417'], removed: ['416'] }, '416 → 417'],
    [{ added: ['413', '400'], removed: ['412'] }, 'видалено: 412; додано: 413, 400'],
    [{ from: 'Київ', to: 'Львів' }, 'Київ → Львів'],
    [{ from: 'Київ', to: '' }, 'стерто: Київ'],
    [{ from: '', to: 'Київ' }, 'додано: Київ'],
  ])('%j → %s', (change, text) => {
    expect(describeDraftHistoryChange(change)).toBe(text);
  });
});
