import fs from 'fs';
import path from 'path';

const read = name => fs.readFileSync(path.join(__dirname, name), 'utf8');

describe('matching realtime connection notice', () => {
  it('renders once before the feed-mode branch, including an empty feed', () => {
    const source = read('Matching.jsx');
    const notice = source.indexOf("{realtimeConnection === 'offline'\n");
    const feedModeBranch = source.indexOf("{viewMode === 'dislikes' && viewLayout === 'list' ? (");

    expect(notice).toBeGreaterThan(-1);
    expect(notice).toBeLessThan(feedModeBranch);
    expect(source.match(/<ConnectionNotice role="status"/g)).toHaveLength(1);
  });

  // Дві липкі плашки на тій самій висоті лягали одна на одну — тепер одна,
  // і її можна закрити до нової події.
  it('one closable notice carries both the offline and the pending lines', () => {
    const source = read('Matching.jsx');
    const notice = source.slice(source.indexOf('<ConnectionNotice role="status"'), source.indexOf('</ConnectionNotice>'));
    expect(notice).toContain('data-testid="write-outbox-pending"');
    expect(notice).toContain('<ConnectionNoticeClose');
    expect(source).toContain('outboxPendingCount > connectionNoticeDismissed.pending');
  });

  it('sticks right below what sticks above it — the nav on a phone, the top bar on wide screens', () => {
    const styles = read('Matching.styled.jsx');
    const notice = styles.slice(styles.indexOf('export const ConnectionNotice'));

    expect(notice).toContain("'calc(var(--km-top-nav-h, 0px) + max(8px, env(safe-area-inset-top)) + 46px)'");
    expect(notice).toContain("'calc(var(--km-top-nav-h, 0px) + 6px)'");
    expect(notice).toContain('z-index: 13;');
  });
});
