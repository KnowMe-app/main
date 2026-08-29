import { mergeProfileNodes } from './profileNodeMerge';

/**
 * Зібрати всі анкети з вузлів — незалежно від того, звідки ці вузли взялись.
 *
 * Індексація має два входи, і так було завжди: з бекенду і з локально
 * завантажених файлів. Другий існує не для зручності, а тому що перший — це
 * читання всієї бази: на 26 тисячах анкет це десятки мегабайтів і хвилини
 * очікування, а з телефона ще й трафік. Локальний шлях робить ту саму роботу
 * з уже викачаних файлів, у браузері, не торкаючись бекенду.
 *
 * Обидва входи мусять давати **однакові анкети** — інакше індекс, зібраний
 * локально, розійдеться з індексом, зібраним на бекенді, і побачити це можна
 * буде хіба що по дірках у пошуку. Тому збірка тут одна на двох: різниця між
 * входами закінчується на тому, хто прочитав вузли.
 *
 * Колекція у вебі одна. `users` приймається лише як нижній шар для анкет, які
 * ще не переїхали, і як єдине джерело `publish` — власного вузла в нього
 * немає, ним володіє мобільний застосунок.
 */

/** Вузли, з яких складається анкета. Порядок — той самий, що й у читача. */
export const PROFILE_NODE_NAMES = Object.freeze([
  'matchingCards',
  'profileDetails',
  'profileContacts',
  'profileWorkflow',
  'profileTechnical',
]);

const asMap = value => (value && typeof value === 'object' ? value : {});

/**
 * @param {object} sources вузли як `{ id: дані }` плюс необовʼязковий
 *   `users` — legacy-шар для ще не перенесених анкет.
 * @returns {{ profiles: object, stats: object }}
 */
export const mergeProfileNodeCollections = (sources = {}) => {
  const nodes = Object.fromEntries(
    PROFILE_NODE_NAMES.map(node => [node, asMap(sources[node])]),
  );
  const legacyUsers = asMap(sources.users);

  const ids = new Set([
    ...PROFILE_NODE_NAMES.flatMap(node => Object.keys(nodes[node])),
    ...Object.keys(legacyUsers),
  ]);

  const profiles = {};
  const stats = { total: 0, fromNodes: 0, legacyOnly: 0, withPublish: 0 };

  ids.forEach(id => {
    if (!id) return;
    stats.total += 1;

    const legacy = legacyUsers[id] || null;
    const hasNodeData = PROFILE_NODE_NAMES.some(node => nodes[node][id]);

    const profile = mergeProfileNodes({
      userId: id,
      card: nodes.matchingCards[id] || null,
      details: nodes.profileDetails[id] || null,
      contacts: nodes.profileContacts[id] || null,
      workflow: nodes.profileWorkflow[id] || null,
      technical: nodes.profileTechnical[id] || null,
      legacy,
    });
    if (!profile) return;

    // `publish` живе тільки в legacy — власного вузла в нього немає. Тож коли
    // legacy-шару не дали, стан публікації читається з картки: наявність
    // `feedDate` і є «показувати».
    const publish = legacyUsers[id]?.publish;
    if (publish !== undefined) {
      profile.publish = publish;
      stats.withPublish += 1;
    }

    if (hasNodeData) stats.fromNodes += 1;
    else stats.legacyOnly += 1;

    profiles[id] = profile;
  });

  return { profiles, stats };
};

/**
 * Що з локально завантажених файлів чого варте.
 *
 * Локальна індексація без вузлів — це індексація legacy, тобто того, чого веб
 * уже не показує. Мовчати про це не можна: людина натисне кнопку, отримає
 * файл, заллє його — і зламає пошук, не побачивши жодної помилки.
 */
export const describeLocalIndexingSources = (sources = {}) => {
  const loadedNodes = PROFILE_NODE_NAMES.filter(node => Object.keys(asMap(sources[node])).length);
  const hasLegacy = Boolean(Object.keys(asMap(sources.users)).length);

  return {
    loadedNodes,
    hasLegacy,
    // Картка стрічки й деталі — це те, з чого беруться майже всі індекси.
    // Без них локальна збірка дасть майже порожній результат.
    isUsable: loadedNodes.includes('matchingCards') || loadedNodes.includes('profileDetails') || hasLegacy,
    isLegacyOnly: !loadedNodes.length && hasLegacy,
  };
};
