import toast from 'react-hot-toast';
import { isAdminUid } from './accessLevel';

export const ENABLE_BACKEND_TRAFFIC_TOAST = true;
export const BACKEND_TRAFFIC_SILENT_MODE = false;
export const BACKEND_TRAFFIC_AUTO_CONSOLE_SUMMARY = false;
export const BACKEND_DOWNLOAD_TOASTS_STORAGE_KEY = 'backendDownloadSizeToastsEnabled';
export const BACKEND_TRAFFIC_TRACKING_TEST_UID = 'vtDxkDMjCwYuTDqTUnZsO29bpQr1';
const BACKEND_TRAFFIC_EXTRA_TRACKED_UIDS = [BACKEND_TRAFFIC_TRACKING_TEST_UID];

const TOAST_GROUP_DELAY_MS = 750;
const TOAST_DURATION_MS = 5000;
const CONSOLE_SUMMARY_DELAY_MS = 15000;
const DEDUPE_WINDOW_MS = 250;
const SAMPLE_MIN_INTERVAL_MS = 1000;
const TRACK_EVERY_N_REQUEST = 3;
const LARGE_PAYLOAD_BYTES = 1024 * 1024;
const CRITICAL_PAYLOAD_BYTES = 5 * 1024 * 1024;
const MAX_RECENT_REQUESTS = 100;
const MAX_TRACKED_KEYS = 500;
const MAX_ESTIMATE_NODES = 1200;
const MAX_ESTIMATE_DEPTH = 6;
const MAX_STRING_BYTES = 2048;
const OBJECT_OVERHEAD_BYTES = 16;
const ARRAY_OVERHEAD_BYTES = 12;
const PROPERTY_OVERHEAD_BYTES = 4;
const WRAPPED_ON_VALUE_FLAG = Symbol.for('knowme.backendTraffic.wrapAdminOnValue');

const formatRows = rows => (Array.isArray(rows) ? rows : []);

const getStoredBackendDownloadToastsEnabled = () => {
  if (typeof localStorage === 'undefined') return true;

  const storedValue = localStorage.getItem(BACKEND_DOWNLOAD_TOASTS_STORAGE_KEY);
  return storedValue !== 'false';
};

export const getBackendDownloadToastsEnabled = () => {
  if (BACKEND_TRAFFIC_SILENT_MODE) return false;

  if (typeof window !== 'undefined' && typeof window.__BACKEND_TRAFFIC_SILENT_MODE === 'boolean') {
    return !window.__BACKEND_TRAFFIC_SILENT_MODE;
  }

  return getStoredBackendDownloadToastsEnabled();
};

export const setBackendDownloadToastsEnabled = enabled => {
  const normalizedEnabled = Boolean(enabled);

  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(BACKEND_DOWNLOAD_TOASTS_STORAGE_KEY, normalizedEnabled ? 'true' : 'false');
  }

  if (typeof window !== 'undefined') {
    window.__BACKEND_TRAFFIC_SILENT_MODE = !normalizedEnabled;
  }

  return normalizedEnabled;
};


export const formatBytes = bytes => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.max(kb, 0.01).toFixed(kb >= 100 ? 0 : kb >= 10 ? 1 : 2)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
};

const getNowIso = () => new Date().toISOString();

