import '@testing-library/jest-dom';
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import FeedLoadCountdown from './FeedLoadCountdown';

const advance = ms => act(() => { jest.advanceTimersByTime(ms); });

describe('FeedLoadCountdown', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const renderCountdown = (props = {}) => render(
    <FeedLoadCountdown durationMs={10000} batchSize={2} cycleKey={0} onElapsed={() => {}} {...props} />,
  );

  const dial = () => screen.getByTestId('feed-load-countdown-dial').textContent;

  it('починає з повних десяти секунд і показує мілісекунди', () => {
    renderCountdown();
    expect(dial()).toBe('10.000');
  });

  it('відраховує назад рівними кроками', () => {
    renderCountdown();
    advance(2500);
    expect(dial()).toBe('07.500');
    advance(7000);
    expect(dial()).toBe('00.500');
  });

  it('не міняє ширину рядка на переході через десяту секунду', () => {
    // Секунди доповнені нулем: інакше «10.000» і «9.950» різної довжини, і на
    // цьому переході циферблат смикався вбік.
    renderCountdown();
    const atStart = dial().length;
    advance(100);
    expect(dial()).toBe('09.900');
    expect(dial()).toHaveLength(atStart);
  });

  it('просить наступну порцію рівно один раз, коли дійшов нуля', () => {
    const onElapsed = jest.fn();
    renderCountdown({ onElapsed });

    advance(9950);
    expect(onElapsed).not.toHaveBeenCalled();

    advance(50);
    expect(onElapsed).toHaveBeenCalledTimes(1);
  });

  it('не заводиться наново сам — наступна порція коштує новий жест', () => {
    // Раніше відлік перезапускався сам, і достатньо було лишити вкладку в кінці
    // списку, щоб картки їхали нескінченно без участі читача.
    const onElapsed = jest.fn();
    renderCountdown({ onElapsed });

    advance(10000);
    expect(onElapsed).toHaveBeenCalledTimes(1);

    advance(60000);
    expect(onElapsed).toHaveBeenCalledTimes(1);
  });

  it('перезапускає відлік, коли стрічка виросла на порцію', () => {
    const onElapsed = jest.fn();
    const { rerender } = renderCountdown({ onElapsed, cycleKey: 5 });
    advance(8000);
    expect(dial()).toBe('02.000');

    rerender(
      <FeedLoadCountdown durationMs={10000} batchSize={2} cycleKey={7} onElapsed={onElapsed} />,
    );
    expect(dial()).toBe('10.000');

    // Ті дві секунди, що лишались до перезапуску, вже нічого не запускають.
    advance(2000);
    expect(onElapsed).not.toHaveBeenCalled();
  });

  it('каже, скільки карток і коли саме буде', () => {
    renderCountdown({ batchSize: 2, durationMs: 10000 });
    expect(screen.getByText('Наступні 2 картки завантажаться за 10 с')).toBeInTheDocument();
  });

  it('не запускає нічого після розмонтування', () => {
    const onElapsed = jest.fn();
    const { unmount } = renderCountdown({ onElapsed });
    advance(5000);
    unmount();
    advance(10000);
    expect(onElapsed).not.toHaveBeenCalled();
  });
});
