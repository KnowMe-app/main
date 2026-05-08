import { shouldUseServerComment } from '../commentsStorage';

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
});
