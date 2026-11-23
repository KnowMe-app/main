import { canGrantProfilePrivileges, isAdminUid } from './accessLevel';
import { areProposalValuesEqual, buildProposalPreview } from './profileProposals';

const SERVICE_ERROR_CODES = new Set([
  'INVALID_DRAFT', 'AUTH_REQUIRED', 'PERMISSION_DENIED', 'DRAFT_NOT_FOUND', 'TARGET_NOT_FOUND',
  'ALREADY_EXISTS', 'REVISION_CONFLICT', 'PARTIAL_WRITE', 'NETWORK_ERROR',
]);

export class ProfileProposalError extends Error {
  constructor(code, cause) {
    super(cause?.message || code);
    this.name = 'ProfileProposalError';
    this.code = code;
    if (cause) this.cause = cause;
  }
}

const normalizeErrorCode = value => (
  typeof value === 'string' ? value.split('/').pop().trim().replace(/-/g, '_').toUpperCase() : ''
);

const classifyError = (error, fallback) => {
  if (error instanceof ProfileProposalError) return error;
  const codes = [normalizeErrorCode(error?.code), normalizeErrorCode(error?.message)];
  let code = codes.find(value => SERVICE_ERROR_CODES.has(value));
  if (!code && codes.includes('DRAFT_CHANGED_ELSEWHERE')) code = 'REVISION_CONFLICT';
  if (!code && /^permission[_ ]denied\b/i.test(error?.message || '')) code = 'PERMISSION_DENIED';
  if (!code && codes.some(value => ['UNAVAILABLE', 'DISCONNECTED', 'NETWORK_REQUEST_FAILED', 'DEADLINE_EXCEEDED'].includes(value))) {
    code = 'NETWORK_ERROR';
  }
  return new ProfileProposalError(code || fallback, error);
};

const run = async (fallback, operation) => {
  try {
    return await operation();
  } catch (error) {
    throw classifyError(error, fallback);
  }
};

