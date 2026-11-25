const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const { stageProfileProposalMigration } = require('./profileProposalMigration');
const { prepareProfileProposalCutover } = require('./prepareProfileProposalCutover');
const { PROFILE_PROPOSAL_LIVE } = require('../src/utils/profileProposalStoragePaths');

const fixturePath = path.join(__dirname, 'fixtures/profileProposalMigration/legacy-export.json');
const cli = path.join(__dirname, 'prepareProfileProposalCutover.js');
const fixture = () => JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const frozen = source => stageProfileProposalMigration({ ...source, profileProposalControl: { activeWriter: 'frozen' } });
const reconciled = () => {
  const source = fixture();
  const draft = source.multiData.profileMutations['author-b']['publishing-draft'];
  draft.status = 'private';
  delete draft.publicationAttemptId;
  delete draft.publicationActorUid;
  delete source.multiData.edits['canonical-peer']['editor-a'].reviewClaim;
  return source;
};

const applyLive = (snapshot, live) => ({
  ...snapshot,
  multiData: { ...snapshot.multiData, profileProposals: { ...snapshot.multiData.profileProposals, live } },
});

const asExportValue = value => {
  if (!value || typeof value !== 'object') return value;
  const children = Object.entries(value).filter(([, item]) => !Array.isArray(value) || item != null);
  return Object.fromEntries(children.map(([key, item]) => [key, asExportValue(item)]));
};

test('requires a frozen server writer and refuses to prepare during account cleanup', () => {
  const snapshot = frozen(reconciled());
  for (const activeWriter of [undefined, 'legacy', 'unified', 'typo']) {
    snapshot.profileProposalControl.activeWriter = activeWriter;
    assert.throws(() => prepareProfileProposalCutover(snapshot), { code: 'CUTOVER_REQUIRES_FROZEN_WRITER' });
  }
  snapshot.profileProposalControl = { activeWriter: 'frozen', cleanupLease: { runId: 'cleanup-1' } };
  assert.throws(() => prepareProfileProposalCutover(snapshot), { code: 'CUTOVER_CLEANUP_IN_PROGRESS' });
});

test('blocks unresolved publication or review without accepting a held override', () => {
  const sources = [fixture(), reconciled()];
  sources[1].multiData.edits['canonical-peer']['editor-a'].reviewClaim = { fieldName: 'name' };
  for (const source of sources) {
    assert.throws(() => prepareProfileProposalCutover(frozen(source), { allowHeld: true }), { code: 'CUTOVER_REVIEW_IN_PROGRESS' });
  }
  const pending = reconciled();
  pending.multiData.profileMutations['author-a']['pending-draft'].publicationActorUid = 'legacy-admin';
  assert.throws(() => prepareProfileProposalCutover(frozen(pending), { allowHeld: true }), { code: 'CUTOVER_REVIEW_IN_PROGRESS' });
});

test('requires an unmodified Stage 7 archive and a current verified source', () => {
  const source = reconciled();
  assert.throws(() => prepareProfileProposalCutover({
    ...source, profileProposalControl: { activeWriter: 'frozen' },
  }), { code: 'STAGED_SNAPSHOT_MISSING' });

  for (const mutate of [
    snapshot => { snapshot.profileDetails.canonical.height = 171; },
    snapshot => { snapshot.searchId['380500000004'].phone = 'canonical-peer'; },
    snapshot => { snapshot.multiData.edits.canonical['editor-a'].fields.email.to = 'wrong@example.invalid'; },
    snapshot => { snapshot.multiData.profileProposals.manifest.state = 'activated'; },
  ]) {
    const snapshot = frozen(reconciled());
    mutate(snapshot);
    assert.throws(() => prepareProfileProposalCutover(snapshot, { allowHeld: true }), { code: 'STAGED_SNAPSHOT_MISMATCH' });
  }
});

test('reports inactive records and copies only eligible heads with raw metadata, ownership, and history', () => {
  const source = reconciled();
  const snapshot = frozen(source);
  const before = structuredClone(snapshot);
  assert.throws(() => prepareProfileProposalCutover(snapshot), error => (
    error.code === 'CUTOVER_HELD_RECORDS' && error.report.counts.held === 2 && error.report.counts.unmapped === 1
  ));
  const { report, patch } = prepareProfileProposalCutover(snapshot, { allowHeld: true });
  assert.deepEqual(Object.keys(patch), [PROFILE_PROPOSAL_LIVE]);
  assert.equal(report.activeWriter, 'frozen');
  assert.equal(report.counts.held, 2);
  assert.equal(report.counts.unmapped, 1);
  assert.deepEqual(snapshot, before, 'source and sealed archive remain unchanged');
  assert.equal(snapshot.profileProposalControl.activeWriter, 'frozen');
  assert.equal(snapshot.multiData.profileProposals.manifest.state, 'staged');

  const live = patch[PROFILE_PROPOSAL_LIVE];
  assert.deepEqual(live.heads.create['author-a'], source.multiData.profileMutations['author-a']);
  assert.deepEqual(live.heads.create['author-b']['archived-draft'], source.multiData.profileMutations['author-b']['archived-draft']);
  assert.equal(live.heads.create['author-b'].canonical, undefined);
  assert.deepEqual(live.heads.update.canonical, source.multiData.edits.canonical);
  assert.deepEqual(live.heads.update['pending-draft'], source.multiData.edits['pending-draft']);
  assert.equal(live.heads.update['fully-deleted'], undefined);
  assert.equal(live.heads.update['unidentified-target'], undefined);
  assert.deepEqual(live.owners, source.multiData.profileMutationOwners);
  assert.deepEqual(live.identityClaims, source.multiData.profileIdentityClaims);
  assert.deepEqual(live.contributors, source.multiData.editsContributors);
  assert.deepEqual(live.targetsByEditor['editor-a'], { canonical: 70, 'body-only': 73, 'canonical-peer': 74 });
  assert.deepEqual(live.history.create['pending-draft']['shared-event-id'], {
    ...source.multiData.profileMutationHistory['pending-draft']['shared-event-id'], operation: 'create',
  });
  assert.deepEqual(live.history.update.canonical['shared-event-id'], {
    ...source.multiData.editsHistory.canonical['shared-event-id'], operation: 'update', cardId: 'canonical',
  });
  assert.equal(live.history.update['history-only-card']['former-editor-entry'].operation, 'update');
});

