import {
  buildSearchIdRecordKey,
  normalizeSearchIdInput,
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
