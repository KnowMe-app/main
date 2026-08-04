// Batch 33 (B4): one-time cleanup for the pre-split data model, where a representative's power of
// attorney (`powerOfAttorney.date`/`apostilleDate`) used to live inside the person record itself.
// That meant "a new POA" meant "a new duplicate person record" (same name/passport, different
// dates) - this script folds every such duplicate back into one person record per human, moving
// whatever POA dates it carried onto the *case* that referenced it (relations.
// representativePowerOfAttorney - see CaseEditor.jsx/documentsCatalogUtils.js), which is where the
// app has stored POA data going forward since this same batch.
//
// Additive-first, per spec: new case-level POA data and re-pointed representativeIds are written
// (and a backup of the untouched representatives collection is saved to disk) *before* any
// duplicate person record is deleted. Run in report-only mode by default; nothing is written to
// the database unless --apply is passed.
//
//   node scripts/migrateRepresentativePowerOfAttorney.js            # dry run, prints a report
//   node scripts/migrateRepresentativePowerOfAttorney.js --apply    # writes the changes above
//
// Needs the same REACT_APP_* Firebase config the app itself uses, plus a signed-in account with
// write access to documentsBuilder/* - set MIGRATION_EMAIL / MIGRATION_PASSWORD in the
// environment for a service/admin account (auth is skipped if neither is set, e.g. for a database
// whose rules don't require it).
/* eslint-disable no-console */
require('@babel/register')({
  presets: [['@babel/preset-env', { targets: { node: 'current' } }]],
  extensions: ['.js'],
  ignore: [/node_modules/],
});

const path = require('path');
const fs = require('fs');
const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const { getDatabase, ref, get, update } = require('firebase/database');
const {
  DOCUMENTS_PARTIES_PATH,
  DOCUMENTS_CASES_PATH,
  normalizeDocumentsCatalog,
  isPlainObject,
  toArray,
  partyDisplayName,
  formatPassportNumber,
} = require('../src/components/documentsCatalogUtils');

const APPLY = process.argv.includes('--apply');
const ROOT = path.join(__dirname, '..');
const BACKUP_DIR = path.join(ROOT, 'scripts', 'migration-backups');

const isFilled = value => !(value === undefined || value === null || String(value).trim() === '');

const normalizeName = record => {
  const nominative = record?.name?.uk?.nominative || record?.name?.en || '';
  return String(nominative).trim().toLowerCase().replace(/\s+/g, ' ');
};

const normalizePassport = record => {
  const number = record?.passport?.number;
  return isFilled(number) ? formatPassportNumber(number).replace(/\s+/g, '').toUpperCase() : '';
};

// A group key needs at least one of name/passport filled in - two records that are both entirely
// blank on both aren't safe to assume are "the same person", so each stays its own singleton group.
const groupKeyFor = record => {
  const name = normalizeName(record);
  const passport = normalizePassport(record);
  if (!name && !passport) return `__singleton__:${record.id}`;
  return `${name}|${passport}`;
};

const REPRESENTATIVE_LEAF_PATHS = [
  'name.uk.nominative', 'name.uk.genitive', 'name.en', 'birthDate',
  'address.uk', 'address.en',
  'passport.number', 'passport.issuedBy.uk', 'passport.issuedBy.en', 'passport.issueDate',
];

const filledFieldCount = record => REPRESENTATIVE_LEAF_PATHS.reduce((count, path) => {
  const value = path.split('.').reduce((accumulator, key) => (isPlainObject(accumulator) ? accumulator[key] : undefined), record);
  return isFilled(value) ? count + 1 : count;
}, 0);

// Legacy POA a duplicate record itself carried (pre-split records only - createEmptyRepresentative
// no longer creates this field, but hand-pasted/older records may still have it).
const legacyPoaOf = record => (isPlainObject(record?.powerOfAttorney) ? record.powerOfAttorney : {});

const buildFirebaseApp = () => initializeApp({
  apiKey: process.env.REACT_APP_API_KEY,
  authDomain: process.env.REACT_APP_AUTH_DOMAIN,
  databaseURL: process.env.REACT_APP_DATABASE_URL,
  projectId: process.env.REACT_APP_PROJECT_ID,
  storageBucket: process.env.REACT_APP_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_APP_ID,
});

