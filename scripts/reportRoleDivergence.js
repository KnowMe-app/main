// Звіт і виправлення ролей, які розійшлись між карткою стрічки й Firestore.
//
// Форма входу щоразу вимагала обрати роль і писала її в Firestore `users/{uid}`
// та legacy `users/{uid}`, не чіпаючи картки `matchingCards/{uid}`. «Мій
// профіль» читав роль із Firestore, стрічка — з картки. Скрипт вирівнює
// Firestore (і legacy-дзеркало) за карткою; картки з кількома ролями лише
// називає — котра правдива, вирішує людина в «Моєму профілі». Логіка плану —
// `src/utils/roleDivergence.js`.
//
// Потрібні ті самі REACT_APP_* змінні, що й застосунку, плюс MIGRATION_EMAIL /
// MIGRATION_PASSWORD акаунта з адмінським UID (перелік Firestore `users` і
// запис у чужі документи — лише адмінові).
//
//   node scripts/reportRoleDivergence.js            # суха прогонка, друкує звіт
//   node scripts/reportRoleDivergence.js --apply    # записує роль картки в Firestore і legacy
/* eslint-disable no-console */
require('@babel/register')({
  presets: [['@babel/preset-env', { targets: { node: 'current' } }]],
  extensions: ['.js'],
  ignore: [/node_modules/],
});

const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const { getDatabase, ref, get, update } = require('firebase/database');
const { getFirestore, collection, getDocs, doc, updateDoc } = require('firebase/firestore');

const { buildRoleDivergencePlan } = require('../src/utils/roleDivergence');

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
  const firestore = getFirestore(app);

  if (process.env.MIGRATION_EMAIL && process.env.MIGRATION_PASSWORD) {
    await signInWithEmailAndPassword(getAuth(app), process.env.MIGRATION_EMAIL, process.env.MIGRATION_PASSWORD);
  }

  let usersSnapshot;
  try {
    usersSnapshot = await getDocs(collection(firestore, 'users'));
  } catch (error) {
    console.error(`Firestore users не прочитано (${error.code || error.message}). Потрібен акаунт з адмінським UID.`);
    process.exitCode = 1;
    return;
  }

  const firestoreRoles = {};
  usersSnapshot.forEach(snapshot => {
    const data = snapshot.data() || {};
    firestoreRoles[snapshot.id] = { userRole: data.userRole, role: data.role };
  });

  // Картка читається поштучно: лише для акаунтів Firestore, і лише поле ролі.
  const cards = {};
  const ids = Object.keys(firestoreRoles);
  for (let index = 0; index < ids.length; index += 50) {
    const batch = ids.slice(index, index + 50);
    // eslint-disable-next-line no-await-in-loop
    await Promise.all(batch.map(async id => {
      const snapshot = await get(ref(database, `matchingCards/${id}/role`)).catch(() => null);
      if (snapshot && snapshot.exists()) cards[id] = { role: snapshot.val() };
    }));
  }

  const { mismatched, multiRole, updates } = buildRoleDivergencePlan({ cards, firestoreRoles });

  console.log(`Акаунтів у Firestore: ${ids.length}, з карткою й роллю: ${Object.keys(cards).length}`);
  console.log(`Роль у Firestore розходиться з карткою: ${mismatched.length}`);
  mismatched.forEach(entry => console.log(`  - ${entry.id}: Firestore «${entry.firestoreRole || '—'}» → картка «${entry.cardRole}»`));
  console.log(`Картка з кількома ролями (вирішує людина в «Моєму профілі»): ${multiRole.length}`);
  multiRole.forEach(entry => console.log(`  - ${entry.id}: ${entry.roles.join(', ')}`));

  if (!APPLY) {
    console.log('\nСуха прогонка — нічого не записано. Повторіть із --apply.');
    return;
  }

  const legacyUpdates = {};
  for (const [id, roles] of Object.entries(updates)) {
    // eslint-disable-next-line no-await-in-loop
    await updateDoc(doc(firestore, 'users', id), roles);
    legacyUpdates[`users/${id}/userRole`] = roles.userRole;
    legacyUpdates[`users/${id}/role`] = roles.role;
  }
  if (Object.keys(legacyUpdates).length) await update(ref(database), legacyUpdates);
  console.log(`Вирівняно акаунтів: ${Object.keys(updates).length}.`);
}

if (require.main === module) {
  main().then(() => process.exit(process.exitCode || 0)).catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { main };
