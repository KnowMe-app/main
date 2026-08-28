// Одноразове перенесення multiData/searchQueries на форму з ключем від тексту.
//
// Стара форма писала кожен виконаний пошук у `push()`, а пошук перезапускався на
// кожній паузі в наборі тексту — тож у базі осідали ланцюги на кшталт
// "Arma" → "Arman" → "Armand" → "Armando", по ряду на кожну паузу, з випадковим
// ключем і без часу у значенні. Скрипт зводить кожного власника до одного ряду
// на запит:
//
//   multiData/searchQueries/{ownerId}/{queryKey} = {
//     query, createdAt, updatedAt, count
//   }
//
// Ланцюг набору схлопується в останній запит (час першого лишається як
// createdAt), а повтори того самого тексту — в один ряд із лічильником. Час для
// старих рядів береться з push-ключа: перші вісім символів — це мілісекунди.
//
// Потрібні ті самі REACT_APP_* змінні, що й застосунку, плюс MIGRATION_EMAIL /
// MIGRATION_PASSWORD для акаунта одного з адмінських UID із database.rules.json
// (лише адмін має право писати в чужу історію) — і оновлені правила мають бути
// вставлені у Firebase Console (Realtime Database → Rules) до запуску.
//
//   node scripts/migrateSearchQueries.js            # суха прогонка, друкує звіт
//   node scripts/migrateSearchQueries.js --apply    # записує зміни
/* eslint-disable no-console */
require('@babel/register')({
  presets: [['@babel/preset-env', { targets: { node: 'current' } }]],
  extensions: ['.js'],
  ignore: [/node_modules/],
});

const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const { getDatabase, ref, get, update } = require('firebase/database');

const {
  SEARCH_QUERIES_ROOT_PATH,
  buildSearchQueryMigrationPlan,
} = require('../src/utils/searchQueryStorage');

const APPLY = process.argv.includes('--apply');

const buildFirebaseApp = () => initializeApp({
  apiKey: process.env.REACT_APP_API_KEY,
  authDomain: process.env.REACT_APP_AUTH_DOMAIN,
  databaseURL: process.env.REACT_APP_DATABASE_URL,
  projectId: process.env.REACT_APP_PROJECT_ID,
  storageBucket: process.env.REACT_APP_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_APP_ID,
});

async function main() {
  const app = buildFirebaseApp();
  const database = getDatabase(app);

  if (process.env.MIGRATION_EMAIL && process.env.MIGRATION_PASSWORD) {
    await signInWithEmailAndPassword(getAuth(app), process.env.MIGRATION_EMAIL, process.env.MIGRATION_PASSWORD);
  }

  const snapshot = await get(ref(database, SEARCH_QUERIES_ROOT_PATH));
  const { updates, report } = buildSearchQueryMigrationPlan(snapshot.val());

  const changed = report.filter(entry => entry.before !== entry.after || entry.removed > 0);
  if (!changed.length) {
    console.log('Історія пошуку вже у новій формі — переносити нічого.');
    return;
  }

  console.log(`Власників до перенесення: ${changed.length}`);
  changed.forEach(entry => {
    console.log(`  - ${entry.ownerId}: ${entry.before} → ${entry.after} рядів`);
  });

  if (!APPLY) {
    console.log('\nСуха прогонка — нічого не записано. Повторіть із --apply.');
    return;
  }

  await update(ref(database), updates);
  console.log(`Записано ${Object.keys(updates).length} шлях(ів).`);
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { main };
