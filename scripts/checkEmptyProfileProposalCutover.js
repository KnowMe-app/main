const { planProfileProposalMigration } = require('./profileProposalMigration');
const { createRequire } = require('node:module');
const path = require('node:path');
const { PROFILE_NODES } = require('../src/utils/profileNodeSchema');
const { readSearchIdEntryMatches } = require('../src/utils/searchKeyUtils');

const database = 'https://webringitapp-default-rtdb.firebaseio.com';
const canonicalRoots = [...Object.values(PROFILE_NODES), 'users', 'newUsers'];
const terminalStatuses = new Set(['accepted', 'archived', 'rejected']);
const entries = value => value && typeof value === 'object' ? Object.entries(value) : [];
const records = root => entries(root).flatMap(([, branch]) => entries(branch).map(([, record]) => record));

function inspectEmptyCutover(snapshot) {
  const legacy = snapshot.multiData;
  const control = snapshot.profileProposalControl;
  const inventory = planProfileProposalMigration(snapshot).report.counts;
  const pendingPublications = records(legacy.profileMutations).filter(record =>
    record?.status === 'publishing' || (!terminalStatuses.has(record?.status)
      && (record?.publicationAttemptId != null || record?.publicationActorUid != null))).length;
  const pendingReviews = records(legacy.edits).filter(record => record?.reviewClaim != null).length;
  const legacyDraftIds = new Set(entries(legacy.profileMutations).flatMap(([, drafts]) =>
    entries(drafts).map(([id]) => id)));
  const canonicalIds = new Set(canonicalRoots.flatMap(root => Object.keys(snapshot[root] ?? {})));
  const missingLegacyDraftReferences = entries(snapshot.searchId).flatMap(([, value]) =>
    readSearchIdEntryMatches(value)).filter(({ id }) => legacyDraftIds.has(id) && !canonicalIds.has(id)).length;
  return {
    legacyMode: control?.activeWriter == null || control.activeWriter === 'legacy',
    liveEmpty: legacy.profileProposals?.live == null,
    cleanupInProgress: control?.cleanupLease != null,
    pendingPublications,
    pendingReviews,
    missingLegacyDraftReferences,
    legacyCreateCount: inventory.create,
    legacyUpdateCount: inventory.update,
    unclassifiedLegacyCount: inventory.unmapped,
  };
}

async function readCutoverSnapshot(token) {
  const locations = [
    ...canonicalRoots.map(path => [path, true]),
    ['profileProposalControl'],
    ['searchId'],
    ['multiData/profileMutations'],
    ['multiData/edits'],
    ['multiData/profileProposals/live', true],
  ];
  const results = await Promise.all(locations.map(async ([path, shallow]) => {
    const url = new URL(`/${path}.json`, database);
    if (shallow) url.searchParams.set('shallow', 'true');
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      redirect: 'error',
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) throw new Error(`RTDB read failed for ${path} with HTTP ${response.status}`);
    try {
      return [path, await response.json()];
    } catch {
      throw new Error(`Invalid RTDB response for ${path}`);
    }
  }));
  const values = Object.fromEntries(results);
  return {
    ...Object.fromEntries(canonicalRoots.map(root => [root, values[root]])),
    profileProposalControl: values.profileProposalControl,
    searchId: values.searchId,
    multiData: {
      profileMutations: values['multiData/profileMutations'],
      edits: values['multiData/edits'],
      profileProposals: { live: values['multiData/profileProposals/live'] },
    },
  };
}

async function getFirebaseAccessToken() {
  const requireFunctionDependency = createRequire(path.resolve(__dirname, '../functions/package.json'));
  const { GoogleAuth } = requireFunctionDependency('google-auth-library');
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/firebase.database', 'https://www.googleapis.com/auth/userinfo.email'],
  });
  try {
    const token = await auth.getAccessToken();
    if (token) return token;
  } catch (error) {
    const status = Number(error.response?.status ?? error.code);
    if (Number.isInteger(status)) throw new Error(`Firebase authentication failed with HTTP ${status}`);
  }
  throw new Error('Unable to authenticate the Firebase service account');
}

module.exports = { inspectEmptyCutover, readCutoverSnapshot, getFirebaseAccessToken };

if (require.main === module) {
  getFirebaseAccessToken().then(readCutoverSnapshot).then(snapshot => {
    const report = inspectEmptyCutover(snapshot);
    console.log(JSON.stringify(report, null, 2));
    if (!report.legacyMode || !report.liveEmpty || report.cleanupInProgress
      || report.pendingPublications || report.pendingReviews) process.exitCode = 1;
  }).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
