// One-time cleanup for multiData/searchQueries: before the dedupe fix in addMatchingSearchQuery
// (src/components/config.js), every executed search pushed a new entry regardless of whether the
// same text was already stored, and Enter followed by the blur it triggers fired the write twice -
// so owners built up many identical rows for the same query. This script removes every duplicate,
// keeping only each owner's most recent entry per unique query text (push keys sort chronologically,
// so the lexicographically-largest key per text group is the one kept).
//
// Needs the same REACT_APP_* Firebase config the app itself uses, plus MIGRATION_EMAIL /
// MIGRATION_PASSWORD for an account matching one of the two admin UIDs hardcoded into
// database.rules.json's multiData/searchQueries rule - that rule change must be pasted into
// Firebase Console (Realtime Database -> Rules) before this script can write across owners.
//
//   node scripts/dedupeSearchQueries.js            # dry run, prints a report
//   node scripts/dedupeSearchQueries.js --apply    # writes the deletions
/* eslint-disable no-console */
require('@babel/register')({
  presets: [['@babel/preset-env', { targets: { node: 'current' } }]],
  extensions: ['.js'],
  ignore: [/node_modules/],
});

const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const { getDatabase, ref, get, update } = require('firebase/database');

const APPLY = process.argv.includes('--apply');
const SEARCH_QUERIES_PATH = 'multiData/searchQueries';

const buildFirebaseApp = () => initializeApp({
  apiKey: process.env.REACT_APP_API_KEY,
  authDomain: process.env.REACT_APP_AUTH_DOMAIN,
  databaseURL: process.env.REACT_APP_DATABASE_URL,
  projectId: process.env.REACT_APP_PROJECT_ID,
  storageBucket: process.env.REACT_APP_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_APP_ID,
});

// Pure planning step - group each owner's entries by text, and for every group with more than one
// entry, keep the chronologically-latest push key (they sort lexicographically) and mark the rest
// for deletion.
const buildDedupePlan = allSearchQueries => {
  const report = [];
  const keysToDelete = [];

  Object.entries(allSearchQueries || {}).forEach(([ownerId, entries]) => {
    const groups = new Map();
    Object.entries(entries || {}).forEach(([queryId, text]) => {
      if (!groups.has(text)) groups.set(text, []);
      groups.get(text).push(queryId);
    });

    groups.forEach((queryIds, text) => {
      if (queryIds.length < 2) return;
      const sortedIds = [...queryIds].sort();
      const keptId = sortedIds[sortedIds.length - 1];
      const removedIds = sortedIds.slice(0, -1);
      removedIds.forEach(queryId => keysToDelete.push(`${SEARCH_QUERIES_PATH}/${ownerId}/${queryId}`));
      report.push({ ownerId, text, keptId, removedIds });
    });
  });

  return { report, keysToDelete };
};

async function main() {
  const app = buildFirebaseApp();
  const database = getDatabase(app);

  if (process.env.MIGRATION_EMAIL && process.env.MIGRATION_PASSWORD) {
    await signInWithEmailAndPassword(getAuth(app), process.env.MIGRATION_EMAIL, process.env.MIGRATION_PASSWORD);
  }

  const snapshot = await get(ref(database, SEARCH_QUERIES_PATH));
  const { report, keysToDelete } = buildDedupePlan(snapshot.val());

  if (!report.length) {
    console.log('No duplicate search queries found - nothing to clean up.');
    return;
  }

  console.log(`Found ${report.length} duplicate group(s), ${keysToDelete.length} entr(y/ies) to remove:`);
  report.forEach(entry => {
    console.log(`  - owner ${entry.ownerId} "${entry.text}": keeping ${entry.keptId}, removing [${entry.removedIds.join(', ')}]`);
  });

  if (!APPLY) {
    console.log('\nDry run - no changes written. Re-run with --apply to write them.');
    return;
  }

  const patch = {};
  keysToDelete.forEach(path => { patch[path] = null; });
  await update(ref(database), patch);
  console.log(`Removed ${keysToDelete.length} duplicate search quer(y/ies).`);
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { buildDedupePlan };
