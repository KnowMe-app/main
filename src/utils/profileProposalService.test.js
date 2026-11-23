import { ADMIN_UIDS, READONLY_ADMIN_UIDS } from './accessLevel';
import { createProfileProposalService } from './profileProposalService';
import {
  buildCreateProposal,
  buildUpdateProposal,
  normalizeLegacyCreateProposal,
  normalizeLegacyOverlayProposal,
} from './profileProposals';

const author = 'editor-1';
const otherAuthor = 'editor-2';
const [admin] = ADMIN_UIDS;
const [inspector] = READONLY_ADMIN_UIDS;
const cardId = 'card-1';
const canonical = Object.freeze({ userId: cardId, city: 'Kyiv', name: 'Ada' });

const locate = proposal => ({
  operation: proposal.operation,
  cardId: proposal.reservedCardId ?? proposal.targetCardId,
  createdBy: proposal.createdBy,
});

const keyFor = ({ cardId: id, createdBy }) => JSON.stringify([id, createdBy]);

const makeProposal = (operation, { createdBy = author, city = 'Lviv', at = 100, id = `proposal-${createdBy}` } = {}) => {
  const header = { id, createdBy, at };
  return operation === 'create'
    ? buildCreateProposal({ ...header, reservedCardId: cardId, data: { name: 'Ada', city } })
    : buildUpdateProposal({ ...header, targetCardId: cardId, canonical, edits: { city } });
};

const expectedCode = code => expect.objectContaining({ code });

const createHandler = () => {
  const records = new Map();
  const history = new Map();
  const targets = new Set([cardId]);
  const seed = proposal => {
    const key = keyFor(locate(proposal));
    // The token belongs to the backend snapshot and changes with each write.
    const snapshot = { proposal, record: { generation: (records.get(key)?.record.generation ?? 0) + 1 } };
    records.set(key, snapshot);
    return proposal;
  };
  const assertCurrent = (locator, current) => {
    const stored = records.get(keyFor(locator));
    if (stored?.record !== current?.record) {
      throw Object.assign(new Error('Concurrent write'), { code: 'REVISION_CONFLICT' });
    }
  };
  return {
    historyEntries: history,
    targets,
    seed,
    assertCurrent,
    get: jest.fn(async locator => records.get(keyFor(locator)) ?? null),
    list: jest.fn(async ({ actorUid, createdBy, review }) => [...records.values()]
      .map(({ proposal }) => proposal)
      .filter(proposal => createdBy ? proposal.createdBy === createdBy : review || proposal.createdBy === actorUid)),
    save: jest.fn(async (proposal, { current }) => {
      assertCurrent(locate(proposal), current);
      return seed(proposal);
    }),
    remove: jest.fn(async current => {
      const locator = locate(current.proposal);
      assertCurrent(locator, current);
      records.delete(keyFor(locator));
    }),
    history: jest.fn(async locator => history.get(keyFor(locator)) ?? []),
    checkTarget: jest.fn(async proposal => {
      if (!targets.has(proposal.targetCardId)) {
        throw Object.assign(new Error('Target card is missing'), { code: 'TARGET_NOT_FOUND' });
      }
    }),
  };
};

const setup = () => {
  const create = createHandler();
  delete create.checkTarget;
  const handlers = { create, update: createHandler() };
  const serviceAs = actorUid => createProfileProposalService({ handlers, getActorUid: () => actorUid });
  return { handlers, serviceAs, service: serviceAs(author) };
};

