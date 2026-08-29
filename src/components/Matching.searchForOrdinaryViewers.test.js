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

    expect(applySearchResults).toContain('arr.filter(u => isMatchingCardId(u?.userId));');
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
