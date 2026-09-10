// Ключ у `searchId` не зʼявлявся там, де значення в анкеті вже було.
//
// Писачі індексу питали анкету («це значення нове?»), а не індекс («цей ключ
// уже є?»). Тож прізвище, яке потрапило в анкету повз індексатор — імпортом,
// міграцією, прийнятим овнерлеєм чи попередньою спробою, яку база відхилила, —
// не індексувалось уже ніколи: кожне наступне збереження бачило «не змінилось»
// і мовчки нічого не робило. Назовні це виглядало як анкета з прізвищем, якої
// пошук за прізвищем не знаходить, і як «У backend searchId немає запису
// surname_…» на стрілці до бекенду.

jest.mock('firebase/app', () => ({ initializeApp: () => ({}) }));
jest.mock('firebase/auth', () => ({ getAuth: () => ({ currentUser: null }) }));
jest.mock('firebase/firestore', () => ({
  getFirestore: () => ({}),
  collection: () => ({}),
  doc: () => ({}),
  getDoc: () => ({}),
  getDocs: () => ({}),
  setDoc: () => ({}),
  updateDoc: () => ({}),
  deleteField: () => ({}),
}));
jest.mock('firebase/storage', () => ({
  getStorage: () => ({}),
  ref: () => ({}),
  getDownloadURL: () => ({}),
  uploadBytes: () => ({}),
  deleteObject: () => ({}),
  listAll: async () => ({ items: [], prefixes: [] }),
  getBytes: () => ({}),
}));

// Мок навмисно на простих функціях, а не на `jest.fn`: CRA вмикає
// `resetMocks`, і реалізація, вкладена в `jest.fn` усередині фабрики модуля,
// зникає перед першим же тестом — лишається мок, що повертає `undefined`.
const mockStore = {};
const mockReads = [];
const mockWrites = [];
jest.mock('firebase/database', () => ({
  getDatabase: () => ({}),
  ref: (_db, path) => path,
  get: async path => {
    const key = String(path).replace('searchId/', '');
    mockReads.push(key);
    return {
      exists: () => Object.prototype.hasOwnProperty.call(mockStore, key),
      val: () => mockStore[key],
    };
  },
  update: async (_path, payload) => {
    mockWrites.push(payload);
    Object.assign(mockStore, payload);
  },
  remove: async path => {
    const key = String(path).replace('searchId/', '');
    mockWrites.push({ [key]: null });
    delete mockStore[key];
  },
  set: () => ({}),
  push: () => ({}),
  runTransaction: async () => ({}),
  orderByChild: () => ({}),
  orderByValue: () => ({}),
  orderByKey: () => ({}),
  query: () => ({}),
  startAfter: () => ({}),
  startAt: () => ({}),
  limitToFirst: () => ({}),
  limitToLast: () => ({}),
  endAt: () => ({}),
  endBefore: () => ({}),
  equalTo: () => ({}),
  serverTimestamp: () => ({}),
}));

const { syncUserSearchIdIndex } = require('./config');

const resetBackend = () => {
  Object.keys(mockStore).forEach(key => delete mockStore[key]);
  mockReads.length = 0;
  mockWrites.length = 0;
};

// Позначка про підтверджений ключ живе в модулі й між тестами не скидається,
// тому кожен сценарій бере власну анкету — саме так, як це бачить база.
let cardCounter = 0;
const nextCardId = () => {
  cardCounter += 1;
  return `CARD${cardCounter}`;
};

beforeEach(resetBackend);

describe('searchId індексує за станом індексу, а не за різницею в анкеті', () => {
  it('дописує ключ для значення, яке в анкеті не змінилось', async () => {
    const cardId = nextCardId();

    await syncUserSearchIdIndex(cardId, { surname: 'Аветісян' }, { userId: cardId, surname: 'Аветісян' });

    expect(mockStore).toEqual({ surname_аветісян: cardId });
  });

  it('індексує всі версії поля-історії, а не лише останню', async () => {
    // Масив у полі анкети — це історія, і шукають людину за будь-яким із
    // записів: замінене прізвище лишається знаходжуваним.
    const cardId = nextCardId();

    await syncUserSearchIdIndex(
      cardId,
      { surname: ['Коваленко'] },
      { userId: cardId, surname: ['Коваленко', 'Аветісян'] },
    );

    expect(mockStore).toEqual({
      surname_коваленко: cardId,
      surname_аветісян: cardId,
    });
  });

  it('не переписує ключ, який уже містить цю анкету', async () => {
    const cardId = nextCardId();
    mockStore.surname_аветісян = cardId;

    await syncUserSearchIdIndex(cardId, {}, { userId: cardId, surname: 'Аветісян' });

    expect(mockReads).toEqual(['surname_аветісян']);
    expect(mockWrites).toEqual([]);
  });

  it('дописує анкету до ключа, який уже належить іншій', async () => {
    const cardId = nextCardId();
    mockStore.surname_аветісян = 'OTHER';

    await syncUserSearchIdIndex(cardId, {}, { userId: cardId, surname: 'Аветісян' });

    expect(mockStore.surname_аветісян).toEqual(['OTHER', cardId]);
  });
});

describe('підтверджений ключ не перечитується щоразу', () => {
  // Перевірка індексу коштує читання на кожне значення, а автозбереження форми
  // спрацьовує на кожне поле, з якого людина вийшла. Тому підтверджену пару
  // «ключ → анкета» таб памʼятає й другого разу в базу не ходить.
  it('друге збереження тієї самої анкети не робить читань', async () => {
    const cardId = nextCardId();
    const profile = { userId: cardId, surname: 'Аветісян' };

    await syncUserSearchIdIndex(cardId, {}, profile);
    expect(mockReads).toEqual(['surname_аветісян']);

    mockReads.length = 0;
    await syncUserSearchIdIndex(cardId, profile, profile);

    expect(mockReads).toEqual([]);
  });

  it('навмисне стирання поля знімає позначку, і наступний запис знову перевіряє базу', async () => {
    const cardId = nextCardId();

    await syncUserSearchIdIndex(cardId, {}, { userId: cardId, surname: 'Аветісян' });
    await syncUserSearchIdIndex(
      cardId,
      { surname: 'Аветісян' },
      { userId: cardId },
      { surname: 'Аветісян' },
    );
    expect(mockStore.surname_аветісян).toBeUndefined();

    mockReads.length = 0;
    await syncUserSearchIdIndex(cardId, {}, { userId: cardId, surname: 'Аветісян' });

    expect(mockReads).toEqual(['surname_аветісян']);
    expect(mockStore.surname_аветісян).toBe(cardId);
  });
});

describe('писач вузлів анкети тримається того самого правила', () => {
  const fs = require('fs');
  const path = require('path');
  const source = fs.readFileSync(path.join(__dirname, 'config.js'), 'utf8');

  it('updateProfileNodesInRTDB більше не звіряє нове значення з поточним станом анкети', () => {
    expect(source).not.toContain('if (!currentValues.includes(cleanedValue)) {');
  });

  it('syncUserSearchIdIndex більше не звіряє кандидата з попереднім станом анкети', () => {
    expect(source).not.toContain('if (!prevCandidates.has(candidate)) {');
  });
});
