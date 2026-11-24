const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const {
  MIGRATION_NODE,
  planProfileProposalMigration,
  rollbackProfileProposalMigration,
  stageProfileProposalMigration,
  verifyProfileProposalMigration,
} = require('./profileProposalMigration');

const fixturePath = path.join(__dirname, 'fixtures/profileProposalMigration/legacy-export.json');
const cliPath = path.join(__dirname, 'migrateProfileProposals.js');
const readJson = filename => JSON.parse(fs.readFileSync(filename, 'utf8'));
const fixture = () => readJson(fixturePath);
const entries = container => Object.values(container || {});
const recordByPath = (stage, sourcePath) => entries(stage.records).find(record => record.sourcePath === sourcePath);
const proposalOf = record => JSON.parse(record.proposalJson);
const indexedBySourcePath = collection => Object.fromEntries(
  Object.entries(collection).map(([key, record]) => [record.sourcePath, { key, ...record }]),
);
const sourceValue = (snapshot, sourcePath) => sourcePath.split('/').reduce((node, key) => node[key], snapshot);
const cutoverState = { version: 1, state: 'staged', activeWriter: 'legacy' };

const reverseObjectKeys = value => {
  if (Array.isArray(value)) return value.map(reverseObjectKeys);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reverseObjectKeys(item)]));
};

const asExportVal = value => {
  if (!value || typeof value !== 'object') return value;
  const children = Object.entries(value).filter(([, item]) => !Array.isArray(value) || item != null);
  return Object.fromEntries(children.map(([key, item]) => [key, asExportVal(item)]));
};

const checkCutoverState = manifest => {
  Object.entries(cutoverState).forEach(([label, value]) => assert.equal(manifest[label], value));
  for (const member of ['sourceDigest', 'canonicalDigest', 'indexDigest']) {
    assert.match(manifest[member], /^[0-9a-f]{64}$/);
  }
};

