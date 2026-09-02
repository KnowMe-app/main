import fs from 'fs';
import path from 'path';

import { buildMatchingCardProjection, expandMatchingCard } from '../matchingCardIndex';
import { mergeProfileNodes } from '../profileNodeMerge';
import { mergeProfileNodeCollections } from '../profileNodeCollections';

const configSource = fs.readFileSync(
  path.join(__dirname, '..', '..', 'components', 'config.js'),
  'utf8',
);

const sliceFn = (name, until) => {
  const from = configSource.indexOf(name);
  const to = configSource.indexOf(until, from + name.length);
  if (from < 0 || to < 0) throw new Error(`не знайдено межі зрізу: ${name} → ${until}`);
  return configSource.slice(from, to);
};

/**
 * Веб мусить пережити зникнення `/users`.
 *
 * Дзеркалення двостороннє, поки мобільний застосунок живий: він пише в `/users`,
 * і веб кладе туди свої зміни. Але «поки живий» — це не «назавжди». Колекцію
 * можуть перестати підтримувати: закрити права, прибрати вузол. Веб від цього
 * не має ані падати на збереженні, ані втрачати стан публікації — бо єдине, що
 * жило тільки в legacy, це `publish`.
 */
describe('збереження анкети не залежить від legacy-колекції', () => {
  it('updateDataInRealtimeDB пише спершу у вузли, і лише потім дзеркалить у legacy', () => {
    const writer = sliceFn('export const updateDataInRealtimeDB =', '\nexport const ');

    const nodesIndex = writer.indexOf('await fanOutProfileNodes(userId, cleanedUploadedInfo)');
    const legacyIndex = writer.indexOf('await mirrorProfileToLegacyUsers(');

    expect(nodesIndex).toBeGreaterThan(-1);
    expect(legacyIndex).toBeGreaterThan(nodesIndex);
    expect(writer).toContain('if (!nodesWritten && !legacyWritten) throwProfileWriteFailure(userId,');
  });

  it('updateProfileNodesInRTDB не має legacy-тіла, тож пише лише у вузли', () => {
    const writer = sliceFn('export const updateProfileNodesInRTDB =', '\nexport const ');

    expect(writer).toContain('await fanOutProfileNodes(userId, cleanedUploadedInfo)');
    expect(writer).not.toContain('mirrorProfileToLegacyUsers(');
    expect(writer).toContain('if (!nodesWritten) throwProfileWriteFailure(userId,');
  });

  it('дзеркалення в legacy не кидає — воно повертає результат', () => {
    const mirror = sliceFn(
      'const mirrorProfileToLegacyUsers = async',
      'const throwProfileWriteFailure',
    );

    expect(mirror).toContain('return true;');
    expect(mirror).toContain('return false;');
    expect(mirror).toContain("console.warn('[legacy] анкету не вдалося віддзеркалити в стару колекцію'");
  });

  it('розкладка по вузлах теж не кидає, але звітує про успіх', () => {
    const fanOut = sliceFn('const fanOutProfileNodes = async', '\n// ---');
    expect(fanOut).toContain('return results.some(Boolean);');
  });

  it('картка стрічки перебудовується з вузлів, а не з legacy', () => {
    // Інакше після зникнення `/users` кожне збереження знімало б картку:
    // перечитування дало б порожньо, і проєкція зібралась би ні з чого.
    const reader = sliceFn('const readProfileForMatchingCard = async', 'const runMatchingCardRefresh');

    expect(reader).toContain('readProfileFromNodes(id, { includeTechnical: true })');
    expect(reader).not.toContain('`users/${id}`');
  });

  it('щойно збережене перекриває перечитане', () => {
    // `publish` власного вузла не має: у нових вузлах він виражений наявністю
    // `feedDate` у самій картці. Перечитування тому дає *попередній* стан
    // публікації, і без накладання пейлоада зняття публікації не спрацювало б
    // жодного разу.
    const refresh = sliceFn('const runMatchingCardRefresh = async', '// Проєкція стрічки');
    expect(refresh).toContain('{ ...(stored || {}), ...payload }');
  });

  it('попередній стан для звірки індексів читається з вузлів', () => {
    const writer = sliceFn('export const updateProfileNodesInRTDB =', '\nexport const ');
    expect(writer).toContain('await readProfileFromNodes(userId, { includeTechnical: true })');
  });
});

