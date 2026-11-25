const assert = require('node:assert/strict');
const { test } = require('node:test');
const { planControlWrite, checkQuiescent } = require('./activateEmptyProfileProposals');

const release = 'a'.repeat(40);

test('uses the frozen owner and a server timestamp for activation', () => {
  const frozen = planControlWrite({ activeWriter: 'legacy', unrelated: true }, 'freeze', release);
  assert.deepEqual(frozen, { activeWriter: 'frozen', cutoverRelease: release, unrelated: true });
  assert.equal(planControlWrite(frozen, 'freeze', release), null);
  const activated = planControlWrite(frozen, 'activate', release);
  assert.deepEqual(activated, {
    ...frozen,
    activeWriter: 'unified',
    activatedAt: { '.sv': 'timestamp' },
  });
  assert.equal(planControlWrite(activated, 'activate', release), null);
});

test('refuses activity, unexpected data, and a freeze owned by a different release', () => {
  assert.throws(() => planControlWrite({ cleanupLease: { token: 'example' } }, 'freeze', release), /cleanup/);
  assert.throws(() => planControlWrite({ activeWriter: 'frozen' }, 'activate', release), /own the freeze/);
  assert.throws(() => planControlWrite({ activeWriter: 'unified' }, 'freeze', release), /legacy writer/);
  assert.throws(() => checkQuiescent({ multiData: { profileProposals: { live: { heads: true } } } }),
    /Unexpected live proposal data/);
  assert.throws(() => checkQuiescent({ multiData: { edits: { card: { user: { reviewClaim: true } } } } }),
    /still in progress/);
});

test('reports orphaned draft links without including search terms or record IDs', () => {
  const report = checkQuiescent({
    searchId: {
      'not-for-logs': { phone: ['draft-only', 'canonical'] },
    },
    profileDetails: { canonical: true },
    multiData: {
      profileMutations: { user: { 'draft-only': {}, canonical: {} } },
    },
  });
  assert.equal(report.missingLegacyDraftReferences, 1);
  assert.doesNotMatch(JSON.stringify(report), /not-for-logs|draft-only/);
});
