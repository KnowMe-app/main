import {
  appendSearchIdEntryId,
  buildSearchIdCandidateKeys,
  buildSearchIdRecordKey,
  describeSearchIdRecord,
  getSearchIdPrefixes,
  normalizeExactSearchIdInput,
  normalizeSearchIdInput,
  readSearchIdEntryIds,
  readSearchIdEntryMatches,
  removeSearchIdEntryId,
} from './searchKeyUtils';

const youtubeChannelId = 'UC4LwxzuzRqwSpa1A64eziDQ';

describe('searchKeyUtils YouTube normalization', () => {
  it('keeps YouTube route-prefixed URL searches aligned with stored channel paths', () => {
    expect(normalizeSearchIdInput('youtube', `https://www.youtube.com/channel/${youtubeChannelId}`))
      .toBe(`channel/${youtubeChannelId}`);
    // Ключ — саме значення; поле віддає `describeSearchIdRecord` окремо.
    expect(buildSearchIdRecordKey({ youtube: `https://www.youtube.com/channel/${youtubeChannelId}` }))
      .toBe(`channel_slash_${youtubeChannelId.toLowerCase()}`);
    expect(buildSearchIdRecordKey({ youtube: `channel/${youtubeChannelId}` }))
      .toBe(`channel_slash_${youtubeChannelId.toLowerCase()}`);
  });

  it('keeps YouTube c and user route prefixes while still normalizing handles', () => {
    expect(normalizeSearchIdInput('youtube', 'https://youtube.com/c/KnowMeOfficial?view=videos'))
      .toBe('c/KnowMeOfficial');
    expect(normalizeSearchIdInput('youtube', 'https://m.youtube.com/user/KnowMeOfficial#about'))
      .toBe('user/KnowMeOfficial');
    expect(normalizeSearchIdInput('youtube', 'https://www.youtube.com/@KnowMeOfficial'))
      .toBe('KnowMeOfficial');
    expect(normalizeSearchIdInput('youtube', 'youtube: channel/UC4LwxzuzRqwSpa1A64eziDQ'))
      .toBe('channel/UC4LwxzuzRqwSpa1A64eziDQ');
  });
});


describe('searchKeyUtils exact searchId behavior', () => {
  it('builds only the exact key when variants are disabled', () => {
    const normalized = normalizeSearchIdInput('telegram', 'УК СМ ALIA 09.10.2025');

    expect(buildSearchIdCandidateKeys(normalized, 'УК СМ ALIA 09.10.2025', {
      includeVariants: false,
      includePrefixMatches: false,
    })).toEqual(['ук см alia 09.10.2025']);
  });
});

describe('форма запису індексу', () => {
  it('поле живе в значенні, а не в ключі', () => {
    expect(describeSearchIdRecord({ phone: '+38 067 111 22 33' })).toEqual({
      field: 'phone',
      valueKey: '380671112233',
      path: 'searchId/380671112233/phone',
    });
  });

  it('одне читання віддає всі поля значення — і те, яким збіглось', () => {
    const entry = { name: 'AA0001', surname: ['AA0002', 'AA0003'] };

    expect(readSearchIdEntryIds(entry)).toEqual(['AA0001', 'AA0002', 'AA0003']);
    // Звуження до поля — це фільтр уже прочитаного, а не окремий запит.
    expect(readSearchIdEntryIds(entry, ['surname'])).toEqual(['AA0002', 'AA0003']);
    expect(readSearchIdEntryMatches(entry, ['name'])).toEqual([{ id: 'AA0001', field: 'name' }]);
  });

  it('запис у старій формі читається далі — під час переходу лежать обидві', () => {
    expect(readSearchIdEntryIds('AA0001')).toEqual(['AA0001']);
    expect(readSearchIdEntryIds(['AA0001', 'AA0002'])).toEqual(['AA0001', 'AA0002']);
    // Поля в такому записі немає, тож назвати його нічим — але губити знайдене
    // гірше, ніж віддати без назви поля.
    expect(readSearchIdEntryMatches(['AA0001'])).toEqual([{ id: 'AA0001', field: '' }]);
  });

  it('id дописується і знімається без чужих втрат', () => {
    expect(appendSearchIdEntryId(null, 'AA0001')).toBe('AA0001');
    expect(appendSearchIdEntryId('AA0001', 'AA0002')).toEqual(['AA0001', 'AA0002']);
    expect(appendSearchIdEntryId(['AA0001', 'AA0002'], 'AA0002')).toEqual(['AA0001', 'AA0002']);
    expect(removeSearchIdEntryId(['AA0001', 'AA0002'], 'AA0001')).toBe('AA0002');
    expect(removeSearchIdEntryId('AA0001', 'AA0001')).toBeNull();
  });

  it('нормалізація бере поле, яке розпізнав SearchBar', () => {
    // Раніше нормалізація вмикалась тільки на одному вибраному полі, тобто на
    // звичайному пошуку не вмикалась ніколи — і телефон із пробілами не
    // знаходився.
    expect(normalizeExactSearchIdInput('+38 067 111 22 33', undefined, 'phone')).toBe('380671112233');
    expect(normalizeExactSearchIdInput('https://ameblo.jp/knowme-official', undefined, 'ameblo'))
      .toBe('knowme-official');
    expect(normalizeExactSearchIdInput('Ольга  Іванівна')).toBe('Ольга Іванівна');
  });
});

describe('getSearchIdPrefixes', () => {
  it('keeps searchId prefix search scoped to explicitly selected keys', () => {
    expect(getSearchIdPrefixes(['telegram'])).toEqual(['telegram']);
    expect(getSearchIdPrefixes(['telegram', 'phone'])).toEqual(['phone', 'telegram']);
  });

  it('does not fall back to every searchId prefix for an explicit empty selection', () => {
    expect(getSearchIdPrefixes([])).toEqual([]);
    expect(getSearchIdPrefixes(['unknownKey'])).toEqual([]);
  });

  it('keeps the legacy all-prefixes fallback only when no explicit key list is provided', () => {
    expect(getSearchIdPrefixes()).toEqual(expect.arrayContaining(['phone', 'telegram', 'instagram']));
  });
});
