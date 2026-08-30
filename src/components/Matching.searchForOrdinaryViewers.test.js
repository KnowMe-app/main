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

  // Знайдене за точним контактом — не дека. Дека бере картки з `feedDate`, і
  // саме тому пошук мовчав: анкета знаходилась у `searchId`, читалась із
  // проєкції — і зникала на останньому кроці, бо не опублікована. Показати її
  // нема кому: у стрічку вона не приїде ніколи.
  it('знайдене показується тому, хто вже має право на повну анкету', () => {
    const source = matchingSource();
    const applySearchResults = source.slice(
      source.indexOf('  const applySearchResults = async res => {'),
      source.indexOf('  useEffect(() => {', source.indexOf('  const applySearchResults = async res => {')),
    );

    expect(applySearchResults).toContain('hasFullProfileAccess && user?.__matchingAccessAllowed === undefined');
    expect(applySearchResults).toContain('__matchingAccessAllowed: true');
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

  it('каже, що знайдене приховали фільтри, а не що його немає', () => {
    expect(resolver).toContain('Знайдено ${visibleUsers.length} — усіх приховали фільтри');
    expect(resolver).toContain('Фільтри приховали всі завантажені профілі');
  });

  it('не приписує фільтрам порожні вкладки реакцій і «схожих»', () => {
    expect(resolver).toContain("const isReactionTab = viewMode === 'favorites' || viewMode === 'dislikes';");
    expect(resolver).toContain("!isReactionTab && searchTab !== 'similar' && visibleUsers.length > 0");
  });

  it('обидва порожні стани говорять одним текстом', () => {
    // Дека мала свій зашитий рядок і не знала ані про порожню групу, ані про
    // фільтри — той самий екран пояснював причину лише в одному з двох виглядів.
    expect(source).toContain('<OwnerStatusMessage>{emptyFeedMessage}</OwnerStatusMessage>');
    expect(source).toContain('<FeedNotice>{emptyFeedMessage}</FeedNotice>');
    expect(source).not.toContain('<OwnerStatusMessage>Немає доступних профілів</OwnerStatusMessage>');
  });
});
