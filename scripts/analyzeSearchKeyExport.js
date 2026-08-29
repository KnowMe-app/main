#!/usr/bin/env node
/**
 * Report what a `searchKey` RTDB export actually costs.
 *
 * Usage: node scripts/analyzeSearchKeyExport.js <searchKey-export.json>
 *
 * Prints, per index and per root (`searchKey/*` vs `searchKey/users/*`):
 *   - payload size a full read of the node would download
 *   - how much of it is the `no` / `?` buckets, which encode "поле не заповнене"
 *     and hold the bulk of every collection
 *   - buckets the app has no name for, and names the app expects but never wrote
 *   - how far the two roots overlap, i.e. how much of the index is stored twice
 *
 * After a rebuild it should report no `no` buckets, no numeric `fields` nodes, and
 * no users-shaped ids under the shared root. Anything else means the reindex did not
 * finish or ran against the wrong root.
 */

const fs = require('fs');
const path = require('path');

const KNOWN_BUCKETS_BY_INDEX = {
  blood: ['1+', '1-', '1', '2+', '2-', '2', '3+', '3-', '3', '4+', '4-', '4', '+', '-', '?', 'no'],
  maritalStatus: ['+', '-', '?', 'no'],
  role: ['ed', 'sm', 'ag', 'ip', 'pp', 'cl', '?', 'no'],
  csection: ['cs2plus', 'cs1', 'cs0', 'other', 'no'],
  imt: ['le28', '29_31', '32_35', '36_plus', '?', 'no'],
  contact: [
    'vk', 'instagram', 'ameblo', 'facebook', 'phone', 'telegram', 'telegram2',
    'tiktok', 'linkedin', 'youtube', 'email', 'twitter', 'line', 'otherLink',
  ],
  userId: ['vk', 'aa', 'ab', 'id', 'long', 'mid', 'other'],
  bmi: ['lt18_5', '18_5_24_9', '25_29_9', '30_plus', 'other'],
  country: ['ua', 'other', 'unknown'],
};

// The bucket each index uses for "nothing on record". A rebuilt index stores none of
// them - absence of the id is the answer.
const EMPTY_BUCKET_BY_INDEX = {
  blood: 'no', maritalStatus: 'no', role: 'no', csection: 'no', imt: 'no',
  age: 'no', height: 'no', weight: 'no', lastAction: 'no', getInTouch: 'no',
  reaction: 'no', bmi: 'other', country: 'unknown',
};

// age/lastAction/getInTouch/reaction store one bucket per day (`d_YYYY-MM-DD`) plus
// the `no`/`?` pair, and fields stores one bucket per filled-field count.
const OPEN_VOCABULARY_INDEXES = new Set(['age', 'lastAction', 'getInTouch', 'reaction', 'fields']);

const BULK_BUCKETS = ['no', '?', 'unknown'];

// A rebuilt index holds none of these: `no` is expressed by absence and `fields`
// stores four range buckets instead of one node per filled-field count.
const FIELD_COUNT_RANGE_BUCKETS = ['le5', 'f6_10', 'f11_20', 'f20_plus'];
const isLegacyFieldCountBucket = bucket => /^\d+$/.test(String(bucket));

const byteSize = value => Buffer.byteLength(JSON.stringify(value));
const formatKb = bytes => `${(bytes / 1024).toFixed(0)} KB`;

const bucketEntries = node => {
  if (!node || typeof node !== 'object') return [];
  // RTDB serves a node whose keys are 0..n as a JSON array (`fields` hits this).
  if (Array.isArray(node)) {
    return node
      .map((value, index) => [String(index), value])
      .filter(([, value]) => value && typeof value === 'object');
  }
  return Object.entries(node).filter(([, value]) => value && typeof value === 'object');
};

const collectIds = node => {
  const ids = new Set();
  bucketEntries(node).forEach(([, usersMap]) => {
    Object.keys(usersMap).forEach(id => ids.add(id));
  });
  return ids;
};

