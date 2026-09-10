jest.mock('components/config', () => ({
  addPublicProfileCommentAs: jest.fn(),
  auth: { currentUser: { uid: '0ghb1LphfASV0Y3b6J010v4CDyD2' } },
  deleteCommentByOwner: jest.fn(),
  fetchOwnerCommentsSubtree: jest.fn(),
  fetchPublicProfileComments: jest.fn(),
  readOwnerWriterMap: jest.fn(),
}));

const {
  addPublicProfileCommentAs,
  auth,
  deleteCommentByOwner,
  fetchOwnerCommentsSubtree,
  fetchPublicProfileComments,
  readOwnerWriterMap,
} = require('components/config');

const {
  LEGACY_IMPORT_COMMENT_OWNER_ID,
  copyPublicCommentsBetweenCards,
  isTgLegacyUserId,
  makeLegacyCommentAuthorId,
  migrateLegacyTgCommentsToPublic,
  planLegacyTgCommentMigration,
  resolveMigrationOwnerIds,
} = require('../legacyTgCommentMigration');

const ADMIN = '0ghb1LphfASV0Y3b6J010v4CDyD2';
const IMPORTER = LEGACY_IMPORT_COMMENT_OWNER_ID;

describe('розпізнавання TG-карток', () => {
  it('бере рівно `TG` великими й далі самі цифри', () => {
    expect(isTgLegacyUserId('TG0001')).toBe(true);
    expect(isTgLegacyUserId(' TG12 ')).toBe(true);
    expect(isTgLegacyUserId('tg0001')).toBe(false);
    expect(isTgLegacyUserId('TGA001')).toBe(false);
    expect(isTgLegacyUserId('ID0001')).toBe(false);
    expect(isTgLegacyUserId('')).toBe(false);
  });
});

describe('синтетичний автор', () => {
  it('один автор — один id, і між запусками він той самий', () => {
    expect(makeLegacyCommentAuthorId('Деліверінг дрімз'))
      .toBe(makeLegacyCommentAuthorId('деліверінг дрімз '));
    expect(makeLegacyCommentAuthorId('Деліверінг дрімз'))
      .not.toBe(makeLegacyCommentAuthorId('Інша агенція'));
  });

  // Firebase-Auth UID — 28 символів [A-Za-z0-9]: дефіс у префіксі й робить
  // синтетичний id таким, яким його не може виявитись жоден живий акаунт.
  it('не може збігтися з uid живого акаунта', () => {
    const id = makeLegacyCommentAuthorId('Деліверінг дрімз');
    expect(id.startsWith('legacy-tg-')).toBe(true);
    expect(id).toMatch(/-/);
  });
});

