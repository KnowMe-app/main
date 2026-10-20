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
 * Колекція у вебі одна, і складається вона лише з вузлів. Legacy `users`
 * тут колись приймався нижнім шаром для анкет, які ще не переїхали, і джерелом
 * `publish`; з колекцією `users` застосунок більше не працює, а стан публікації
 * приносить картка: `expandMatchingCard` розгортає `feedDate` у `publish`.
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
 * @param {object} sources вузли як `{ id: дані }`; будь-які інші ключі
 *   (зокрема колишній `users`) ігноруються.
 * @returns {{ profiles: object, stats: object }}
 */
export const mergeProfileNodeCollections = (sources = {}) => {
  const nodes = Object.fromEntries(
    PROFILE_NODE_NAMES.map(node => [node, asMap(sources[node])]),
  );

  const ids = new Set(PROFILE_NODE_NAMES.flatMap(node => Object.keys(nodes[node])));

  const profiles = {};
  const stats = { total: 0 };

  ids.forEach(id => {
    if (!id) return;

    const profile = mergeProfileNodes({
      userId: id,
      card: nodes.matchingCards[id] || null,
      details: nodes.profileDetails[id] || null,
      contacts: nodes.profileContacts[id] || null,
      workflow: nodes.profileWorkflow[id] || null,
      technical: nodes.profileTechnical[id] || null,
    });
    if (!profile) return;

    stats.total += 1;
    profiles[id] = profile;
  });

  return { profiles, stats };
};

/**
 * Що з локально завантажених файлів чого варте.
 *
 * Мовчати про порожнечу не можна: людина натисне кнопку, отримає файл, заллє
 * його — і зламає пошук, не побачивши жодної помилки.
 */
export const describeLocalIndexingSources = (sources = {}) => {
  const loadedNodes = PROFILE_NODE_NAMES.filter(node => Object.keys(asMap(sources[node])).length);

  return {
    loadedNodes,
    // Будь-який вузол анкети вартий індексації: контакти живуть у
    // `profileContacts`, і `searchId`, зібраний із самих лише контактів, — це
    // повний індекс контактів, а не «майже порожній результат». Поки тут
    // питались тільки картка й деталі, вибір самого `profileContacts` мовчки
    // вважався «нічого не завантажено», і кнопка не робила нічого.
    isUsable: loadedNodes.length > 0,
  };
};