const isKey = value => typeof value === 'string' && value.trim() === value && value.length > 0 && !/[.#$[\]/]/.test(value);
const isDraftOperation = operation => operation === 'create' || operation === 'update';
const isEditable = status => status === 'private' || status === 'pendingReview';

const checkLocator = ({ operation, cardId, createdBy }) => {
  if (!isDraftOperation(operation) || !isKey(cardId) || !isKey(createdBy)) {
    throw new ProfileProposalError('INVALID_DRAFT');
  }
  return { operation, cardId, createdBy };
};

const proposalLocator = proposal => checkLocator({
  operation: proposal?.operation,
  createdBy: proposal?.createdBy,
  cardId: proposal?.reservedCardId ?? proposal?.targetCardId,
});

const requireOwnerOrAdmin = (locator, actorUid) => {
  if (locator.createdBy !== actorUid && !canGrantProfilePrivileges(actorUid)) {
    throw new ProfileProposalError('PERMISSION_DENIED');
  }
};

const isRecord = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const checkProposal = proposal => {
  const locator = proposalLocator(proposal);
  // ID пропозиції може містити префікс сумісності. Шлях RTDB будується лише з
  // перевірених cardId і createdBy.
  if (typeof proposal.id !== 'string' || !proposal.id.trim()) throw new ProfileProposalError('INVALID_DRAFT');
  if (locator.operation === 'create' && (!isRecord(proposal.data) || proposal.targetCardId != null)) {
    throw new ProfileProposalError('INVALID_DRAFT');
  }
  if (locator.operation === 'update' && (
    !isRecord(proposal.changes) || !Object.keys(proposal.changes).length || proposal.reservedCardId != null
  )) {
    throw new ProfileProposalError('INVALID_DRAFT');
  }
  return locator;
};

const compareExpected = (current, expected) => {
  // Номер є у нових записів. У старого шару він може бути null, тому порівнюємо
  // і знімок, який прочитав редактор. Адаптер повторює перевірку в транзакції.
  if (!expected || !areProposalValuesEqual(current.proposal, expected)) {
    throw new ProfileProposalError('REVISION_CONFLICT');
  }
};

const samePayload = (a, b, normalizeData = value => value) => (
  areProposalValuesEqual(normalizeData(a.data), normalizeData(b.data))
  && areProposalValuesEqual(a.changes, b.changes)
  && areProposalValuesEqual(a.originalValues ?? {}, b.originalValues ?? {})
  && (a.baseCardRevision ?? null) === (b.baseCardRevision ?? null)
  && (a.targetCreateProposalId ?? null) === (b.targetCreateProposalId ?? null)
);

/**
 * Адаптери читають точний запис у своєму сховищі. record лишається всередині
 * сервісу і йде назад адаптеру для умовного запису. Клієнт передає незмінений
 * результат get/create/save як expected, зокрема коли старий запис не має
 * ревізії. Збереження переводить редагований запис у pendingReview.
 *
 * Поки чинні старі UI-писачі, їхні правила й історія лишаються чинними.
 * Авторизацію читання точкових записів забезпечує сховище.
 */
export const createProfileProposalService = ({ handlers, getActorUid, now = Date.now }) => {
  const requireActor = () => {
    const uid = getActorUid();
    if (!isKey(uid)) throw new ProfileProposalError('AUTH_REQUIRED');
    return uid;
  };

  const read = (locator, actorUid) => handlers[locator.operation].get(locator, { actorUid });
  const sameDraft = (a, b) => samePayload(a, b, handlers[a.operation].normalizeData);
  const save = async (proposal, locator, current, actorUid) => {
    const handler = handlers[locator.operation];
    const context = { current, actorUid };
    await handler.checkTarget?.(proposal, context);
    return handler.save(proposal, context);
  };

  return {
    createDraft: proposal => run('WRITE_FAILED', async () => {
      const actorUid = requireActor();
      const locator = checkProposal(proposal);
      if (locator.createdBy !== actorUid) throw new ProfileProposalError('PERMISSION_DENIED');

      const current = await read(locator, actorUid);
      if (current) {
        if (current.proposal.id === proposal.id && sameDraft(current.proposal, proposal)) return current.proposal;
        throw new ProfileProposalError('ALREADY_EXISTS');
      }
      if (proposal.status !== 'pendingReview' || proposal.revision !== 1) throw new ProfileProposalError('INVALID_DRAFT');
      const at = now();
      return save({ ...proposal, createdAt: at, updatedAt: at }, locator, null, actorUid);
    }),

    getDraft: locator => run('READ_FAILED', async () => {
      const actorUid = requireActor();
      return (await read(checkLocator(locator ?? {}), actorUid))?.proposal ?? null;
    }),

    listDrafts: ({ review = false, createdBy } = {}) => run('READ_FAILED', async () => {
      const actorUid = requireActor();
      if (createdBy != null && !isKey(createdBy)) throw new ProfileProposalError('INVALID_DRAFT');
      if ((review || (createdBy && createdBy !== actorUid)) && !isAdminUid(actorUid)) {
        throw new ProfileProposalError('PERMISSION_DENIED');
      }
      const options = { actorUid, createdBy: createdBy ?? (review ? null : actorUid), review };
      const lists = await Promise.all([handlers.create.list(options), handlers.update.list(options)]);
      return lists.flat().sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0) || a.id.localeCompare(b.id));
    }),

    saveDraft: (proposal, { expected } = {}) => run('WRITE_FAILED', async () => {
      const actorUid = requireActor();
      const locator = checkProposal(proposal);
      requireOwnerOrAdmin(locator, actorUid);
      const current = await read(locator, actorUid);
      if (!current) throw new ProfileProposalError('DRAFT_NOT_FOUND');
      compareExpected(current, expected);
      const existing = current.proposal;
      if (proposal.id !== existing.id || !isEditable(existing.status)) {
        throw new ProfileProposalError('REVISION_CONFLICT');
      }
      if (existing.status === 'pendingReview' && sameDraft(existing, proposal)) return existing;

      return save({
        ...proposal,
        createdAt: existing.createdAt,
        updatedAt: now(),
        revision: (existing.revision ?? 0) + 1,
        status: 'pendingReview',
      }, locator, current, actorUid);
    }),

    deleteDraft: (reference, { expected } = {}) => run('WRITE_FAILED', async () => {
      const actorUid = requireActor();
      const locator = checkLocator(reference ?? {});
      requireOwnerOrAdmin(locator, actorUid);
      if (locator.operation === 'create' && !canGrantProfilePrivileges(actorUid)) {
        throw new ProfileProposalError('PERMISSION_DENIED');
      }
      const current = await read(locator, actorUid);
      if (!current) return false;
      compareExpected(current, expected);
      if (!isEditable(current.proposal.status)) throw new ProfileProposalError('REVISION_CONFLICT');
      await handlers[locator.operation].remove(current, { actorUid });
      return true;
    }),

    getDraftHistory: reference => run('READ_FAILED', async () => {
      const actorUid = requireActor();
      if (!isAdminUid(actorUid)) throw new ProfileProposalError('PERMISSION_DENIED');
      const locator = checkLocator(reference ?? {});
      const entries = await handlers[locator.operation].history(locator, { actorUid });
      return entries.map(entry => ({
        ...entry,
        actorUid: entry.actorUid ?? entry.editorUserId ?? null,
        revision: entry.revision ?? null,
      }));
    }),

    buildDraftPreview: buildProposalPreview,
  };
};
