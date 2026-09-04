import fs from 'fs';
import path from 'path';
import {
  hidePeerDonorCards,
  isDonorViewer,
  isPeerDonorCard,
  listProfileRoles,
} from '../matchingPeerVisibility';
import { mergeMatchingCandidateUsers } from '../reactionPriority';

const donor = (userId, extra = {}) => ({ userId, publish: true, userRole: 'ed', ...extra });
const agency = userId => ({ userId, publish: true, userRole: 'ag' });

describe('донорка не гортає стрічку інших донорок', () => {
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
    expect(listProfileRoles({ userRole: 'donor' })).toEqual(['ed']);
    expect(listProfileRoles({ role: 'до' })).toEqual(['ed']);
    expect(listProfileRoles({})).toEqual([]);
  });

  // Анкета кількох ролей ховається лише тоді, коли всі вони — `ed`.
  it('ховає лише ту картку, яка тільки донорська', () => {
    expect(isPeerDonorCard({ userRole: 'ed' })).toBe(true);
    expect(isPeerDonorCard({ role: ['ed', 'ag'] })).toBe(false);
    expect(isPeerDonorCard({ userRole: 'ag' })).toBe(false);
    // Роль, якої додаток не знає, — не привід ховати картку.
    expect(isPeerDonorCard({ userRole: 'хтось' })).toBe(false);
  });

  it('лишає власну анкету і явно надані картки', () => {
    const users = [donor('own'), donor('peer'), donor('granted', { __matchingAccessAllowed: true }), agency('ag1')];

    const visible = hidePeerDonorCards({ users, viewerRole: 'ed', viewerId: 'own' });

    expect(visible.map(user => user.userId)).toEqual(['own', 'granted', 'ag1']);
  });

  it('читачеві іншої ролі не прибирає нічого', () => {
    const users = [donor('a'), donor('b'), agency('c')];
    expect(hidePeerDonorCards({ users, viewerRole: 'ag' })).toHaveLength(3);
    expect(hidePeerDonorCards({ users, viewerRole: '' })).toHaveLength(3);
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
