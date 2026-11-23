const { get, push, ref, remove, runTransaction, update } = require('firebase/database');

jest.mock('firebase/database', () => ({
  get: jest.fn(),
  push: jest.fn(() => ({ key: 'history-entry' })),
  ref: jest.fn((db, path) => ({ db, path })),
  remove: jest.fn(async () => {}),
  runTransaction: jest.fn(),
  update: jest.fn(),
}));

jest.mock('components/config', () => ({
  auth: { currentUser: null },
  database: { app: 'db' },
  syncUserSearchKeyIndex: jest.fn(async () => {}),
  syncMatchingCardIndex: jest.fn(async () => {}),
}));

jest.mock('./multiAccountEdits', () => {
  const actual = jest.requireActual('./multiAccountEdits');
  return {
    ...actual,
    getOverlaysForCard: jest.fn(async () => ({})),
  };
});

const { auth, syncUserSearchKeyIndex, syncMatchingCardIndex } = require('components/config');
const { getOverlaysForCard } = require('./multiAccountEdits');
const { ADMIN_UIDS, READONLY_ADMIN_UIDS } = require('./accessLevel');
const { acceptCreateProfileMutation, rejectCreateProfileMutation, saveCreateProfileMutation } = require('./profileMutations');

const snapshotOf = value => ({ exists: () => Boolean(value), val: () => value });

const pendingMutation = {
  cardId: 'card-1',
  operation: 'create',
  status: 'pendingReview',
  createdBy: 'author-1',
  revision: 3,
  data: { userId: 'card-1', name: 'Anna' },
};

