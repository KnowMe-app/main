import { resolveOnlineRecovery } from './feedOnlineRecovery';

describe('що повторити, коли звʼязок повернувся', () => {
  it('порожня стрічка з помилкою — заново, але не з колекції чи пошуку', () => {
    expect(resolveOnlineRecovery({ mode: 'default', loadError: {}, hasRows: false })).toBe('reload-default');
    expect(resolveOnlineRecovery({ mode: 'favorites', loadError: {}, hasRows: false })).toBeNull();
    expect(resolveOnlineRecovery({ mode: 'search', loadError: {}, hasRows: false })).toBeNull();
  });

  it('відмова хвоста дочитується й без кнопки «Показати ще»', () => {
    expect(resolveOnlineRecovery({ mode: 'default', hasRows: true, deckHasMore: true, showFeedRetry: false, tailFailed: true })).toBe('retry-tail');
    expect(resolveOnlineRecovery({ mode: 'default', hasRows: true, deckHasMore: true, showFeedRetry: true })).toBe('retry-tail');
  });

  it('без відмови, без хвоста чи в пошуку — нічого', () => {
    expect(resolveOnlineRecovery({ mode: 'default', hasRows: true, deckHasMore: true })).toBeNull();
    expect(resolveOnlineRecovery({ mode: 'default', hasRows: true, deckHasMore: false, tailFailed: true })).toBeNull();
    expect(resolveOnlineRecovery({ mode: 'search', hasRows: true, deckHasMore: true, tailFailed: true })).toBeNull();
  });
});
