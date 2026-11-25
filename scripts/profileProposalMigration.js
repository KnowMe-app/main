const { createHash } = require('node:crypto');
const path = require('node:path');

// Сухий прогін не створює навіть кеш транспілятора. Тут потрібні лише чисті
// нормалізатори застосунку, без ініціалізації Firebase або мережі.
require('@babel/register')({
  presets: [['@babel/preset-env', { targets: { node: 'current' } }]],
  only: [path.resolve(__dirname, '../src')],
  babelrc: false,
  configFile: false,
  cache: false,
});

const { isPlainObject } = require('../src/utils/profileFieldChanges');
const { INDEXABLE_DRAFT_STATUSES } = require('../src/utils/profileDraftIndexing');
const { PROFILE_NODES } = require('../src/utils/profileNodeSchema');
const { readLegacyCreateProposal, readLegacyUpdateProposal } = require('../src/utils/profileProposalLegacyRecords');
const { readSearchIdEntryMatches } = require('../src/utils/searchKeyUtils');

const MIGRATION_NODE = 'profileProposals';
const RELATIONSHIPS = ['profileMutationOwners', 'profileIdentityClaims', 'editsByEditor', 'editsContributors'];
const LEGACY_NODES = ['profileMutations', 'edits', 'profileMutationHistory', 'editsHistory', ...RELATIONSHIPS];
const TERMINAL_STATUSES = new Set(['accepted', 'archived', 'rejected']);

const migrationError = code => Object.assign(new Error(code), { code });
const owns = (value, key) => Object.prototype.hasOwnProperty.call(value ?? {}, key);
const own = (value, key) => (owns(value, key) ? value[key] : undefined);
const entries = value => (isPlainObject(value) || Array.isArray(value) ? Object.entries(value) : []);
const select = (value, keys) => Object.fromEntries(keys.map(key => [key, own(value, key) ?? null]));

const ordered = value => {
  if (Array.isArray(value)) return value.map(ordered);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key])]));
};

const stableJson = value => JSON.stringify(ordered(value));

// RTDB зберігає списки як дочірні ключі, а SDK `.val()` повертає щільні
// діапазони масивом. `.exportVal()` залишає ключі й додає `.priority`.
// Зіставляємо одне дерево збереження й читаємо дані так само, як адаптери.
const storedValue = value => {
  if (value == null || typeof value !== 'object') return value ?? null;
  const children = entries(value).flatMap(([key, child]) => {
    const stored = storedValue(child);
    return stored === null ? [] : [[key, stored]];
  });
  return children.length ? Object.fromEntries(children) : null;
};

const readSnapshotValue = value => {
  if (value == null || typeof value !== 'object') return value ?? null;
  if (owns(value, '.value')) return readSnapshotValue(value['.value']);
  const children = entries(value).filter(([key, child]) => key !== '.priority' && child != null);
  if (!children.length) return null;
  const lastIndex = 2 * children.length;
  if (children.every(([key]) => /^(0|[1-9]\d*)$/.test(key) && Number(key) < lastIndex)) {
    const list = [];
    children.forEach(([key, item]) => { list[Number(key)] = readSnapshotValue(item); });
    return list;
  }
  return Object.fromEntries(children.map(([key, item]) => [key, readSnapshotValue(item)]));
};

const digest = value => createHash('sha256').update(stableJson(storedValue(value))).digest('hex');

function* leaves(collection, name) {
  const source = `multiData/${name}`;
  if (collection == null) return;
  if (!isPlainObject(collection)) {
    yield { sourcePath: source, record: readSnapshotValue(collection) };
    return;
  }
  for (const [parent, children] of entries(collection)) {
    if (parent === '.priority') continue;
    if (!isPlainObject(children)) {
      yield { sourcePath: `${source}/${parent}`, parent, record: readSnapshotValue(children) };
      continue;
    }
    for (const [child, record] of entries(children)) {
      if (child === '.priority') continue;
      yield { sourcePath: `${source}/${parent}/${child}`, parent, child, record: readSnapshotValue(record) };
    }
  }
}

const parseMetadata = serialized => {
  if (typeof serialized !== 'string') return null;
  try {
    const value = JSON.parse(serialized);
    return isPlainObject(value) ? value : null;
  } catch {
    return null;
  }
};

