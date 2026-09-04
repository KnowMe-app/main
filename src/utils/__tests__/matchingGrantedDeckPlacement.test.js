import fs from 'fs';
import path from 'path';
import { mergeMatchingCandidateUsers } from '../reactionPriority';

const paged = (userId, feedDate = '2026-09-01') => ({
  userId,
  publish: true,
  lastLogin2: feedDate,
  userRole: 'ag',
});

const granted = (userId, extra = {}) => ({
  userId,
  userRole: 'ag',
  __matchingAccessAllowed: true,
  ...extra,
});

const deck = (users, additionalAccessUsers) => mergeMatchingCandidateUsers({
  users,
  additionalAccessUsers,
  viewMode: 'default',
  hasAdditionalAccessRules: true,
}).map(user => user.userId);

/*
 * Загальний список — це стрічка, і нічого, крім стрічки.
 *
 * Правила додаткового доступу читаються по індексу, який знає всі анкети,
 * зокрема неопубліковані. Поки вони доливались у деку як є, звичайний читач
 * гортав картки, яких у стрічці немає за визначенням: у `matchingCards` вони
 * без `feedDate`. Такій анкеті місце у відповіді на точковий пошук за
 * контактом, а не в загальному списку.
 */
describe('надана картка потрапляє в деку лише разом зі стрічкою', () => {
  it('неопубліковану надану картку в загальний список не пускає', () => {
    expect(deck([paged('feed1')], [granted('draft')])).toEqual(['feed1']);
  });

  it('сховану надану картку теж не пускає', () => {
    expect(deck([paged('feed1')], [granted('hidden', { publish: false })])).toEqual(['feed1']);
  });

  it('опубліковану надану картку показує', () => {
    expect(deck([paged('feed1')], [granted('shown', { publish: true })]))
      .toEqual(expect.arrayContaining(['feed1', 'shown']));
  });
});

/*
 * Хвіст списку належить пагінації: саме туди дивиться читач, чекаючи на порцію,
 * і саме там стоять відлік і сентинел.
 */
describe('нові картки лягають у самий кінець деки', () => {
  const grantedFromInitialLoad = granted('grantedHead', {
    publish: true,
    __matchingAccessInitialBatch: true,
  });

  it('пачка наданих карток з входу стоїть перед декою, а не після неї', () => {
    expect(deck([paged('page1'), paged('page2')], [grantedFromInitialLoad]))
      .toEqual(['grantedHead', 'page1', 'page2']);
  });

  it('дописана сторінка лягає останньою, а не над наданими картками', () => {
    const before = deck([paged('page1')], [grantedFromInitialLoad]);
    const after = deck([paged('page1'), paged('page2')], [grantedFromInitialLoad]);

    expect(before[before.length - 1]).toBe('page1');
    expect(after[after.length - 1]).toBe('page2');
  });

  // Надані картки дочитуються тільки після кінця стрічки — і саме тоді вони
  // самі стають тією порцією, на яку чекає читач.
  it('надані картки, дочитані після кінця стрічки, лягають у хвіст', () => {
    const laterPage = granted('grantedTail', { publish: true });

    expect(deck([paged('page1')], [grantedFromInitialLoad, laterPage]))
      .toEqual(['grantedHead', 'page1', 'grantedTail']);
  });
});

describe('позначку пачки з входу ставить сам завантажувач', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', '..', 'components', 'Matching.jsx'),
    'utf8',
  );

  it('перша пачка наданих карток позначена як голова деки', () => {
    expect(source).toContain('__matchingAccessAllowed: true, __matchingAccessInitialBatch: true');
  });

  // Дочитані сторінки позначки не отримують — інакше приріст знову їхав би в
  // середину списку.
  it('сторінки, дочитані пізніше, позначки не отримують', () => {
    expect(source).toContain("scopedUsers.push({ ...user, __matchingAccessAllowed: true });");
  });
});
