import { isPlainObject } from './profileFieldChanges';
import { normalizeLegacyCreateProposal, normalizeLegacyOverlayProposal } from './profileProposals';

export const readLegacyCreateProposal = (record, location) => {
  const proposal = normalizeLegacyCreateProposal(record, location);
  if (!proposal) return null;
  if (typeof record.proposalId === 'string' && record.proposalId.trim()) proposal.id = record.proposalId;
  if (record.duplicateConflicts?.length) {
    Object.defineProperty(proposal, 'duplicateConflicts', { value: record.duplicateConflicts });
  }
  return proposal;
};

// RTDB прибирає null і порожні контейнери. У вихідних значеннях поля вони
// відрізняються від відсутнього запису, тож тільки метадані зберігаємо як JSON.
const readMetadataMap = serialized => {
  if (typeof serialized !== 'string') return {};
  try {
    const parsed = JSON.parse(serialized);
    return isPlainObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

export const readLegacyUpdateProposal = (record, location) => {
  const normalized = normalizeLegacyOverlayProposal(record, location);
  if (!normalized) return null;

  const { proposal: metadata } = record;
  if (
    !isPlainObject(metadata) || typeof metadata.id !== 'string' || !metadata.id.trim()
    || !Number.isSafeInteger(metadata.revision) || metadata.revision < 1
  ) return normalized;

  const { legacy, ...proposal } = normalized;
  const replacements = readMetadataMap(metadata.replacements);
  return {
    ...proposal,
    id: metadata.id,
    createdAt: metadata.createdAt ?? null,
    revision: metadata.revision,
    baseCardRevision: metadata.baseCardRevision ?? null,
    originalValues: readMetadataMap(metadata.originalValues),
    changes: Object.fromEntries(Object.entries(proposal.changes).map(([field, change]) => [
      field, Array.isArray(replacements[field]) ? { ...change, replacements: replacements[field] } : change,
    ])),
    ...(metadata.targetCreateProposalId && { targetCreateProposalId: metadata.targetCreateProposalId }),
    ...(legacy.adminOnly && { adminOnly: true }),
  };
};
