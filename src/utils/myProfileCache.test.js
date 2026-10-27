import { MATCHING_CACHE_TTL_MS } from './matchingCachePolicy';
import {
  MY_PROFILE_CACHE_TTL_MS,
  clearMyProfileCache,
  patchMyProfileCache,
  readFreshMyProfileCache,
  readMyProfileCache,
  writeMyProfileCache,
} from './myProfileCache';

// Справжнє сховище, а не мок: мок `localStorage` у кількох сюїтах повертає
// `null` на все (див. CLAUDE.md), і тест мовчки перевіряв би порожнечу.
describe('памʼять «Мого профілю»', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('повертає записану анкету тому самому uid і нікому іншому', () => {
    writeMyProfileCache('uid-a', { name: 'Оксана', photos: ['a.jpg'] }, 1000);
    expect(readMyProfileCache('uid-a', 2000)).toEqual({ name: 'Оксана', photos: ['a.jpg'] });
    expect(readMyProfileCache('uid-b', 2000)).toBeNull();
  });

  it('не тримає пароля й службових позначок зведення', () => {
    writeMyProfileCache('uid-a', { name: 'Оксана', password: 'secret', __photosHydrated: true }, 1000);
    expect(readMyProfileCache('uid-a', 1000)).toEqual({ name: 'Оксана' });
  });

  it('забуває анкету, старшу за тиждень', () => {
    writeMyProfileCache('uid-a', { name: 'Оксана' }, 0);
    expect(readMyProfileCache('uid-a', MY_PROFILE_CACHE_TTL_MS + 1)).toBeNull();
  });

  // Старт матчингу бере звідси роль і права й бази не питає зовсім, тож тут
  // строк загальний для кеша матчингу (шість годин), а не тиждень показу.
  it('для старту матчингу віддає анкету лише свіжою — до шести годин', () => {
    writeMyProfileCache('uid-a', { name: 'Оксана', accessLevel: 'matching:view' }, 1000);
    expect(readFreshMyProfileCache('uid-a', 1000 + MATCHING_CACHE_TTL_MS)).toEqual({ name: 'Оксана', accessLevel: 'matching:view' });
    expect(readFreshMyProfileCache('uid-a', 1001 + MATCHING_CACHE_TTL_MS)).toBeNull();
    expect(readMyProfileCache('uid-a', 1001 + MATCHING_CACHE_TTL_MS)).toEqual({ name: 'Оксана', accessLevel: 'matching:view' });
    expect(readFreshMyProfileCache('uid-b', 2000)).toBeNull();
  });

  it('дописує поле в уже збережену анкету й не заводить нової', () => {
    patchMyProfileCache('uid-a', { role: 'ag' });
    expect(readMyProfileCache('uid-a')).toBeNull();
    writeMyProfileCache('uid-a', { name: 'Оксана', role: 'ed' });
    patchMyProfileCache('uid-a', { role: 'ag' });
    expect(readMyProfileCache('uid-a')).toEqual({ name: 'Оксана', role: 'ag' });
  });

  it('вихід стирає анкети всіх акаунтів пристрою й лишає решту сховища', () => {
    writeMyProfileCache('uid-a', { name: 'A' });
    writeMyProfileCache('uid-b', { name: 'B' });
    window.localStorage.setItem('appLanguage', 'uk');
    clearMyProfileCache();
    expect(readMyProfileCache('uid-a')).toBeNull();
    expect(readMyProfileCache('uid-b')).toBeNull();
    expect(window.localStorage.getItem('appLanguage')).toBe('uk');
  });

  it('зіпсований запис — це просто відсутність кеша', () => {
    window.localStorage.setItem('km.myProfile.v1:uid-a', '{not json');
    expect(readMyProfileCache('uid-a')).toBeNull();
  });
});
