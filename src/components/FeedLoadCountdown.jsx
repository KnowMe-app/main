import React, { useEffect, useRef, useState } from 'react';
import { FeedCountdown, FeedCountdownDial, FeedCountdownHint } from './Matching.styled';
import { formatMatchingCountdown } from '../utils/matchingFeedThrottle';

/**
 * Відлік до наступної порції карток у кінці стрічки.
 *
 * Живе окремим компонентом навмисне: тік іде щокадру, і тримати його станом
 * сторінки означало б перемальовувати всю стрічку 60 разів на секунду. Тут
 * перемальовується сам відлік.
 *
 * Батько монтує його лише тоді, коли пауза справді триває, а `cycleKey`
 * перезапускає відлік після кожної підвантаженої порції — звідси «і так далі».
 */
export const FeedLoadCountdown = ({ durationMs, batchSize, cycleKey, onElapsed }) => {
  const [remainingMs, setRemainingMs] = useState(durationMs);
  // Відлік заводить сам себе наново. У нормі його перезапускає `cycleKey` —
  // стрічка виросла на порцію. Але дозавантаження має власні guard-и і може
  // нічого не привезти; без цього лічильника відлік застигав би на «0.000»
  // назавжди, замість того щоб спробувати ще раз через десять секунд.
  const [restartToken, setRestartToken] = useState(0);
  const onElapsedRef = useRef(onElapsed);
  useEffect(() => { onElapsedRef.current = onElapsed; }, [onElapsed]);

  useEffect(() => {
    // Дедлайн, а не лічильник кадрів: у фоновій вкладці rAF не викликається, і
    // відлік має показати те, що справді минуло, коли вкладку відкриють знову.
    const deadline = Date.now() + durationMs;
    let frame = 0;
    let fired = false;
    setRemainingMs(durationMs);

    const tick = () => {
      const remaining = Math.max(0, deadline - Date.now());
      setRemainingMs(remaining);
      if (remaining > 0) {
        frame = requestAnimationFrame(tick);
        return;
      }
      if (fired) return;
      fired = true;
      onElapsedRef.current?.();
      setRestartToken(token => token + 1);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [cycleKey, durationMs, restartToken]);

  // Числа не озвучуються: відлік оновлюється щокадру, і жива область читала б
  // його вголос без кінця. Що відбувається, каже підпис, і він не змінюється.
  return (
    <FeedCountdown data-testid="feed-load-countdown">
      <FeedCountdownDial aria-hidden="true">{formatMatchingCountdown(remainingMs)}</FeedCountdownDial>
      <FeedCountdownHint>
        {`Наступні ${batchSize} картки завантажаться за ${Math.round(durationMs / 1000)} с`}
      </FeedCountdownHint>
    </FeedCountdown>
  );
};

export default FeedLoadCountdown;
