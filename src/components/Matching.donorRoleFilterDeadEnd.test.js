import fs from 'fs';
import path from 'path';
import {
  donorFeedRoleFilterLeavesNothing,
  keepDonorCounterpartyCards,
  DONOR_FEED_ROLE_FILTER_KEYS,
} from 'utils/matchingPeerVisibility';
import { applyMatchingUiFiltersToUsers } from 'utils/matchingDataProvider';

// Набір із знімка, на якому це й зловили: шість груп з виключеннями, серед них
// «Тип профілю: крім AG, IP».
const SCREENSHOT_FILTERS = {
  userRole: { ed: true, ag: false, ip: false, other: true },
  maritalStatus: { married: false, unmarried: true, other: true },
  rh: { '+': true, '-': false, other: true },
};

describe('дека донорки, з якої фільтр зняв AG та IP', () => {
  it('не може віддати жодної картки, хай яка велика стрічка', () => {
    // Стрічка з самих донорських анкет — саме так виглядає база: `ed` у ній
    // переважна більшість.
    const feed = Array.from({ length: 50 }, (_, index) => ({
      userId: `ed${index}`,
      role: 'ed',
      publish: true,
    })).concat([
      { userId: 'agency', role: 'ag', publish: true },
      { userId: 'parents', role: 'ip', publish: true },
    ]);

    const visible = keepDonorCounterpartyCards({
      users: applyMatchingUiFiltersToUsers({
        users: feed,
        filters: SCREENSHOT_FILTERS,
        viewMode: 'default',
      }),
      viewerRole: 'ed',
      viewerId: 'me',
    });

    expect(visible).toEqual([]);
  });

  it('упізнається як окрема причина, а не як «не знайшлось»', () => {
    expect(donorFeedRoleFilterLeavesNothing({
      viewerRole: 'ed',
      filters: SCREENSHOT_FILTERS,
    })).toBe(true);
  });

  it('мовчить там, де причина інша', () => {
    // Агенція бачить усю стрічку — правило деки донорки до неї не застосовується.
    expect(donorFeedRoleFilterLeavesNothing({
      viewerRole: 'ag',
      filters: SCREENSHOT_FILTERS,
    })).toBe(false);
    // Донорка, у якої лишився хоч один з двох чіпів.
    expect(donorFeedRoleFilterLeavesNothing({
      viewerRole: 'ed',
      filters: { userRole: { ed: false, ag: true, ip: false, other: false } },
    })).toBe(false);
    // Група, у якій нічого не знято, не звужує нічого.
    expect(donorFeedRoleFilterLeavesNothing({
      viewerRole: 'ed',
      filters: { userRole: { ed: true, ag: true, ip: true, other: true } },
    })).toBe(false);
    expect(donorFeedRoleFilterLeavesNothing({ viewerRole: 'ed', filters: {} })).toBe(false);
  });

  it('вмикає обидва чіпи назад, а не саму лише AG', () => {
    expect([...DONOR_FEED_ROLE_FILTER_KEYS]).toEqual(['ag', 'ip']);
  });
});

describe('екран порожньої деки', () => {
  const source = fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');

  it('називає цю причину перед загальним «фільтри приховали завантажене»', () => {
    const cause = source.indexOf('donorRoleFilterBlocksFeed) {');
    const generic = source.indexOf('Фільтри приховали всі завантажені профілі');
    expect(cause).toBeGreaterThan(-1);
    expect(generic).toBeGreaterThan(cause);
  });

  it('лишає на порожньому екрані жест, яким умову можна зняти', () => {
    // Кінця списку тут не видно нікому: `hasMore` закритий, спостерігач знятий,
    // і ні «Показати ще», ні відліку на цьому екрані немає.
    expect(source).toContain('onClick={restoreDonorRoleFilter}');
    expect(source).toContain("uiText('Увімкнути AG та IP', language)");
  });
});