const createInitialStats = () => {
  const startedAt = getNowIso();

  return {
    startedAt,
    lastResetAt: startedAt,
    estimatedPayloadBytes: 0,
    actualRequestCount: 0,
    totalBytes: 0,
    totalRequests: 0,
    estimatedRequestCount: 0,
    sampledRequestCount: 0,
    dedupedRequestCount: 0,
    byOperation: {},
    byPath: {},
    bySource: {},
    byRequestKey: {},
    activeSubscriptions: 0,
    subscriptionEvents: [],
    largestRequest: null,
    recentRequests: [],
    reset() {
      this.lastResetAt = getNowIso();
      this.estimatedPayloadBytes = 0;
      this.actualRequestCount = 0;
      this.totalBytes = 0;
      this.totalRequests = 0;
      this.estimatedRequestCount = 0;
      this.sampledRequestCount = 0;
      this.dedupedRequestCount = 0;
      this.byOperation = {};
      this.byPath = {};
      this.bySource = {};
      this.byRequestKey = {};
      this.activeSubscriptions = 0;
      this.subscriptionEvents = [];
      this.largestRequest = null;
      this.recentRequests = [];
    },
    summary({ log = true } = {}) {
      const operationRows = Object.entries(this.byOperation).map(([operation, data]) => ({
        operation,
        actualRequests: data.actualRequestCount,
        estimatedRequests: data.estimatedRequestCount,
        total: formatBytes(data.estimatedPayloadBytes),
        avgKbPerRequest: Number(((data.estimatedPayloadBytes / Math.max(data.actualRequestCount, 1)) / 1024).toFixed(2)),
        largest: formatBytes(data.largestBytes || 0),
      }));
      const topHeaviestPaths = Object.entries(this.byPath)
        .sort(([, a], [, b]) => b.estimatedPayloadBytes - a.estimatedPayloadBytes)
        .slice(0, 10)
        .map(([path, data]) => ({
          path,
          actualRequests: data.actualRequestCount,
          total: formatBytes(data.estimatedPayloadBytes),
          largest: formatBytes(data.largestBytes || 0),
        }));
      const topSpammedSources = Object.entries(this.bySource)
        .sort(([, a], [, b]) => b.actualRequestCount - a.actualRequestCount)
        .slice(0, 10)
        .map(([source, data]) => ({
          source,
          actualRequests: data.actualRequestCount,
          total: formatBytes(data.estimatedPayloadBytes),
          avgKbPerRequest: Number(((data.estimatedPayloadBytes / Math.max(data.actualRequestCount, 1)) / 1024).toFixed(2)),
        }));
      const largestOperations = Object.entries(this.byOperation)
        .sort(([, a], [, b]) => (b.largestBytes || 0) - (a.largestBytes || 0))
        .slice(0, 10)
        .map(([operation, data]) => ({
          operation,
          largest: formatBytes(data.largestBytes || 0),
          actualRequests: data.actualRequestCount,
          total: formatBytes(data.estimatedPayloadBytes),
        }));
      const topRepeatedRequests = Object.entries(this.byRequestKey)
        .sort(([, a], [, b]) => b.actualRequestCount - a.actualRequestCount)
        .slice(0, 10)
        .map(([key, data]) => ({
          key,
          source: data.source,
          operation: data.operation,
          path: data.path,
          actualRequests: data.actualRequestCount,
          estimatedRequests: data.estimatedRequestCount,
          total: formatBytes(data.estimatedPayloadBytes),
        }));
      const durationMs = Math.max(Date.now() - Date.parse(this.lastResetAt || this.startedAt || getNowIso()), 1);
      const durationHours = durationMs / 36e5;

      if (log && typeof console !== 'undefined' && console.table) {
        console.table(formatRows(operationRows));
        console.table(formatRows(topHeaviestPaths));
        console.table(formatRows(topSpammedSources));
        console.table(formatRows(topRepeatedRequests));
      }

      return {
        totals: {
          actualRequestCount: this.actualRequestCount,
          estimatedRequestCount: this.estimatedRequestCount,
          estimatedPayloadBytes: this.estimatedPayloadBytes,
          estimatedPayload: formatBytes(this.estimatedPayloadBytes),
          sampledRequestCount: this.sampledRequestCount,
          dedupedRequestCount: this.dedupedRequestCount,
          activeSubscriptions: this.activeSubscriptions,
          startedAt: this.startedAt,
          lastResetAt: this.lastResetAt,
          durationMs,
          trafficPerHour: formatBytes(this.estimatedPayloadBytes / Math.max(durationHours, 1 / 3600)),
          requestsPerHour: Number((this.actualRequestCount / Math.max(durationHours, 1 / 3600)).toFixed(2)),
        },
        byOperation: operationRows,
        topHeaviestPaths,
        topSpammedSources,
        largestOperations,
        topRepeatedRequests,
        activeSubscriptions: this.activeSubscriptions,
        subscriptionEvents: this.subscriptionEvents,
        largestRequest: this.largestRequest,
      };
    },
    export() {
      return {
        exportedAt: getNowIso(),
        ...this.summary({ log: false }),
        recentRequests: [...this.recentRequests],
      };
    },
  };
};

