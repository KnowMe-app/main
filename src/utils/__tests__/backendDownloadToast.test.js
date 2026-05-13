const ADMIN_UID = '3LiD7JGCJTSJoVMU7fdR1ZrcIZH2';
const BACKEND_TRAFFIC_TEST_UID = 'vtDxkDMjCwYuTDqTUnZsO29bpQr1';

const loadTracker = () => {
  jest.resetModules();
  const toast = jest.fn();
  toast.success = jest.fn();
  toast.error = jest.fn();
  jest.doMock('react-hot-toast', () => ({ __esModule: true, default: toast }));
  const tracker = require('../backendDownloadToast');
  return { tracker, toast };
};

const resetWindowTrackerState = () => {
  delete window.backendTrafficStats;
  delete window.__backendTrafficTrackerRuntime;
  delete window.__getBackendDownloadToastUid;
  delete window.__BACKEND_TRAFFIC_SILENT_MODE;
};

describe('backendDownloadToast admin traffic tracker', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    resetWindowTrackerState();
    jest.spyOn(console, 'table').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.dontMock('react-hot-toast');
    resetWindowTrackerState();
    jest.restoreAllMocks();
  });

  it('does not estimate payloads or show toasts for non-admin users', () => {
    const { tracker, toast } = loadTracker();
    window.__getBackendDownloadToastUid = () => 'regular-user';

    tracker.recordAdminBackendTraffic(
      {
        exists: () => true,
        val: () => {
          throw new Error('payload estimation should not run');
        },
      },
      { operation: 'get', source: 'Matching', path: 'users' },
    );

    jest.advanceTimersByTime(1000);

    expect(window.backendTrafficStats).toBeUndefined();
    expect(toast).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('tracks payloads for the matching test user', () => {
    const { tracker, toast } = loadTracker();
    window.__getBackendDownloadToastUid = () => BACKEND_TRAFFIC_TEST_UID;

    tracker.recordAdminBackendTraffic(
      { exists: () => true, val: () => ({ name: 'Matching test payload' }) },
      { operation: 'get', source: 'Matching', path: 'users/test-user' },
    );
    jest.advanceTimersByTime(1000);

    expect(window.backendTrafficStats.summary({ log: false }).totals.actualRequestCount).toBe(1);
    expect(toast.success).toHaveBeenCalledWith(
      expect.stringContaining('[Matching] Backend get users/test-user'),
      expect.objectContaining({ icon: '📦' }),
    );
  });

  it('collects stats while silent mode suppresses toast output', () => {
    const { tracker, toast } = loadTracker();
    window.__getBackendDownloadToastUid = () => ADMIN_UID;
    window.__BACKEND_TRAFFIC_SILENT_MODE = true;

    tracker.recordAdminBackendTraffic(
      { exists: () => true, val: () => ({ name: 'Admin payload' }) },
      { operation: 'get', source: 'AddNewProfile', path: 'newUsers' },
    );
    jest.advanceTimersByTime(1000);

    const summary = window.backendTrafficStats.summary({ log: false });
    expect(summary.totals.actualRequestCount).toBe(1);
    expect(summary.totals.estimatedPayloadBytes).toBeGreaterThan(0);
    expect(toast).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('returns a JSON-friendly export object with repeated request analytics', () => {
    const { tracker } = loadTracker();
    window.__getBackendDownloadToastUid = () => ADMIN_UID;

    tracker.recordAdminBackendTraffic(
      { exists: () => true, val: () => ({ count: 1 }) },
      { operation: 'getDocs', source: 'ProfileForm', path: 'searchKey' },
    );
    jest.advanceTimersByTime(300);
    tracker.recordAdminBackendTraffic(
      { exists: () => true, val: () => ({ count: 2 }) },
      { operation: 'getDocs', source: 'ProfileForm', path: 'searchKey' },
    );

    const exported = window.backendTrafficStats.export();
    expect(exported.exportedAt).toEqual(expect.any(String));
    expect(exported.totals.startedAt).toEqual(expect.any(String));
    expect(exported.totals.lastResetAt).toEqual(expect.any(String));
    expect(exported.topRepeatedRequests[0]).toMatchObject({
      source: 'ProfileForm',
      operation: 'getDocs',
      path: 'searchKey',
    });
    expect(() => JSON.stringify(exported)).not.toThrow();
  });

  it('tracks onValue subscriptions and ignores duplicate unsubscribe calls', () => {
    const { tracker } = loadTracker();
    window.__getBackendDownloadToastUid = () => ADMIN_UID;
    const rawUnsubscribe = jest.fn();
    const rawOnValue = jest.fn((target, callback) => {
      callback({ exists: () => true, val: () => ({ ready: true }) });
      return rawUnsubscribe;
    });
    const wrappedOnValue = tracker.wrapAdminOnValue(rawOnValue, {
      operation: 'onValue',
      source: 'Matching',
    });

    const unsubscribe = wrappedOnValue('multiData/favorites', jest.fn());
    expect(window.backendTrafficStats.activeSubscriptions).toBe(1);

    unsubscribe();
    unsubscribe();

    expect(rawUnsubscribe).toHaveBeenCalledTimes(1);
    expect(window.backendTrafficStats.activeSubscriptions).toBe(0);
    expect(window.backendTrafficStats.subscriptionEvents.map(event => event.type)).toEqual(['start', 'end']);
  });

  it('does not wrap an already wrapped onValue function twice', () => {
    const { tracker } = loadTracker();
    const rawOnValue = jest.fn(() => jest.fn());
    const once = tracker.wrapAdminOnValue(rawOnValue, { source: 'Matching' });
    const twice = tracker.wrapAdminOnValue(once, { source: 'Matching' });

    expect(twice).toBe(once);
  });
});
