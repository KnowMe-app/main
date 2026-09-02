const fs = require('fs');
const path = require('path');

const { mergeMatchingCandidateUsers } = require('utils/reactionPriority');
const { isMatchingCardId } = require('utils/matchingDataProvider');

const matchingSource = () => fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');

// Firebase push-id — рівно 20 символів, і саме такі id мають анкети, заведені в
// застосунку. Мірка «довше за 20» лишилась від поділу колекцій і викидала їх з
// результатів пошуку вже після того, як статус сказав «Знайшов».
const pushId = '-P-Q1n2HOTQwhFihr1RA';
const authUid = 'vtDxkDMjCwYuTDqTUnZsO29bpQr1';

describe('пошук у matching для читача без повного доступу', () => {
  it('картка з push-id — така сама картка', () => {
    expect(pushId).toHaveLength(20);
    expect(isMatchingCardId(pushId)).toBe(true);
    expect(isMatchingCardId(authUid)).toBe(true);
  });

  it('результати пошуку не фільтруються за довжиною id', () => {
    const source = matchingSource();
    const applySearchResults = source.slice(
      source.indexOf('  const applySearchResults = async res => {'),
      source.indexOf('  useEffect(() => {', source.indexOf('  const applySearchResults = async res => {')),
    );

    expect(applySearchResults).toContain('.filter(u => isMatchingCardId(u?.userId))');
    expect(applySearchResults).not.toContain('isValidId');
  });

  it('те саме на шляху, яким результат приходить із searchUsers', () => {
    const source = matchingSource();
    const searchUsers = source.slice(
      source.indexOf('  const searchUsers = async (params, options = {}) => {'),
      source.indexOf('  const similarUsers = ', source.indexOf('  const searchUsers = async (params, options = {}) => {')),
    );

    expect(searchUsers).toContain('const filtered = arr.filter(u => isMatchingCardId(u?.userId));');
    expect(searchUsers).not.toContain('isValidId');
  });

  // Знайдене — не дека. Дека бере картки з `feedDate`, і саме тому пошук мовчав
  // про неопубліковані: анкета знаходилась у `searchId`, читалась із проєкції —
  // і зникала на останньому кроці, бо не в стрічці. Позначка тепер ставиться
  // кожному знайденому, а не лише знайденому читачем із повним доступом:
  // інакше слабший доступ показував би більше за сильніший.
  it('знайдене показується тому, хто його знайшов', () => {
    const source = matchingSource();
    const applySearchResults = source.slice(
      source.indexOf('  const applySearchResults = async res => {'),
      source.indexOf('  useEffect(() => {', source.indexOf('  const applySearchResults = async res => {')),
    );

    expect(applySearchResults).toContain('user?.__matchingAccessAllowed === undefined');
    expect(applySearchResults).toContain('__matchingAccessAllowed: true');
    // І в тому порядку, який відрізняє опубліковане від решти знайденого.
    expect(applySearchResults).toContain('orderMatchingSearchResults(');
  });

  it('позначка не пише в спільний кеш карток — лише у відповідь на запит', () => {
    const source = matchingSource();
    const searchUsers = source.slice(
      source.indexOf('  const searchUsers = async (params, options = {}) => {'),
      source.indexOf('  const handleExit = async () => {'),
    );

    // `searchUsers` кладе знайдене в кеш карток, з якого його бере й стрічка.
    // Позначка ставиться після нього, в `applySearchResults`, інакше картка без
    // `feedDate` пролізла б у деку через кеш.
    expect(searchUsers).toContain('filtered.forEach(u => updateCard(u.userId, u));');
    expect(searchUsers).not.toContain('__matchingAccessAllowed');
  });

  // Власні чернетки доливаються до стрічки, бо не чекають погодження адміном.
  // Але відповідь на пошуковий запит — не стрічка: там вони читаються як
  // результат і ще й рахуються в чіпі «Знайдено N».
  it('власні чернетки не підмішуються у відповідь на запит', () => {
    const source = matchingSource();
    expect(source).toContain("users: viewMode === 'search' ? users : [...users, ...personalCreateProfiles],");
  });

  it('у стрічці власні чернетки лишаються', () => {
    const draft = {
      userId: pushId,
      name: 'Чернетка',
      publish: true,
      __matchingAccessAllowed: true,
    };
    const merged = mergeMatchingCandidateUsers({
      users: [draft],
      additionalAccessUsers: [],
      isAdmin: false,
      viewMode: 'default',
    });

    expect(merged.map(user => user.userId)).toEqual([pushId]);
  });
});

// Порожній екран при робочому пошуку — окрема причина, і мовчати про неї
// найдорожче: статус каже «Знайшов у searchId», а під ним «немає профілів».
describe('порожній екран називає свою причину', () => {
  const source = fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');
  const resolver = source.slice(
    source.indexOf('  const resolveEmptyFeedMessage = () => {'),
    source.indexOf('  const emptyFeedMessage = resolveEmptyFeedMessage();'),
  );

  it('каже, що стрічку спорожнили фільтри, а не що профілів немає', () => {
    expect(resolver).toContain('Фільтри приховали всі завантажені профілі');
  });

  it('не приписує фільтрам ані порожні вкладки реакцій, ані порожній пошук', () => {
    // Видачу запиту чіпи більше не звужують, тож порожній пошук — це справді
    // «не знайшлось», а не «приховали».
    expect(resolver).toContain("const isReactionTab = viewMode === 'favorites' || viewMode === 'dislikes';");
    expect(resolver).toContain('!isReactionTab && !isSearching && visibleUsers.length > 0');
  });

  it('обидва порожні стани говорять одним текстом', () => {
    // Дека мала свій зашитий рядок і не знала ані про порожню групу, ані про
    // фільтри — той самий екран пояснював причину лише в одному з двох виглядів.
    expect(source).toContain('<OwnerStatusMessage>{emptyFeedMessage}</OwnerStatusMessage>');
    expect(source).toContain('<FeedNotice>{emptyFeedMessage}</FeedNotice>');
    expect(source).not.toContain('<OwnerStatusMessage>Немає доступних профілів</OwnerStatusMessage>');
  });
});

// Чіпи описують, кого показувати в деці. Запит називає конкретну людину, і
// сховати її через те, що вона не того типу, означає відповісти «немає» на
// питання «де ось цей».
describe('фільтри не звужують видачу пошуку', () => {
  const source = fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');

  it('режим пошуку віддає знайдене як є', () => {
    const filtered = source.slice(
      source.indexOf('  const filteredUsers = useMemo(() => {'),
      source.indexOf('  const draftFilteredCount = useMemo'),
    );

    expect(filtered).toContain("if (viewMode === 'search') return visibleUsers;");
    const bypassIndex = filtered.indexOf("if (viewMode === 'search') return visibleUsers;");
    const filterIndex = filtered.indexOf('return applyMatchingUiFiltersToUsers({');
    expect(bypassIndex).toBeGreaterThan(-1);
    expect(filterIndex).toBeGreaterThan(bypassIndex);
  });

  it('вкладка «Схожі» живе за тим самим правилом', () => {
    const similar = source.slice(
      source.indexOf('  const similarUsers = useMemo(() => {'),
      source.indexOf('  const feedSource = '),
    );

    expect(similar).not.toContain('applyMatchingUiFiltersToUsers');
  });

  it('діагностика не рахує це за помилку фільтрації', () => {
    expect(source).toContain("if (!showDiagnostics || viewMode === 'search') return null;");
  });
});
