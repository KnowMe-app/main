import fs from 'fs';
import path from 'path';

const read = name => fs.readFileSync(path.join(__dirname, name), 'utf8');

describe('matching realtime connection notice', () => {
  it('renders once before the feed-mode branch, including an empty feed', () => {
    const source = read('Matching.jsx');
    const notice = source.indexOf("{realtimeConnection === 'offline' && (");
    const feedModeBranch = source.indexOf("{viewMode === 'dislikes' && viewLayout === 'list' ? (");

    expect(notice).toBeGreaterThan(-1);
    expect(notice).toBeLessThan(feedModeBranch);
    expect(source.match(/<ConnectionNotice role="status">/g)).toHaveLength(1);
  });

  it('sticks immediately below the safe-area-aware top bar', () => {
    const styles = read('Matching.styled.jsx');
    const notice = styles.slice(styles.indexOf('export const ConnectionNotice'));

    expect(notice).toContain('top: calc(max(8px, env(safe-area-inset-top)) + 46px);');
    expect(notice).toContain('z-index: 13;');
  });
});