test('keeps history of held slots and invalid event targets in the archive', () => {
  const source = reconciled();
  const held = {
    cardUserId: 'unidentified-target', editorUserId: 'editor-a', fieldName: 'name', change: { to: 'Held value' },
  };
  source.multiData.editsHistory['unidentified-target'] = { old: held };
  source.multiData.editsHistory.canonical['invalid-link'] = { ...held, editorUserId: 'editor-b' };
  const snapshot = frozen(source);
  const { report, patch } = prepareProfileProposalCutover(snapshot, { allowHeld: true });
  assert.equal(report.counts.archiveOnlyHistory, 2);
  assert.equal(patch[PROFILE_PROPOSAL_LIVE].history.update['unidentified-target'], undefined);
  assert.equal(patch[PROFILE_PROPOSAL_LIVE].history.update.canonical['invalid-link'], undefined);
  assert.equal(Object.values(snapshot.multiData.profileProposals.history).length, 8);
});

test('retains a verified link from managed contributions to a migrated create draft', () => {
  const source = reconciled();
  delete source.multiData.edits['pending-draft']['editor-b'].proposal.targetCreateProposalId;
  const snapshot = frozen(source);
  const { patch } = prepareProfileProposalCutover(snapshot, { allowHeld: true });
  const head = patch[PROFILE_PROPOSAL_LIVE].heads.update['pending-draft']['editor-b'];
  assert.equal(head.proposal.targetCreateProposalId, 'proposal/create.pending#A');
  assert.equal(snapshot.multiData.edits['pending-draft']['editor-b'].proposal.targetCreateProposalId, undefined);
  assert.equal(patch[PROFILE_PROPOSAL_LIVE].heads.update.canonical['editor-b'].proposal, undefined);
});

test('supports RTDB-equivalent retries and refuses unexpected live data', () => {
  const snapshot = frozen(reconciled());
  const prepare = value => prepareProfileProposalCutover(value, { allowHeld: true });
  const initial = prepare(snapshot);
  const ready = applyLive(snapshot, initial.patch[PROFILE_PROPOSAL_LIVE]);
  assert.deepEqual(prepare(ready), initial);
  assert.deepEqual(prepare(asExportValue(ready)).report, initial.report);
  assert.throws(() => prepare(applyLive(snapshot, { heads: initial.patch[PROFILE_PROPOSAL_LIVE].heads })), { code: 'CUTOVER_LIVE_CONFLICT' });
  assert.throws(() => prepare(applyLive(snapshot, { ...initial.patch[PROFILE_PROPOSAL_LIVE], owners: { unknown: 'author' } })), { code: 'CUTOVER_LIVE_CONFLICT' });
});

test('writes a private patch file and prints only report metadata', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'proposal-cutover-'));
  try {
    const snapshot = frozen(reconciled());
    const input = path.join(directory, 'source.json');
    const output = path.join(directory, 'patch.json');
    fs.writeFileSync(input, JSON.stringify(snapshot), { mode: 0o600 });
    const dryRun = spawnSync(process.execPath, [cli, '--snapshot', input], { encoding: 'utf8' });
    assert.equal(dryRun.status, 1);
    assert.match(dryRun.stderr, /CUTOVER_HELD_RECORDS/);
    assert.equal(JSON.parse(dryRun.stdout).counts.held, 2);
    assert.deepEqual(fs.readdirSync(directory), ['source.json']);

    const args = [cli, '--snapshot', input, '--allow-held', '--output', output];
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = spawnSync(process.execPath, args, { encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      assert.doesNotMatch(result.stdout, /draft@example|author-a|pending-draft/);
    }
    assert.equal(fs.statSync(output).mode & 0o777, 0o600);
    assert.deepEqual(JSON.parse(fs.readFileSync(output, 'utf8')), prepareProfileProposalCutover(snapshot, { allowHeld: true }).patch);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
