import {
  buildSearchIdRecordKey,
  normalizeSearchIdInput,
  buildSearchIdCandidateKeys,
  getSearchIdPrefixes,
} from './searchKeyUtils';

const youtubeChannelId = 'UC4LwxzuzRqwSpa1A64eziDQ';

describe('searchKeyUtils YouTube normalization', () => {
  it('keeps YouTube route-prefixed URL searches aligned with stored channel paths', () => {
    expect(normalizeSearchIdInput('youtube', `https://www.youtube.com/channel/${youtubeChannelId}`))
      .toBe(`channel/${youtubeChannelId}`);
    expect(buildSearchIdRecordKey({ youtube: `https://www.youtube.com/channel/${youtubeChannelId}` }))
      .toBe(`youtube_channel_slash_${youtubeChannelId.toLowerCase()}`);
    expect(buildSearchIdRecordKey({ youtube: `channel/${youtubeChannelId}` }))
      .toBe(`youtube_channel_slash_${youtubeChannelId.toLowerCase()}`);
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
  it('builds only the exact selected telegram key when variants are disabled', () => {
    const normalized = normalizeSearchIdInput('telegram', 'УК СМ ALIA 09.10.2025');

    expect(buildSearchIdCandidateKeys(normalized, 'УК СМ ALIA 09.10.2025', ['telegram'], {
      includeVariants: false,
      includePrefixMatches: false,
    })).toEqual(['telegram_ук см alia 09.10.2025']);
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
