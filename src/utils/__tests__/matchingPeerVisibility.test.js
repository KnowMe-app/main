import fs from 'fs';
import path from 'path';
import {
  isCounterpartyCard,
  isDonorViewer,
  keepDonorCounterpartyCards,
  listProfileRoles,
} from '../matchingPeerVisibility';
import { mergeMatchingCandidateUsers } from '../reactionPriority';

const donor = (userId, extra = {}) => ({ userId, publish: true, userRole: 'ed', ...extra });
const agency = (userId, extra = {}) => ({ userId, publish: true, userRole: 'ag', ...extra });
const unroled = (userId, extra = {}) => ({ userId, publish: true, ...extra });

describe('у стрічці донорки лишаються самі контрагенти', () => {
  it('впізнає роль читача за будь-яким її написанням', () => {
    expect(isDonorViewer('ed')).toBe(true);
    expect(isDonorViewer('Egg donor')).toBe(true);
    expect(isDonorViewer('ag')).toBe(false);
    expect(isDonorViewer('')).toBe(false);
  });

  it('читає ролі картки з обох ключів і з масиву', () => {
    expect(listProfileRoles({ userRole: 'ed' })).toEqual(['ed']);
    expect(listProfileRoles({ role: ['ed', 'ag'] })).toEqual(['ed', 'ag']);
    expect(listProfileRoles({ userRole: 'ag', role: 'agency' })).toEqual(['ag']);
    expect(listProfileRoles({})).toEqual([]);
  });

  // Досить однієї впізнаної ролі контрагента: анкета кількох ролей лишається.
  it('впізнає контрагента, а не «все, що не донорка»', () => {
    expect(isCounterpartyCard({ userRole: 'ag' })).toBe(true);
    expect(isCounterpartyCard({ userRole: 'cl' })).toBe(true);
    expect(isCounterpartyCard({ role: ['ed', 'ag'] })).toBe(true);
    expect(isCounterpartyCard({ userRole: 'ed' })).toBe(false);
    expect(isCounterpartyCard({ userRole: 'sm' })).toBe(false);
    // Роль, якої додаток не знає, контрагента не робить — так само як її брак.
    expect(isCounterpartyCard({ userRole: 'хтось' })).toBe(false);
    expect(isCounterpartyCard({})).toBe(false);
  });

  // Саме через це донорка й бачила в стрічці «незрозуміло що»: ролі в картки
  // немає (вона зʼявилась пізніше за самі анкети), а правило ховало лише те, що
  // впізнане як колега.
  it('картку без ролі в стрічку донорки не пускає', () => {
    const users = [unroled('noRole'), agency('ag1')];

    const visible = keepDonorCounterpartyCards({ users, viewerRole: 'ed', viewerId: 'own' });

    expect(visible.map(user => user.userId)).toEqual(['ag1']);
  });

  it('лишає власну анкету і явно надані картки', () => {
    const users = [donor('own'), donor('peer'), donor('granted', { __matchingAccessAllowed: true }), agency('ag1')];

    const visible = keepDonorCounterpartyCards({ users, viewerRole: 'ed', viewerId: 'own' });

    expect(visible.map(user => user.userId)).toEqual(['own', 'granted', 'ag1']);
  });

  it('читачеві іншої ролі не прибирає нічого', () => {
    const users = [donor('a'), unroled('b'), agency('c')];
    expect(keepDonorCounterpartyCards({ users, viewerRole: 'ag' })).toHaveLength(3);
    expect(keepDonorCounterpartyCards({ users, viewerRole: '' })).toHaveLength(3);
  });
});

describe('правило діє у стрічці, але не в пошуку й не в реакціях', () => {
  const users = [donor('peer'), agency('ag1')];

  it('дека за замовчуванням чужих донорок не показує', () => {
    const merged = mergeMatchingCandidateUsers({
      users,
      viewMode: 'default',
      viewerRole: 'ed',
      viewerId: 'own',
    });

    expect(merged.map(user => user.userId)).toEqual(['ag1']);
  });

  it('не втрачає ознаки початкового доступу, коли та сама картка є у public feed', () => {
    const merged = mergeMatchingCandidateUsers({
      users: [donor('granted', { name: 'Оновлена картка' })],
      additionalAccessUsers: [donor('granted', {
        __matchingAccessAllowed: true,
        __matchingAccessInitialBatch: true,
      })],
      hasAdditionalAccessRules: true,
      viewMode: 'default',
      viewerRole: 'ed',
      viewerId: 'own',
    });

    expect(merged).toEqual([expect.objectContaining({
      userId: 'granted',
      name: 'Оновлена картка',
      __matchingAccessAllowed: true,
      __matchingAccessInitialBatch: true,
    })]);
  });

  it('видача пошуку показує їх — там питають про конкретну людину', () => {
    const merged = mergeMatchingCandidateUsers({
      users,
      viewMode: 'search',
      viewerRole: 'ed',
      viewerId: 'own',
    });

    expect(merged.map(user => user.userId)).toEqual(['peer', 'ag1']);
  });

  it('обране лишається обраним, ким би не був читач', () => {
    const merged = mergeMatchingCandidateUsers({
      users,
      viewMode: 'favorites',
      favoriteUsers: { peer: true },
      dislikeUsers: {},
      viewerRole: 'ed',
      viewerId: 'own',
    });

    expect(merged.map(user => user.userId)).toEqual(['peer']);
  });
});

describe('екран пояснює порожню стрічку донорки', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'components', 'Matching.jsx'), 'utf8');

  it('називає причину замість «немає доступних профілів»', () => {
    expect(source).toContain('isDonorViewer(currentUserRole)');
    expect(source).toContain('Конкретну людину можна знайти пошуком');
  });

  it('передає роль читача в деку, а не тільки в лічильник', () => {
    expect(source).toContain('viewerRole: currentUserRole,');
    expect(source).toContain('viewerId: ownerId,');
  });
});

describe('дочитування сторінок рахує те, що донорка справді побачить', () => {
  const matchingSource = fs.readFileSync(
    path.join(__dirname, '..', '..', 'components', 'Matching.jsx'),
    'utf8',
  );
  const providerSource = fs.readFileSync(
    path.join(__dirname, '..', 'matchingDataProvider.js'),
    'utf8',
  );

  it('сторінка джерела отримує роль читача', () => {
    expect(matchingSource).toContain('viewerRole: currentUserRoleRef.current,');
  });

  // Запас рахується по картках, які дійдуть до екрана. Без цього відлік обіцяв
  // би дві картки, а дорахувати їх на екрані було б нічим.
  it('фільтр сторінки джерела застосовує те саме правило', () => {
    expect(providerSource).toContain('filterSourceUsers: sourceUsers => keepDonorCounterpartyCards({');
  });
});
