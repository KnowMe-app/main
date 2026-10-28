import { MATCHING_CACHE_TTL_MS } from './matchingCachePolicy';
import {
  clearContactsCache,
  forgetProfileContacts,
  readFreshProfileContacts,
  writeProfileContacts,
} from './matchingContactsCache';

describe('контакти анкет у памʼяті пристрою', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('свіжі контакти читаються, протухлі — ні', () => {
    writeProfileContacts('viewer', 'card', { allowed: true, contacts: { phone: '380' } }, { now: 1000 });
    expect(readFreshProfileContacts('viewer', 'card', { now: 2000 })).toEqual({ allowed: true, contacts: { phone: '380' } });
    expect(readFreshProfileContacts('viewer', 'card', { now: 1001 + MATCHING_CACHE_TTL_MS })).toBeNull();
  });

  // «Закрито» — теж відповідь бази, і памʼятається так само; контактів при
  // ній не лежить, хай що передали.
  it('памʼятає й відмову, без контактів', () => {
    writeProfileContacts('viewer', 'card', { allowed: false, contacts: { phone: '380' } });
    expect(readFreshProfileContacts('viewer', 'card')).toEqual({ allowed: false, contacts: null });
  });

  it('привʼязаний до читача', () => {
    writeProfileContacts('viewer', 'card', { allowed: true, contacts: { phone: '380' } });
    expect(readFreshProfileContacts('other', 'card')).toBeNull();
  });

  it('правка контактів картки знімає її запис у всіх читачів', () => {
    writeProfileContacts('viewer', 'card', { allowed: true, contacts: { phone: '380' } });
    writeProfileContacts('other', 'card', { allowed: true, contacts: { phone: '380' } });
    writeProfileContacts('viewer', 'card2', { allowed: true, contacts: { phone: '381' } });
    forgetProfileContacts('card');
    expect(readFreshProfileContacts('viewer', 'card')).toBeNull();
    expect(readFreshProfileContacts('other', 'card')).toBeNull();
    expect(readFreshProfileContacts('viewer', 'card2')).not.toBeNull();
  });

  it('вихід з акаунта стирає все', () => {
    writeProfileContacts('viewer', 'card', { allowed: true, contacts: { phone: '380' } });
    clearContactsCache();
    expect(readFreshProfileContacts('viewer', 'card')).toBeNull();
  });
});