const createRuntime = () => ({
  pendingToast: null,
  pendingToastTimer: null,
  lastConsoleSummaryAt: 0,
  lastSeenByKey: new Map(),
  samplingByKey: new Map(),
});

const cleanupRuntime = runtime => {
  if (runtime?.pendingToastTimer) clearTimeout(runtime.pendingToastTimer);
  if (runtime) {
    runtime.pendingToast = null;
    runtime.pendingToastTimer = null;
  }
};

const getRuntime = () => {
  if (typeof window === 'undefined') return moduleRuntime;
  if (window.__backendTrafficTrackerRuntime) return window.__backendTrafficTrackerRuntime;
  window.__backendTrafficTrackerRuntime = createRuntime();
  return window.__backendTrafficTrackerRuntime;
};

let moduleRuntime = createRuntime();

if (typeof window !== 'undefined') {
  cleanupRuntime(window.__backendTrafficTrackerRuntime);
  window.__backendTrafficTrackerRuntime = createRuntime();
}

export const cleanupBackendTrafficTracker = () => cleanupRuntime(getRuntime());

const getStats = () => {
  if (typeof window === 'undefined') return createInitialStats();
  if (!window.backendTrafficStats) window.backendTrafficStats = createInitialStats();
  return window.backendTrafficStats;
};

const getDefaultUid = () => {
  if (typeof window === 'undefined') return null;
  return window.__getBackendDownloadToastUid?.() || null;
};

const shouldTrack = getUid => {
  if (!ENABLE_BACKEND_TRAFFIC_TOAST) return false;
  try {
    const uid = typeof getUid === 'function' ? getUid() : getUid;
    return isAdminUid(uid) || BACKEND_TRAFFIC_EXTRA_TRACKED_UIDS.includes(uid);
  } catch (error) {
    return false;
  }
};

const getStringByteLength = value => {
  const text = String(value ?? '');
  const sliced = text.length > MAX_STRING_BYTES ? text.slice(0, MAX_STRING_BYTES) : text;
  const bytes = typeof TextEncoder !== 'undefined'
    ? new TextEncoder().encode(sliced).length
    : unescape(encodeURIComponent(sliced)).length;
  if (text.length <= MAX_STRING_BYTES) return bytes;
  return Math.round((bytes / sliced.length) * text.length);
};

const estimateValueBytes = (value, state = { nodes: 0 }, depth = 0) => {
  if (value === null || value === undefined) return 4;
  if (state.nodes >= MAX_ESTIMATE_NODES || depth > MAX_ESTIMATE_DEPTH) return OBJECT_OVERHEAD_BYTES;
  state.nodes += 1;

  const type = typeof value;
  if (type === 'string') return getStringByteLength(value);
  if (type === 'number') return 8;
  if (type === 'boolean') return 4;
  if (type !== 'object') return getStringByteLength(value);

  if (Array.isArray(value)) {
    return value.reduce(
      (sum, item) => sum + estimateValueBytes(item, state, depth + 1),
      ARRAY_OVERHEAD_BYTES,
    );
  }

  return Object.entries(value).reduce(
    (sum, [key, item]) => sum + getStringByteLength(key) + PROPERTY_OVERHEAD_BYTES + estimateValueBytes(item, state, depth + 1),
    OBJECT_OVERHEAD_BYTES,
  );
};

const estimateSnapshotBytes = result => {
  if (!result) return 0;

  if (typeof result.val === 'function') {
    return result.exists?.() === false ? 0 : estimateValueBytes(result.val());
  }

  if (typeof result.data === 'function') {
    return result.exists?.() === false ? 0 : estimateValueBytes(result.data());
  }

  if (Array.isArray(result.docs)) {
    return result.docs.reduce((sum, doc) => {
      const data = typeof doc.data === 'function' ? doc.data() : doc;
      return sum + estimateValueBytes(data);
    }, ARRAY_OVERHEAD_BYTES);
  }

  if (Array.isArray(result.items) || Array.isArray(result.prefixes)) {
    const itemsBytes = (result.items || []).reduce(
      (sum, item) => sum + getStringByteLength(item.fullPath || item.name || ''),
      ARRAY_OVERHEAD_BYTES,
    );
    const prefixesBytes = (result.prefixes || []).reduce(
      (sum, item) => sum + getStringByteLength(item.fullPath || item.name || ''),
      ARRAY_OVERHEAD_BYTES,
    );
    return itemsBytes + prefixesBytes;
  }

  return estimateValueBytes(result);
};

