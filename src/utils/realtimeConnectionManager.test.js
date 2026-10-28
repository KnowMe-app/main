const mockGoOffline = jest.fn();
const mockGoOnline = jest.fn();
jest.mock('firebase/database', () => ({
  goOffline: (...args) => mockGoOffline(...args),
  goOnline: (...args) => mockGoOnline(...args),
}));

const setVisibility = state => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
};

describe('зʼєднання з базою — лише поки на стрічку дивляться', () => {
  let manager;
  let stop;
  const database = { _instanceStarted: true };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.resetModules();
    mockGoOffline.mockClear();
    mockGoOnline.mockClear();
    setVisibility('visible');
    // eslint-disable-next-line global-require
    manager = require('./realtimeConnectionManager');
    stop = manager.startRealtimeConnectionManager(database, { hiddenMs: 1000, idleMs: 5000 });
  });

  afterEach(() => {
    stop();
    jest.useRealTimers();
  });

  it('закриває зʼєднання фонової вкладки й відкриває, щойно на неї повернулись', () => {
    setVisibility('hidden');
    jest.advanceTimersByTime(999);
    expect(mockGoOffline).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(mockGoOffline).toHaveBeenCalledWith(database);
    expect(manager.getRealtimeConnectionDemand().suspended).toBe(true);

    setVisibility('visible');
    expect(mockGoOnline).toHaveBeenCalledWith(database);
    expect(manager.getRealtimeConnectionDemand().suspended).toBe(false);
  });

  it('коротка відлучка зʼєднання не чіпає', () => {
    setVisibility('hidden');
    jest.advanceTimersByTime(500);
    setVisibility('visible');
    jest.advanceTimersByTime(2000);
    expect(mockGoOffline).not.toHaveBeenCalled();
  });

  it('закриває зʼєднання екрана без дотику, а дотик його повертає', () => {
    jest.advanceTimersByTime(5000);
    expect(mockGoOffline).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event('pointerdown'));
    expect(mockGoOnline).toHaveBeenCalledTimes(1);
  });

  // Читання, поки зʼєднання призупинене, не падає, а чекає — тож програмне
  // читання відновлює його саме, не чекаючи на дотик.
  it('програмне читання відновлює призупинене зʼєднання', () => {
    jest.advanceTimersByTime(5000);
    expect(manager.getRealtimeConnectionDemand().suspended).toBe(true);
    manager.noteRealtimeDemand();
    expect(mockGoOnline).toHaveBeenCalledTimes(1);
    expect(manager.getRealtimeConnectionDemand()).toEqual({ demanded: true, suspended: false });
  });

  it('не створює сокета, якого ще немає', () => {
    stop();
    mockGoOffline.mockClear();
    const untouched = { _instanceStarted: false };
    stop = manager.startRealtimeConnectionManager(untouched, { hiddenMs: 1000, idleMs: 5000 });
    jest.advanceTimersByTime(5000);
    expect(mockGoOffline).not.toHaveBeenCalled();
  });

  it('з виходом зі стрічки зʼєднання повертається іншим екранам', () => {
    jest.advanceTimersByTime(5000);
    stop();
    expect(mockGoOnline).toHaveBeenCalledTimes(1);
    stop = () => {};
  });
});