// Pure planning step, kept separate from I/O so it can be exercised with fixture data - group
// representatives into duplicate sets, pick a canonical record per group, and work out the
// additive case patch (re-pointed representativeIds + backfilled POA dates) needed before any
// duplicate can be safely deleted.
const buildMigrationPlan = catalog => {
  const groups = new Map();
  catalog.parties.representatives.forEach(record => {
    const key = groupKeyFor(record);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  });

  const duplicateGroups = [...groups.values()].filter(group => group.length > 1);

  // canonicalIdByDuplicateId: every duplicate's id -> the one record kept for that person.
  const canonicalIdByDuplicateId = new Map();
  const duplicateIdsToDelete = new Set();
  const report = [];

  duplicateGroups.forEach(group => {
    const canonical = group.reduce((best, candidate) => (
      filledFieldCount(candidate) > filledFieldCount(best) ? candidate : best
    ), group[0]);
    group.forEach(record => {
      if (record.id === canonical.id) return;
      canonicalIdByDuplicateId.set(String(record.id), String(canonical.id));
      duplicateIdsToDelete.add(String(record.id));
    });
    report.push({
      person: partyDisplayName(canonical) || canonical.id,
      keptId: canonical.id,
      removedIds: group.filter(record => record.id !== canonical.id).map(record => record.id),
    });
  });

  // Additive step 1: re-point every case's representativeIds at the canonical id (deduped), and
  // backfill relations.representativePowerOfAttorney from whichever duplicate the case referenced,
  // only where the case doesn't already carry that date itself (never overwrite real case data,
  // never invent a date that was never entered anywhere).
  const casesPatch = {};
  let casesTouched = 0;
  catalog.cases.forEach(caseRecord => {
    const relations = isPlainObject(caseRecord.relations) ? caseRecord.relations : {};
    const originalIds = toArray(relations.representativeIds).map(String);
    if (!originalIds.length) return;

    const remappedIds = [...new Set(originalIds.map(id => canonicalIdByDuplicateId.get(id) || id))];
    const idsChanged = remappedIds.length !== originalIds.length || remappedIds.some((id, index) => id !== originalIds[index]);

    const existingPoa = isPlainObject(relations.representativePowerOfAttorney) ? relations.representativePowerOfAttorney : {};
    let poaDate = existingPoa.date || '';
    let poaApostilleDate = existingPoa.apostilleDate || '';
    if (!poaDate || !poaApostilleDate) {
      originalIds.forEach(id => {
        if (!duplicateIdsToDelete.has(id)) return;
        const duplicateRecord = catalog.parties.representatives.find(item => String(item.id) === id);
        const legacyPoa = legacyPoaOf(duplicateRecord);
        if (!poaDate && isFilled(legacyPoa.date)) poaDate = legacyPoa.date;
        if (!poaApostilleDate && isFilled(legacyPoa.apostilleDate)) poaApostilleDate = legacyPoa.apostilleDate;
      });
    }
    const poaChanged = poaDate !== (existingPoa.date || '') || poaApostilleDate !== (existingPoa.apostilleDate || '');

    if (!idsChanged && !poaChanged) return;
    casesTouched += 1;
    casesPatch[caseRecord.id] = {
      ...caseRecord,
      relations: {
        ...relations,
        representativeIds: remappedIds,
        representativePowerOfAttorney: { ...existingPoa, date: poaDate, apostilleDate: poaApostilleDate },
      },
    };
  });

  return {
    duplicateGroups, canonicalIdByDuplicateId, duplicateIdsToDelete, report, casesPatch, casesTouched,
  };
};

async function main() {
  const app = buildFirebaseApp();
  const database = getDatabase(app);

  if (process.env.MIGRATION_EMAIL && process.env.MIGRATION_PASSWORD) {
    await signInWithEmailAndPassword(getAuth(app), process.env.MIGRATION_EMAIL, process.env.MIGRATION_PASSWORD);
  }

  const [partiesSnapshot, casesSnapshot] = await Promise.all([
    get(ref(database, DOCUMENTS_PARTIES_PATH)),
    get(ref(database, DOCUMENTS_CASES_PATH)),
  ]);
  const rawParties = partiesSnapshot.val();
  const catalog = normalizeDocumentsCatalog(rawParties, null, casesSnapshot.val());

  const {
    duplicateGroups, duplicateIdsToDelete, report, casesPatch, casesTouched,
  } = buildMigrationPlan(catalog);

  if (!duplicateGroups.length) {
    console.log('No duplicate representative records found - nothing to migrate.');
    return;
  }

  console.log(`Found ${duplicateGroups.length} duplicate representative group(s), ${duplicateIdsToDelete.size} record(s) to remove:`);
  report.forEach(entry => {
    console.log(`  - ${entry.person}: keeping ${entry.keptId}, removing [${entry.removedIds.join(', ')}]`);
  });
  console.log(`${casesTouched} case(s) need their relations updated (representativeIds and/or POA dates).`);

  if (!APPLY) {
    console.log('\nDry run - no changes written. Re-run with --apply to write them.');
    return;
  }

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const backupPath = path.join(BACKUP_DIR, `representatives-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(rawParties?.representatives || {}, null, 2));
  console.log(`Backed up current representatives collection to ${backupPath}`);

  if (Object.keys(casesPatch).length) {
    await update(ref(database, DOCUMENTS_CASES_PATH), casesPatch);
    console.log(`Updated ${Object.keys(casesPatch).length} case(s).`);
  }

  // Only now, after every case has been re-pointed at the canonical record, remove the duplicates.
  const representativesPatch = {};
  duplicateIdsToDelete.forEach(id => { representativesPatch[id] = null; });
  await update(ref(database, `${DOCUMENTS_PARTIES_PATH}/representatives`), representativesPatch);
  console.log(`Removed ${duplicateIdsToDelete.size} duplicate representative record(s).`);
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  groupKeyFor, filledFieldCount, normalizeName, normalizePassport, buildMigrationPlan,
};