export const getBackendPath = target => {
  if (!target) return 'unknown';
  if (typeof target === 'string') return target;
  if (target.path) return target.path;
  if (target.fullPath) return `storage/${target.fullPath}`;
  if (target._path?.segments) return target._path.segments.join('/');
  if (target._query?.path?.segments) return target._query.path.segments.join('/');
  if (target._delegate) return getBackendPath(target._delegate);
  if (typeof target.toString === 'function') {
    const raw = target.toString();
    if (raw && raw !== '[object Object]') {
      try {
        const url = new URL(raw);
        return decodeURIComponent(url.pathname.replace(/^\//, '')) || raw;
      } catch (error) {
        return raw;
      }
    }
  }
  return 'unknown';
};

const getSeverity = bytes => {
  if (bytes >= CRITICAL_PAYLOAD_BYTES) return 'critical';
  if (bytes >= LARGE_PAYLOAD_BYTES) return 'warning';
  return 'normal';
};

const getRequestKey = request => `${request.source}|${request.operation}|${request.path}`;
const getDedupeKey = request => `${getRequestKey(request)}|${request.signature || ''}`;

const makeMessage = request => {
  const source = request.source ? `[${request.source}] ` : '';
  const severity = getSeverity(request.bytes);
  const prefix = severity === 'critical' ? 'CRITICAL PAYLOAD ' : severity === 'warning' ? 'LARGE PAYLOAD ' : 'Backend ';
  return `${source}${prefix}${request.operation} ${request.path}: ${formatBytes(request.bytes)}`;
};

const incrementBucket = (bucket, key, { actual = 0, estimated = 0, bytes = 0, meta = {} } = {}) => {
  const normalizedKey = key || 'unknown';
  const data = bucket[normalizedKey] || {
    actualRequestCount: 0,
    estimatedRequestCount: 0,
    estimatedPayloadBytes: 0,
    largestBytes: 0,
    ...meta,
  };
  data.actualRequestCount += actual;
  data.estimatedRequestCount += estimated;
  data.estimatedPayloadBytes += bytes;
  data.largestBytes = Math.max(data.largestBytes || 0, bytes || 0);
  bucket[normalizedKey] = data;
};

const updateActualStats = request => {
  const stats = getStats();
  stats.actualRequestCount += 1;
  stats.totalRequests = stats.actualRequestCount;
  incrementBucket(stats.byOperation, request.operation, { actual: 1 });
  incrementBucket(stats.byPath, request.path, { actual: 1 });
  incrementBucket(stats.bySource, request.source || 'unknown', { actual: 1 });
  incrementBucket(stats.byRequestKey, getRequestKey(request), {
    actual: 1,
    meta: { source: request.source || 'unknown', operation: request.operation, path: request.path },
  });
  pruneObjectBucket(stats.byRequestKey);
  return stats;
};

const updateEstimatedStats = (request, stats) => {
  stats.estimatedPayloadBytes += request.bytes;
  stats.totalBytes = stats.estimatedPayloadBytes;
  stats.estimatedRequestCount += 1;
  incrementBucket(stats.byOperation, request.operation, { estimated: 1, bytes: request.bytes });
  incrementBucket(stats.byPath, request.path, { estimated: 1, bytes: request.bytes });
  incrementBucket(stats.bySource, request.source || 'unknown', { estimated: 1, bytes: request.bytes });
  incrementBucket(stats.byRequestKey, getRequestKey(request), {
    estimated: 1,
    bytes: request.bytes,
    meta: { source: request.source || 'unknown', operation: request.operation, path: request.path },
  });
  if (!stats.largestRequest || request.bytes > stats.largestRequest.bytes) stats.largestRequest = request;
  stats.recentRequests.push(request);
  if (stats.recentRequests.length > MAX_RECENT_REQUESTS) {
    stats.recentRequests.splice(0, stats.recentRequests.length - MAX_RECENT_REQUESTS);
  }
  return stats;
};

const pruneMap = map => {
  if (map.size <= MAX_TRACKED_KEYS) return;
  const firstKey = map.keys().next().value;
  if (firstKey) map.delete(firstKey);
};

const pruneObjectBucket = bucket => {
  const keys = Object.keys(bucket);
  if (keys.length <= MAX_TRACKED_KEYS) return;
  delete bucket[keys[0]];
};

const isDuplicateDevRequest = (runtime, request) => {
  const key = getDedupeKey(request);
  const now = Date.now();
  const lastAt = runtime.lastSeenByKey.get(key);
  runtime.lastSeenByKey.set(key, now);
  pruneMap(runtime.lastSeenByKey);
  return Boolean(lastAt && now - lastAt <= DEDUPE_WINDOW_MS);
};

const shouldEstimateAndToast = (runtime, request) => {
  const key = getRequestKey(request);
  const now = Date.now();
  const state = runtime.samplingByKey.get(key) || { count: 0, lastEstimatedAt: 0 };
  state.count += 1;
  const shouldEstimate =
    state.count <= TRACK_EVERY_N_REQUEST ||
    state.count % TRACK_EVERY_N_REQUEST === 1 ||
    now - state.lastEstimatedAt >= SAMPLE_MIN_INTERVAL_MS;
  if (shouldEstimate) state.lastEstimatedAt = now;
  runtime.samplingByKey.set(key, state);
  pruneMap(runtime.samplingByKey);
  return shouldEstimate;
};

const isSilentMode = () => !getBackendDownloadToastsEnabled();

const scheduleToast = request => {
  if (isSilentMode()) return;
  const runtime = getRuntime();
  runtime.pendingToast = runtime.pendingToast || { bytes: 0, requests: 0, sources: new Set(), operations: new Set(), lastRequest: null, maxSeverity: 'normal' };
  runtime.pendingToast.bytes += request.bytes;
  runtime.pendingToast.requests += 1;
  if (request.source) runtime.pendingToast.sources.add(request.source);
  runtime.pendingToast.operations.add(request.operation);
  runtime.pendingToast.lastRequest = request;
  const severity = getSeverity(request.bytes);
  if (severity === 'critical' || (severity === 'warning' && runtime.pendingToast.maxSeverity === 'normal')) {
    runtime.pendingToast.maxSeverity = severity;
  }

  if (runtime.pendingToastTimer) return;
  runtime.pendingToastTimer = setTimeout(() => {
    const batch = runtime.pendingToast;
    runtime.pendingToast = null;
    runtime.pendingToastTimer = null;
    if (!batch) return;
    const isSingleRequest = batch.requests === 1;
    const sources = [...batch.sources].slice(0, 3).join(', ');
    const operations = [...batch.operations].slice(0, 4).join('/');
    const groupedContext = [sources && `[${sources}${batch.sources.size > 3 ? ', …' : ''}]`, operations]
      .filter(Boolean)
      .join(' ');
    const message = isSingleRequest
      ? makeMessage(batch.lastRequest)
      : `Backend traffic${groupedContext ? ` ${groupedContext}` : ''}: ${formatBytes(batch.bytes)} (${batch.requests} tracked / sampled requests)`;
    const toastFn = batch.maxSeverity === 'critical' ? toast.error : batch.maxSeverity === 'warning' ? toast : toast.success;
    toastFn(message, { duration: TOAST_DURATION_MS, icon: batch.maxSeverity === 'normal' ? '📦' : '⚠️' });
  }, TOAST_GROUP_DELAY_MS);
};

const maybeLogConsoleSummary = stats => {
  if (!BACKEND_TRAFFIC_AUTO_CONSOLE_SUMMARY) return;
  if (typeof console === 'undefined' || !console.table) return;
  const runtime = getRuntime();
  const now = Date.now();
  if (now - runtime.lastConsoleSummaryAt < CONSOLE_SUMMARY_DELAY_MS) return;
  runtime.lastConsoleSummaryAt = now;
  stats.summary();
};

const makeRequestShell = ({ operation = 'get', source = '', path = 'unknown' } = {}) => ({
  operation,
  source,
  path: getBackendPath(path),
  at: getNowIso(),
});

export const recordAdminBackendTraffic = (result, options = {}) => {
  const { getUid = getDefaultUid } = options;
  if (!shouldTrack(getUid)) return;

  try {
    const runtime = getRuntime();
    const requestShell = makeRequestShell(options);
    requestShell.signature = result?.key || result?.size || result?.docs?.length || result?.items?.length || '';

    if (isDuplicateDevRequest(runtime, requestShell)) {
      getStats().dedupedRequestCount += 1;
      return;
    }

    const stats = updateActualStats(requestShell);
    if (!shouldEstimateAndToast(runtime, requestShell)) {
      stats.sampledRequestCount += 1;
      return;
    }

    const request = {
      ...requestShell,
      bytes: estimateSnapshotBytes(result),
    };
    updateEstimatedStats(request, stats);
    scheduleToast(request);
    maybeLogConsoleSummary(stats);
  } catch (error) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('Backend traffic tracking failed', error);
    }
  }
};

