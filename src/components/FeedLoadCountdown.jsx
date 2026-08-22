import React, { useEffect, useRef, useState } from 'react';
import { FeedCountdown, FeedCountdownDial, FeedCountdownHint } from './Matching.styled';
import {
  MATCHING_COUNTDOWN_TICK_MS,
  formatMatchingCountdown,
  quantizeMatchingCountdown,
} from '../utils/matchingFeedThrottle';

/**
 * Відлік до наступної порції карток у кінці стрічки.
 *
 * Живе окремим компонентом навмисне: тік іде двадцять разів на секунду, і
 * тримати його станом сторінки означало б перемальовувати з ним усю стрічку.
 *
 * Відлік не заводить себе сам. Його монтує батько, коли читач прокруткою дійшов
 * до кінця списку, і розмонтовує, щойно відлік добіг нуля, — тож одна порція
 * карток коштує рівно один жест.
 */
export const FeedLoadCountdown = ({ durationMs, batchSize, cycleKey, onElapsed }) => {
  const [remainingMs, setRemainingMs] = useState(durationMs);
  const onElapsedRef = useRef(onElapsed);
  useEffect(() => { onElapsedRef.current = onElapsed; }, [onElapsed]);

  useEffect(() => {
    // Дедлайн, а не лічильник тіків: інтервал у фоновій вкладці душиться, і
    // відлік має показати те, що справді минуло, коли вкладку відкриють знову.
    const deadline = Date.now() + durationMs;
    let fired = false;
    setRemainingMs(durationMs);

    const tick = () => {
      const remaining = Math.max(0, deadline - Date.now());
      setRemainingMs(remaining);
      if (remaining > 0 || fired) return;
      fired = true;
      onElapsedRef.current?.();
    };

    const timer = setInterval(tick, MATCHING_COUNTDOWN_TICK_MS);
    return () => clearInterval(timer);
  }, [cycleKey, durationMs]);

  // Числа не озвучуються: відлік оновлюється двадцять разів на секунду, і жива
  // область читала б його вголос без кінця. Що відбувається, каже підпис.
  return (
    <FeedCountdown data-testid="feed-load-countdown">
      <FeedCountdownDial aria-hidden="true">
        {formatMatchingCountdown(quantizeMatchingCountdown(remainingMs))}
      </FeedCountdownDial>
      <FeedCountdownHint>
        {`Наступні ${batchSize} картки завантажаться за ${Math.round(durationMs / 1000)} с`}
      </FeedCountdownHint>
    </FeedCountdown>
  );
};

export default FeedLoadCountdown;