const validOverlayMetadata = metadata => {
  if (metadata == null) return true;
  if (typeof metadata.id !== 'string' || !metadata.id.trim()
    || !Number.isSafeInteger(metadata.revision) || metadata.revision < 1
    || (metadata.status != null && metadata.status !== 'pendingReview')) return false;
  const originals = parseMetadata(metadata.originalValues);
  const replacements = parseMetadata(metadata.replacements);
  return Boolean(originals && replacements)
    && Object.values(originals).every(value => typeof value?.present === 'boolean')
    && Object.values(replacements).every(pairs => Array.isArray(pairs)
      && pairs.every(pair => owns(pair, 'from') && owns(pair, 'to')));
};

const isValidChange = change => isPlainObject(change) && (
  owns(change, 'to') || Array.isArray(change.added) || Array.isArray(change.removed)
);

const reserveEntry = (map, key, item) => {
  const group = map.get(key) || [];
  group.push(item);
  map.set(key, group);
};

const safeCollection = rows => Object.fromEntries(rows.map(row => [digest(row.sourcePath), row]));

const makeContext = snapshot => {
  if (!isPlainObject(snapshot) || (snapshot.multiData != null && !isPlainObject(snapshot.multiData))) {
    throw migrationError('INVALID_SNAPSHOT');
  }
  const legacy = select(snapshot.multiData, LEGACY_NODES);
  const canonical = select(snapshot, Object.values(PROFILE_NODES));
  const indexes = select(snapshot, ['searchId', 'searchKey']);
  const accountDeletions = snapshot.accountDeletions ?? null;
  const hasCanonical = cardId => Object.values(canonical).some(root => isPlainObject(own(root, cardId)));
  const isDeleted = cardId => Number.isSafeInteger(readSnapshotValue(own(accountDeletions, cardId)?.authDeletedAt));
  const isDeleting = cardId => isPlainObject(own(accountDeletions, cardId));
  return { legacy, canonical, indexes, accountDeletions, hasCanonical, isDeleted, isDeleting };
};

const classifyCreate = (item, ctx) => {
  const { proposal, record } = item;
  const { status, reservedCardId, createdBy } = proposal;
  const owner = readSnapshotValue(own(ctx.legacy.profileMutationOwners, reservedCardId));
  if (owner != null && owner !== createdBy) item.issues.push('draft_owner_mismatch');
  if (record.data?.userId != null && record.data.userId !== reservedCardId) item.issues.push('draft_card_id_mismatch');
  if (TERMINAL_STATUSES.has(status)) {
    if (status === 'accepted' && !ctx.hasCanonical(reservedCardId)) item.issues.push('accepted_without_canonical');
    return 'historical';
  }
  if (ctx.isDeleting(createdBy) || ctx.isDeleting(reservedCardId)) item.issues.push('account_deletion');
  if (ctx.hasCanonical(reservedCardId)) item.issues.push('draft_canonical_collision');
  if (status === 'publishing' || record.publicationAttemptId != null || record.publicationActorUid != null) {
    item.issues.push('publication_in_progress');
  }
  if (!INDEXABLE_DRAFT_STATUSES.has(status)) item.issues.push('unknown_draft_status');
  if (item.issues.length) return 'hold';
  return status === 'private' ? 'private' : 'pending';
};

const classifyTarget = (item, ctx, createsByCard) => {
  const { targetCardId, targetCreateProposalId } = item.proposal;
  if (ctx.isDeleted(targetCardId)) return 'deleted';
  if (ctx.hasCanonical(targetCardId)) return 'canonical';
  const possible = createsByCard.get(targetCardId) || [];
  if (possible.length > 1) return 'ambiguous';
  const [parent] = possible;
  if (!parent || !INDEXABLE_DRAFT_STATUSES.has(parent.proposal.status)) return 'missing';
  if (parent.disposition === 'hold' || (targetCreateProposalId && targetCreateProposalId !== parent.proposal.id)) {
    return 'ambiguous';
  }
  item.proposal = { ...item.proposal, targetCreateProposalId: parent.proposal.id };
  return 'draft';
};

