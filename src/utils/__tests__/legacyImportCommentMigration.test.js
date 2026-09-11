jest.mock('components/config', () => ({
  addPublicProfileCommentAs: jest.fn(),
  auth: { currentUser: { uid: '0ghb1LphfASV0Y3b6J010v4CDyD2' } },
  deleteCommentByOwner: jest.fn(),
  fetchOwnerCommentsSubtree: jest.fn(),
  fetchPublicProfileCommentsStrict: jest.fn(),
  readOwnerWriterMapStrict: jest.fn(),
}));

const {
  addPublicProfileCommentAs,
  auth,
  deleteCommentByOwner,
  fetchOwnerCommentsSubtree,
  fetchPublicProfileCommentsStrict,
  readOwnerWriterMapStrict,
} = require('components/config');

const {
  LEGACY_COMMENT_AUTHOR_ID_PREFIX,
  LEGACY_IMPORT_COMMENT_OWNER_ID,
  LEGACY_IMPORT_ID_PREFIXES,
  copyPublicCommentsBetweenCards,
  isLegacyImportUserId,
  isPermissionDeniedFailure,
  makeLegacyCommentAuthorId,
  migrateLegacyImportCommentsToPublic,
  planLegacyImportCommentMigration,
  resolveMigrationOwnerIds,
} = require('../legacyImportCommentMigration');

const ADMIN = '0ghb1LphfASV0Y3b6J010v4CDyD2';
const IMPORTER = LEGACY_IMPORT_COMMENT_OWNER_ID;

describe('розпізнавання карток партії', () => {
  it('бере рівно префікс великими й далі самі цифри', () => {
    expect(isLegacyImportUserId('TG0001')).toBe(true);
    expect(isLegacyImportUserId(' TG12 ')).toBe(true);
    expect(isLegacyImportUserId('tg0001')).toBe(false);
    expect(isLegacyImportUserId('TGA001')).toBe(false);
    expect(isLegacyImportUserId('')).toBe(false);
  });

  // Партії дві, і кожна кнопка бачить рівно свою: перенос ID-карток не мусить
  // чіпати TG-карток, і навпаки.
  it('партії не перетинаються', () => {
    expect(isLegacyImportUserId('ID0001')).toBe(false);
    expect(isLegacyImportUserId('ID0001', 'ID')).toBe(true);
    expect(isLegacyImportUserId('TG0001', 'ID')).toBe(false);
    expect(LEGACY_IMPORT_ID_PREFIXES).toEqual(['TG', 'ID']);
  });

  // Префікс іде в регулярку, тож усе, що нею бути не може, відхиляється до
  // першого запиту: інакше `.` мовчки розширив би перенос на чужі картки.
  it('не пускає префікс, який не є великими літерами', () => {
    expect(() => isLegacyImportUserId('TG0001', 'T.')).toThrow('великих літер');
    expect(() => isLegacyImportUserId('TG0001', '')).toThrow('великих літер');
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
    expect(id.startsWith(LEGACY_COMMENT_AUTHOR_ID_PREFIX)).toBe(true);
    expect(id).toMatch(/-/);
  });

  // Партії в префіксі автора немає навмисно: та сама агенція писала і про TG-,
  // і про ID-картки — це одна людина, а не дві.
  it('не тягне за собою партію картки', () => {
    expect(LEGACY_COMMENT_AUTHOR_ID_PREFIX).not.toMatch(/tg|id/i);
  });
});