const recordSubscriptionEvent = (type, request) => {
  const stats = getStats();
  stats.activeSubscriptions = Math.max(0, stats.activeSubscriptions + (type === 'start' ? 1 : -1));
  stats.subscriptionEvents.push({
    type,
    source: request.source || 'unknown',
    operation: request.operation,
    path: request.path,
    at: getNowIso(),
    activeSubscriptions: stats.activeSubscriptions,
  });
  if (stats.subscriptionEvents.length > MAX_RECENT_REQUESTS) {
    stats.subscriptionEvents.splice(0, stats.subscriptionEvents.length - MAX_RECENT_REQUESTS);
  }
};

const trackSubscriptionStart = options => {
  if (!shouldTrack(options.getUid || getDefaultUid)) return null;
  try {
    const request = makeRequestShell(options);
    recordSubscriptionEvent('start', request);
    return request;
  } catch (error) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('Backend subscription tracking failed', error);
    }
    return null;
  }
};

const trackSubscriptionEnd = request => {
  if (!request) return;
  try {
    recordSubscriptionEvent('end', request);
  } catch (error) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('Backend subscription cleanup tracking failed', error);
    }
  }
};

export const withAdminDownloadToast = async (promise, options = {}) => {
  const result = await promise;
  recordAdminBackendTraffic(result, options);
  return result;
};

