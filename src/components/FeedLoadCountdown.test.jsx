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

  it('починає з повних десяти секунд', () => {
    renderCountdown();
    expect(dial()).toBe('10с');
  });

  it('відраховує назад цілими секундами', () => {
    renderCountdown();
    advance(2500);
    expect(dial()).toBe('8с');
    advance(7000);
    expect(dial()).toBe('1с');
  });

  // Мілісекунди прибрані: число мінялось двадцять разів на секунду, а підпис
  // поруч називав своє, фіксоване. Ширину тепер тримає сам циферблат
  // (`min-width` у стилях), а не нуль перед числом.
  it('не смикається на переході через десяту секунду', () => {
    renderCountdown();
    advance(100);
    expect(dial()).toBe('10с');
    advance(1000);
    expect(dial()).toBe('9с');
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
    expect(dial()).toBe('2с');

    rerender(
      <FeedLoadCountdown durationMs={10000} batchSize={2} cycleKey={7} onElapsed={onElapsed} />,
    );
    expect(dial()).toBe('10с');

    // Ті дві секунди, що лишались до перезапуску, вже нічого не запускають.
    advance(2000);
    expect(onElapsed).not.toHaveBeenCalled();
  });

  // Підпис більше не називає власного числа секунд: воно було фіксованим і з
  // відліком поруч не збігалось — «02.700» під написом «за 10 с».
  it('каже, скільки карток буде, і не сперечається з відліком', () => {
    renderCountdown({ batchSize: 2, durationMs: 10000 });
    expect(screen.getByText('Наступні 2 картки завантажаться автоматично')).toBeInTheDocument();
    advance(7000);
    expect(dial()).toBe('3с');
    expect(screen.getByText('Наступні 2 картки завантажаться автоматично')).toBeInTheDocument();
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
