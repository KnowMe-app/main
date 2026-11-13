import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';

import { useFreshFeedStateGate } from './useFreshFeedStateGate';
import { createFeedStateReader } from '../utils/searchFeedDenial';

const rows = [{ userId: 'alive' }, { userId: 'deleted' }];

describe('useFreshFeedStateGate', () => {
  it('до свіжої відповіді картки з кешу не показує, після — лише дозволені', async () => {
    const reader = createFeedStateReader(async id => ({ feedDate: id === 'deleted' ? false : '2026-10-01' }));
    const { result } = renderHook(() => useFreshFeedStateGate(rows, { reader }));
    expect(result.current.rows).toEqual([]);
    expect(result.current.pendingCount).toBe(2);
    await waitFor(() => expect(result.current.pendingCount).toBe(0));
    expect(result.current.rows.map(row => row.userId)).toEqual(['alive']);
  });

  it('стан, уже записаний сторінкою з бази, не читається вдруге', () => {
    const read = jest.fn();
    const reader = createFeedStateReader(read);
    reader.prime('alive', { feedDate: '2026-10-01' });
    reader.prime('deleted', { feedDate: false });
    const { result } = renderHook(() => useFreshFeedStateGate(rows, { reader }));
    expect(result.current.rows.map(row => row.userId)).toEqual(['alive']);
    expect(read).not.toHaveBeenCalled();
  });

  it('вимкнена перевірка (стрічка адміна) показує все як є', () => {
    const reader = createFeedStateReader(jest.fn());
    const { result } = renderHook(() => useFreshFeedStateGate(rows, { reader, enabled: false }));
    expect(result.current.rows).toBe(rows);
  });

  it('прочитані стани віддає до того, як рядки відкриються', async () => {
    const reader = createFeedStateReader(async id => ({ feedDate: '2026-10-01', card: { name: id } }));
    const seen = [];
    let hook;
    const onFreshStates = jest.fn(states => { seen.push(hook.result.current.rows.length); return states; });
    hook = renderHook(() => useFreshFeedStateGate(rows, { reader, onFreshStates }));
    await waitFor(() => expect(hook.result.current.pendingCount).toBe(0));
    expect(onFreshStates).toHaveBeenCalledTimes(1);
    expect(Object.keys(onFreshStates.mock.calls[0][0]).sort()).toEqual(['alive', 'deleted']);
    expect(onFreshStates.mock.calls[0][0].alive.card).toEqual({ name: 'alive' });
    // У ту мить рядки ще сховані.
    expect(seen).toEqual([0]);
  });

  it('поки журнал змін не прочитано (ready: false), картки не читаються', async () => {
    const read = jest.fn(async () => ({ feedDate: '2026-10-01' }));
    const reader = createFeedStateReader(read);
    const { result, rerender } = renderHook(({ ready }) => useFreshFeedStateGate(rows, { reader, ready }), {
      initialProps: { ready: false },
    });
    expect(result.current.rows).toEqual([]);
    expect(read).not.toHaveBeenCalled();
    rerender({ ready: true });
    await waitFor(() => expect(result.current.pendingCount).toBe(0));
    expect(read).toHaveBeenCalledTimes(2);
  });

  // Без мережі перевірка чекає на сесію, журнал і тайм-аут читання, і стрічка
  // стояла скелетоном, хоча дека лежала на пристрої (13.11, телефон).
  it('стеля очікування показує картки, а пізній стан схованої її ховає', async () => {
    jest.useFakeTimers();
    try {
      let answer;
      const reader = createFeedStateReader(() => new Promise(resolve => { answer = resolve; }));
      const { result } = renderHook(() => useFreshFeedStateGate([{ userId: 'deleted' }], { reader, maxWaitMs: 3000 }));
      expect(result.current.rows).toEqual([]);
      act(() => { jest.advanceTimersByTime(3000); });
      expect(result.current.rows.map(row => row.userId)).toEqual(['deleted']);
      await act(async () => { answer({ feedDate: false }); });
      expect(result.current.rows).toEqual([]);
    } finally {
      jest.useRealTimers();
    }
  });

  it('картку, показану стелею до журналу, читає, щойно журнал готовий', async () => {
    jest.useFakeTimers();
    try {
      const read = jest.fn(async id => ({ feedDate: id === 'deleted' ? false : '2026-10-01' }));
      const reader = createFeedStateReader(read);
      const { result, rerender } = renderHook(({ ready }) => useFreshFeedStateGate(rows, { reader, ready, maxWaitMs: 3000 }), {
        initialProps: { ready: false },
      });
      act(() => { jest.advanceTimersByTime(3000); });
      expect(result.current.rows.map(row => row.userId)).toEqual(['alive', 'deleted']);
      expect(read).not.toHaveBeenCalled();
      rerender({ ready: true });
      expect(read).toHaveBeenCalledTimes(2);
      await waitFor(() => expect(result.current.rows.map(row => row.userId)).toEqual(['alive']));
    } finally {
      jest.useRealTimers();
    }
  });

  // Прибирання ефекту колись ставило «розмонтовано», і повторне монтування
  // (подвійне в режимі розробки) відкидало відповідь назавжди.
  it('у StrictMode відповідь не губиться', async () => {
    const reader = createFeedStateReader(async () => ({ feedDate: '2026-10-01' }));
    const { result } = renderHook(() => useFreshFeedStateGate(rows, { reader, maxWaitMs: 0 }), {
      wrapper: ({ children }) => <React.StrictMode>{children}</React.StrictMode>,
    });
    await waitFor(() => expect(result.current.pendingCount).toBe(0));
    expect(result.current.rows.map(row => row.userId)).toEqual(['alive', 'deleted']);
  });
});
