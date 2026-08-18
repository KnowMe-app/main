export const INITIAL_MATCHING_REQUEST_TIMEOUT_MS = 10 * 1000;

const MATCHING_INITIAL_REQUEST_LABELS = new Set([
  'reaction-snapshots',
  'index-cache-read',
  'access-profile',
  'search-key-sets',
  'search-index',
  'profile-hydration',
  'source-chunk',
  'source-page-read',
  'ui-filtering',
]);

const sanitizeMatchingDiagnosticText = value => String(value || '')
  .replace(/([?&](?:token|auth|key|email|uid)=)[^&\s]+/gi, '$1[redacted]')
  .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[redacted-email]')
  .slice(0, 500);

const getMatchingErrorCode = error => {
  const code = [error?.code, error?.cause?.code, error?.errorInfo?.code]
    .map(value => String(value || '').trim())
    .find(Boolean)
    || (/PERMISSION_DENIED/i.test(error?.message || '') ? 'permission-denied' : '');
  return /^[a-z0-9/_-]{1,80}$/i.test(code) ? code : 'matching/unknown';
};

export const annotateMatchingStageError = (error, stage) => {
  const annotated = error instanceof Error
    ? error
    : new Error(String(error?.message || error || `Matching request failed at ${stage}`), { cause: error });
  const inheritedCode = getMatchingErrorCode(error);
  if (!annotated.code && inheritedCode !== 'matching/unknown') annotated.code = inheritedCode;
  if (!annotated.code) {
    if (annotated.name === 'TypeError') annotated.code = 'matching/type-error';
    else if (/indexeddb|idb/i.test(`${annotated.name} ${annotated.message}`)) annotated.code = 'matching/indexeddb-error';
    else if (/network|offline|failed to fetch/i.test(annotated.message || '')) annotated.code = 'matching/network-error';
    else annotated.code = 'matching/unknown';
  }
  if (!annotated.requestLabel) annotated.requestLabel = stage;
  if (!annotated.stage) annotated.stage = annotated.requestLabel;
  return annotated;
};

export const normalizeMatchingInitialLoadError = (error, context = {}) => {
  const cause = error?.cause && typeof error.cause === 'object' ? error.cause : null;
  const code = getMatchingErrorCode(error);
  const candidateRequestLabel = String(error?.requestLabel || error?.stage || context.requestLabel || '').trim();
  const requestLabel = MATCHING_INITIAL_REQUEST_LABELS.has(candidateRequestLabel) ? candidateRequestLabel : 'unknown';
  const collectionSource = String(context.collectionSource || 'unknown');
  const viewMode = String(context.viewMode || 'unknown');
  const ownerId = String(context.ownerId || 'unknown');
  const normalizedCode = code.toLowerCase().replace(/_/g, '-');
  const originalMessage = sanitizeMatchingDiagnosticText(error?.message || cause?.message || 'Unexpected Matching load error');
  const name = sanitizeMatchingDiagnosticText(error?.name || cause?.name || 'Error');
  let message = originalMessage;
  let userMessage = `Помилка на етапі ${requestLabel} (${code}). Відкрийте технічні деталі.`;

  if (code === 'matching/initial-request-timeout') {
    userMessage = `Таймаут на етапі ${requestLabel}`;
    message = originalMessage || 'Initial request timed out';
  } else if (normalizedCode.includes('permission-denied')) {
    userMessage = `Немає доступу до ${collectionSource} на етапі ${requestLabel} (permission-denied)`;
    message = originalMessage || 'Permission denied';
  } else if (normalizedCode.includes('unavailable')) {
    userMessage = `Сервіс ${collectionSource} тимчасово недоступний на етапі ${requestLabel}`;
    message = 'Firebase service unavailable';
  } else if (normalizedCode.includes('failed-precondition') || /index/i.test(error?.message || '')) {
    userMessage = `Для ${collectionSource} відсутній потрібний індекс на етапі ${requestLabel}`;
    message = 'Required Firebase index is unavailable';
  } else if (normalizedCode.includes('network-error') || /network|offline|failed to fetch/i.test(`${code} ${error?.message || ''}`)) {
    userMessage = `Помилка мережі на етапі ${requestLabel} під час завантаження ${collectionSource}`;
    message = 'Network request failed';
  } else if (normalizedCode === 'matching/type-error') {
    userMessage = `Помилка обробки даних на етапі ${requestLabel}. Відкрийте технічні деталі.`;
  }

  return {
    code,
    name,
    message,
    requestLabel,
    collectionSource,
    viewMode,
    ownerId,
    online: typeof navigator === 'undefined' ? null : navigator.onLine,
    timestamp: new Date().toISOString(),
    userMessage,
  };
};

export const runInitialRequestWithTimeout = (request, label, timeoutMs = INITIAL_MATCHING_REQUEST_TIMEOUT_MS) => {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      const error = new Error(`Matching initial request timed out after ${timeoutMs}ms: ${label}`);
      error.code = 'matching/initial-request-timeout';
      error.requestLabel = label;
      reject(error);
    }, timeoutMs);
  });

  const stagedRequest = Promise.resolve().then(request).catch(error => {
    throw annotateMatchingStageError(error, label);
  });
  return Promise.race([stagedRequest, timeout]).finally(() => clearTimeout(timeoutId));
};
