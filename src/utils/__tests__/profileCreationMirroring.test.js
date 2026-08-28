import fs from 'fs';
import path from 'path';

import { buildProfileNodePatch, listTouchedProfileNodes } from '../profileNodeWriter';
import { buildMatchingCardProjection, resolveMatchingCardCollection } from '../matchingCardIndex';
import { isValidMatchingUserId, isShortMatchingUserId } from '../matchingDataProvider';

const configSource = fs.readFileSync(
  path.join(__dirname, '..', '..', 'components', 'config.js'),
  'utf8',
);

/**
 * Створення анкети — це той самий запис, що й редагування, тільки перший.
 *
 * Легко зробити його «майже таким самим»: покласти анкету в legacy, оновити
 * картку стрічки — і забути розкласти по вузлах. Тоді нова анкета живе
 * нерозділеною доти, доки її вперше не відредагують, а контакт із неї новим
 * шляхом не читається взагалі. Тут перевіряється, що всі три кроки на місці.
 */
describe('створення анкети розкладається так само, як збереження', () => {
  const creation = configSource.slice(
    configSource.indexOf('export const makeNewUser ='),
    configSource.indexOf('export const', configSource.indexOf('export const makeNewUser =') + 10),
  );

  it('пише анкету, розкладає її по вузлах і одразу будує картку', () => {
    expect(creation).toContain('await set(newUserRef, newUser)');
    expect(creation).toContain('await fanOutProfileNodes(newUserId, newUser)');
    expect(creation).toContain('await syncMatchingCardIndex(newUserId, newUser');
  });

  it('розкладка йде після запису в legacy, а не замість нього', () => {
    // Порядок важить: мобільний застосунок читає legacy, і нова анкета має
    // зʼявитись там першою.
    expect(creation.indexOf('await set(newUserRef, newUser)'))
      .toBeLessThan(creation.indexOf('await fanOutProfileNodes'));
  });

  it.each([
    ['updateDataInRealtimeDB', 'users'],
    ['updateDataInNewUsersRTDB', 'newUsers'],
  ])('%s теж розкладає збережене по вузлах', writerName => {
    const writer = configSource.slice(
      configSource.indexOf(`export const ${writerName} =`),
      configSource.indexOf('export const', configSource.indexOf(`export const ${writerName} =`) + 10),
    );
    expect(writer).toContain('await fanOutProfileNodes(userId, cleanedUploadedInfo)');
    expect(writer).toContain('refreshMatchingCardAfterProfileWrite');
  });
});

describe('що саме дістається кожному вузлу при створенні', () => {
  // Те, що `makeNewUser` реально збирає: id, дати створення і контакт або імʼя
  // з пошукового запиту, з якого анкету й заводять.
  const newUser = {
    userId: 'AC00042',
    createdAt: '26.08.2026',
    createdAt2: '2026-08-26',
    phone: ['+380671112233'],
    name: 'Катерина',
    surname: 'Коваленко',
  };

  it('кожне поле нової анкети їде у свій вузол', () => {
    const patch = buildProfileNodePatch(newUser.userId, newUser);

    // Дата створення в новому вузлі одна, і це ISO-копія: `createdAt` рахують
    // локальним часом, `createdAt2` — UTC, тож після 21:00 за Києвом вони
    // розходяться на добу, а решта бази читає саме ISO.
    expect(patch).toEqual({
      'profileContacts/AC00042/phone': ['+380671112233'],
      'profileDetails/AC00042/surname': 'Коваленко',
      'profileTechnical/AC00042/createdAt': '2026-08-26',
    });
    expect(listTouchedProfileNodes(patch))
      .toEqual(['profileContacts', 'profileDetails', 'profileTechnical']);

    // `name` і `userId` роутер не чіпає: імʼя належить картці стрічки, і туди
    // воно потрапляє проєкцією, а не копією поля.
    expect(patch).not.toHaveProperty('matchingCards/AC00042/name');
  });

  it('ISO-копія виграє незалежно від порядку ключів у payload', () => {
    // Порядок властивостей обʼєкта — не рішення, а випадковість того, хто його
    // збирав. Якби перемагав останній записаний ключ, дата створення анкети
    // залежала б саме від цього.
    const straight = buildProfileNodePatch('AC00042', {
      createdAt: '26.08.2026',
      createdAt2: '2026-08-26',
      lastLogin: '26.08.2026',
      lastLogin2: '2026-08-27',
    });
    const reversed = buildProfileNodePatch('AC00042', {
      lastLogin2: '2026-08-27',
      lastLogin: '26.08.2026',
      createdAt2: '2026-08-26',
      createdAt: '26.08.2026',
    });

    expect(straight).toEqual({
      'profileTechnical/AC00042/createdAt': '2026-08-26',
      'profileTechnical/AC00042/lastLogin': '2026-08-27',
    });
    expect(reversed).toEqual(straight);
  });

  it('картка стрічки збирається одразу і несе ініціал, а не прізвище', () => {
    const card = buildMatchingCardProjection(newUser.userId, {
      ...newUser,
      __sourceCollection: 'newUsers',
    });

    expect(card).toEqual({ name: 'Катерина', surnameShort: 'К.' });
    expect(card).not.toHaveProperty('phone');
    expect(card).not.toHaveProperty('surname');
  });

  it('нова анкета потрапляє в стрічку, щойно її опублікували', () => {
    // Це і є «застосунок живе без адміністрування»: анкету створив користувач,
    // її опублікували — вона в стрічці. Раніше ключ стрічки давався лише
    // анкетам з `users`, а `makeNewUser` заводить анкету з push-ключем, тож
    // створена у вебі анкета не показалась би ніколи.
    const card = buildMatchingCardProjection(newUser.userId, {
      ...newUser,
      publish: true,
      lastLogin2: '2026-08-26',
    });
    expect(card.feedDate).toBe('2026-08-26');
  });

  it('без publish нова анкета в стрічку не йде', () => {
    const card = buildMatchingCardProjection(newUser.userId, { ...newUser, lastLogin2: '2026-08-26' });
    expect(card).not.toHaveProperty('feedDate');
  });
});

describe('id, який генерує створення, читається як newUsers', () => {
  // `makeNewUser` бере `push()`, а push-ключ Firebase — це рівно 20 символів.
  const pushKey = '-OA1b2c3d4e5f6g7h8i9';
  const authUid = '3LiD7JGCJTSJoVMU7fdR1ZrcIZH2';

  it('push-ключ має рівно 20 символів, Auth UID — 28', () => {
    expect(pushKey).toHaveLength(20);
    expect(authUid).toHaveLength(28);
  });

  it('межа проходить по «більше за 20», тож push-ключ лишається в newUsers', () => {
    expect(resolveMatchingCardCollection(pushKey)).toBe('newUsers');
    expect(resolveMatchingCardCollection(authUid)).toBe('users');

    expect(isShortMatchingUserId(pushKey)).toBe(true);
    expect(isValidMatchingUserId(pushKey)).toBe(false);
    expect(isValidMatchingUserId(authUid)).toBe(true);
  });

  it('той самий поріг стоїть і в маршрутизації searchKey', () => {
    // Інакше індекс щойно створеної анкети поїхав би в корінь `users`, а
    // читали б його з `newUsers` — рівно так 1300+ id опинились у чужому індексі.
    expect(configSource).toContain(
      "export const isUsersCollectionUserId = userId => String(userId || '').trim().length > 20;",
    );
  });
});