describe('план переносу', () => {
  const plan = params => planLegacyImportCommentMigration({
    privateComments: {},
    writers: {},
    existingPublicComments: {},
    ...params,
  });

  it('бере коментар картки партії, підписує його автором з writer і зберігає дату', () => {
    const { entries, skipped } = plan({
      privateComments: {
        [IMPORTER]: {
          TG0001: { text: 'Зняли з підготовки до переносу', updatedAt: 1785492679190 },
          ID0007: { text: 'Інша партія — не ця кнопка', updatedAt: 1 },
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
    expect(skipped).toEqual({ otherPrefix: 1, emptyText: 1, unverifiedWriter: 0 });
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

  it('стерта позначка writer не дає опублікувати неперевірену приватну нотатку', () => {
    const { entries } = plan({
      privateComments: { [ADMIN]: { TG0001: { text: 'відгук', updatedAt: 5 } } },
      writers: { [ADMIN]: { TG0001: ['Деліверінг дрімз', ''] } },
    });

    expect(entries).toEqual([]);
  });

  // Партія з таблиці (`handleExcelProfilesUpload`) записує картку, коментар і
  // дизлайк — і жодного `writer`. Гейт для неї означав би «перенести
  // неможливо», тож знімає його не код, а людина.
  it('віддає відкинуте назад — з текстом, а не самим числом', () => {
    const { entries, skipped, unverified } = plan({
      privateComments: { [IMPORTER]: { ID0001: { text: 'відгук з таблиці', updatedAt: 5 } } },
      prefix: 'ID',
    });

    expect(entries).toEqual([]);
    expect(skipped.unverifiedWriter).toBe(1);
    expect(unverified).toEqual([{ profileId: 'ID0001', ownerId: IMPORTER, text: 'відгук з таблиці' }]);
  });

  it('з дозволу переносить і нотатку без writer — без вигаданого імені автора', () => {
    const { entries, skipped } = plan({
      privateComments: { [IMPORTER]: { ID0001: { text: 'відгук з таблиці', updatedAt: 5 } } },
      prefix: 'ID',
      allowMissingWriter: true,
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ profileId: 'ID0001', authorName: '' });
    expect(skipped.unverifiedWriter).toBe(0);
  });

  it('позначка іншого власника не верифікує приватну нотатку цього власника', () => {
    const { entries } = plan({
      privateComments: { [IMPORTER]: { TG0001: { text: 'відгук', updatedAt: 5 } } },
      writers: { [ADMIN]: { TG0001: 'Деліверінг дрімз' } },
    });

    expect(entries).toEqual([]);
  });

  it('той самий текст у двох власників їде однією копією, а прибрати треба обидва оригінали', () => {
    const { entries } = plan({
      privateComments: {
        [ADMIN]: { TG0001: { text: 'Відгук', updatedAt: 5 } },
        [IMPORTER]: { TG0001: { text: 'відгук ', updatedAt: 6 } },
      },
      writers: {
        [ADMIN]: { TG0001: 'Деліверінг дрімз' },
        [IMPORTER]: { TG0001: 'Деліверінг дрімз' },
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
      writers: { [ADMIN]: { TG0001: 'Деліверінг дрімз' } },
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
    fetchPublicProfileCommentsStrict.mockReset().mockResolvedValue({});
    readOwnerWriterMapStrict.mockReset().mockResolvedValue({ TG0001: 'Деліверінг дрімз', ID0001: 'Деліверінг дрімз' });
    fetchOwnerCommentsSubtree.mockReset().mockResolvedValue({});
  });

  it('пише публічний відгук і аж тоді прибирає приватний оригінал', async () => {
    fetchOwnerCommentsSubtree.mockImplementation(async ownerId => (ownerId === IMPORTER
      ? { TG0001: { text: 'відгук', updatedAt: 7 } }
      : {}));
    readOwnerWriterMapStrict.mockImplementation(async ownerId => (ownerId === IMPORTER
      ? { TG0001: 'Деліверінг дрімз' }
      : {}));

    const stats = await migrateLegacyImportCommentsToPublic();

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

  // Кнопка на партію: `ID💬` мусить бачити ID-картки й не чіпати TG-карток —
  // інакше два переноси стали б одним, запущеним двічі.
  it('переносить ту партію, яку назвали, і лише її', async () => {
    fetchOwnerCommentsSubtree.mockResolvedValue({
      TG0001: { text: 'відгук про TG', updatedAt: 7 },
      ID0001: { text: 'відгук про ID', updatedAt: 8 },
    });

    const stats = await migrateLegacyImportCommentsToPublic({ prefix: 'ID' });

    expect(addPublicProfileCommentAs).toHaveBeenCalledTimes(1);
    expect(addPublicProfileCommentAs).toHaveBeenCalledWith(expect.objectContaining({
      profileId: 'ID0001',
      text: 'відгук про ID',
    }));
    expect(stats).toMatchObject({ prefix: 'ID', total: 1, written: 1 });
    expect(stats.profileIds).toEqual(['ID0001']);
  });

  it('той самий автор в обох партіях лишається однією людиною', async () => {
    fetchOwnerCommentsSubtree.mockResolvedValue({
      TG0001: { text: 'перший', updatedAt: 7 },
      ID0001: { text: 'другий', updatedAt: 8 },
    });
    readOwnerWriterMapStrict.mockResolvedValue({ TG0001: 'Деліверінг дрімз', ID0001: 'Деліверінг дрімз' });

    await migrateLegacyImportCommentsToPublic({ prefix: 'TG' });
    await migrateLegacyImportCommentsToPublic({ prefix: 'ID' });

    const [tgCall, idCall] = addPublicProfileCommentAs.mock.calls.map(([payload]) => payload);
    expect(tgCall.authorId).toBe(idCall.authorId);
  });

  // 25 нотаток, кожна пропущена через відсутній `writer`, виглядали як порожня
  // база: «переносити нічого». Тепер це питання до людини, а не мовчазна
  // відмова, — і питається воно з текстами в руках.
  it('питає людину про нотатки без writer і переносить їх з її дозволу', async () => {
    fetchOwnerCommentsSubtree.mockResolvedValue({ ID0001: { text: 'відгук з таблиці', updatedAt: 7 } });
    readOwnerWriterMapStrict.mockResolvedValue({});
    const confirmMissingWriter = jest.fn().mockResolvedValue(true);

    const stats = await migrateLegacyImportCommentsToPublic({ prefix: 'ID', confirmMissingWriter });

    expect(confirmMissingWriter).toHaveBeenCalledWith(expect.objectContaining({
      prefix: 'ID',
      count: 1,
      samples: [{ profileId: 'ID0001', text: 'відгук з таблиці' }],
    }));
    expect(addPublicProfileCommentAs).toHaveBeenCalledWith(expect.objectContaining({
      profileId: 'ID0001',
      authorName: '',
    }));
    expect(stats).toMatchObject({ written: 1, includedWithoutWriter: true });
  });

  it('без дозволу не публікує нічого, але каже, скільки відкинув', async () => {
    fetchOwnerCommentsSubtree.mockResolvedValue({ ID0001: { text: 'відгук з таблиці', updatedAt: 7 } });
    readOwnerWriterMapStrict.mockResolvedValue({});
    const confirmMissingWriter = jest.fn().mockResolvedValue(false);

    const stats = await migrateLegacyImportCommentsToPublic({ prefix: 'ID', confirmMissingWriter });

    expect(addPublicProfileCommentAs).not.toHaveBeenCalled();
    expect(deleteCommentByOwner).not.toHaveBeenCalled();
    expect(stats).toMatchObject({ written: 0, unverified: 1, includedWithoutWriter: false });
    expect(stats.profileIds).toEqual(['ID0001']);
  });

  // Мовчазний прогін (без callback) лишається обережним: не спитавши — не
  // публікує.
  it('без запитувача нотатку без writer не публікує', async () => {
    fetchOwnerCommentsSubtree.mockResolvedValue({ ID0001: { text: 'відгук з таблиці', updatedAt: 7 } });
    readOwnerWriterMapStrict.mockResolvedValue({});

    const stats = await migrateLegacyImportCommentsToPublic({ prefix: 'ID' });

    expect(addPublicProfileCommentAs).not.toHaveBeenCalled();
    expect(stats.unverified).toBe(1);
  });

  it('невдалий публічний запис не коштує приватного оригіналу', async () => {
    fetchOwnerCommentsSubtree.mockResolvedValue({ TG0001: { text: 'відгук', updatedAt: 7 } });
    addPublicProfileCommentAs.mockRejectedValue(new Error('PERMISSION_DENIED'));

    const stats = await migrateLegacyImportCommentsToPublic();

    expect(deleteCommentByOwner).not.toHaveBeenCalled();
    expect(stats.written).toBe(0);
    expect(stats.failed).toBeGreaterThan(0);
  });

  // Звіт «перенесено 0/1» без причини не каже нічого, а причина майже завжди
  // одна: правила бази ще не викочені (їх не викочує CI).
  it('називає відмову бази причиною, а не мовчить про неї', async () => {
    fetchOwnerCommentsSubtree.mockResolvedValue({ TG0001: { text: 'відгук', updatedAt: 7 } });
    const denied = new Error('PERMISSION_DENIED: Permission denied');
    denied.code = 'PERMISSION_DENIED';
    addPublicProfileCommentAs.mockRejectedValue(denied);

    const stats = await migrateLegacyImportCommentsToPublic();

    expect(stats.permissionDenied).toBe(true);
    expect(stats.failures[0]).toMatchObject({ profileId: 'TG0001', code: 'PERMISSION_DENIED' });
  });

  it('інша помилка за відмову бази не видається', async () => {
    fetchOwnerCommentsSubtree.mockResolvedValue({ TG0001: { text: 'відгук', updatedAt: 7 } });
    addPublicProfileCommentAs.mockRejectedValue(new Error('Порожній коментар не зберігається'));

    const stats = await migrateLegacyImportCommentsToPublic();

    expect(stats.permissionDenied).toBe(false);
    expect(isPermissionDeniedFailure(stats.failures[0])).toBe(false);
  });

  it('копія лишає приватну нотатку на місці', async () => {
    fetchOwnerCommentsSubtree.mockResolvedValue({ TG0001: { text: 'відгук', updatedAt: 7 } });

    const stats = await migrateLegacyImportCommentsToPublic({ removePrivate: false });

    expect(addPublicProfileCommentAs).toHaveBeenCalledTimes(1);
    expect(deleteCommentByOwner).not.toHaveBeenCalled();
    expect(stats.removed).toBe(0);
  });

  it('читає лише названих власників, а відмову одного не вважає поломкою', async () => {
    fetchOwnerCommentsSubtree.mockImplementation(async ownerId => {
      if (ownerId === IMPORTER) throw new Error('PERMISSION_DENIED');
      return {};
    });

    const stats = await migrateLegacyImportCommentsToPublic();

    expect(fetchOwnerCommentsSubtree.mock.calls.map(([ownerId]) => ownerId))
      .toEqual(resolveMigrationOwnerIds([], ADMIN));
    expect(stats.unreadableOwnerIds).toEqual([IMPORTER]);
  });

  it('перериває перенос і нічого не видаляє, якщо writer не прочитано', async () => {
    fetchOwnerCommentsSubtree.mockImplementation(async ownerId => (ownerId === IMPORTER
      ? { TG0001: { text: 'приватна нотатка', updatedAt: 7 } }
      : {}));
    readOwnerWriterMapStrict.mockImplementation(async ownerId => {
      if (ownerId === IMPORTER) throw new Error('writer unavailable');
      return {};
    });

    await expect(migrateLegacyImportCommentsToPublic()).rejects.toThrow('writer unavailable');

    expect(addPublicProfileCommentAs).not.toHaveBeenCalled();
    expect(deleteCommentByOwner).not.toHaveBeenCalled();
  });

  it('бере writer з адмінського піддерева, але коментар — лише з піддерева імпортера', async () => {
    fetchOwnerCommentsSubtree.mockResolvedValue({
      TG0001: { text: 'імпортований відгук', updatedAt: 7 },
    });
    readOwnerWriterMapStrict.mockImplementation(async ownerId => (ownerId === ADMIN
      ? { TG0001: 'Агенція з адмінського writer' }
      : {}));

    await migrateLegacyImportCommentsToPublic();

    expect(fetchOwnerCommentsSubtree).toHaveBeenCalledTimes(1);
    expect(fetchOwnerCommentsSubtree).toHaveBeenCalledWith(IMPORTER);
    expect(addPublicProfileCommentAs).toHaveBeenCalledWith(expect.objectContaining({
      profileId: 'TG0001',
      authorName: 'Агенція з адмінського writer',
      authorId: makeLegacyCommentAuthorId('Агенція з адмінського writer'),
    }));
  });

  it('перериває міграцію, якщо публічні відгуки не вдалося перевірити', async () => {
    fetchOwnerCommentsSubtree.mockResolvedValue({ TG0001: { text: 'відгук', updatedAt: 7 } });
    fetchPublicProfileCommentsStrict.mockRejectedValue(new Error('comments unavailable'));

    await expect(migrateLegacyImportCommentsToPublic()).rejects.toThrow('comments unavailable');
    expect(addPublicProfileCommentAs).not.toHaveBeenCalled();
    expect(deleteCommentByOwner).not.toHaveBeenCalled();
  });

  // Записи від чужого імені — право самих лише адмінів, і питати про нього
  // базу посеред пачки записів пізно.
  it('не адмін міграцію не запускає', async () => {
    auth.currentUser = { uid: 'ordinaryViewerUid000000000' };
    await expect(migrateLegacyImportCommentsToPublic()).rejects.toThrow('лише адмін');
    expect(fetchOwnerCommentsSubtree).not.toHaveBeenCalled();
  });
});

describe('перенос публічних відгуків між дублікатами', () => {
  beforeEach(() => {
    auth.currentUser = { uid: ADMIN };
    addPublicProfileCommentAs.mockReset().mockResolvedValue({ id: 'c1' });
    fetchPublicProfileCommentsStrict.mockReset();
  });

  it('копіює відгук на другу картку, зберігаючи автора й дату', async () => {
    fetchPublicProfileCommentsStrict.mockResolvedValue({
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
    fetchPublicProfileCommentsStrict.mockResolvedValue({
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