describe('дзеркалення читається і в зворотний бік', () => {
  // Мобільний застосунок пише тільки в `/users`. Якби веб дивився лише у
  // вузли, зміна, зроблена з телефона, не зʼявилась би в ньому ніколи.
  // Дзеркалення лишилось одностороннім: веб пише в legacy заради мобільного
  // застосунку і більше з неї не читає. Читання назад показувало не анкету, а
  // копію — ту саму, у якій ще лежить те, що у вебі вже стерли, — та ще й
  // впиралось у права, яких у звичайного читача на чужий `users/$uid` немає.
  it('анкета читається лише з вузлів', () => {
    const reader = sliceFn('export const fetchUserById =', 'export const removeKeyFromFirebase');
    expect(reader).toContain('await readProfileFromNodes(userId, { includeTechnical: true })');
    expect(reader).not.toContain('withLegacy');
    expect(reader).not.toContain('users/${userId}');
  });

  it('читач вузлів сам у legacy не ходить', () => {
    const loader = sliceFn('export const readProfileFromNodes =', 'export const fetchUsersByIds =');
    expect(loader).not.toContain("readProfileNodePart('users', id)");
    expect(loader).not.toContain('withLegacy');
    // Шар, який викликач уже тримає в руках (файл офлайн-міграції), лишається —
    // але проходить ту саму межу видимості, що й вузли: контакти лежать і в
    // ньому, тож читачеві прихованої анкети він теж не дістається.
    expect(loader).toContain('legacy: legacyFieldsNodesDoNotOwn(scoped.legacy, parts)');
  });

  it('legacy мовчить про те, чим уже володіє вузол', () => {
    // Інакше поле, стерте у вебі, поверталося б із кожним читанням: у вузлі
    // його немає, а в legacy воно ще лежить.
    const filter = sliceFn('const legacyFieldsNodesDoNotOwn =', 'export const readProfileFromNodes');

    expect(filter).toContain('!presentNodes.has(resolveFieldOwnerNode(field))');
    expect(filter).toContain('Object.keys(value).length');
  });
});

describe('стан публікації переживає зникнення legacy', () => {
  const publishedCard = buildMatchingCardProjection('freshPushKey00000000', {
    name: 'Оля',
    publish: true,
    lastLogin2: '2026-08-26',
  });

  it('картка несе стан публікації сама — окремого поля для цього не треба', () => {
    expect(publishedCard.feedDate).toBe('2026-08-26');

    const expanded = expandMatchingCard('freshPushKey00000000', publishedCard);
    expect(expanded.publish).toBe(true);
    expect(expanded.lastLogin2).toBe('2026-08-26');
  });

  it('знята публікація лишає ключ у стані false, і анкета читається як прихована', () => {
    const hiddenCard = buildMatchingCardProjection('freshPushKey00000000', {
      name: 'Оля',
      publish: false,
      lastLogin2: '2026-08-26',
    });

    // `false`, а не відсутність ключа: у стрічку не потрапляє ні те, ні те, але
    // пошук показує ще не опубліковану анкету і мовчить про сховану — тож
    // розрізнити їх картка мусить сама.
    expect(hiddenCard.feedDate).toBe(false);
    expect(expandMatchingCard('freshPushKey00000000', hiddenCard).publish).toBe(false);
  });

  it('анкета, яку ще не публікували, ключа стрічки не має взагалі', () => {
    const neverPublishedCard = buildMatchingCardProjection('freshPushKey00000000', {
      name: 'Оля',
      lastLogin2: '2026-08-26',
    });

    expect(neverPublishedCard).not.toHaveProperty('feedDate');
    expect(expandMatchingCard('freshPushKey00000000', neverPublishedCard).publish).toBeUndefined();
  });

  it('анкета, зібрана лише з вузлів, знає, що вона показана', () => {
    const profile = mergeProfileNodes({
      userId: 'freshPushKey00000000',
      card: publishedCard,
      details: { surname: 'Коваленко' },
      legacy: null,
    });

    expect(profile.publish).toBe(true);
    expect(profile.surname).toBe('Коваленко');
  });

  it('індексація без legacy-шару бере публікацію з картки', () => {
    const { profiles, stats } = mergeProfileNodeCollections({
      matchingCards: { freshPushKey00000000: publishedCard },
      profileDetails: { freshPushKey00000000: { surname: 'Коваленко' } },
    });

    expect(profiles.freshPushKey00000000.publish).toBe(true);
    expect(stats.fromNodes).toBe(1);
    // `withPublish` рахує саме legacy-джерело — його тут немає, і це не збій.
    expect(stats.withPublish).toBe(0);
  });

  it('legacy, коли він є, лишається останнім словом про публікацію', () => {
    // Поки мобільний застосунок живий, `publish` у `/users` — його рішення, і
    // веб його поважає: інакше вимкнена в мобільному анкета лишалась би в
    // стрічці до наступної перебудови картки.
    const { profiles } = mergeProfileNodeCollections({
      matchingCards: { freshPushKey00000000: publishedCard },
      users: { freshPushKey00000000: { publish: false } },
    });

    expect(profiles.freshPushKey00000000.publish).toBe(false);
  });
});
