import {
  COMMENTS_TTL_MS,
  getCachedComment,
  loadComments,
  saveComments,
  setLocalComment,
  shouldUseServerComment,
} from '../commentsStorage';

describe('commentsStorage owner-scoped cache', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.spyOn(Date, 'now').mockReturnValue(10_000);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('keeps comments separated by owner', () => {
    setLocalComment('owner-a', 'card-1', 'own text', 100);
    setLocalComment('owner-b', 'card-1', 'shared text', 200);

    expect(getCachedComment('owner-a', 'card-1').text).toBe('own text');
    expect(getCachedComment('owner-b', 'card-1').text).toBe('shared text');
  });

  it('caches empty comments per owner', () => {
    setLocalComment('owner-a', 'card-1', '', 100);

    expect(getCachedComment('owner-a', 'card-1')).toMatchObject({
      text: '',
      empty: true,
    });
  });

  it('expires entries after the matching comments TTL', () => {
    saveComments({
      'owner-a': {
        'card-1': { text: 'fresh enough', lastAction: 1, cachedAt: 10_000 },
        'card-2': { text: 'stale', lastAction: 1, cachedAt: 10_000 - COMMENTS_TTL_MS - 1 },
      },
    });

    expect(loadComments()['owner-a']).toHaveProperty('card-1');
    expect(loadComments()['owner-a']).not.toHaveProperty('card-2');
  });
});

describe('shouldUseServerComment', () => {
  it('keeps a newer local comment instead of replacing it with stale server data', () => {
    const local = { text: 'fresh local edit', lastAction: 2000 };
    const server = { text: 'stale server text', lastAction: 1000 };

    expect(shouldUseServerComment(server, local)).toBe(false);
  });

  it('uses a server comment only when it is newer than the local cache', () => {
    const local = { text: 'old local text', lastAction: 1000 };
    const server = { text: 'fresh server text', lastAction: 2000 };

    expect(shouldUseServerComment(server, local)).toBe(true);
  });

  it('uses the server comment when there is no local cache', () => {
    const server = { text: 'server text', lastAction: 1000 };

    expect(shouldUseServerComment(server, undefined)).toBe(true);
  });

  it('does not overwrite a newer empty local edit with older server data', () => {
    const local = { text: '', lastAction: 2000, empty: true };
    const server = { text: 'old server text', lastAction: 1000 };

    expect(shouldUseServerComment(server, local)).toBe(false);
  });
});