describe.each(['create', 'update'])('%s draft service contract', operation => {
  it('creates, reads, lists, previews and saves through the same interface', async () => {
    const { service } = setup();
    const proposal = makeProposal(operation);
    const locator = locate(proposal);

    const saved = await service.createDraft(proposal);
    expect(saved).toMatchObject({ id: proposal.id, createdBy: author, revision: 1 });
    expect(locate(saved)).toEqual(locator);
    await expect(service.getDraft(locator)).resolves.toEqual(saved);
    await expect(service.listDrafts()).resolves.toEqual([saved]);
    expect(service.buildDraftPreview(saved, canonical)).toEqual({ ...canonical, city: 'Lviv' });

    const next = makeProposal(operation, { city: 'Odesa', at: 101 });
    const revised = await service.saveDraft(next, { expected: saved });
    expect(revised).toMatchObject({ id: proposal.id, createdBy: author, createdAt: saved.createdAt, revision: 2 });
    expect(locate(revised)).toEqual(locator);
    await expect(service.getDraft(locator)).resolves.toEqual(revised);
    expect(service.buildDraftPreview(revised, canonical).city).toBe('Odesa');
  });

  it('handles repeated create, no-op save, and competing proposals with the same identity', async () => {
    const { service, handlers } = setup();
    const proposal = makeProposal(operation);
    const saved = await service.createDraft(proposal);
    const identical = makeProposal(operation, { at: 101 });

    await expect(service.createDraft(proposal)).resolves.toEqual(saved);
    await expect(service.saveDraft(identical, { expected: saved })).resolves.toEqual(saved);
    await expect(service.createDraft(makeProposal(operation, { city: 'Odesa' })))
      .rejects.toEqual(expectedCode('ALREADY_EXISTS'));
    expect(handlers[operation].save).toHaveBeenCalledTimes(1);
  });

  it('deletes once and reports missing on a later save', async () => {
    const { service, serviceAs, handlers } = setup();
    const proposal = makeProposal(operation);
    const stored = await service.createDraft(proposal);
    const writer = operation === 'create' ? serviceAs(admin) : service;

    await expect(writer.deleteDraft(locate(proposal), { expected: stored })).resolves.toBe(true);
    await expect(writer.deleteDraft(locate(proposal))).resolves.toBe(false);
    await expect(service.getDraft(locate(proposal))).resolves.toBeNull();
    await expect(service.saveDraft(proposal, { expected: stored })).rejects.toEqual(expectedCode('DRAFT_NOT_FOUND'));
    expect(handlers[operation].remove).toHaveBeenCalledTimes(1);
  });

  it('rejects stale saves and deletes before touching the backend', async () => {
    const { service, serviceAs, handlers } = setup();
    const proposal = makeProposal(operation);
    const stored = await service.createDraft(proposal);
    const latest = await service.saveDraft(makeProposal(operation, { city: 'Odesa', at: 101 }), { expected: stored });
    const remover = operation === 'create' ? serviceAs(admin) : service;

    await expect(service.saveDraft(makeProposal(operation, { city: 'Kharkiv' }), { expected: stored }))
      .rejects.toEqual(expectedCode('REVISION_CONFLICT'));
    await expect(remover.deleteDraft(locate(proposal), { expected: stored }))
      .rejects.toEqual(expectedCode('REVISION_CONFLICT'));
    expect(handlers[operation].save).toHaveBeenCalledTimes(2);
    expect(handlers[operation].remove).not.toHaveBeenCalled();
    await expect(service.getDraft(locate(proposal))).resolves.toEqual(latest);
  });

  it('surfaces backend errors and safely retries an unchanged request', async () => {
    const { service, handlers } = setup();
    const proposal = makeProposal(operation);
    const stored = await service.createDraft(proposal);
    const edited = makeProposal(operation, { city: 'Odesa', at: 101 });
    const failure = new Error('Firebase write failed');
    handlers[operation].save.mockRejectedValueOnce(failure);

    await expect(service.saveDraft(edited, { expected: stored }))
      .rejects.toMatchObject({ code: 'WRITE_FAILED', cause: failure });
    await expect(service.getDraft(locate(proposal))).resolves.toEqual(stored);
    await expect(service.saveDraft(edited, { expected: stored })).resolves.toMatchObject({ revision: 2 });
  });

  it('reports a conflict between two clients that loaded the same revision', async () => {
    const { service, serviceAs, handlers } = setup();
    const proposal = makeProposal(operation);
    const stored = await service.createDraft(proposal);
    const handler = handlers[operation];
    const save = handler.save.getMockImplementation();
    let arrivals = 0;
    let releaseWrites;
    const bothWritesReady = new Promise(resolve => { releaseWrites = resolve; });
    handler.save.mockImplementation(async (...args) => {
      arrivals += 1;
      if (arrivals === 2) releaseWrites();
      await bothWritesReady;
      return save(...args);
    });

    const results = await Promise.allSettled([
      service.saveDraft(makeProposal(operation, { city: 'Odesa', at: 101 }), { expected: stored }),
      serviceAs(author).saveDraft(makeProposal(operation, { city: 'Kharkiv', at: 101 }), { expected: stored }),
    ]);
    const successful = results.filter(result => result.status === 'fulfilled');
    const rejected = results.filter(result => result.status === 'rejected');
    expect(successful).toHaveLength(1);
    expect(successful[0].value.revision).toBe(2);
    expect(rejected).toEqual([{ status: 'rejected', reason: expectedCode('REVISION_CONFLICT') }]);
    await expect(service.getDraft(locate(proposal))).resolves.toEqual(successful[0].value);
  });

  it('lets the inspector read foreign drafts and history while retaining own editing only', async () => {
    const { service, serviceAs, handlers } = setup();
    const proposal = makeProposal(operation);
    const locator = locate(proposal);
    const stored = await service.createDraft(proposal);
    const inspectorService = serviceAs(inspector);
    const history = [{ actorUid: author, revision: 1, fieldName: 'city', change: { to: 'Lviv' } }];
    handlers[operation].historyEntries.set(keyFor(locator), history);

    await expect(inspectorService.getDraft(locator)).resolves.toEqual(stored);
    await expect(inspectorService.listDrafts({ review: true })).resolves.toContainEqual(stored);
    await expect(inspectorService.getDraftHistory(locator)).resolves.toEqual(history);
    await expect(inspectorService.saveDraft(makeProposal(operation, { city: 'Odesa' }), { expected: stored }))
      .rejects.toEqual(expectedCode('PERMISSION_DENIED'));
    await expect(inspectorService.deleteDraft(locator)).rejects.toEqual(expectedCode('PERMISSION_DENIED'));
    await expect(service.getDraftHistory(locator)).rejects.toEqual(expectedCode('PERMISSION_DENIED'));

    const own = await inspectorService.createDraft(makeProposal(operation, { createdBy: inspector }));
    await expect(inspectorService.saveDraft(makeProposal(operation, { createdBy: inspector, city: 'Odesa' }), { expected: own }))
      .resolves.toMatchObject({ createdBy: inspector, revision: 2 });
  });

  it('loads a legacy record with an unknown revision and saves its first known revision', async () => {
    const { service, handlers } = setup();
    const legacy = operation === 'create'
      ? normalizeLegacyCreateProposal({ data: { name: 'Ada', city: 'Lviv' }, status: 'pendingReview' }, { creatorUid: author, cardId })
      : normalizeLegacyOverlayProposal({ fields: { city: { from: 'Kyiv', to: 'Lviv' } } }, { editorUid: author, cardId });
    handlers[operation].seed(legacy);

    const saved = await service.getDraft(locate(legacy));
    expect(saved).toMatchObject({ id: legacy.id, createdBy: author, revision: null });
    const edited = makeProposal(operation, { id: legacy.id, city: 'Odesa' });
    await expect(service.saveDraft(edited, { expected: saved })).resolves.toMatchObject({ id: legacy.id, revision: 1 });
  });
});

