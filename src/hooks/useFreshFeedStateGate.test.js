import { renderHook, waitFor } from '@testing-library/react';

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
});