describe('план переносу', () => {
  const plan = params => planLegacyTgCommentMigration({
    privateComments: {},
    writers: {},
    existingPublicComments: {},
    ...params,
  });

  it('бере коментар TG-картки, підписує його автором з writer і зберігає дату', () => {
    const { entries, skipped } = plan({
      privateComments: {
        [IMPORTER]: {
          TG0001: { text: 'Зняли з підготовки до переносу', updatedAt: 1785492679190 },
          ID0007: { text: 'Не TG — не наша справа', updatedAt: 1 },
          TG0002: { text: '   ', updatedAt: 2 },
        },
      },
      writers: { [IMPORTER]: { TG0001: 'Деліверінг дрімз' } },
    });

    expect(entries).toEqual([{
      profileId: 'TG0001',
      text: 'Зняли з підготовки до переносу',
      textKey: 'зняли з підготовки до переносу',
      authorName: 'Деліверінг дрімз',
      authorId: makeLegacyCommentAuthorId('Деліверінг дрімз'),
      createdAt: 1785492679190,
      ownerIds: [IMPORTER],
    }]);
    expect(skipped).toEqual({ notTg: 1, emptyText: 1 });
  });

  // Масив у полі анкети — історія, і поточне значення в ній останнє. Позначку
  // `writer` це правило теж накриває: стерта означає «автора не знаємо».
  it('бере поточну версію writer, а не першу-ліпшу', () => {
    const { entries } = plan({
      privateComments: { [ADMIN]: { TG0001: { text: 'відгук', updatedAt: 5 } } },
      writers: { [ADMIN]: { TG0001: ['Стара агенція', 'Деліверінг дрімз'] } },
    });

    expect(entries[0].authorName).toBe('Деліверінг дрімз');
  });

  it('стерта позначка writer лишає відгук без імені, а не з попереднім', () => {
    const { entries } = plan({
      privateComments: { [ADMIN]: { TG0001: { text: 'відгук', updatedAt: 5 } } },
      writers: { [ADMIN]: { TG0001: ['Деліверінг дрімз', ''] } },
    });

    expect(entries[0].authorName).toBe('');
  });

  it('імʼя автора береться з позначки іншого власника, якщо у свого її немає', () => {
    const { entries } = plan({
      privateComments: { [IMPORTER]: { TG0001: { text: 'відгук', updatedAt: 5 } } },
      writers: { [ADMIN]: { TG0001: 'Деліверінг дрімз' } },
    });

    expect(entries[0].authorName).toBe('Деліверінг дрімз');
    expect(entries[0].authorId).toBe(makeLegacyCommentAuthorId('Деліверінг дрімз'));
  });

  it('той самий текст у двох власників їде однією копією, а прибрати треба обидва оригінали', () => {
    const { entries } = plan({
      privateComments: {
        [ADMIN]: { TG0001: { text: 'Відгук', updatedAt: 5 } },
        [IMPORTER]: { TG0001: { text: 'відгук ', updatedAt: 6 } },
      },
    });

    expect(entries).toHaveLength(1);
    expect(entries[0].ownerIds).toEqual([ADMIN, IMPORTER]);
  });

  // Міграцію запускають з телефона, і половина її може не доїхати. Другий
  // запуск мусить домалювати решту, а не подвоїти вже перенесене.
  it('уже перенесений відгук удруге не пишеться', () => {
    const { entries, duplicates } = plan({
      privateComments: { [ADMIN]: { TG0001: { text: 'Відгук  з таблиці', updatedAt: 5 } } },
      existingPublicComments: { TG0001: [{ text: 'відгук з таблиці' }] },
    });

    expect(entries).toEqual([]);
    expect(duplicates).toHaveLength(1);
  });
});

