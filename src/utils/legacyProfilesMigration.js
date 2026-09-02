/**
 * Повторна міграція legacy-колекцій `users` і `newUsers` у нові вузли RTDB.
 *
 * Бази тут немає ні на читання, ні на запис: на вхід ідуть локальні JSON-копії
 * колекцій, на вихід — вміст кожного вузла, готовий до імпорту. Причина та
 * сама, що й у першої міграції: `newUsers` у правилах бази вже немає (корінь —
 * `.read: false`), тож прочитати її можна лише вивантаженням із консолі.
 *
 * Розкладку по вузлах робить не власна копія правил, а той самий роутер, яким
 * ходить кожне збереження анкети (`buildProfileNodePatch`), і той самий писач
 * картки (`buildMatchingCardProjection`). Це не економія коду, а вимога: перша
 * діра в даних виникла рівно там, де міграція і runtime розійшлись у тому, що
 * вважати значенням поля.
 *
 * Форма значень не змінюється. Поле, яке лежало масивом, лягає масивом:
 * анкета тримає кілька імен, кілька телефонів, кілька дат пологів, і звести їх
 * до одного означало б повторити ту саму втрату, від якої ця міграція й лікує.
 */

import { buildProfileNodePatch } from './profileNodeWriter';
import { buildMatchingCardProjection, MATCHING_CARDS_ROOT } from './matchingCardIndex';
import { NEVER_MIGRATED_FIELDS, PROFILE_NODES, resolveFieldOwnerNode } from './profileNodeSchema';
import { listScalarConflicts, mergeUserCollectionData } from './mergeUserCollections';

/** Вузли, які наповнює міграція. Картка йде першою — її пише проєкція. */
export const MIGRATION_NODES = Object.freeze([
  MATCHING_CARDS_ROOT,
  PROFILE_NODES.profileDetails,
  PROFILE_NODES.profileContacts,
  PROFILE_NODES.profileWorkflow,
  PROFILE_NODES.profileTechnical,
]);

const NEVER_MIGRATED = new Set(NEVER_MIGRATED_FIELDS);

const asMap = value => (value && typeof value === 'object' ? value : {});

const hasContent = value => Boolean(value) && Object.keys(value).length > 0;

/**
 * Зводить обидві legacy-колекції в один набір анкет.
 *
 * Анкета, яка є в обох, зливається по полях: списки обʼєднуються, скаляр
 * лишається скаляром. Про кожне поле, де скаляри розійшлись, звіт каже окремо —
 * саме там міграція мусить щось лишити позаду, і мовчати про це не можна.
 */
export const mergeLegacyCollections = ({ users, newUsers } = {}, options = {}) => {
  const primary = asMap(users);
  const secondary = asMap(newUsers);
  const ids = [...new Set([...Object.keys(primary), ...Object.keys(secondary)])].filter(Boolean);

  const profiles = {};
  const conflicts = {};
  const stats = { total: 0, usersOnly: 0, newUsersOnly: 0, both: 0, conflicted: 0 };

  ids.forEach(id => {
    const left = primary[id];
    const right = secondary[id];
    const hasLeft = left && typeof left === 'object';
    const hasRight = right && typeof right === 'object';
    if (!hasLeft && !hasRight) return;

    stats.total += 1;
    if (hasLeft && hasRight) stats.both += 1;
    else if (hasLeft) stats.usersOnly += 1;
    else stats.newUsersOnly += 1;

    if (hasLeft && hasRight) {
      const fields = listScalarConflicts(left, right);
      if (fields.length) {
        conflicts[id] = fields;
        stats.conflicted += 1;
      }
    }

    profiles[id] = {
      ...mergeUserCollectionData(hasLeft ? left : {}, hasRight ? right : {}, options),
      userId: id,
    };
  });

  return { profiles, conflicts, stats };
};

/**
 * Вміст вузлів для однієї анкети.
 *
 * `existingCard` передається писачу картки навмисно: без нього анкета з
 * `publish: false` виглядає як «сховали», хоча її могли ніколи й не
 * публікувати. Різниця видима в пошуку, тож повторна міграція не має права її
 * вигадувати — вона бере попередній стан із уже наявного вузла карток.
 */
const buildNodesForProfile = (id, profile, { existingCard, knowsExistingCards } = {}) => {
  const nodes = {};

  // `undefined` і `null` тут різні відповіді. Вузол карток дали — значить про
  // кожну анкету відомо, була в неї картка чи ні (`null` — не було). Не дали —
  // відомо нічого, і писач бере `publish` як є, так само як офлайн-збірка.
  const cardState = knowsExistingCards ? { existingCard: existingCard || null } : {};
  const projection = buildMatchingCardProjection(id, profile, cardState);
  if (hasContent(projection)) nodes[MATCHING_CARDS_ROOT] = projection;

  // Роутер віддає шляхи від кореня (`profileDetails/{id}/{поле}`) — для файлу
  // імпорту вони згортаються назад у вміст вузла.
  const patch = buildProfileNodePatch(id, profile);
  Object.entries(patch).forEach(([path, value]) => {
    const [node, , ...rest] = path.split('/');
    if (!node || !rest.length) return;
    (nodes[node] = nodes[node] || {})[rest.join('/')] = value;
  });

  return nodes;
};

/**
 * Поля, які не поїхали нікуди.
 *
 * `resolveFieldOwnerNode` віддає `null` там, де нового місця в поля немає, а
 * `NEVER_MIGRATED_FIELDS` — це ті, кому його свідомо не дали. Різниця між ними
 * і є питанням до людини: перше може виявитись полем, яке забули розкласти.
 */
const listUnmappedFields = profile => Object.keys(profile || {})
  .filter(field => field !== 'userId'
    && !field.startsWith('__')
    && !NEVER_MIGRATED.has(field)
    && resolveFieldOwnerNode(field) === null);

/**
 * Збирає вміст усіх вузлів із двох legacy-колекцій.
 *
 * @param {object} sources `{ users, newUsers, matchingCards }` — останній
 *   необовʼязковий: це вже наявний вузол карток, з якого береться попередній
 *   стан публікації.
 * @param {object} [options] `mergeConflictingScalars` — див. `mergeUserFieldValue`.
 * @returns {{payload: object, stats: object, conflicts: object, unmapped: object}}
 *   `payload` — `{ вузол: { id: дані } }`, придатний для прямого імпорту.
 */
export const buildProfileNodesPayloadFromCollections = (sources = {}, options = {}) => {
  const { profiles, conflicts, stats: mergeStats } = mergeLegacyCollections(sources, options);
  const existingCards = asMap(sources.matchingCards);
  const knowsExistingCards = Boolean(sources.matchingCards);

  const payload = {};
  const unmappedByField = {};
  const stats = {
    ...mergeStats,
    written: 0,
    skipped: 0,
    byNode: Object.fromEntries(MIGRATION_NODES.map(node => [node, 0])),
  };

  Object.entries(profiles).forEach(([id, profile]) => {
    const nodes = buildNodesForProfile(id, profile, {
      existingCard: existingCards[id],
      knowsExistingCards,
    });
    const filled = Object.keys(nodes);
    if (!filled.length) {
      stats.skipped += 1;
      return;
    }

    stats.written += 1;
    filled.forEach(node => {
      (payload[node] = payload[node] || {})[id] = nodes[node];
      stats.byNode[node] = (stats.byNode[node] || 0) + 1;
    });

    listUnmappedFields(profile).forEach(field => {
      unmappedByField[field] = (unmappedByField[field] || 0) + 1;
    });
  });

  return { payload, stats, conflicts, unmapped: unmappedByField };
};