const describeRoot = (rootName, rootNode) => {
  const indexNames = Object.keys(rootNode || {}).filter(name => name !== 'users');
  const rows = [];
  const allIds = new Set();
  let totalBytes = 0;
  let bulkBytes = 0;

  indexNames.forEach(indexName => {
    const node = rootNode[indexName];
    const entries = bucketEntries(node);
    const bytes = byteSize(node);
    const bulk = BULK_BUCKETS.reduce(
      (acc, bucket) => acc + (node && !Array.isArray(node) && node[bucket] ? byteSize(node[bucket]) : 0),
      0,
    );
    const ids = collectIds(node);
    ids.forEach(id => allIds.add(id));

    const known = KNOWN_BUCKETS_BY_INDEX[indexName];
    const bucketNames = entries.map(([bucket]) => bucket);
    const unexpected = known ? bucketNames.filter(bucket => !known.includes(bucket)) : [];
    const unwritten = known ? known.filter(bucket => !bucketNames.includes(bucket)) : [];
    const stale = [];
    const emptyBucket = EMPTY_BUCKET_BY_INDEX[indexName];
    if (emptyBucket && bucketNames.includes(emptyBucket)) {
      stale.push(`\`${emptyBucket}\` bucket (should be absence)`);
    }
    if (indexName === 'fields' && bucketNames.some(isLegacyFieldCountBucket)) {
      stale.push(`legacy per-count nodes (expected ${FIELD_COUNT_RANGE_BUCKETS.join('/')})`);
    }

    totalBytes += bytes;
    bulkBytes += bulk;
    rows.push({
      indexName,
      bytes,
      bulk,
      buckets: entries.length,
      entries: entries.reduce((acc, [, usersMap]) => acc + Object.keys(usersMap).length, 0),
      ids: ids.size,
      unexpected,
      unwritten,
      stale,
      openVocabulary: OPEN_VOCABULARY_INDEXES.has(indexName),
    });
  });

  rows.sort((a, b) => b.bytes - a.bytes);

  console.log(`\n=== ${rootName} ===`);
  console.log(
    `${'index'.padEnd(15)}${'read'.padStart(9)}${'no+?'.padStart(9)}${'buckets'.padStart(9)}${'entries'.padStart(9)}${'profiles'.padStart(10)}`,
  );
  rows.forEach(row => {
    console.log(
      row.indexName.padEnd(15) +
        formatKb(row.bytes).padStart(9) +
        formatKb(row.bulk).padStart(9) +
        String(row.buckets).padStart(9) +
        String(row.entries).padStart(9) +
        String(row.ids).padStart(10),
    );
  });
  console.log(
    `${'TOTAL'.padEnd(15)}${formatKb(totalBytes).padStart(9)}${formatKb(bulkBytes).padStart(9)}` +
      `   (${totalBytes ? Math.round((bulkBytes / totalBytes) * 100) : 0}% of the index is "field not filled")`,
  );
  console.log(`profiles covered: ${allIds.size}`);

  rows.forEach(row => {
    row.stale.forEach(note => {
      console.log(`  ! ${row.indexName}: not rebuilt yet - ${note}`);
    });
  });

  rows.forEach(row => {
    if (row.openVocabulary) return;
    if (row.unexpected.length) {
      console.log(`  ! ${row.indexName}: buckets the app never reads -> ${row.unexpected.join(', ')}`);
    }
    if (row.unwritten.length) {
      console.log(`  · ${row.indexName}: names the app reads but the index has no node for -> ${row.unwritten.join(', ')}`);
    }
  });

  return allIds;
};

const main = () => {
  const [, , exportPath] = process.argv;
  if (!exportPath) {
    console.error('Usage: node scripts/analyzeSearchKeyExport.js <searchKey-export.json>');
    process.exit(1);
  }

  const resolved = path.resolve(exportPath);
  const root = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  // Accept both a `searchKey` subtree export and a whole-database export.
  const searchKey = root.searchKey || root;

  console.log(`searchKey export: ${resolved}`);
  console.log(`full node size:   ${formatKb(byteSize(searchKey))}`);

  const sharedRootIds = describeRoot('searchKey/* (shared root)', searchKey);
  const usersIds = searchKey.users
    ? describeRoot('searchKey/users/* (account profiles)', searchKey.users)
    : new Set();

  if (usersIds.size) {
    const overlap = [...usersIds].filter(id => sharedRootIds.has(id));
    const longIdsInSharedRoot = [...sharedRootIds].filter(id => id.length >= 20);
    console.log('\n=== roots ===');
    console.log(`profiles in searchKey/users:                       ${usersIds.size}`);
    console.log(`of those also indexed under searchKey/*:           ${overlap.length}`);
    console.log(`users-shaped ids (>=20 chars) under searchKey/*:   ${longIdsInSharedRoot.length}`);
    console.log(`users-shaped ids missing from searchKey/users:     ${longIdsInSharedRoot.filter(id => !usersIds.has(id)).length}`);
  }
};

main();
