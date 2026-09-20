import { renderHook, act } from '@testing-library/react';
import { useHardwareBackClose } from './useHardwareBackClose';

// jsdom тримає справжню історію, але `popstate` на `history.back()` шле
// асинхронно й не завжди; подію тут кидаємо самі — перевіряємо реакцію на
// жест, а не реалізацію навігації в jsdom.
const pressHardwareBack = () => {
  act(() => {
    window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
  });
};

describe('useHardwareBackClose', () => {
  it('відкритий шар кладе в історію рівно один запис', () => {
    const before = window.history.length;

    const { rerender } = renderHook(({ open }) => useHardwareBackClose(open, jest.fn(), 'testLayer'), {
      initialProps: { open: true },
    });
    rerender({ open: true });
    rerender({ open: true });

    expect(window.history.state).toEqual({ testLayer: true });
    expect(window.history.length).toBe(before + 1);
  });

  it('апаратна кнопка «назад» закриває шар', () => {
    const onClose = jest.fn();
    renderHook(() => useHardwareBackClose(true, onClose, 'testLayer'));

    pressHardwareBack();

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('другий жест уже не закриває нічого: запис знято першим', () => {
    const onClose = jest.fn();
    renderHook(() => useHardwareBackClose(true, onClose, 'testLayer'));

    pressHardwareBack();
    pressHardwareBack();

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('закритий шар історію не чіпає', () => {
    const before = window.history.length;

    renderHook(() => useHardwareBackClose(false, jest.fn(), 'testLayer'));

    expect(window.history.length).toBe(before);
  });

  it('шар, закритий кнопкою, знімає власний запис історії', () => {
    const backSpy = jest.spyOn(window.history, 'back').mockImplementation(() => {});

    const { rerender } = renderHook(({ open }) => useHardwareBackClose(open, jest.fn(), 'testLayer'), {
      initialProps: { open: true },
    });
    rerender({ open: false });

    expect(backSpy).toHaveBeenCalledTimes(1);
    backSpy.mockRestore();
  });

  it('після апаратного «назад» запис не знімається вдруге', () => {
    const backSpy = jest.spyOn(window.history, 'back').mockImplementation(() => {});
    const { rerender } = renderHook(({ open }) => useHardwareBackClose(open, jest.fn(), 'testLayer'), {
      initialProps: { open: true },
    });

    pressHardwareBack();
    rerender({ open: false });

    expect(backSpy).not.toHaveBeenCalled();
    backSpy.mockRestore();
  });
});