export const wrapAdminOnValue = (onValueFn, options = {}) => {
  if (onValueFn?.[WRAPPED_ON_VALUE_FLAG]) return onValueFn;

  const wrappedOnValue = (target, callback, cancelCallbackOrOptions, optionsArg) => {
    const trackingOptions = {
      ...options,
      operation: options.operation || 'onValue',
      path: options.path || target,
    };
    const trackedCallback = snapshot => {
      recordAdminBackendTraffic(snapshot, trackingOptions);
      return callback(snapshot);
    };

    let unsubscribe;
    if (optionsArg !== undefined) {
      unsubscribe = onValueFn(target, trackedCallback, cancelCallbackOrOptions, optionsArg);
    } else if (cancelCallbackOrOptions !== undefined) {
      unsubscribe = onValueFn(target, trackedCallback, cancelCallbackOrOptions);
    } else {
      unsubscribe = onValueFn(target, trackedCallback);
    }

    if (typeof unsubscribe !== 'function') return unsubscribe;
    const subscriptionRequest = trackSubscriptionStart(trackingOptions);
    let didUnsubscribe = false;
    return (...unsubscribeArgs) => {
      if (didUnsubscribe) return undefined;
      didUnsubscribe = true;
      trackSubscriptionEnd(subscriptionRequest);
      return unsubscribe(...unsubscribeArgs);
    };
  };

  wrappedOnValue[WRAPPED_ON_VALUE_FLAG] = true;
  return wrappedOnValue;
};
