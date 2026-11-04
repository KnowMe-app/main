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
});
