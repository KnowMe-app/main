import '@testing-library/jest-dom';
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import FeedLoadCountdown from './FeedLoadCountdown';

// rAF під фейковими таймерами: jsdom мапить його на таймер, тож кадр «настає»
// разом з просуванням годинника, і відлік можна прокрутити детерміновано.
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

  it('починає з повних десяти секунд і показує мілісекунди', () => {
    renderCountdown();
    expect(screen.getByTestId('feed-load-countdown')).toHaveTextContent('10.000');
  });

  it('відраховує назад', () => {
    renderCountdown();
    // Кадр приходить приблизно раз на 16 мс, тож остання намальована мітка
    // трохи випереджає годинник — перевіряємо секунду, а не точну мілісекунду.
    advance(2500);
    expect(screen.getByTestId('feed-load-countdown')).toHaveTextContent(/7\.\d{3}/);
    advance(7000);
    expect(screen.getByTestId('feed-load-countdown')).toHaveTextContent(/0\.\d{3}/);
  });

  it('просить наступну порцію рівно один раз, коли дійшов нуля', () => {
    const onElapsed = jest.fn();
    renderCountdown({ onElapsed });

    advance(9999);
    expect(onElapsed).not.toHaveBeenCalled();

    advance(1);
    expect(onElapsed).toHaveBeenCalledTimes(1);
  });

  it('заводиться наново, якщо після нуля картки так і не приїхали', () => {
    // Дозавантаження має власні guard-и і може нічого не привезти. Тоді
    // `cycleKey` не зміниться — і відлік мусить спробувати сам, а не застигнути.
    const onElapsed = jest.fn();
    renderCountdown({ onElapsed });

    advance(10000);
    expect(onElapsed).toHaveBeenCalledTimes(1);

    advance(10000);
    expect(onElapsed).toHaveBeenCalledTimes(2);
  });

  it('перезапускає відлік, коли стрічка виросла на порцію', () => {
    const onElapsed = jest.fn();
    const { rerender } = renderCountdown({ onElapsed, cycleKey: 5 });
    advance(8000);
    expect(screen.getByTestId('feed-load-countdown')).toHaveTextContent(/2\.\d{3}/);

    rerender(
      <FeedLoadCountdown durationMs={10000} batchSize={2} cycleKey={7} onElapsed={onElapsed} />,
    );
    advance(0);
    expect(screen.getByTestId('feed-load-countdown')).toHaveTextContent('10.000');

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
