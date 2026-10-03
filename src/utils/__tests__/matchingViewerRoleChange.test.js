import {
  resolveViewerCurrentRole,
  isDonorViewer,
  listFeedRoleFilterKeysForViewer,
  alignRoleFilterGroupWithViewer,
  keepDonorCounterpartyCards,
} from '../matchingPeerVisibility';
import { resolveMatchingFilterGroups, buildMatchingFilterChips } from 'components/SearchFilters';

/**
 * Роль міняють з `MyProfile`, а `deriveRole` її обʼєднує: після переходу з
 * агенції в донорки в анкеті лишається `['ag', 'ed']`. Поточна серед них —
 * остання, як і в решти полів анкети.
 */
describe('поточна роль читача — остання з поданих', () => {
  it('бере останню з масиву, а не весь масив', () => {
    expect(resolveViewerCurrentRole(['ag', 'ed'])).toBe('ed');
    expect(resolveViewerCurrentRole(['ed', 'ag'])).toBe('ag');
    // Те саме значення з localStorage приходить рядком.
    expect(resolveViewerCurrentRole('ag,ed')).toBe('ed');
    expect(resolveViewerCurrentRole(' AG , ed ')).toBe('ed');
  });

  it('незнані значення не стають роллю', () => {
    expect(resolveViewerCurrentRole(['ag', 'кухар'])).toBe('ag');
    expect(resolveViewerCurrentRole('')).toBe('');
    expect(resolveViewerCurrentRole(undefined)).toBe('');
  });

  // Правило деки читає ролі як набір: кожна роль розширює деку, а роль
  // організації знімає звуження цілком. Донорка-агентка бачить усе.
  it('правило деки читає ролі читача як набір', () => {
    expect(isDonorViewer('ed')).toBe(true);
    expect(isDonorViewer(['ed', 'sm'])).toBe(true);
    expect(isDonorViewer(['ag', 'ed'])).toBe(false);
    expect(isDonorViewer(['ed', 'ag'])).toBe(false);

    const feed = [
      { userId: 'colleague', role: 'ed' },
      { userId: 'surrogate', role: 'sm' },
      { userId: 'agency', role: 'ag' },
      { userId: 'donorAgent', role: ['ed', 'ag'] },
    ];
    expect(keepDonorCounterpartyCards({ users: feed, viewerRole: 'ed' }).map(user => user.userId))
      .toEqual(['surrogate', 'agency', 'donorAgent']);
    expect(keepDonorCounterpartyCards({ users: feed, viewerRole: ['ed', 'sm'] }).map(user => user.userId))
      .toEqual(['agency', 'donorAgent']);
    expect(keepDonorCounterpartyCards({ users: feed, viewerRole: ['ag', 'ed'] })).toEqual(feed);
  });
});

describe('шухляда не пропонує того, чого в деці не буває', () => {
  it('донорці не показує ED, решті показує все', () => {
    expect(listFeedRoleFilterKeysForViewer('ed')).toEqual(['ag', 'ip', 'other']);
    expect(listFeedRoleFilterKeysForViewer(['ag', 'ed'])).toEqual(['ed', 'ag', 'ip', 'other']);
    expect(listFeedRoleFilterKeysForViewer('ag')).toEqual(['ed', 'ag', 'ip', 'other']);
    expect(listFeedRoleFilterKeysForViewer('')).toEqual(['ed', 'ag', 'ip', 'other']);
  });

  it('той самий перелік керує і групою в шухляді', () => {
    const roleGroup = resolveMatchingFilterGroups({ roleOptionKeys: ['ag', 'ip', 'other'] })
      .find(group => group.filterName === 'userRole');
    expect(roleGroup.options.map(option => option.val)).toEqual(['ag', 'ip', 'other']);
  });

  it('і рядом чіпів: про сховану позначку чіп не говорить', () => {
    // `ed: false` лишився від попередньої ролі. Донорці ED у шухляді немає, тож
    // «Тип профілю: крім ED» назвало б позначку, якої вона не бачить і не зніме.
    const filters = { userRole: { ed: false, ag: true, ip: true, other: true } };
    expect(buildMatchingFilterChips(filters, 'uk', { roleOptionKeys: ['ag', 'ip', 'other'] }))
      .toEqual([]);
    expect(buildMatchingFilterChips(filters, 'uk').map(chip => chip.filterName))
      .toEqual(['userRole']);
  });
});

describe('зміна ролі не лишає читача з неможливою умовою', () => {
  it('вмикає назад позначку, якої більше не показують', () => {
    const stored = { ed: false, ag: true, ip: true, other: true };
    expect(alignRoleFilterGroupWithViewer(stored, 'ed'))
      .toEqual({ ed: true, ag: true, ip: true, other: true });
  });

  it('знімає звуження цілком, коли показаного не лишилось', () => {
    // Агенція гортала самих донорок; ставши доноркою, вона дістала б умову,
    // якої її дека виконати не може, — тобто порожній екран замість стрічки.
    const stored = { ed: true, ag: false, ip: false, other: false };
    expect(alignRoleFilterGroupWithViewer(stored, 'ed'))
      .toEqual({ ed: true, ag: true, ip: true, other: true });
  });

  it('чинне звуження лишає як є, тим самим обʼєктом', () => {
    const stored = { ed: true, ag: true, ip: false, other: true };
    // `ed` донорці не показують, але він і так увімкнений — міняти нема чого,
    // а новий обʼєкт коштував би перезбирання деки на кожну відповідь профілю.
    expect(alignRoleFilterGroupWithViewer(stored, ['ag', 'ed'])).toBe(stored);
    expect(alignRoleFilterGroupWithViewer(stored, 'ag')).toBe(stored);
  });

  it('порожню групу не вигадує', () => {
    expect(alignRoleFilterGroupWithViewer(undefined, 'ed')).toBeUndefined();
  });
});
