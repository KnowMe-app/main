'use strict';

const {
  PROFILE_PROPOSAL_ARCHIVE,
  LEGACY_PROFILE_PROPOSAL_PATHS: legacy,
  UNIFIED_PROFILE_PROPOSAL_PATHS: unified,
} = require('./profileProposalStorage');

const entries = value => (value && typeof value === 'object' ? Object.entries(value) : []);

const parseRecord = value => {
  if (typeof value !== 'string') return null;
  try { return JSON.parse(value); } catch { return null; }
};

const archivedAddress = record => {
  if (typeof record?.sourcePath !== 'string') return [];
  const [multiData, collection, parent, child] = record.sourcePath.split('/');
  return multiData === 'multiData' ? [collection, parent, child] : [];
};

const isHistoryActor = (record, uid) => (
  record?.editorUserId === uid || record?.actorUid === uid || record?.createdBy === uid
);

// Архів підтверджує колізію, але право видалити саму картку доводять
// лише наявні голови пропозицій разом із перевіркою профілю й Auth.
const archivedDraftOwners = archive => {
  const owners = new Map();
  for (const [, record] of [...entries(archive?.records), ...entries(archive?.unmapped)]) {
    const [collection, author, card] = archivedAddress(record);
    if (collection !== 'profileMutations' || !author || !card) continue;
    if (!owners.has(card)) owners.set(card, new Set());
    owners.get(card).add(author);
  }
  return owners;
};

const buildRelatedCardUpdates = (root, path, cardIds, matches) => {
  const updates = {};
  for (const [cardId, children] of entries(root)) {
    if (cardIds.has(cardId)) {
      updates[`${path}/${cardId}`] = null;
    } else {
      for (const [child, record] of entries(children)) {
        if (matches(child, record)) updates[`${path}/${cardId}/${child}`] = null;
      }
    }
  }
  return updates;
};

const buildRelatedAuthorUpdates = (root, path, uid, cardIds) => {
  const updates = {};
  for (const [author, cards] of entries(root)) {
    if (author === uid) {
      updates[`${path}/${author}`] = null;
    } else {
      for (const [cardId] of entries(cards)) {
        if (cardIds.has(cardId)) updates[`${path}/${author}/${cardId}`] = null;
      }
    }
  }
  return updates;
};

const buildIdentityClaimUpdates = (root, path, cardIds) => Object.fromEntries(
  entries(root).filter(([, cardId]) => cardIds.has(cardId)).map(([id]) => [`${path}/${id}`, null]),
);

const buildDraftOwnerUpdates = (root, path, uid, cardIds) => Object.fromEntries(
  entries(root).filter(([cardId, owner]) => cardIds.has(cardId) || owner === uid)
    .map(([cardId]) => [`${path}/${cardId}`, null]),
);

const buildHistoryUpdates = (root, path, uid, cardIds) => (
  buildRelatedCardUpdates(root, path, cardIds, (_entryId, record) => isHistoryActor(record, uid))
);

const buildContributorUpdates = (root, path, uid, cardIds) => (
  buildRelatedCardUpdates(root, path, cardIds, contributor => contributor === uid)
);

const buildRelationshipUpdates = (roots, paths, uid, cardIds) => ({
  ...buildRelatedAuthorUpdates(roots.byEditor, paths.byEditor, uid, cardIds),
  ...buildContributorUpdates(roots.contributors, paths.contributors, uid, cardIds),
  ...buildIdentityClaimUpdates(roots.identityClaims, paths.identityClaims, cardIds),
  ...buildDraftOwnerUpdates(roots.owners, paths.owners, uid, cardIds),
});

const buildLiveProposalCleanup = (live, uid, cardIds) => ({
  ...buildRelatedAuthorUpdates(live?.heads?.create, unified.create, uid, cardIds),
  ...buildRelatedCardUpdates(live?.heads?.update, unified.update, cardIds, editor => editor === uid),
  ...buildHistoryUpdates(live?.history?.create, unified.createHistory, uid, cardIds),
  ...buildHistoryUpdates(live?.history?.update, unified.updateHistory, uid, cardIds),
  ...buildRelationshipUpdates({ ...live, byEditor: live?.targetsByEditor }, unified, uid, cardIds),
});

const matchesArchivedProposal = (record, uid, cardIds) => {
  const [collection, parent, child] = archivedAddress(record);
  if (collection === 'profileMutations') return parent === uid || cardIds.has(child);
  if (collection === 'edits') return child === uid || cardIds.has(parent);
  return false;
};

const buildArchiveProposalCleanup = (archive, uid, cardIds) => {
  const updates = {};
  const removedKeys = new Set();
  for (const [id, record] of entries(archive?.records)) {
    if (!matchesArchivedProposal(record, uid, cardIds)) continue;
    removedKeys.add(id);
    updates[`${PROFILE_PROPOSAL_ARCHIVE}/records/${id}`] = null;
  }
  for (const [id, record] of entries(archive?.unmapped)) {
    if (matchesArchivedProposal(record, uid, cardIds)) updates[`${PROFILE_PROPOSAL_ARCHIVE}/unmapped/${id}`] = null;
  }
  for (const [id, record] of entries(archive?.history)) {
    const [, sourceCardId] = archivedAddress(record);
    if (cardIds.has(record?.cardId) || cardIds.has(sourceCardId)
      || removedKeys.has(record?.proposalKey) || isHistoryActor(parseRecord(record?.entryJson), uid)) {
      updates[`${PROFILE_PROPOSAL_ARCHIVE}/history/${id}`] = null;
    }
  }

  const relationshipPaths = Object.fromEntries(Object.entries(legacy).map(([key, path]) => [
    key, `${PROFILE_PROPOSAL_ARCHIVE}/legacyRelationships/${path.split('/').at(-1)}`,
  ]));
  const relationships = archive?.legacyRelationships;
  return {
    ...updates,
    ...buildRelationshipUpdates({
      byEditor: relationships?.editsByEditor,
      contributors: relationships?.editsContributors,
      identityClaims: relationships?.profileIdentityClaims,
      owners: relationships?.profileMutationOwners,
    }, relationshipPaths, uid, cardIds),
  };
};

module.exports = {
  archivedDraftOwners,
  buildArchiveProposalCleanup,
  buildContributorUpdates,
  buildDraftOwnerUpdates,
  buildHistoryUpdates,
  buildLiveProposalCleanup,
  isHistoryActor,
};
