/**
 * Правила Storage перевіряються емулятором — так само, як правила бази.
 *
 * Доти `storage.rules` не мав жодної перевірки й викочувався руками з консолі:
 * у файлі навіть лишився слід колишньої одруківки в UID адміна («…y4…» замість
 * «…v4…»), яка мовчки відхиляла завантаження логотипів. З 09.11 правила
 * викочує CI (`deploy-storage-rules.yml`), і цей прогін стоїть перед деплоєм:
 * файл із помилкою Storage відхиляє цілком і лишає в проді попередній набір.
 *
 * Запуск: npm run test:storage-rules
 */

import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import fs from 'node:fs';

const SUPERADMIN = '0ghb1LphfASV0Y3b6J010v4CDyD2';
const SECOND_ADMIN = '3LiD7JGCJTSJoVMU7fdR1ZrcIZH2';
const BUILDER = 'S0VhDLCYjuTFDNLalRa85u7fPcg2';
const INSPECTOR = 'vtDxkDMjCwYuTDqTUnZsO29bpQr1';
const OWNER = 'profileOwnerUid00000000000';
const OUTSIDER = 'outsiderUid000000000000000';
const TOKEN = 'shareTokenAAAAAAAAAAAAAAAAAAAAAA';

const host = process.env.FIREBASE_STORAGE_EMULATOR_HOST || '127.0.0.1:9199';
const [emulatorHost, emulatorPort] = host.split(':');

const results = [];
let failures = 0;
const it = async (name, body) => {
  try {
    await body();
    results.push(`  ok   ${name}`);
  } catch (error) {
    failures += 1;
    results.push(`  FAIL ${name}\n       ${error?.message || error}`);
  }
};
const describe = name => results.push(`\n${name}`);

const testEnv = await initializeTestEnvironment({
  projectId: 'demo-knowme-storage',
  storage: {
    rules: fs.readFileSync('storage.rules', 'utf8'),
    host: emulatorHost,
    port: Number(emulatorPort),
  },
});

const BYTES = new Uint8Array([1, 2, 3]);
const IMAGE = { contentType: 'image/jpeg' };
const storageOf = uid => (uid ? testEnv.authenticatedContext(uid) : testEnv.unauthenticatedContext()).storage();
const put = (uid, path, metadata = IMAGE) => storageOf(uid).ref(path).put(BYTES, metadata);
const read = (uid, path) => storageOf(uid).ref(path).getMetadata();
const del = (uid, path) => storageOf(uid).ref(path).delete();

const seed = (path, metadata = IMAGE) => testEnv.withSecurityRulesDisabled(context =>
  context.storage().ref(path).put(BYTES, metadata));

describe('avatar/{uid} — фото анкети');

await it('власниця й повні адміни пишуть у теку анкети', async () => {
  await assertSucceeds(put(OWNER, `avatar/${OWNER}/a.jpg`));
  await assertSucceeds(put(OWNER, `avatar/${OWNER}/thumbs/a.jpg`));
  await assertSucceeds(put(SUPERADMIN, `avatar/${OWNER}/b.jpg`));
  await assertSucceeds(put(SECOND_ADMIN, `avatar/${OWNER}/c.jpg`));
});

await it('сторонній і інспектор у чужу теку не пишуть', async () => {
  await assertFails(put(OUTSIDER, `avatar/${OWNER}/x.jpg`));
  // Інспектор бачить адмінські екрани, але фото чужих анкет не міняє: роботи
  // «Мініатюри фото» й «Кеш фото на рік» запускає лише повний адмін.
  await assertFails(put(INSPECTOR, `avatar/${OWNER}/x.jpg`));
});

await it('фото читає кожен, хто увійшов, і ніхто без входу', async () => {
  await seed(`avatar/${OWNER}/seed.jpg`);
  await assertSucceeds(read(OUTSIDER, `avatar/${OWNER}/seed.jpg`));
  await assertFails(read(null, `avatar/${OWNER}/seed.jpg`));
  await assertFails(put(null, `avatar/${OWNER}/anon.jpg`));
});

