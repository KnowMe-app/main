import { applyMatchingUiFiltersToUsers } from 'utils/matchingDataProvider';
import { mergeMatchingCandidateUsers } from 'utils/reactionPriority';
import { LIKED_AUDIENCE_CARD_FLAG } from 'utils/likedAudience';

// Картку «лише для вподобаних» збирач деки ставить головою, а фінальний
// фільтр показу мусить її пропустити: `publish: false` у неї навмисно.
// Поки він питав сам лише `publish`, вподобана агенція не бачила анкети в
// стрічці, хоча правила бази вже відкрили їй деталі й контакти.
describe('картка, відкрита читачеві вподобанням, доходить до екрана', () => {
  const liked = { userId: 'owner', publish: false, publishAudience: 'liked', [LIKED_AUDIENCE_CARD_FLAG]: true };
  const hidden = { userId: 'hidden', publish: false };
  const published = { userId: 'pub', publish: true, lastLogin2: '2026-10-19' };

  it('фільтр показу лишає її і далі ховає звичайну сховану', () => {
    const users = mergeMatchingCandidateUsers({
      users: [published, hidden],
      likedAudienceUsers: [liked],
      viewMode: 'default',
      viewerRole: 'ag',
    });
    expect(users.map(u => u.userId)).toEqual(['owner', 'pub']);
    const shown = applyMatchingUiFiltersToUsers({ users: [...users, hidden], filters: {}, excludeReactionUsers: true });
    expect(shown.map(u => u.userId)).toEqual(['owner', 'pub']);
  });

  it('без позначки така сама картка не показується', () => {
    const { [LIKED_AUDIENCE_CARD_FLAG]: _flag, ...unflagged } = liked;
    expect(applyMatchingUiFiltersToUsers({ users: [unflagged], filters: {} })).toEqual([]);
  });
});
