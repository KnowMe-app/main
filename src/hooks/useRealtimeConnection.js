import { useEffect, useState } from 'react';
import { onValue, ref } from 'firebase/database';
import { database } from '../components/config';

/**
 * Чи є зараз зʼєднання з базою (`.info/connected`).
 *
 * Стрічка малюється з кешу браузера цілком — картки стрічки, порядок, навіть
 * перша сторінка після перезавантаження, — а все, що дочитується на дотик
 * (повна анкета, контакти, відгуки), чекає на зʼєднання без обмеження в часі:
 * `get()` бази без звʼязку не падає, а висить. Тож без звʼязку екран виглядав
 * цілком робочим і мовчки показував урізане: прізвище ініціалом, «Rh+» замість
 * групи, вічне «Шукаємо відгуки…», рядок без контактів. Саме так це й побачила
 * агенція — і питання було «чому їй анкету обрізано».
 *
 * Стани три: `pending` — ще не зʼєднались після старту; `online`; `offline`.
 * Першому зʼєднанню дається `grace` (воно буває не миттєвим), короткому обриву
 * після нього — `blip`: мобільна мережа моргає, і плашка, що спалахує на пів
 * секунди, лише лякає.
 */
export const REALTIME_CONNECTION_GRACE_MS = 5000;
export const REALTIME_CONNECTION_BLIP_MS = 2500;

export const useRealtimeConnection = ({
  grace = REALTIME_CONNECTION_GRACE_MS,
  blip = REALTIME_CONNECTION_BLIP_MS,
} = {}) => {
  const [state, setState] = useState('pending');

  useEffect(() => {
    let connectedOnce = false;
    let timer = setTimeout(() => setState(current => (current === 'pending' ? 'offline' : current)), grace);
    const unsubscribe = onValue(ref(database, '.info/connected'), snapshot => {
      if (snapshot.val() === true) {
        connectedOnce = true;
        clearTimeout(timer);
        setState('online');
        return;
      }

      // Firebase спершу повідомляє `false`, ще до того, як транспорт устиг
      // підʼєднатись. Це не обрив: перше зʼєднання й далі має весь `grace`.
      if (!connectedOnce) return;

      clearTimeout(timer);
      timer = setTimeout(() => setState(current => (current === 'online' ? 'offline' : current)), blip);
    });
    return () => {
      clearTimeout(timer);
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [grace, blip]);

  return state;
};