const collectProposals = (ctx, recordIssue) => {
  const records = [];
  const unmapped = [];
  const createsByCard = new Map();
  const overlaysByCardAndAuthor = new Map();
  const proposalsById = new Map();

  const rememberUnmapped = (leaf, reason) => {
    recordIssue(reason);
    unmapped.push({ sourcePath: leaf.sourcePath, reason, recordJson: stableJson(leaf.record) });
  };

  for (const leaf of leaves(ctx.legacy.profileMutations, 'profileMutations')) {
    if (leaf.record?.operation === 'update') {
      rememberUnmapped(leaf, 'legacy_update_without_delta');
      continue;
    }
    const proposal = leaf.child && (leaf.record?.data == null || isPlainObject(leaf.record.data))
      && readLegacyCreateProposal(leaf.record, { creatorUid: leaf.parent, cardId: leaf.child });
    if (!proposal) {
      rememberUnmapped(leaf, 'invalid_create_record');
      continue;
    }
    const item = { ...leaf, proposal, issues: [] };
    item.disposition = classifyCreate(item, ctx);
    reserveEntry(createsByCard, proposal.reservedCardId, item);
    reserveEntry(proposalsById, proposal.id, item);
    records.push(item);
  }

  for (const duplicates of createsByCard.values()) {
    if (duplicates.length < 2) continue;
    duplicates.forEach(item => { item.issues.push('duplicate_reserved_card'); });
  }

  for (const leaf of leaves(ctx.legacy.edits, 'edits')) {
    const proposal = leaf.child && readLegacyUpdateProposal(leaf.record, { cardId: leaf.parent, editorUid: leaf.child });
    if (!proposal) {
      rememberUnmapped(leaf, 'invalid_update_record');
      continue;
    }
    const item = { ...leaf, proposal, issues: [], disposition: 'pending' };
    if (leaf.record.reviewClaim != null) item.issues.push('review_in_progress');
    if (!validOverlayMetadata(leaf.record.proposal)) item.issues.push('invalid_update_metadata');
    if (!Object.values(proposal.changes).length || !Object.values(proposal.changes).every(isValidChange)
      || Object.values(leaf.record.fields).some(change => !isPlainObject(change))) {
      item.issues.push('unsupported_update_changes');
    }
    if (ctx.isDeleting(proposal.createdBy) || ctx.isDeleting(proposal.targetCardId)) item.issues.push('account_deletion');
    overlaysByCardAndAuthor.set(stableJson([proposal.targetCardId, proposal.createdBy]), item);
    reserveEntry(proposalsById, proposal.id, item);
    records.push(item);
  }

  for (const duplicates of proposalsById.values()) {
    if (duplicates.length < 2) continue;
    duplicates.forEach(item => { item.issues.push('duplicate_proposal_id'); });
  }
  for (const item of records) {
    if (item.proposal.operation === 'create' && item.issues.length && item.disposition !== 'historical') {
      item.disposition = 'hold';
    }
  }
  for (const item of overlaysByCardAndAuthor.values()) {
    item.targetKind = classifyTarget(item, ctx, createsByCard);
    if (item.targetKind !== 'canonical' && item.targetKind !== 'draft') item.issues.push(`target_${item.targetKind}`);
    if (item.issues.length) item.disposition = 'hold';
  }
  records.forEach(item => item.issues.forEach(recordIssue));
  return { records, unmapped, createsByCard, overlaysByCardAndAuthor };
};

const collectHistory = (legacy, createsByCard, overlaysByCardAndAuthor) => {
  const history = [];
  for (const name of ['profileMutationHistory', 'editsHistory']) {
    for (const leaf of leaves(legacy[name], name)) {
      const { sourcePath, parent: cardId, child: eventId, record } = leaf;
      let item;
      if (eventId && isPlainObject(record) && (record.cardId ?? record.cardUserId ?? cardId) === cardId) {
        if (name === 'editsHistory') {
          item = overlaysByCardAndAuthor.get(stableJson([cardId, record.editorUserId]));
          if (record.proposalId != null && record.proposalId !== item?.proposal.id) item = null;
        } else {
          const creates = createsByCard.get(cardId);
          if (creates?.length === 1) [item] = creates;
        }
      }
      history.push({
        sourcePath, ...(cardId && { cardId }), ...(eventId && { eventId }), entryJson: stableJson(record),
        ...(item && { proposalKey: digest(item.sourcePath) }),
      });
    }
  }
  return history;
};