test('inventories one deterministic head per supported source and uses safe storage keys', () => {
  const source = fixture();
  const initial = planProfileProposalMigration(source);
  const reordered = planProfileProposalMigration(reverseObjectKeys(source));

  assert.deepEqual(reordered, initial);
  checkCutoverState(initial.stage.manifest);
  assert.equal(initial.report.counts.proposals, 12);
  assert.equal(initial.report.counts.history, 6);
  assert.equal(initial.report.counts.unmapped, 1);
  assert.equal(entries(initial.stage.records).length, 12);
  assert.equal(entries(initial.stage.history).length, 6);
  assert.equal(entries(initial.stage.unmapped).length, 1);
  assert.equal(new Set(entries(initial.stage.records).map(record => record.sourcePath)).size, 12);
  Object.keys(initial.stage.records).forEach(key => {
    assert.ok(Buffer.byteLength(key) <= 768, 'Firebase key length');
    assert.doesNotMatch(key, /[.#$[\]/]/);
  });
  assert.deepEqual(source, fixture(), 'dry-run leaves its input intact');
});

test('retains create identity, status, revision and published/returned visibility', () => {
  const { stage } = planProfileProposalMigration(fixture());
  const pending = recordByPath(stage, 'multiData/profileMutations/author-a/pending-draft');
  const returned = recordByPath(stage, 'multiData/profileMutations/author-a/private-draft');
  const accepted = recordByPath(stage, 'multiData/profileMutations/author-a/published-draft');
  const publishing = recordByPath(stage, 'multiData/profileMutations/author-b/publishing-draft');
  const archived = recordByPath(stage, 'multiData/profileMutations/author-b/archived-draft');

  assert.equal(pending.disposition, 'pending');
  assert.deepEqual(proposalOf(pending), {
    id: 'proposal/create.pending#A',
    operation: 'create',
    createdBy: 'author-a',
    createdAt: 10,
    updatedAt: 20,
    status: 'pendingReview',
    revision: 2,
    reservedCardId: 'pending-draft',
    targetCardId: null,
    data: { userId: 'pending-draft', name: 'Draft Fixture', email: 'draft@example.invalid' },
    identityKeys: ['email_draft_at_example_dot_invalid'],
    acceptedAt: null,
    legacy: { source: 'profileMutations', creatorUid: 'author-a', cardId: 'pending-draft' },
  });
  assert.equal(returned.disposition, 'private');
  assert.equal(proposalOf(returned).status, 'private');
  assert.equal(proposalOf(returned).revision, 3);
  assert.equal(accepted.disposition, 'historical');
  assert.equal(proposalOf(accepted).status, 'accepted');
  assert.equal(proposalOf(accepted).id, 'proposal-published');
  assert.equal(proposalOf(accepted).acceptedAt, 42);
  assert.equal(publishing.disposition, 'hold');
  assert.equal(proposalOf(publishing).status, 'publishing');
  assert.equal(archived.disposition, 'historical');
  assert.equal(proposalOf(archived).status, 'archived');

  const rejectedSource = fixture();
  rejectedSource.multiData.profileMutations['author-a']['private-draft'].status = 'rejected';
  const rejectedStage = planProfileProposalMigration(rejectedSource).stage;
  const rejected = recordByPath(rejectedStage, 'multiData/profileMutations/author-a/private-draft');
  assert.equal(rejected.disposition, 'historical');
  assert.equal(proposalOf(rejected).status, 'rejected');
  assert.deepEqual(proposalOf(rejected).data, proposalOf(returned).data);
});

test('keeps independent contributors, replacements and absent values without replaying settled changes', () => {
  const { stage } = planProfileProposalMigration(fixture());
  const first = recordByPath(stage, 'multiData/edits/canonical/editor-a');
  const second = recordByPath(stage, 'multiData/edits/canonical/editor-b');
  const linked = recordByPath(stage, 'multiData/edits/pending-draft/editor-b');
  const bodyOnly = recordByPath(stage, 'multiData/edits/body-only/editor-a');
  const active = proposalOf(first);
  const legacy = proposalOf(second);

  assert.notEqual(active.id, legacy.id);
  assert.equal(first.targetKind, 'canonical');
  assert.equal(second.targetKind, 'canonical');
  assert.equal(first.disposition, 'pending');
  assert.equal(active.operation, 'update');
  assert.equal(active.targetCardId, 'canonical');
  assert.equal(active.createdBy, 'editor-a');
  assert.equal(active.revision, 4);
  assert.equal(active.baseCardRevision, 16);
  assert.ok(!Object.hasOwn(active, 'data'), 'update holds only proposed changes');
  assert.deepEqual(active.changes, {
    phone: {
      added: ['380500000003', '380500000004'],
      removed: ['380500000001'],
      replacements: [{ from: '380500000001', to: '380500000003' }],
    },
    email: { from: 'baseline@example.invalid', to: '' },
  });
  assert.deepEqual(active.originalValues, {
    phone: { present: true, value: ['380500000001', '380500000099'] },
    email: { present: true, value: 'baseline@example.invalid' },
  });
  assert.equal(legacy.createdBy, 'editor-b');
  assert.equal(legacy.legacy.adminOnly, true);
  assert.deepEqual(legacy.changes.phone.added, ['380500000004', '380500000006']);
  assert.equal(linked.targetKind, 'draft');
  assert.equal(proposalOf(linked).targetCreateProposalId, 'proposal/create.pending#A');
  assert.deepEqual(proposalOf(linked).originalValues.city, { present: false });
  assert.equal(bodyOnly.targetKind, 'canonical');
});

test('preserves actor attribution, backend event IDs and history without active heads', () => {
  const source = fixture();
  const { stage } = planProfileProposalMigration(source);
  const history = indexedBySourcePath(stage.history);
  const records = indexedBySourcePath(stage.records);
  const accepted = history['multiData/editsHistory/canonical/shared-event-id'];
  const renamed = history['multiData/profileMutationHistory/pending-draft/shared-event-id'];
  const settled = history['multiData/editsHistory/canonical/discarded-value'];
  const historyWithoutOverlay = history['multiData/editsHistory/history-only-card/former-editor-entry'];
  const historyWithoutDraft = history['multiData/profileMutationHistory/history-only-draft/archived-event'];

  assert.equal(accepted.eventId, renamed.eventId, 'old IDs survive namespacing');
  assert.notEqual(accepted.key, renamed.key);
  assert.equal(accepted.proposalKey, records['multiData/edits/canonical/editor-a'].key);
  assert.equal(settled.proposalKey, accepted.proposalKey);
  assert.equal(renamed.proposalKey, records['multiData/profileMutations/author-a/pending-draft'].key);
  assert.equal(historyWithoutOverlay.proposalKey ?? null, null);
  assert.equal(historyWithoutDraft.proposalKey ?? null, null);
  Object.values(history).forEach(entry => {
    assert.deepEqual(JSON.parse(entry.entryJson), sourceValue(source, entry.sourcePath));
  });
  assert.equal(records[historyWithoutOverlay.sourcePath], undefined);
  assert.ok(!entries(stage.records).some(record => proposalOf(record).targetCardId === 'history-only-card'));
});

test('reports absent and deleted targets, holds in-flight reviews, and retains unclassifiable data', () => {
  const source = fixture();
  const { stage, report } = planProfileProposalMigration(source);
  const deleted = recordByPath(stage, 'multiData/edits/fully-deleted/editor-a');
  const missing = recordByPath(stage, 'multiData/edits/unidentified-target/editor-a');
  const reviewing = recordByPath(stage, 'multiData/edits/canonical-peer/editor-a');
  const unsupported = entries(stage.unmapped).find(record => record.sourcePath === 'multiData/profileMutations/author-b/canonical');

  assert.equal(deleted.targetKind, 'deleted');
  assert.equal(missing.targetKind, 'missing');
  assert.equal(reviewing.targetKind, 'canonical');
  [deleted, missing, reviewing].forEach(record => assert.equal(record.disposition, 'hold'));
  assert.deepEqual(JSON.parse(unsupported.recordJson), sourceValue(source, unsupported.sourcePath));
  assert.equal(report.counts.staleSearchReferences, 3);
});

test('holds ambiguous reservations and duplicate logical IDs without losing either source', () => {
  const source = fixture();
  const pending = source.multiData.profileMutations['author-a']['pending-draft'];
  source.multiData.profileMutations['author-b']['pending-draft'] = { ...pending, createdBy: 'author-b' };
  const { stage, report } = planProfileProposalMigration(source);
  const first = recordByPath(stage, 'multiData/profileMutations/author-a/pending-draft');
  const second = recordByPath(stage, 'multiData/profileMutations/author-b/pending-draft');
  const contribution = recordByPath(stage, 'multiData/edits/pending-draft/editor-b');

  assert.equal(proposalOf(first).id, proposalOf(second).id);
  assert.equal(proposalOf(first).createdBy, 'author-a');
  assert.equal(proposalOf(second).createdBy, 'author-b');
  assert.equal(first.disposition, 'hold');
  assert.equal(second.disposition, 'hold');
  assert.equal(contribution.disposition, 'hold');
  assert.equal(contribution.targetKind, 'ambiguous');
  assert.equal(report.issues.duplicate_reserved_card, 2);
  assert.equal(report.issues.duplicate_proposal_id, 2);
  assert.equal(report.counts.proposals, 13);
});

test('holds unreadable managed metadata and never links a journal event to a different recorded proposal', () => {
  const source = fixture();
  source.multiData.edits.canonical['editor-a'].proposal.replacements = 'not valid JSON';
  source.multiData.editsHistory.canonical['shared-event-id'].proposalId = 'earlier-proposal-id';
  const snapshot = stageProfileProposalMigration(source);
  const stage = snapshot.multiData[MIGRATION_NODE];
  const active = recordByPath(stage, 'multiData/edits/canonical/editor-a');
  const event = indexedBySourcePath(stage.history)['multiData/editsHistory/canonical/shared-event-id'];

  assert.equal(active.disposition, 'hold');
  assert.ok(active.issues.includes('invalid_update_metadata'));
  assert.equal(snapshot.multiData.edits.canonical['editor-a'].proposal.replacements, 'not valid JSON');
  assert.equal(JSON.parse(event.entryJson).proposalId, 'earlier-proposal-id');
  assert.equal(event.proposalKey ?? null, null);
});

test('keeps every legacy, canonical and index node and makes a repeated staged write a no-op', () => {
  const original = fixture();
  const migration = planProfileProposalMigration(original);
  const staged = stageProfileProposalMigration(original);
  const { [MIGRATION_NODE]: stage, ...unchangedMultiData } = staged.multiData;

  assert.deepEqual(stage, migration.stage);
  assert.deepEqual({ ...staged, multiData: unchangedMultiData }, original);
  for (const name of ['profileMutationOwners', 'profileIdentityClaims', 'editsContributors', 'editsByEditor']) {
    assert.deepEqual(stage.legacyRelationships[name], original.multiData[name]);
  }
  assert.deepEqual(verifyProfileProposalMigration(staged), migration.report);
  assert.deepEqual(stageProfileProposalMigration(staged), staged);
  assert.deepEqual(original, fixture());
  assert.equal(original.multiData[MIGRATION_NODE], undefined);
});

test('accepts RTDB numeric child maps from exportVal while still detecting changes to the stored values', () => {
  const source = fixture();
  source.profileContacts.canonical.phone.splice(1, 0, null);
  const detached = source.multiData.editsHistory['history-only-card']['former-editor-entry'];
  detached.change = { added: ['First archived value', null, 'Third archived value'] };
  const exportedSource = asExportVal(source);
  assert.deepEqual(exportedSource.profileContacts.canonical.phone, {
    0: '380500000001', 2: '380500000099',
  });

  const original = planProfileProposalMigration(source);
  const exported = planProfileProposalMigration(exportedSource);
  assert.deepEqual(exported, original);
  const managed = recordByPath(exported.stage, 'multiData/edits/canonical/editor-a');
  assert.deepEqual(proposalOf(managed).changes.phone.added, ['380500000003', '380500000004']);
  const event = indexedBySourcePath(exported.stage.history)['multiData/editsHistory/history-only-card/former-editor-entry'];
  assert.equal(event.proposalKey ?? null, null);
  assert.deepEqual(asExportVal(JSON.parse(event.entryJson)), asExportVal(detached));

  const stagedFromExport = stageProfileProposalMigration(exportedSource);
  const { [MIGRATION_NODE]: stage, ...multiData } = stagedFromExport.multiData;
  assert.deepEqual({ ...stagedFromExport, multiData }, exportedSource);
  assert.deepEqual(stage, original.stage);

  const transported = asExportVal(stageProfileProposalMigration(source));
  assert.deepEqual(verifyProfileProposalMigration(transported), original.report);
  assert.deepEqual(rollbackProfileProposalMigration(transported, source), source);
  transported.profileContacts.canonical.phone[2] = '380500000008';
  assert.throws(() => verifyProfileProposalMigration(transported), { code: 'STAGED_SNAPSHOT_MISMATCH' });
  assert.throws(() => rollbackProfileProposalMigration(transported, source));
});

test('verifies and reverses staging only against the matching source backup', () => {
  const backup = fixture();
  const staged = stageProfileProposalMigration(backup);
  const changedBackup = fixture();
  changedBackup.profileDetails.canonical.height = 171;

  assert.deepEqual(rollbackProfileProposalMigration(staged, backup), backup);
  assert.throws(() => rollbackProfileProposalMigration(staged, changedBackup));
  assert.throws(() => verifyProfileProposalMigration(backup));

  const unsafeEdits = [
    snapshot => { snapshot.profileContacts.canonical.email = 'mismatch@example.invalid'; },
    snapshot => { snapshot.searchId['380500000003'].phone.reverse(); },
    snapshot => { snapshot.multiData.editsByEditor['editor-a'].canonical += 1; },
    snapshot => { snapshot.multiData[MIGRATION_NODE].manifest.activeWriter = 'unified'; },
    snapshot => {
      const first = entries(snapshot.multiData[MIGRATION_NODE].records)[0];
      first.proposalJson = JSON.stringify({ ...proposalOf(first), revision: 99 });
    },
  ];
  unsafeEdits.forEach(edit => {
    const candidate = structuredClone(staged);
    edit(candidate);
    assert.throws(() => stageProfileProposalMigration(candidate));
    assert.throws(() => verifyProfileProposalMigration(candidate));
    assert.throws(() => rollbackProfileProposalMigration(candidate, backup));
  });
  assert.deepEqual(backup, fixture());
});

const runCli = (...args) => spawnSync(process.execPath, [cliPath, ...args], {
  cwd: path.dirname(__dirname), encoding: 'utf8', timeout: 15000,
});
const successfulCli = (...args) => {
  const result = runCli(...args);
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  return result;
};
const failedCli = (...args) => {
  const result = runCli(...args);
  assert.ok(Number.isInteger(result.status) && result.status !== 0, result.stderr || result.error?.message);
};
const temporaryDirectory = t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'knowme-proposal-migration-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
};

test('CLI dry-run inventories only, verifies and resumes after the durable backup', t => {
  const dir = temporaryDirectory(t);
  const out = path.join(dir, 'bundle');
  const options = ['--snapshot', fixturePath, '--output', out];
  const dryRun = successfulCli('--snapshot', fixturePath);
  const report = JSON.parse(dryRun.stdout);
  assert.equal(report.counts.proposals, 12);
  assert.ok(!fs.existsSync(out), 'dry-run creates no output directory');
  assert.doesNotMatch(dryRun.stdout, /@example\.invalid|author-a|editor-a/);

  const inputBytes = fs.readFileSync(fixturePath);
  successfulCli(...options, '--apply');
  const backupPath = path.join(out, 'backup.json');
  const stagedPath = path.join(out, 'staged.json');
  const backupBytes = fs.readFileSync(backupPath);
  const stagedBytes = fs.readFileSync(stagedPath);
  const backup = JSON.parse(backupBytes);
  const staged = JSON.parse(stagedBytes);
  assert.deepEqual(backupBytes, inputBytes);
  assert.deepEqual(backup, JSON.parse(inputBytes));
  verifyProfileProposalMigration(staged);
  if (process.platform !== 'win32') {
    assert.equal(fs.statSync(backupPath).mode & 0o777, 0o600);
    assert.equal(fs.statSync(stagedPath).mode & 0o777, 0o600);
  }

  // Переривання між записом копії та створенням staged.json.
  fs.unlinkSync(stagedPath);
  successfulCli(...options, '--apply');
  assert.deepEqual(fs.readFileSync(stagedPath), stagedBytes);
  successfulCli(...options, '--apply');
  assert.deepEqual(fs.readFileSync(stagedPath), stagedBytes);
  assert.deepEqual(fs.readFileSync(backupPath), backupBytes);
  successfulCli('--snapshot', stagedPath, '--output', out, '--apply');
  successfulCli('--snapshot', stagedPath, '--verify');
  successfulCli('--snapshot', stagedPath, '--output', out, '--rollback');
  assert.deepEqual(fs.readFileSync(path.join(out, 'rolled-back.json')), backupBytes);
  assert.deepEqual(readJson(path.join(out, 'rolled-back.json')), backup);
  assert.deepEqual(fs.readFileSync(fixturePath), inputBytes);
});

test('CLI refuses to overwrite an existing bundle or roll back changed data', t => {
  const dir = temporaryDirectory(t);
  const out = path.join(dir, 'bundle');
  const options = ['--snapshot', fixturePath, '--output', out, '--apply'];
  successfulCli(...options);
  const backupPath = path.join(out, 'backup.json');
  const stagedPath = path.join(out, 'staged.json');
  const newSourcePath = path.join(dir, 'changed.json');
  const changedSource = fixture();
  changedSource.profileTechnical.canonical.lastLogin = '2026-02-02';
  fs.writeFileSync(newSourcePath, JSON.stringify(changedSource));
  const before = fs.readFileSync(stagedPath);
  const backup = fs.readFileSync(backupPath);

  failedCli('--snapshot', newSourcePath, '--output', out, '--apply');
  assert.deepEqual(fs.readFileSync(stagedPath), before);
  assert.deepEqual(fs.readFileSync(backupPath), backup);

  const tampered = JSON.parse(before);
  tampered.matchingCards.canonical.rev += 1;
  fs.writeFileSync(stagedPath, JSON.stringify(tampered));
  failedCli('--snapshot', stagedPath, '--verify');
  failedCli(...options);
  failedCli('--snapshot', stagedPath, '--output', out, '--rollback');
  assert.ok(!fs.existsSync(path.join(out, 'rolled-back.json')));
  assert.deepEqual(readJson(stagedPath), tampered);
});
