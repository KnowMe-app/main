import { act, renderHook } from '@testing-library/react';

const mockListeners = [];
jest.mock('firebase/database', () => ({
  ref: (_db, path) => path,
  onValue: (_ref, callback) => {
    mockListeners.push(callback);
    return () => {};
  },
}));
jest.mock('../components/config', () => ({ database: {} }));

const { useRealtimeConnection } = require('./useRealtimeConnection');

const emit = connected => act(() => mockListeners.forEach(listener => listener({ val: () => connected })));

describe('стан звʼязку з базою', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockListeners.length = 0;
  });
  afterEach(() => jest.useRealTimers());

  it('не кричить «немає звʼязку», поки перше зʼєднання ще встигає', () => {
    const { result } = renderHook(() => useRealtimeConnection({ grace: 5000, blip: 2000 }));
    emit(false);
    act(() => { jest.advanceTimersByTime(2000); });
    expect(result.current).toBe('pending');
    act(() => { jest.advanceTimersByTime(2000); });
    expect(result.current).toBe('pending');
    emit(true);
    expect(result.current).toBe('online');
  });

  it('не замінює початковий grace коротшим таймером обриву', () => {
    const { result } = renderHook(() => useRealtimeConnection({ grace: 5000, blip: 2000 }));
    emit(false);
    act(() => { jest.advanceTimersByTime(2000); });
    expect(result.current).toBe('pending');
    act(() => { jest.advanceTimersByTime(3000); });
    expect(result.current).toBe('offline');
  });

  it('каже «немає звʼязку», коли зʼєднання так і не зʼявилось', () => {
    const { result } = renderHook(() => useRealtimeConnection({ grace: 5000, blip: 2000 }));
    act(() => { jest.advanceTimersByTime(5000); });
    expect(result.current).toBe('offline');
    emit(true);
    expect(result.current).toBe('online');
  });

  it('пропускає коротке моргання мережі, але не довгий обрив', () => {
    const { result } = renderHook(() => useRealtimeConnection({ grace: 5000, blip: 2000 }));
    emit(true);
    emit(false);
    act(() => { jest.advanceTimersByTime(1000); });
    emit(true);
    act(() => { jest.advanceTimersByTime(5000); });
    expect(result.current).toBe('online');
    emit(false);
    act(() => { jest.advanceTimersByTime(2000); });
    expect(result.current).toBe('offline');
  });
});
