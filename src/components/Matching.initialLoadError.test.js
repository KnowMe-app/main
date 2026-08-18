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
    expect(reporter).toContain('toast.error(diagnostic.userMessage');
    expect(reporter).toContain('id: INITIAL_LOAD_ERROR_TOAST_ID');
    expect(reporter).toContain("console.error({ event: 'Matching.initialLoadError', ...diagnosticWithTrace })");
    expect(source).toContain(') : loadError ? (');
    expect(source).toContain('role="alert"');
    expect(source).toContain('Спробувати ще раз');
  });

  it('gives permission, search-index timeout, and unknown failures distinct safe messages', () => {
    const normalizer = section('export const normalizeMatchingInitialLoadError', 'export const runInitialRequestWithTimeout');
    expect(normalizer).toContain('Немає доступу до');
    expect(normalizer).toContain('(permission-denied)');
    expect(normalizer).toContain('Таймаут на етапі');
    expect(normalizer).toContain('Не вдалося завантажити');
    expect(normalizer).toContain("error?.requestLabel || error?.stage || context.requestLabel");
    expect(normalizer).toContain('MATCHING_INITIAL_REQUEST_LABELS.has(candidateRequestLabel)');
    expect(normalizer).toContain("message = originalMessage || 'Permission denied'");
    expect(normalizer).toContain('const originalMessage = sanitizeMatchingDiagnosticText');
    expect(source).toContain("}), 'search-index');");
  });

  it('annotates ordinary request failures with their stage and preserves useful safe details', () => {
    const annotator = section('export const annotateMatchingStageError', 'export const normalizeMatchingInitialLoadError');
    const runner = section('export const runInitialRequestWithTimeout', 'const ADDITIONAL_MATCHING_LOG_LIMIT');
    expect(annotator).toContain("annotated.name === 'TypeError'");
    expect(annotator).toContain("annotated.code = 'matching/type-error'");
    expect(annotator).toContain('if (!annotated.requestLabel) annotated.requestLabel = stage');
    expect(runner).toContain('annotateMatchingStageError(error, label)');
    expect(source).toContain("'reaction-snapshots'");
  });

  it('renders copyable technical details without copying raw errors or sensitive profile data', () => {
    const errorUi = section('            ) : loadError ? (', '            ) : (');
    expect(errorUi).toContain('Технічні деталі');
    expect(errorUi).toContain('Етап: {loadError.requestLabel}');
    expect(errorUi).toContain('Код: {loadError.code}');
    expect(errorUi).toContain('Повідомлення: {loadError.message}');
    expect(errorUi).toContain('Trace:');
    expect(errorUi).toContain("toast.success('Діагностику скопійовано')");
    expect(errorUi).toContain('JSON.stringify(loadError, null, 2)');
    expect(errorUi).not.toContain('token');
    expect(errorUi).not.toContain('profile');
    const reporter = section('  const reportInitialLoadError', '  const resetReactionPaginationState');
    expect(reporter).not.toContain('JSON.stringify(error)');
    expect(reporter).not.toContain('toast.error(error');
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
