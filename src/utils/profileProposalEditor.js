import { applyOverlayToCard, buildOverlayFromDraft, normalizeArray } from './profileFieldChanges';
import {
  areProposalValuesEqual,
  buildCreateProposal,
  buildUpdateProposal,
  normalizeLegacyCreateProposal,
} from './profileProposals';

const owns = (object, key) => Object.prototype.hasOwnProperty.call(object ?? {}, key);

export const proposalEditorKey = ({ operation, createdBy, cardId }) => JSON.stringify([operation, createdBy, cardId]);

export const createEditorSnapshot = mutation => {
  const proposal = normalizeLegacyCreateProposal(mutation);
  if (proposal && mutation.proposalId) proposal.id = mutation.proposalId;
  return proposal;
};

export const asProfileMutation = proposal => ({ ...proposal, cardId: proposal.reservedCardId });

export const buildEditorProposal = (editor, draft, at = Date.now()) => {
  const { locator, expected, base, visible, rawBase, targetCreateProposalId } = editor;
  const { operation, cardId, createdBy } = locator;
  const id = expected?.id ?? proposalEditorKey(locator);
  const header = { id, createdBy, at };

  if (operation === 'create') {
    // Автор може бачити чужі доповнення. В анкету переносимо тільки різницю,
    // яку він сам щойно набрав поверх показаної форми.
    const data = editor.protectContributions
      ? applyOverlayToCard(base, buildOverlayFromDraft(visible, draft))
      : draft;
    return buildCreateProposal({ ...header, reservedCardId: cardId, data });
  }

  const edits = Object.fromEntries(Object.entries(draft).map(([field, value]) => [
    field,
    editor.additive && owns(base, field) && field !== 'userId'
      ? [...normalizeArray(base[field]), ...normalizeArray(value)]
      : value,
  ]));
  const next = buildUpdateProposal({
    ...header,
    targetCardId: cardId,
    canonical: base,
    edits,
    baseCardRevision: expected ? expected.baseCardRevision : rawBase?.rev ?? null,
  });
  if (!next) return null;

  next.originalValues = Object.fromEntries(Object.keys(next.changes).flatMap(field => {
    if (owns(expected?.changes, field)) {
      // Нова форма не може заднім числом видати свіжу анкету за базу старої правки.
      return owns(expected.originalValues, field) ? [[field, expected.originalValues[field]]] : [];
    }
    const source = rawBase ?? base;
    const original = owns(source, field) ? { present: true, value: source[field] } : { present: false };
    return [[field, original]];
  }));
  if (targetCreateProposalId) next.targetCreateProposalId = targetCreateProposalId;
  return next;
};

export const saveEditorProposal = async (service, editor, draft) => {
  const { expected, locator } = editor;
  if (expected && areProposalValuesEqual(editor.visible, draft)) return expected;
  const proposal = buildEditorProposal(editor, draft);
  if (!proposal) {
    if (expected) await service.deleteDraft(locator, { expected });
    return null;
  }
  if (expected) return service.saveDraft(proposal, { expected });
  return service.createDraft(proposal);
};

export const recoverEditorDraft = (editor, pending) => {
  if (
    pending.targetKey !== proposalEditorKey(editor.locator)
    || !owns(pending, 'expected') || !owns(pending, 'basis')
    || !areProposalValuesEqual(pending.expected, editor.expected)
  ) return null;

  const previous = pending.basis ?? {};
  const visible = editor.visible ?? {};
  const changed = Object.keys({ ...previous, ...pending.draft }).filter(field => (
    field !== 'userId' && !areProposalValuesEqual(previous[field], pending.draft[field])
  ));
  if (changed.some(field => !areProposalValuesEqual(previous[field], visible[field]))) return null;
  const restored = { ...visible };
  changed.forEach(field => {
    if (owns(pending.draft, field)) restored[field] = pending.draft[field];
    else delete restored[field];
  });
  return restored;
};