describe('перенос', () => {
  beforeEach(() => {
    auth.currentUser = { uid: ADMIN };
    addPublicProfileCommentAs.mockReset().mockResolvedValue({ id: 'c1' });
    deleteCommentByOwner.mockReset().mockResolvedValue(true);
    fetchPublicProfileComments.mockReset().mockResolvedValue({});
    readOwnerWriterMap.mockReset().mockResolvedValue({});
    fetchOwnerCommentsSubtree.mockReset().mockResolvedValue({});
  });

  it('пише публічний відгук і аж тоді прибирає приватний оригінал', async () => {
    fetchOwnerCommentsSubtree.mockImplementation(async ownerId => (ownerId === IMPORTER
      ? { TG0001: { text: 'відгук', updatedAt: 7 } }
      : {}));
    readOwnerWriterMap.mockImplementation(async ownerId => (ownerId === IMPORTER
      ? { TG0001: 'Деліверінг дрімз' }
      : {}));

    const stats = await migrateLegacyTgCommentsToPublic();

    expect(addPublicProfileCommentAs).toHaveBeenCalledWith({
      profileId: 'TG0001',
      text: 'відгук',
      authorId: makeLegacyCommentAuthorId('Деліверінг дрімз'),
      authorName: 'Деліверінг дрімз',
      createdAt: 7,
    });
    expect(deleteCommentByOwner).toHaveBeenCalledWith({ ownerId: IMPORTER, cardId: 'TG0001' });
    expect(stats).toMatchObject({ total: 1, written: 1, removed: 1, failed: 0 });
  });

  it('невдалий публічний запис не коштує приватного оригіналу', async () => {
    fetchOwnerCommentsSubtree.mockResolvedValue({ TG0001: { text: 'відгук', updatedAt: 7 } });
    addPublicProfileCommentAs.mockRejectedValue(new Error('PERMISSION_DENIED'));

    const stats = await migrateLegacyTgCommentsToPublic();

    expect(deleteCommentByOwner).not.toHaveBeenCalled();
    expect(stats.written).toBe(0);
    expect(stats.failed).toBeGreaterThan(0);
  });

  it('копія лишає приватну нотатку на місці', async () => {
    fetchOwnerCommentsSubtree.mockResolvedValue({ TG0001: { text: 'відгук', updatedAt: 7 } });

    const stats = await migrateLegacyTgCommentsToPublic({ removePrivate: false });

    expect(addPublicProfileCommentAs).toHaveBeenCalledTimes(1);
    expect(deleteCommentByOwner).not.toHaveBeenCalled();
    expect(stats.removed).toBe(0);
  });

  it('читає лише названих власників, а відмову одного не вважає поломкою', async () => {
    fetchOwnerCommentsSubtree.mockImplementation(async ownerId => {
      if (ownerId === IMPORTER) throw new Error('PERMISSION_DENIED');
      return {};
    });

    const stats = await migrateLegacyTgCommentsToPublic();

    expect(fetchOwnerCommentsSubtree.mock.calls.map(([ownerId]) => ownerId))
      .toEqual(resolveMigrationOwnerIds([], ADMIN));
    expect(stats.unreadableOwnerIds).toEqual([IMPORTER]);
  });

  // Записи від чужого імені — право самих лише адмінів, і питати про нього
  // базу посеред пачки записів пізно.
  it('не адмін міграцію не запускає', async () => {
    auth.currentUser = { uid: 'ordinaryViewerUid000000000' };
    await expect(migrateLegacyTgCommentsToPublic()).rejects.toThrow('лише адмін');
    expect(fetchOwnerCommentsSubtree).not.toHaveBeenCalled();
  });
});

describe('перенос публічних відгуків між дублікатами', () => {
  beforeEach(() => {
    auth.currentUser = { uid: ADMIN };
    addPublicProfileCommentAs.mockReset().mockResolvedValue({ id: 'c1' });
    fetchPublicProfileComments.mockReset();
  });

  it('копіює відгук на другу картку, зберігаючи автора й дату', async () => {
    fetchPublicProfileComments.mockResolvedValue({
      TG0001: [{ text: 'відгук', authorId: 'legacy-tg-1', authorName: 'Деліверінг дрімз', createdAt: 7 }],
      'ID0009': [],
    });

    const result = await copyPublicCommentsBetweenCards({
      sourceProfileId: 'TG0001',
      targetProfileId: 'ID0009',
    });

    expect(addPublicProfileCommentAs).toHaveBeenCalledWith({
      profileId: 'ID0009',
      text: 'відгук',
      authorId: 'legacy-tg-1',
      authorName: 'Деліверінг дрімз',
      createdAt: 7,
    });
    expect(result).toEqual({ copied: 1, skipped: 0 });
  });

  it('те, що на картці вже є, вдруге не пишеться', async () => {
    fetchPublicProfileComments.mockResolvedValue({
      TG0001: [{ text: 'Відгук ', authorId: 'legacy-tg-1', createdAt: 7 }],
      'ID0009': [{ text: 'відгук', authorId: 'legacy-tg-1', createdAt: 7 }],
    });

    const result = await copyPublicCommentsBetweenCards({
      sourceProfileId: 'TG0001',
      targetProfileId: 'ID0009',
    });

    expect(addPublicProfileCommentAs).not.toHaveBeenCalled();
    expect(result).toEqual({ copied: 0, skipped: 1 });
  });
});