// Publishing a draft ("Зберегти чернетку") is the one step that turns it into a
// real card: it lands in the profile nodes the web actually reads, goes through
// the standard search indexes, and only then gets its feed projection.
describe('acceptCreateProfileMutation', () => {
  let transactionMutation;
  let canonicalNodes;
  const mutationPath = 'multiData/profileMutations/author-1/card-1';
  const projectionPath = 'matchingCards/card-1';
  const approve = (overrides = {}) => acceptCreateProfileMutation({
    cardId: pendingMutation.cardId,
    creatorUid: pendingMutation.createdBy,
    expectedRevision: pendingMutation.revision,
    ...overrides,
  });

  const simulateTransaction = async (refObject, updater) => {
    if (refObject.path !== mutationPath) {
      const next = updater(null);
      return { committed: next !== undefined, snapshot: snapshotOf(next) };
    }
    // SDK може почати з null, а потім повторити транзакцію з даними сервера.
    const localNext = updater(null);
    if (localNext === undefined) return { committed: false, snapshot: snapshotOf(null) };
    const next = transactionMutation === null ? localNext : updater(transactionMutation);
    if (next !== undefined) transactionMutation = next;
    return { committed: next !== undefined, snapshot: snapshotOf(transactionMutation) };
  };

  const simulatePublication = (refObject, changes) => {
    if (refObject.path || !changes[mutationPath]) return;
    transactionMutation = changes[mutationPath];
    canonicalNodes.set('profileTechnical/card-1', { createdAt: '2026-11-23' });
  };

  const resetPublicationMocks = () => {
    jest.resetAllMocks();
    auth.currentUser = { uid: ADMIN_UIDS[0] };
    canonicalNodes = new Map();
    let attempt = 0;
    ref.mockImplementation((db, path) => ({ db, path }));
    push.mockImplementation(() => ({ key: `attempt-${++attempt}` }));
    get.mockImplementation(async refObject => snapshotOf(
      refObject.path === mutationPath ? transactionMutation : canonicalNodes.get(refObject.path) ?? null,
    ));
    transactionMutation = pendingMutation;
    runTransaction.mockImplementation(simulateTransaction);
    getOverlaysForCard.mockResolvedValue({});
    syncUserSearchKeyIndex.mockResolvedValue(undefined);
    syncMatchingCardIndex.mockImplementation(async (cardId, data) => {
      const projection = { name: data.name, rev: 1 };
      canonicalNodes.set(`matchingCards/${cardId}`, projection);
      return projection;
    });
    update.mockImplementation(async (...args) => simulatePublication(...args));
    remove.mockResolvedValue(undefined);
  };

  beforeEach(resetPublicationMocks);

  it('publishes a pending create draft after an initial local cache miss', async () => {
    await expect(acceptCreateProfileMutation({
      cardId: 'card-1',
      creatorUid: 'author-1',
      expectedRevision: 3,
    })).resolves.toEqual({ userId: 'card-1', name: 'Anna' });

    // Імʼя належить картці стрічки, а не вузлам, тож вузлових полів у цієї
    // чернетки немає — публікація відкриває вузол датою створення.
    expect(update).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      'profileTechnical/card-1/createdAt': expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    }));
    expect(update).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      'users/card-1': expect.anything(),
    }));
  });

  it('does not recreate a draft deleted after the server read', async () => {
    transactionMutation = null;
    get.mockResolvedValueOnce(snapshotOf(pendingMutation));

    await expect(acceptCreateProfileMutation({
      cardId: 'card-1',
      creatorUid: 'author-1',
      expectedRevision: 3,
    })).rejects.toThrow('Profile mutation not found');

    expect(update).not.toHaveBeenCalled();
    const mutationResults = runTransaction.mock.results
      .filter((result, index) => runTransaction.mock.calls[index][0].path.startsWith('multiData/profileMutations'));
    expect(mutationResults).toHaveLength(1);
  });

  it('returns REVISION_CONFLICT when the draft changes after the server read', async () => {
    transactionMutation = { ...pendingMutation, revision: 4, data: { ...pendingMutation.data, name: 'Olena' } };
    get.mockResolvedValueOnce(snapshotOf(pendingMutation));

    await expect(acceptCreateProfileMutation({
      cardId: 'card-1',
      creatorUid: 'author-1',
      expectedRevision: 3,
    })).rejects.toThrow('REVISION_CONFLICT');

    expect(update).not.toHaveBeenCalled();
  });

  it('rejects approval when the record changed since review without incrementing its revision', async () => {
    transactionMutation = { ...pendingMutation, data: { ...pendingMutation.data, name: 'Olena' } };

    await expect(approve({ expectedCurrent: pendingMutation })).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });

    expect(runTransaction).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects an approval when the same revision changes between the read and transaction', async () => {
    transactionMutation = { ...pendingMutation, data: { ...pendingMutation.data, name: 'Olena' } };
    get.mockResolvedValueOnce(snapshotOf(pendingMutation));

    await expect(approve({ expectedCurrent: pendingMutation })).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });

    expect(transactionMutation.data.name).toBe('Olena');
    expect(update).not.toHaveBeenCalled();
  });

  it('розкладає картку по вузлах, чистить історію ревізій і проганяє індекси', async () => {
    const finalData = { userId: 'card-1', name: 'Anna', surname: 'Kovalenko', phone: '+380671112233' };
    const profile = await acceptCreateProfileMutation({
      cardId: 'card-1',
      creatorUid: 'author-1',
      expectedRevision: 3,
      finalData,
    });

    expect(profile).toEqual(finalData);
    expect(syncUserSearchKeyIndex).toHaveBeenCalledWith('card-1', {}, finalData);
    // Публікація анкети одразу дає їй урізану картку для стрічки матчингу.
    // Публікація — нова версія анкети (`rev`) для кешу читачів.
    expect(syncMatchingCardIndex).toHaveBeenCalledWith('card-1', finalData, { bumpRevision: true, onlyIfMissing: true });
    // searchId index entries are written through a transaction of their own.
    expect(runTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ path: expect.stringMatching(/^searchId\//) }),
      expect.any(Function),
      expect.anything(),
    );

    const [, publication] = update.mock.calls.find(([target]) => target.path === undefined || target.path === '') || update.mock.calls[0];
    // Кожне поле — у своєму вузлі; `name` і `userId` належать картці стрічки,
    // і туди їх кладе проєкція, а не копія поля.
    expect(publication['profileDetails/card-1/surname']).toBe('Kovalenko');
    expect(publication['profileContacts/card-1/phone']).toBe('+380671112233');
    expect(publication).not.toHaveProperty('users/card-1');
    expect(publication).not.toHaveProperty('matchingCards/card-1/name');
    expect(Object.keys(publication).some(path => path.includes('createdProfileCardIds'))).toBe(false);
    expect(publication).not.toHaveProperty('multiData/profileMutationHistory/card-1');
    expect(publication['multiData/profileMutations/author-1/card-1'].status).toBe('accepted');
    expect(Object.keys(publication).some(path => path.startsWith('multiData/edits/'))).toBe(false);
    expect(Object.keys(publication).some(path => path.startsWith('multiData/editsHistory/'))).toBe(false);
    expect(remove).toHaveBeenCalledWith(expect.objectContaining({
      path: 'multiData/profileMutationHistory/card-1',
    }));
  });

  it('keeps unresolved overlay fields and makes them admin-only after publication', async () => {
    getOverlaysForCard.mockResolvedValue({
      'editor-1': { fields: { city: { from: 'Kyiv', to: 'Lviv' } } },
    });

    await acceptCreateProfileMutation({
      cardId: 'card-1',
      creatorUid: 'author-1',
      expectedRevision: 3,
      finalData: { userId: 'card-1', name: 'Anna' },
    });

    const publications = update.mock.calls.map(([, publication]) => publication);
    expect(publications[1]['multiData/edits/card-1/editor-1/adminOnly']).toBe(true);
    expect(publications[1]).not.toHaveProperty('multiData/edits/card-1/editor-1/fields');
    const publication = publications[0];
    expect(publication).not.toHaveProperty('matchingCards/card-1/city');
  });

  it('labels each failed publication phase without exposing its Firebase path', async () => {
    const permissionError = () => Object.assign(new Error('PERMISSION_DENIED at /private/contact'), {
      code: 'PERMISSION_DENIED',
    });
    const publish = () => acceptCreateProfileMutation({
      cardId: 'card-1',
      creatorUid: 'author-1',
      expectedRevision: 3,
      finalData: { ...pendingMutation.data, email: 'private@example.com' },
    });

    get.mockRejectedValueOnce(permissionError());
    await expect(publish()).rejects.toMatchObject({ profileSaveStage: 'mutation-transition' });

    resetPublicationMocks();
    const read = get.getMockImplementation();
    get.mockImplementation(refObject => (
      refObject.path.startsWith('searchId/') ? Promise.reject(permissionError()) : read(refObject)
    ));
    await expect(publish()).rejects.toMatchObject({ profileSaveStage: 'identity-claim' });

    resetPublicationMocks();
    runTransaction.mockImplementation(async (refObject, updater) => {
      if (refObject.path.startsWith('searchId/')) throw permissionError();
      return simulateTransaction(refObject, updater);
    });
    await expect(publish()).rejects.toMatchObject({ profileSaveStage: 'search-id-index' });

    resetPublicationMocks();
    syncUserSearchKeyIndex.mockRejectedValueOnce(permissionError());
    await expect(publish()).rejects.toMatchObject({ profileSaveStage: 'search-key-index' });

    resetPublicationMocks();
    update.mockRejectedValueOnce(permissionError());
    await expect(publish()).rejects.toMatchObject({
      profileSaveStage: 'publication-update',
      profileSaveTargets: ['profile-nodes', 'mutation-status'],
      profileSaveRecovered: true,
    });
    expect(transactionMutation).toEqual(pendingMutation);
  });

  it('prevents a second administrator and an autosave from replacing an active claim', async () => {
    let finishIndex;
    let indexingStarted;
    const started = new Promise(resolve => { indexingStarted = resolve; });
    syncUserSearchKeyIndex.mockImplementationOnce(() => new Promise(resolve => {
      finishIndex = resolve;
      indexingStarted();
    }));
    const first = approve();
    try {
      await started;
      const claim = transactionMutation;
      expect(claim).toMatchObject({ status: 'publishing', publicationActorUid: ADMIN_UIDS[0] });
      auth.currentUser = { uid: ADMIN_UIDS[1] };
      await expect(approve({ finalData: { name: 'Stale admin name' } })).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
      await expect(saveCreateProfileMutation({
        ...pendingMutation,
        creatorUid: pendingMutation.createdBy,
        actorUid: pendingMutation.createdBy,
        expectedRevision: pendingMutation.revision,
        data: { name: 'Stale author name' },
      })).rejects.toThrow('REVISION_CONFLICT');
      expect(transactionMutation).toEqual(claim);
      expect(update).not.toHaveBeenCalled();
    } finally {
      auth.currentUser = { uid: ADMIN_UIDS[0] };
      finishIndex?.();
      await first;
    }
    expect(transactionMutation).toMatchObject({ status: 'accepted', data: pendingMutation.data });
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('returns the same accepted result without changing a newer canonical projection or reindexing', async () => {
    await approve();
    const newerProjection = { name: 'Updated canonical name', rev: 2 };
    canonicalNodes.set(projectionPath, newerProjection);

    await expect(approve({
      expectedCurrent: pendingMutation,
      finalData: { ...pendingMutation.data, ignored: null },
    })).resolves.toEqual(pendingMutation.data);
    await expect(approve({ finalData: { name: 'Different approval' } })).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    expect(canonicalNodes.get(projectionPath)).toBe(newerProjection);
    expect(update).toHaveBeenCalledTimes(1);
    expect(syncMatchingCardIndex).toHaveBeenCalledTimes(1);
    expect(syncUserSearchKeyIndex).toHaveBeenCalledTimes(1);
  });

  it('rolls back its claim if a canonical profile appears while indexes are prepared', async () => {
    syncUserSearchKeyIndex.mockImplementationOnce(async () => {
      canonicalNodes.set('profileContacts/card-1', { phone: 'newer' });
    });

    await expect(approve()).rejects.toMatchObject({ code: 'REVISION_CONFLICT', profileSaveRecovered: true });
    expect(update).not.toHaveBeenCalled();
    expect(canonicalNodes.get('profileContacts/card-1')).toEqual({ phone: 'newer' });
    expect(transactionMutation).toEqual(pendingMutation);
  });

  it('does not restore the old draft if its claim changed before the rollback', async () => {
    const replacement = { ...pendingMutation, revision: 4, data: { name: 'Newer' } };
    syncUserSearchKeyIndex.mockImplementationOnce(async () => {
      transactionMutation = replacement;
      throw new Error('index unavailable');
    });

    await expect(approve()).rejects.toMatchObject({ profileSaveStage: 'search-key-index', profileSaveRecovered: false });
    expect(transactionMutation).toEqual(replacement);
    expect(update).not.toHaveBeenCalled();
  });

  it('recognizes an accepted write whose acknowledgement was lost', async () => {
    update.mockImplementationOnce(async (...args) => {
      simulatePublication(...args);
      throw new Error('connection lost');
    });

    await expect(approve()).resolves.toEqual(pendingMutation.data);
    expect(transactionMutation.status).toBe('accepted');
    expect(update).toHaveBeenCalledTimes(1);
    expect(syncMatchingCardIndex).toHaveBeenCalledTimes(1);
  });

  it('reports a missing projection after acceptance without replaying canonical or index writes', async () => {
    syncMatchingCardIndex.mockResolvedValueOnce(null);
    const partial = { code: 'PARTIAL_WRITE', profileSaveStage: 'matching-card-index' };

    await expect(approve()).rejects.toMatchObject(partial);
    await expect(approve()).rejects.toMatchObject(partial);
    expect(transactionMutation.status).toBe('accepted');
    expect(update).toHaveBeenCalledTimes(1);
    expect(syncMatchingCardIndex).toHaveBeenCalledTimes(1);
  });

  it('denies an inspector before claiming a draft', async () => {
    auth.currentUser = { uid: READONLY_ADMIN_UIDS[0] };

    await expect(approve()).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    expect(runTransaction).not.toHaveBeenCalled();
  });

  it('blocks a canonical contact duplicate before changing canonical nodes or search indexes', async () => {
    const phone = '380671112233';
    canonicalNodes.set(`searchId/${phone}/phone`, 'existing-card');
    canonicalNodes.set('matchingCards/existing-card', { name: 'Existing profile' });

    await expect(approve({ finalData: { ...pendingMutation.data, phone } })).rejects.toMatchObject({
      code: 'DUPLICATE_PROFILE',
      profileSaveStage: 'identity-claim',
      profileSaveRecovered: true,
      duplicateConflicts: [{ field: 'phone', cardIds: ['existing-card'] }],
    });

    expect(transactionMutation).toEqual(pendingMutation);
    expect(update).not.toHaveBeenCalled();
    expect(syncMatchingCardIndex).not.toHaveBeenCalled();
    expect(syncUserSearchKeyIndex).not.toHaveBeenCalled();
  });

  it('blocks approval when only another draft’s identity claim is present', async () => {
    const phone = '380671112233';
    runTransaction.mockImplementation(async (refObject, updater) => {
      if (refObject.path !== `multiData/profileIdentityClaims/phone_${phone}`) {
        return simulateTransaction(refObject, updater);
      }
      const current = 'other-draft';
      const next = updater(current);
      return { committed: next !== undefined, snapshot: snapshotOf(next ?? current) };
    });

    await expect(approve({ finalData: { ...pendingMutation.data, phone } })).rejects.toMatchObject({
      code: 'DUPLICATE_PROFILE',
      duplicateConflicts: [{ field: 'phone', cardIds: ['other-draft'] }],
    });

    expect(transactionMutation).toEqual(pendingMutation);
    expect(update).not.toHaveBeenCalled();
  });

  describe('returning a create draft', () => {
    const reject = () => rejectCreateProfileMutation({
      cardId: pendingMutation.cardId,
      creatorUid: pendingMutation.createdBy,
      expectedRevision: pendingMutation.revision,
      expectedCurrent: pendingMutation,
    });

    it('returns a draft after a local cache miss and leaves its data and history intact', async () => {
      await expect(reject()).resolves.toMatchObject({
        status: 'private', revision: 4, data: pendingMutation.data,
      });
      await expect(reject()).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });

      expect(update).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
    });

    it('does not recreate a draft deleted between the read and the transaction', async () => {
      transactionMutation = null;
      get.mockResolvedValueOnce(snapshotOf(pendingMutation));

      await expect(reject()).rejects.toMatchObject({ code: 'DRAFT_NOT_FOUND' });
      expect(transactionMutation).toBeNull();
    });

    it('does not return a same-revision draft changed during review', async () => {
      const newer = { ...pendingMutation, data: { name: 'Newer' } };
      transactionMutation = newer;
      get.mockResolvedValueOnce(snapshotOf(pendingMutation));

      await expect(reject()).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
      expect(transactionMutation).toEqual(newer);
    });

    it.each([READONLY_ADMIN_UIDS[0], pendingMutation.createdBy])('denies role UID %s before reading', async uid => {
      auth.currentUser = { uid };

      await expect(reject()).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
      expect(get).not.toHaveBeenCalled();
      expect(runTransaction).not.toHaveBeenCalled();
    });
  });
});
