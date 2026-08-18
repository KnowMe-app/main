const fs = require('fs');
const path = require('path');
const {
  INITIAL_MATCHING_REQUEST_TIMEOUT_MS,
  annotateMatchingStageError,
  normalizeMatchingInitialLoadError,
  runInitialRequestWithTimeout,
} = require('../utils/matchingLoadError');

const source = fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');
const section = (startText, endText) => {
  const start = source.indexOf(startText);
  return source.slice(start, source.indexOf(endText, start));
};

const context = {
  collectionSource: 'users',
  viewMode: 'default',
  ownerId: 'viewer-id',
};

describe('Matching initial loading error diagnostics', () => {
  it.each([
    {
      title: 'Firebase permission errors',
      error: Object.assign(new Error('Permission denied'), { code: 'PERMISSION_DENIED' }),
      stage: 'source-page-read',
      expectedCode: 'PERMISSION_DENIED',
      expectedMessage: 'Немає доступу до users на етапі source-page-read',
    },
    {
      title: 'missing Firebase indexes',
      error: Object.assign(new Error('Index not defined'), { code: 'failed-precondition' }),
      stage: 'search-index',
      expectedCode: 'failed-precondition',
      expectedMessage: 'відсутній потрібний індекс на етапі search-index',
    },
    {
      title: 'network errors',
      error: new Error('Failed to fetch'),
      stage: 'source-page-read',
      expectedCode: 'matching/network-error',
      expectedMessage: 'Помилка мережі на етапі source-page-read',
    },
    {
      title: 'type errors',
      error: new TypeError('Cannot read properties of undefined'),
      stage: 'ui-filtering',
      expectedCode: 'matching/type-error',
      expectedMessage: 'Помилка обробки даних на етапі ui-filtering',
    },
    {
      title: 'ordinary errors without a code',
      error: new Error('Unexpected data shape'),
      stage: 'profile-hydration',
      expectedCode: 'matching/unknown',
      expectedMessage: 'Помилка на етапі profile-hydration (matching/unknown)',
    },
  ])('reports $title with an actionable stage', ({ error, stage, expectedCode, expectedMessage }) => {
    const annotated = annotateMatchingStageError(error, stage);
    const diagnostic = normalizeMatchingInitialLoadError(annotated, context);

    expect(diagnostic).toEqual(expect.objectContaining({
      code: expectedCode,
      requestLabel: stage,
      collectionSource: 'users',
    }));
    expect(diagnostic.userMessage).toContain(expectedMessage);
    expect(diagnostic.userMessage).not.toBe('Не вдалося завантажити users (matching/unknown)');
  });

  it('inherits a useful Firebase code from the error cause', () => {
    const error = new Error('Matching request failed', {
      cause: Object.assign(new Error('Backend rejected the read'), { code: 'database/permission-denied' }),
    });
    const diagnostic = normalizeMatchingInitialLoadError(
      annotateMatchingStageError(error, 'profile-hydration'),
      context,
    );

    expect(diagnostic.code).toBe('database/permission-denied');
    expect(diagnostic.userMessage).toContain('Немає доступу до users на етапі profile-hydration');
  });

  it('sanitizes sensitive values in technical details', () => {
    const error = new Error('Request failed for test@example.com?token=secret');
    const diagnostic = normalizeMatchingInitialLoadError(
      annotateMatchingStageError(error, 'source-page-read'),
      context,
    );

    expect(diagnostic.message).toContain('[redacted-email]');
    expect(diagnostic.message).toContain('token=[redacted]');
    expect(diagnostic.message).not.toContain('test@example.com');
    expect(diagnostic.message).not.toContain('secret');
  });

  it('rejects a pending request with a labelled bounded timeout', async () => {
    jest.useFakeTimers();
    const pendingRequest = runInitialRequestWithTimeout(
      () => new Promise(() => {}),
      'search-index',
      25,
    );
    jest.advanceTimersByTime(25);

    await expect(pendingRequest).rejects.toEqual(expect.objectContaining({
      code: 'matching/initial-request-timeout',
      requestLabel: 'search-index',
    }));
    jest.useRealTimers();
    expect(INITIAL_MATCHING_REQUEST_TIMEOUT_MS).toBe(10 * 1000);
  });

  it('keeps one stable error toast and replaces the skeleton with an actionable error UI', () => {
    const reporter = section('  const reportInitialLoadError', '  const resetReactionPaginationState');
    const errorUi = section('            ) : loadError ? (', '            ) : (');

    expect(reporter).toContain('toast.error(diagnostic.userMessage');
    expect(reporter).toContain('id: INITIAL_LOAD_ERROR_TOAST_ID');
    expect(errorUi).toContain('role="alert"');
    expect(errorUi).toContain('{loadError.userMessage}');
    expect(errorUi).toContain('Етап: {loadError.requestLabel}');
    expect(errorUi).toContain('Спробувати ще раз');
    expect(errorUi).toContain('JSON.stringify(loadError, null, 2)');
  });

  it('retries through the existing initial loader and guards stale requests', () => {
    const retry = section('  const reloadDefault = React.useCallback', '  const handleFiltersChange');
    const initial = section('  const loadInitial = React.useCallback', '  const reloadDefault');

    expect(retry).toContain('setLoadError(null);');
    expect(retry).toContain('loadInitial();');
    expect(initial).toContain('initialRequest === initialRequestIdRef.current');
    expect(initial).toContain('loadInitialVersion === loadInitialVersionRef.current && initialRequest === initialRequestIdRef.current');
  });
});
