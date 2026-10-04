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
    let timer = setTimeout(() => setState(current => (current === 'pending' ? 'offline' : current)), grace);
    const unsubscribe = onValue(ref(database, '.info/connected'), snapshot => {
      clearTimeout(timer);
      if (snapshot.val() === true) {
        setState('online');
        return;
      }
      timer = setTimeout(() => setState(current => (current === 'online' || current === 'pending' ? 'offline' : current)), blip);
    });
    return () => {
      clearTimeout(timer);
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [grace, blip]);

  return state;
};
