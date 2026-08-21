import {
  PHOTO_URL_CACHE_TTL_MS,
  clearPhotoUrlCache,
  getCachedPhotoUrls,
  getCachedPhotoUrlsMap,
  setCachedPhotoUrls,
} from '../photoUrlCache';

describe('photoUrlCache', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.restoreAllMocks();
  });

  it('повертає збережені URL і переживає перезавантаження сторінки', () => {
    setCachedPhotoUrls('user-1', ['https://a', 'https://b']);
    expect(getCachedPhotoUrls('user-1')).toEqual(['https://a', 'https://b']);
    // Модуль не тримає стану в памʼяті — читання йде з localStorage.
    expect(JSON.parse(localStorage.getItem('matchingPhotoUrls'))['user-1'].urls).toEqual(['https://a', 'https://b']);
  });

  it('відрізняє «фото немає» від «не кешовано»', () => {
    setCachedPhotoUrls('user-1', []);
    expect(getCachedPhotoUrls('user-1')).toEqual([]);
    expect(getCachedPhotoUrls('user-2')).toBeNull();
  });

  it('не віддає протухлі записи', () => {
    setCachedPhotoUrls('user-1', ['https://a']);
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + PHOTO_URL_CACHE_TTL_MS + 1);
    expect(getCachedPhotoUrls('user-1')).toBeNull();
  });

  it('читає пачку id одним проходом і пропускає некешовані', () => {
    setCachedPhotoUrls('user-1', ['https://a']);
    setCachedPhotoUrls('user-2', []);
    expect(getCachedPhotoUrlsMap(['user-1', 'user-2', 'user-3'])).toEqual({
      'user-1': ['https://a'],
      'user-2': [],
    });
  });

  it('переживає зіпсований або недоступний localStorage', () => {
    localStorage.setItem('matchingPhotoUrls', 'не json');
    expect(getCachedPhotoUrls('user-1')).toBeNull();

    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => setCachedPhotoUrls('user-1', ['https://a'])).not.toThrow();
  });

  it('чистить кеш повністю', () => {
    setCachedPhotoUrls('user-1', ['https://a']);
    clearPhotoUrlCache();
    expect(getCachedPhotoUrls('user-1')).toBeNull();
  });
});
