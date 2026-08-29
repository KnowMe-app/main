import fs from 'fs';
import path from 'path';

import { buildMatchingCardsPayloadFromCollections } from '../matchingCardIndex';
import { mergeProfileNodeCollections, describeLocalIndexingSources } from '../profileNodeCollections';

const addNewProfileSource = fs.readFileSync(
  path.join(__dirname, '..', '..', 'components', 'AddNewProfile.jsx'),
  'utf8',
);

/**
 * Індексація має два входи, і так було завжди: з бекенду і з локально
 * завантажених файлів. Другий існує не для зручності — читання всієї бази на
 * 26 тисячах анкет це десятки мегабайтів, а з телефона ще й трафік.
 *
 * Ціна цієї зручності — рівно одна: входи мусять давати **однакові анкети**.
 * Розійшовшись, вони не зламаються голосно: локально зібраний індекс просто
 * почне не знаходити частину анкет, і побачити це можна буде хіба що по дірках
 * у видачі.
 */
describe('локальний вхід індексації читає ті самі анкети, що й бекендовий', () => {
  it('локальні збірки йдуть через ту саму зведену мапу', () => {
    // Три кнопки, одна збірка: індекси searchId/searchKey, картки стрічки і
    // карта ключів. Кожна власна збірка була б окремим приводом розійтись.
    const uses = addNewProfileSource.match(/mergeProfileNodeCollections\(/g) || [];
    expect(uses.length).toBeGreaterThanOrEqual(3);
  });

  it('вузли можна викачати з бекенду, щоб було з чого збирати локально', () => {
    expect(addNewProfileSource).toContain('const handleDownloadProfileNodesForLocalIndex = useCallback');
    expect(addNewProfileSource).toContain('PROFILE_NODE_NAMES.map(async node => {');
  });

  it('локальні кнопки не вимагають legacy-файлів', () => {
    // Після переїзду їх може не бути взагалі — а вузлів вистачає.
    expect(addNewProfileSource).not.toContain('Спочатку оберіть обидва локальні файли');
    const gates = addNewProfileSource.match(/if \(!localIndexSources\.isUsable\)/g) || [];
    expect(gates.length).toBeGreaterThanOrEqual(3);
  });

  it('вузлів самих по собі достатньо, legacy сам по собі — привід попередити', () => {
    const nodesOnly = describeLocalIndexingSources({ matchingCards: { a: { name: 'A' } } });
    expect(nodesOnly.isUsable).toBe(true);
    expect(nodesOnly.isLegacyOnly).toBe(false);

    const legacyOnly = describeLocalIndexingSources({ users: { a: { name: 'A' } } });
    expect(legacyOnly.isUsable).toBe(true);
    expect(legacyOnly.isLegacyOnly).toBe(true);

    expect(describeLocalIndexingSources({}).isUsable).toBe(false);
  });

  it('картки, зібрані локально, збігаються з тим, що збирає бекенд', () => {
    // Той самий набір вузлів, та сама зведена мапа — і, отже, та сама проєкція.
    const nodes = {
      matchingCards: {
        freshPushKey00000000: { name: 'Оля', surnameShort: 'К.', feedDate: '2026-08-26' },
      },
      profileDetails: { freshPushKey00000000: { surname: 'Коваленко', moreInfo_main: 'довгий текст' } },
      profileContacts: { freshPushKey00000000: { phone: '+380671112233' } },
    };

    const { profiles } = mergeProfileNodeCollections(nodes);
    const { payload, stats } = buildMatchingCardsPayloadFromCollections({ profiles });

    expect(stats.written).toBe(1);
    expect(stats.inFeed).toBe(1);
    expect(payload.freshPushKey00000000).toEqual({
      name: 'Оля',
      surnameShort: 'К.',
      feedDate: '2026-08-26',
    });
    // Важке в картку не потрапляє, скільки б його не було в деталях.
    expect(payload.freshPushKey00000000).not.toHaveProperty('moreInfo_main');
    expect(payload.freshPushKey00000000).not.toHaveProperty('phone');
  });

  it('назва мапи більше не вирішує, з якої картка колекції', () => {
    // Мапа сюди приходить уже зведена, тож її ім'я нічого не означає. Раніше
    // воно ставило `__sourceCollection`, і назва мапи вирішувала, звідки
    // нібито прийшла картка.
    const shortId = 'freshPushKey00000000';
    const longId = '3LiD7JGCJTSJoVMU7fdR1ZrcIZH2';
    const { payload } = buildMatchingCardsPayloadFromCollections({
      profiles: {
        [shortId]: { name: 'Оля', publish: true, lastLogin2: '2026-08-26' },
        [longId]: { name: 'Ірина', publish: true, lastLogin2: '2026-08-25' },
      },
    });

    // Обидві в стрічці: право показу дає `publish`, а не формат id.
    expect(payload[shortId].feedDate).toBe('2026-08-26');
    expect(payload[longId].feedDate).toBe('2026-08-25');
  });
});
