import { startVersionWatcher } from './versionCheck';

describe('startVersionWatcher', () => {
  const flush = () => new Promise(resolve => setTimeout(resolve, 0));

  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    delete global.fetch;
    jest.restoreAllMocks();
  });

  it('does not report a new version on the first check - it just records the baseline', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ buildId: 'v1' }) });
    const onNewVersion = jest.fn();

    const stop = startVersionWatcher(onNewVersion);
    await flush();

    expect(onNewVersion).not.toHaveBeenCalled();
    stop();
  });

  it('reports a new version once the tab becomes visible again and version.json has changed', async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ buildId: 'v1' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ buildId: 'v2' }) });
    const onNewVersion = jest.fn();

    const stop = startVersionWatcher(onNewVersion);
    await flush();
    expect(onNewVersion).not.toHaveBeenCalled();

    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();

    expect(onNewVersion).toHaveBeenCalledTimes(1);
    stop();
  });

  it('does not report anything when version.json is unchanged on a later check', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ buildId: 'v1' }) });
    const onNewVersion = jest.fn();

    const stop = startVersionWatcher(onNewVersion);
    await flush();

    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();

    expect(onNewVersion).not.toHaveBeenCalled();
    stop();
  });

  it('only reports once even if the tab is refocused multiple times after a new version appears', async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ buildId: 'v1' }) })
      .mockResolvedValue({ ok: true, json: async () => ({ buildId: 'v2' }) });
    const onNewVersion = jest.fn();

    const stop = startVersionWatcher(onNewVersion);
    await flush();

    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
    window.dispatchEvent(new Event('focus'));
    await flush();

    expect(onNewVersion).toHaveBeenCalledTimes(1);
    stop();
  });

  it('silently ignores network/parse failures instead of throwing', async () => {
    global.fetch.mockRejectedValue(new Error('offline'));
    const onNewVersion = jest.fn();

    expect(() => startVersionWatcher(onNewVersion)).not.toThrow();
    await flush();

    expect(onNewVersion).not.toHaveBeenCalled();
  });

  it('stops listening once the returned cleanup function is called', async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ buildId: 'v1' }) })
      .mockResolvedValue({ ok: true, json: async () => ({ buildId: 'v2' }) });
    const onNewVersion = jest.fn();

    const stop = startVersionWatcher(onNewVersion);
    await flush();
    stop();

    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();

    expect(onNewVersion).not.toHaveBeenCalled();
  });
});