const inspectSearchReferences = (ctx, createsByCard) => {
  let searchReferences = 0;
  let staleSearchReferences = 0;
  for (const [, value] of entries(ctx.indexes.searchId)) {
    for (const { id } of readSearchIdEntryMatches(readSnapshotValue(value))) {
      searchReferences += 1;
      const hasDraft = createsByCard.get(id)?.some(({ proposal }) => INDEXABLE_DRAFT_STATUSES.has(proposal.status));
      if (ctx.isDeleted(id) || (!hasDraft && !ctx.hasCanonical(id))) staleSearchReferences += 1;
    }
  }
  return { searchReferences, staleSearchReferences };
};

const planProfileProposalMigration = snapshot => {
  const ctx = makeContext(snapshot);
  const issues = {};
  const recordIssue = code => { issues[code] = (issues[code] || 0) + 1; };
  const { records, unmapped, createsByCard, overlaysByCardAndAuthor } = collectProposals(ctx, recordIssue);
  const history = collectHistory(ctx.legacy, createsByCard, overlaysByCardAndAuthor);
  const legacyRelationships = storedValue(select(ctx.legacy, RELATIONSHIPS));
  const counts = {
    proposals: records.length,
    create: records.length - overlaysByCardAndAuthor.size,
    update: overlaysByCardAndAuthor.size,
    pending: records.filter(item => item.disposition === 'pending').length,
    private: records.filter(item => item.disposition === 'private').length,
    historical: records.filter(item => item.disposition === 'historical').length,
    held: records.filter(item => item.disposition === 'hold').length,
    unmapped: unmapped.length,
    history: history.length,
    detachedHistory: history.filter(item => !item.proposalKey).length,
    ...Object.fromEntries(RELATIONSHIPS.map(name => [name, entries(ctx.legacy[name]).length])),
    ...inspectSearchReferences(ctx, createsByCard),
  };
  const manifest = {
    version: 1, state: 'staged', activeWriter: 'legacy',
    sourceDigest: digest([ctx.legacy, ctx.canonical, ctx.indexes, ctx.accountDeletions]),
    canonicalDigest: digest(ctx.canonical), indexDigest: digest(ctx.indexes), counts,
  };
  const stage = {
    manifest,
    ...(records.length > 0 && { records: safeCollection(records.map(item => ({
      sourcePath: item.sourcePath, disposition: item.disposition, proposalJson: stableJson(item.proposal),
      ...(item.targetKind && { targetKind: item.targetKind }),
      ...(item.issues.length && { issues: [...item.issues].sort() }),
    }))) }),
    ...(history.length > 0 && { history: safeCollection(history) }),
    ...(unmapped.length > 0 && { unmapped: safeCollection(unmapped) }),
    ...(legacyRelationships && { legacyRelationships }),
  };
  return { stage: ordered(stage), report: ordered({ ...manifest, stageDigest: digest(stage), issues }) };
};

const getStage = snapshot => own(snapshot?.multiData, MIGRATION_NODE);

const verifyStage = (existing, stage) => {
  if (digest(existing) !== digest(stage)) throw migrationError('STAGED_SNAPSHOT_MISMATCH');
};

const stageProfileProposalMigration = snapshot => {
  const { stage } = planProfileProposalMigration(snapshot);
  const existing = getStage(snapshot);
  if (existing != null) {
    verifyStage(existing, stage);
    return snapshot;
  }
  return { ...snapshot, multiData: { ...snapshot.multiData, [MIGRATION_NODE]: stage } };
};

const verifyProfileProposalMigration = snapshot => {
  const { stage, report } = planProfileProposalMigration(snapshot);
  const existing = getStage(snapshot);
  if (existing == null) throw migrationError('STAGED_SNAPSHOT_MISSING');
  verifyStage(existing, stage);
  return report;
};

const rollbackProfileProposalMigration = (staged, backup) => {
  if (getStage(backup) != null) throw migrationError('INVALID_BACKUP');
  verifyProfileProposalMigration(staged);
  if (digest(staged) !== digest(stageProfileProposalMigration(backup))) throw migrationError('BACKUP_MISMATCH');
  return backup;
};

module.exports = {
  MIGRATION_NODE,
  profileProposalSnapshotDigest: digest,
  planProfileProposalMigration,
  stageProfileProposalMigration,
  verifyProfileProposalMigration,
  rollbackProfileProposalMigration,
};
