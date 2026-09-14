import fs from 'fs';
import path from 'path';

import { applyMatchingUiFiltersToUsers } from 'utils/matchingDataProvider';
import { mergeMatchingCandidateUsers } from 'utils/reactionPriority';

// Лайк — це відповідь, яку треба записати, а не привід сховати людину з-під
// пальця. Картка лишається до наступної збірки деки; зникає вона тоді, коли
// читач повернеться до стрічки — і саме цього він і чекає.
describe('картка, на яку щойно відповіли, лишається в деці', () => {
  const card = { userId: 'u1', publish: true, lastLogin2: '2026-01-01' };
  const other = { userId: 'u2', publish: true, lastLogin2: '2026-01-01' };

  it('фільтр показу лишає її, поки набір її тримає', () => {
    const args = {
      users: [card, other],
      filters: {},
      favoriteUsers: { u1: true },
      dislikeUsers: {},
      excludeReactionUsers: true,
      viewMode: 'default',
    };
    expect(applyMatchingUiFiltersToUsers(args).map(u => u.userId)).toEqual(['u2']);
    expect(applyMatchingUiFiltersToUsers({ ...args, keepReactedUserIds: new Set(['u1']) })
      .map(u => u.userId)).toEqual(['u1', 'u2']);
  });

  it('збирач деки лишає її так само', () => {
    const args = {
      users: [card, other],
      viewMode: 'default',
      isAdmin: true,
      favoriteUsers: { u1: true },
      dislikeUsers: {},
    };
    expect(mergeMatchingCandidateUsers(args).map(u => u.userId)).toEqual(['u2']);
    expect(mergeMatchingCandidateUsers({ ...args, keepReactedUserIds: new Set(['u1']) })
      .map(u => u.userId)).toEqual(['u1', 'u2']);
  });

  // Третє прибирання — найжорсткіше: воно не фільтрує показ, а викидає картку
  // зі стану `users`, тож повернути її до наступного завантаження нема звідки.
  // Поки виняток знали лише два перші, картка проходила крізь них і все одно
  // зникала — до них вона просто не доходила.
  it('ефект, що чистить users, теж знає про набір', () => {
    const source = fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');
    expect(source).toContain('|| stickyReactedUserIds.has(u.userId)');
    expect(source).toContain('}, [favoriteUsers, dislikeUsers, stickyReactedUserIds, viewMode]);');
  });

  // Позначка ставиться до запису реакції, а не з її зворотного виклику:
  // `onRemove` спрацьовує вже після того, як зміна списку вподобаних
  // перемалювала сторінку, тобто рівно на один рендер пізніше, ніж треба.
  it('позначка ставиться до самої реакції — і в рядку, і у відкритій картці', () => {
    const source = fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');
    expect(source).toContain('onClickCapture={() => onReacted?.(user.userId)}');
    const rowToggle = source.slice(
      source.indexOf('const toggleRowFavorite = React.useCallback(user => {'),
      source.indexOf('void toggleFavoriteUser({'),
    );
    expect(rowToggle).toContain('rememberReactedCard(user.userId);');
  });
});
