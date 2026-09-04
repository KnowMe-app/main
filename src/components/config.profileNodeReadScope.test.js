// Межа приватності — це не лише «чого не показати», а насамперед «чого не
// просити». Поки всі пʼять вузлів анкети їхали одним `Promise.all`, а межу
// застосовували вже до відповіді, контакти прихованої анкети встигали приїхати
// в браузер: єдиним, хто не пускав їх далі, лишалися правила бази. А правила
// тут викочуються руками, тож «не показали» і «не віддали» — різні речі.
//
// Тому тут перевіряється саме перелік запитів: звичайний читач бере з бази
// картку, і тільки дата в `feedDate` відкриває решту вузлів.

jest.mock('firebase/app', () => ({ initializeApp: () => ({}) }));
jest.mock('firebase/auth', () => ({ getAuth: () => ({ currentUser: null }) }));
jest.mock('firebase/firestore', () => ({
  getFirestore: () => ({}),
  collection: () => ({}),
  doc: () => ({}),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  setDoc: jest.fn(),
  updateDoc: jest.fn(),
  deleteField: jest.fn(),
}));
jest.mock('firebase/storage', () => ({
  getStorage: () => ({}),
  ref: () => ({}),
  getDownloadURL: jest.fn(),
  uploadBytes: jest.fn(),
  deleteObject: jest.fn(),
  listAll: jest.fn(async () => ({ items: [], prefixes: [] })),
  getBytes: jest.fn(),
}));

const mockGet = jest.fn();
jest.mock('firebase/database', () => ({
  getDatabase: () => ({}),
  ref: (_db, path) => path,
  get: (...args) => mockGet(...args),
  set: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  push: jest.fn(),
  orderByChild: jest.fn(),
  query: (...parts) => parts,
  orderByKey: jest.fn(),
  orderByValue: jest.fn(),
  startAfter: jest.fn(),
  limitToFirst: jest.fn(),
  limitToLast: jest.fn(),
  startAt: jest.fn(),
  endAt: jest.fn(),
  endBefore: jest.fn(),
  equalTo: jest.fn(),
  serverTimestamp: jest.fn(),
}));

const { readProfileFromNodes, resetViewerAccessLevelCache } = require('./config');

const CARD_ID = 'hiddenProfileId00000000000';

const snapshotOf = value => ({
  exists: () => value !== null && value !== undefined,
  val: () => value,
});

// Анкета розкладена по вузлах: контакти лежать окремо і мають власне право
// читання, яке тримається на `feedDate` у картці.
const nodesWith = card => ({
  [`matchingCards/${CARD_ID}`]: card,
  [`profileDetails/${CARD_ID}`]: { surname: 'Приховайло', blood: '3+' },
  [`profileContacts/${CARD_ID}`]: { phone: ['+380990000000'], email: 'hidden@b.c' },
  [`profileWorkflow/${CARD_ID}`]: { lastAction: 'дзвінок' },
});

const readWithCard = async card => {
  const nodes = nodesWith(card);
  const requested = [];
  mockGet.mockImplementation(async path => {
    requested.push(String(path));
    return snapshotOf(nodes[String(path)] ?? null);
  });

  const profile = await readProfileFromNodes(CARD_ID);
  return { profile, requested };
};

describe('поза стрічкою звичайний читач не просить приватних вузлів', () => {
  beforeEach(() => {
    mockGet.mockReset();
    resetViewerAccessLevelCache();
    localStorage.clear();
  });

  it('анкети без ключа стрічки читає саму картку', async () => {
    const { profile, requested } = await readWithCard({ name: 'Прихована', city: 'Львів' });

    expect(requested).toEqual([`matchingCards/${CARD_ID}`]);
    expect(profile).toMatchObject({ userId: CARD_ID, name: 'Прихована' });
    expect(profile.phone).toBeUndefined();
    expect(profile.email).toBeUndefined();
    expect(profile.surname).toBeUndefined();
  });

  it('схована анкета (`feedDate: false`) — так само сама картка', async () => {
    const { profile, requested } = await readWithCard({ name: 'Прихована', feedDate: false });

    expect(requested).toEqual([`matchingCards/${CARD_ID}`]);
    expect(profile.phone).toBeUndefined();
  });

  // `feedDate` відкриває межу датою, а не самою лише наявністю: рядок, який не
  // є датою, база за дату не рахує — і код не має рахувати теж.
  it('рядок, який не є датою, приватних вузлів не відкриває', async () => {
    const { profile, requested } = await readWithCard({ name: 'Прихована', feedDate: 'опубліковано' });

    expect(requested).toEqual([`matchingCards/${CARD_ID}`]);
    expect(profile.phone).toBeUndefined();
  });

  it('показана анкета читається як завжди — з деталями і контактами', async () => {
    const { profile, requested } = await readWithCard({ name: 'Показана', feedDate: '2026-09-01' });

    expect(requested).toContain(`profileDetails/${CARD_ID}`);
    expect(requested).toContain(`profileContacts/${CARD_ID}`);
    expect(profile.email).toBe('hidden@b.c');
    expect(profile.surname).toBe('Приховайло');
  });

  // Технічний вузол відкритий лише власниці й адмінам, тож без окремого запиту
  // його не питають і для показаної анкети.
  it('технічний вузол їде тільки за окремим проханням', async () => {
    const { requested } = await readWithCard({ name: 'Показана', feedDate: '2026-09-01' });

    expect(requested).not.toContain(`profileTechnical/${CARD_ID}`);
  });

  // Правила тут викочуються руками, тож база й код розходяться легко: код
  // вважає анкету відкритою, а вузли приїжджають порожні. `readProfileNodePart`
  // ковтає відмову навмисно (контакти можуть бути закриті, і анкета мусить
  // відкритись без них), і назовні це виглядає як анкета без прізвища й
  // контактів. Мовчати про таке не можна: це рівно та скарга, з якою прийшли —
  // «feedDate є, а видно урізане».
  it('називає причину, коли показана анкета приїхала без деталей', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const nodes = {
      [`matchingCards/${CARD_ID}`]: { name: 'Показана', feedDate: '2026-09-01' },
      [`profileDetails/${CARD_ID}`]: null,
      [`profileContacts/${CARD_ID}`]: null,
    };
    mockGet.mockImplementation(async path => snapshotOf(nodes[String(path)] ?? null));

    await readProfileFromNodes(CARD_ID);

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('картка в стрічці'),
      expect.objectContaining({ userId: CARD_ID }),
    );
    warn.mockRestore();
  });
});
