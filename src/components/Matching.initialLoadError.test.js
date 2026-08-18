const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');
const section = (startText, endText) => {
  const start = source.indexOf(startText);
  return source.slice(start, source.indexOf(endText, start));
};

describe('Matching initial loading error state', () => {
  it('puts a pending initial request through a five-second warning and a bounded timeout', () => {
    jest.useFakeTimers();
    expect(source).toContain("const INITIAL_MATCHING_REQUEST_TIMEOUT_MS = 10 * 1000;");
    expect(source).toContain("}, 5000);");
    expect(source).toContain("id: 'matching-slow-load'");
    expect(source).toContain("error.code = 'matching/initial-request-timeout'");
    jest.advanceTimersByTime(5000);
    jest.useRealTimers();
  });

  it('turns Firebase and timeout rejections into a stable error toast and non-skeleton error UI', () => {
    const reporter = section('  const reportInitialLoadError', '  const resetReactionPaginationState');
    expect(reporter).toContain("toast.error('Не вдалося завантажити профілі.");
    expect(reporter).toContain('id: INITIAL_LOAD_ERROR_TOAST_ID');
    expect(source).toContain(') : loadError ? (');
    expect(source).toContain('role="alert"');
    expect(source).toContain('Спробувати ще раз');
  });

  it('clears the error and launches the existing loader on retry', () => {
    const retry = section('  const reloadDefault = React.useCallback', '  const handleFiltersChange');
    expect(retry).toContain('setLoadError(null);');
    expect(retry).toContain('loadInitial();');
  });

  it('does not let a stale initial request finish a newer request', () => {
    const initial = section('  const loadInitial = React.useCallback', '  const reloadDefault');
    expect(initial).toContain('initialRequest === initialRequestIdRef.current');
    expect(initial).toContain('loadInitialVersion === loadInitialVersionRef.current && initialRequest === initialRequestIdRef.current');
    const additional = section('    const loadAdditionalNewUsers = async () => {', '    loadAdditionalNewUsers();');
    expect(additional).toContain('isLatestAdditionalFetch() && initialRequest === initialRequestIdRef.current');
    expect(additional).toContain('loadingStateRef.current = false;');
  });
});