describe('update draft targets', () => {
  it('reports a missing target when creating and when saving an existing draft', async () => {
    const { service, handlers } = setup();
    const proposal = makeProposal('update');
    const { targets, save } = handlers.update;
    targets.delete(cardId);

    await expect(service.createDraft(proposal)).rejects.toEqual(expectedCode('TARGET_NOT_FOUND'));
    expect(save).not.toHaveBeenCalled();

    targets.add(cardId);
    const stored = await service.createDraft(proposal);
    targets.delete(cardId);
    await expect(service.saveDraft(makeProposal('update', { city: 'Odesa' }), { expected: stored }))
      .rejects.toEqual(expectedCode('TARGET_NOT_FOUND'));
    expect(save).toHaveBeenCalledTimes(1);
    await expect(service.getDraft(locate(proposal))).resolves.toEqual(stored);
  });

  it.each([
    ['the same field', { city: 'Odesa' }, 'city'],
    ['different fields', { name: 'Olena' }, 'name'],
  ])('saves two authors’ proposals for %s on the same target', async (_description, edits, secondField) => {
    const { service, serviceAs } = setup();
    const first = makeProposal('update');
    const second = buildUpdateProposal({
      id: `proposal-${otherAuthor}`, createdBy: otherAuthor, at: 100, targetCardId: cardId, canonical, edits,
    });
    const [firstSaved, secondSaved] = await Promise.all([
      service.createDraft(first),
      serviceAs(otherAuthor).createDraft(second),
    ]);

    expect(firstSaved).toMatchObject({ targetCardId: cardId, createdBy: author, revision: 1 });
    expect(secondSaved).toMatchObject({ targetCardId: cardId, createdBy: otherAuthor, revision: 1 });
    expect(Object.keys(firstSaved.changes)).toEqual(['city']);
    expect(Object.keys(secondSaved.changes)).toEqual([secondField]);
    expect(firstSaved.id).not.toBe(secondSaved.id);
    await expect(service.listDrafts()).resolves.toEqual([firstSaved]);
    await expect(serviceAs(otherAuthor).listDrafts()).resolves.toEqual([secondSaved]);
    await expect(serviceAs(admin).listDrafts({ review: true })).resolves.toEqual(expect.arrayContaining([firstSaved, secondSaved]));
  });
});
