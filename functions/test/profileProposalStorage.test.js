'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const {
  PROFILE_PROPOSAL_CONTROL,
  PROFILE_PROPOSAL_LIVE,
  LEGACY_PROFILE_PROPOSAL_PATHS,
  UNIFIED_PROFILE_PROPOSAL_PATHS,
  claimProposalCleanup,
  proposalWriter,
  releaseProposalCleanup,
  shouldRecordProposalWrite,
} = require('../profileProposalStorage');

test('клієнт і Functions використовують однакові адреси активних пропозицій та журналу', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../src/utils/profileProposalStoragePaths.js'), 'utf8');
  const exports = vm.runInNewContext(`${source.replace(/^export /gm, '')}\nJSON.stringify({
    PROFILE_PROPOSAL_CONTROL, PROFILE_PROPOSAL_LIVE, LEGACY_PROFILE_PROPOSAL_PATHS, UNIFIED_PROFILE_PROPOSAL_PATHS,
  })`, { process: { env: {} } });
  assert.deepEqual(JSON.parse(exports), {
    PROFILE_PROPOSAL_CONTROL,
    PROFILE_PROPOSAL_LIVE,
    LEGACY_PROFILE_PROPOSAL_PATHS,
    UNIFIED_PROFILE_PROPOSAL_PATHS,
  });
});

test('активність надходить тільки від чинного писача та після імпорту пропозицій', () => {
  const active = { activeWriter: 'unified', activatedAt: 1000 };
  const before = new Date(999).toISOString();
  const boundary = new Date(1000).toISOString();
  const after = new Date(1001).toISOString();

  assert.equal(shouldRecordProposalWrite(null, 'legacy', before), true);
  assert.equal(shouldRecordProposalWrite(null, 'unified', after), false);
  assert.equal(shouldRecordProposalWrite({ activeWriter: 'frozen' }, 'legacy', before), false);
  assert.equal(shouldRecordProposalWrite({ activeWriter: 'frozen' }, 'unified', after), false);
  assert.equal(shouldRecordProposalWrite({ activeWriter: 'unknown' }, 'legacy', after), false);
  assert.equal(shouldRecordProposalWrite(active, 'legacy', after), false);
  assert.equal(shouldRecordProposalWrite(active, 'unified', before), false);
  assert.equal(shouldRecordProposalWrite(active, 'unified', boundary), false);
  assert.equal(shouldRecordProposalWrite(active, 'unified', after), true);
  assert.equal(shouldRecordProposalWrite({ activeWriter: 'unified' }, 'unified', after), false);
});

test('заморожування не приймає нове очищення, а чинне лишає мітку до завершення', () => {
  assert.equal(proposalWriter({}), 'legacy');
  assert.equal(claimProposalCleanup({ activeWriter: 'frozen' }, 'a', 1000), undefined);
  assert.equal(claimProposalCleanup({ activeWriter: 'unsupported' }, 'a', 1000), undefined);
  const active = { activeWriter: 'unified', activatedAt: 123 };
  const claimed = claimProposalCleanup(active, 'a', 1000);
  assert.equal(claimed.activeWriter, active.activeWriter);
  assert.equal(claimed.activatedAt, active.activatedAt);
  assert.equal(claimed.cleanupLease.startedAt, 1000);
  assert.equal(claimProposalCleanup(claimed, 'b', 1100), undefined);
  assert.equal(releaseProposalCleanup(claimed, 'b'), undefined);

  const frozen = { ...claimed, activeWriter: 'frozen' };
  assert.equal(claimProposalCleanup(frozen, 'b', claimed.cleanupLease.expiresAt), undefined);
  assert.deepEqual(releaseProposalCleanup(frozen, 'a'), { ...frozen, cleanupLease: null });
  assert.equal(claimProposalCleanup(claimed, 'b', claimed.cleanupLease.expiresAt).cleanupLease.token, 'b');
});