await it('повний адмін перелічує теку avatar цілком (робота «Кеш фото на рік»)', async () => {
  // `backfillAvatarCacheControl` і `backfillFeedPhotoThumbs` стартують з
  // `listAll(ref(storage, 'avatar'))` — переліку тек усіх анкет.
  await seed(`avatar/${OWNER}/list.jpg`);
  await assertSucceeds(storageOf(SUPERADMIN).ref('avatar').listAll());
  await assertSucceeds(storageOf(INSPECTOR).ref('avatar').listAll());
});

await it('звичайний читач перелічує фото однієї анкети, але не теки всіх анкет', async () => {
  // Стрічка добирає знімки картки без аватара лістингом її теки
  // (`getAllUserPhotos`) — це лишається. Перелік кореня — список id усіх
  // анкет із фото, зокрема схованих, — ні.
  await seed(`avatar/${OWNER}/list2.jpg`);
  await assertSucceeds(storageOf(OUTSIDER).ref(`avatar/${OWNER}`).listAll());
  await assertFails(storageOf(OUTSIDER).ref('avatar').listAll());
  await assertFails(storageOf(null).ref(`avatar/${OWNER}`).listAll());
});

describe('profileShares/{token} — копії фото посилання');

await it('створює лише власниця, зі своїм uid у метаданих і картинку до 5 МБ', async () => {
  await assertSucceeds(put(OWNER, `profileShares/${TOKEN}/0.jpg`, { ...IMAGE, customMetadata: { owner: OWNER } }));
  await assertFails(put(OWNER, `profileShares/${TOKEN}/1.jpg`, { ...IMAGE, customMetadata: { owner: OUTSIDER } }));
  await assertFails(put(OWNER, `profileShares/${TOKEN}/2.txt`, { contentType: 'text/plain', customMetadata: { owner: OWNER } }));
  await assertFails(put(OUTSIDER, `profileShares/${TOKEN}/3.jpg`, IMAGE));
});

await it('читає власниця, адмін та інспектор; видаляє власниця й адмін', async () => {
  await seed(`profileShares/${TOKEN}/r.jpg`, { ...IMAGE, customMetadata: { owner: OWNER } });
  await assertSucceeds(read(OWNER, `profileShares/${TOKEN}/r.jpg`));
  await assertSucceeds(read(SUPERADMIN, `profileShares/${TOKEN}/r.jpg`));
  await assertSucceeds(read(INSPECTOR, `profileShares/${TOKEN}/r.jpg`));
  await assertFails(read(OUTSIDER, `profileShares/${TOKEN}/r.jpg`));
  await assertFails(del(INSPECTOR, `profileShares/${TOKEN}/r.jpg`));
  await assertFails(del(OUTSIDER, `profileShares/${TOKEN}/r.jpg`));
  await assertSucceeds(del(OWNER, `profileShares/${TOKEN}/r.jpg`));
});

describe('documentsBuilder — файли конструктора документів');

await it('пишуть адміни конструктора, інспектор лише читає', async () => {
  const logo = 'documentsBuilder/parties/cases/clinics/c1/logo/logo.png';
  await assertSucceeds(put(SUPERADMIN, logo, { contentType: 'image/png' }));
  await assertSucceeds(put(BUILDER, logo, { contentType: 'image/png' }));
  await assertSucceeds(read(INSPECTOR, logo));
  await assertFails(put(INSPECTOR, logo, { contentType: 'image/png' }));
  await assertFails(read(OUTSIDER, logo));
  await assertFails(put(OUTSIDER, logo, { contentType: 'image/png' }));
});

describe('усе, що правила не називають, — закрито');

await it('бекапи й довільні теки не читає й не пише ніхто з клієнтів', async () => {
  // `backups/legacy-nodes/…` пише CI сервісним акаунтом (правил він не питає);
  // з браузера ця тека закрита навіть адмінам.
  await seed('backups/legacy-nodes/x/users.json.gz', { contentType: 'application/gzip' });
  await assertFails(read(SUPERADMIN, 'backups/legacy-nodes/x/users.json.gz'));
  await assertFails(read(INSPECTOR, 'backups/legacy-nodes/x/users.json.gz'));
  await assertFails(put(SUPERADMIN, 'random/file.jpg'));
});

await testEnv.cleanup();

console.log(results.join('\n'));
if (failures) {
  console.log(`\n${failures} FAILED`);
  process.exit(1);
}
console.log(`\nусі перевірки пройдено (${results.filter(line => line.startsWith('  ok')).length} перевірок)`);
