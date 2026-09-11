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

// Тост бачить лише адмін, тож і сесія в тесті адмінська.
const ADMIN_UID = '3LiD7JGCJTSJoVMU7fdR1ZrcIZH2';
const mockAuth = { currentUser: { uid: ADMIN_UID } };
jest.mock('firebase/auth', () => ({ getAuth: () => mockAuth }));

const mockToasts = [];
jest.mock('react-hot-toast', () => {
  const record = (type, message, options) => {
    mockToasts.push({ type, message, options });
  };
  const toast = (message, options) => record('default', message, options);
  toast.error = (message, options) => record('error', message, options);
  toast.success = (message, options) => record('success', message, options);
  toast.loading = (message, options) => record('loading', message, options);
  toast.dismiss = () => {};
  toast.custom = (message, options) => record('custom', message, options);
  return { __esModule: true, default: toast, toast, Toaster: () => null };
});
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
// Наступний запис у `searchId` падає з цією помилкою й скидається на `null`.
const mockWriteFailure = { error: null };
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
  // Запис іде в `searchId/{значення}` дочірнім полем, тож мок мусить зводити
  // шлях і ключ payload докупи — інакше сховище тесту не відрізнить
  // `аветісян/surname` від будь-якого іншого `surname`.
  update: async (path, payload) => {
    if (mockWriteFailure.error) {
      const failure = mockWriteFailure.error;
      mockWriteFailure.error = null;
      throw failure;
    }
    const base = String(path).replace(/^searchId\/?/, '');
    const scoped = Object.entries(payload).reduce((acc, [key, value]) => {
      acc[base ? `${base}/${key}` : key] = value;
      return acc;
    }, {});
    mockWrites.push(scoped);
    Object.assign(mockStore, scoped);
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
  mockToasts.length = 0;
  mockWriteFailure.error = null;
  mockAuth.currentUser = { uid: ADMIN_UID };
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

    expect(mockStore).toEqual({ 'аветісян/surname': cardId });
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
      'коваленко/surname': cardId,
      'аветісян/surname': cardId,
    });
  });

  it('не переписує ключ, який уже містить цю анкету', async () => {
    const cardId = nextCardId();
    mockStore['аветісян/surname'] = cardId;

    await syncUserSearchIdIndex(cardId, {}, { userId: cardId, surname: 'Аветісян' });

    expect(mockReads).toEqual(['аветісян/surname']);
    expect(mockWrites).toEqual([]);
  });

  it('дописує анкету до ключа, який уже належить іншій', async () => {
    const cardId = nextCardId();
    mockStore['аветісян/surname'] = 'OTHER';

    await syncUserSearchIdIndex(cardId, {}, { userId: cardId, surname: 'Аветісян' });

    expect(mockStore['аветісян/surname']).toEqual(['OTHER', cardId]);
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
    expect(mockReads).toEqual(['аветісян/surname']);

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
    expect(mockStore['аветісян/surname']).toBeUndefined();

    mockReads.length = 0;
    await syncUserSearchIdIndex(cardId, {}, { userId: cardId, surname: 'Аветісян' });

    expect(mockReads).toEqual(['аветісян/surname']);
    expect(mockStore['аветісян/surname']).toBe(cardId);
  });
});

describe('відмова індексації видима, а не самий лише console.error', () => {
  // Мовчазний `catch` тут і був причиною, чому дірку в індексі помічали вже
  // по дірці в пошуку: анкета зберігалась, ключ не писався, екран мовчав.
  it('показує адмінові тост із ключем і причиною', async () => {
    const cardId = nextCardId();
    mockWriteFailure.error = new Error('PERMISSION_DENIED');

    await syncUserSearchIdIndex(cardId, {}, { userId: cardId, surname: 'Аветісян' });

    expect(mockToasts).toHaveLength(1);
    expect(mockToasts[0].type).toBe('error');
    expect(mockToasts[0].message).toContain('аветісян/surname');
    expect(mockToasts[0].message).toContain('PERMISSION_DENIED');
  });

  it('не памʼятає ключ, який не записався, — наступне збереження пробує знову', async () => {
    const cardId = nextCardId();
    mockWriteFailure.error = new Error('PERMISSION_DENIED');
    await syncUserSearchIdIndex(cardId, {}, { userId: cardId, surname: 'Аветісян' });

    mockReads.length = 0;
    await syncUserSearchIdIndex(cardId, {}, { userId: cardId, surname: 'Аветісян' });

    expect(mockReads).toEqual(['аветісян/surname']);
    expect(mockStore['аветісян/surname']).toBe(cardId);
  });

  it('однакові відмови не складають вежу з тостів', async () => {
    // Кандидатів в одному збереженні десяток; стабільний id підміняє
    // попереднє повідомлення замість того, щоб додати ще одне.
    const cardId = nextCardId();
    mockWriteFailure.error = new Error('PERMISSION_DENIED');
    await syncUserSearchIdIndex(cardId, {}, { userId: cardId, surname: 'Аветісян' });
    mockWriteFailure.error = new Error('PERMISSION_DENIED');
    await syncUserSearchIdIndex(cardId, {}, { userId: cardId, name: 'Анастасія' });

    expect(mockToasts).toHaveLength(2);
    expect(new Set(mockToasts.map(entry => entry.options?.id))).toEqual(
      new Set(['searchId-index-failure']),
    );
  });

  it('донорці на реєстрації нічого не показує', async () => {
    const cardId = nextCardId();
    mockAuth.currentUser = { uid: 'DONOR_UID' };
    mockWriteFailure.error = new Error('PERMISSION_DENIED');

    await syncUserSearchIdIndex(cardId, {}, { userId: cardId, surname: 'Аветісян' });

    expect(mockToasts).toEqual([]);
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
