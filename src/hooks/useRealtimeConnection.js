import { useEffect, useState } from 'react';
import { onValue, ref } from 'firebase/database';
import { database } from '../components/config';
import { getRealtimeConnectionDemand, subscribeRealtimeConnectionDemand } from '../utils/realtimeConnectionManager';

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
 *
 * І ще два, від менеджера зʼєднання (`utils/realtimeConnectionManager`):
 * `idle` — базу ще ніхто не питав, і сокета немає навмисно (сама підписка на
 * `.info/connected` його б і відкрила, тож вона чекає першого запиту);
 * `suspended` — зʼєднання закрите, бо вкладка у фоні чи без дотику. Жоден із
 * них не «немає звʼязку»: плашка мовчить, а на повернення стан починається
 * заново, з `grace`. `lazy: false` — стежити одразу, як раніше.
 */
export const REALTIME_CONNECTION_GRACE_MS = 5000;
export const REALTIME_CONNECTION_BLIP_MS = 2500;

export const useRealtimeConnection = ({
  grace = REALTIME_CONNECTION_GRACE_MS,
  blip = REALTIME_CONNECTION_BLIP_MS,
  lazy = true,
} = {}) => {
  const [state, setState] = useState('pending');
  const [demand, setDemand] = useState(getRealtimeConnectionDemand);
  useEffect(() => {
    if (!lazy) return undefined;
    setDemand(getRealtimeConnectionDemand());
    return subscribeRealtimeConnectionDemand(() => setDemand(getRealtimeConnectionDemand()));
  }, [lazy]);
  const watching = !lazy || (demand.demanded && !demand.suspended);

  useEffect(() => {
    if (!watching) return undefined;
    setState('pending');
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
  }, [grace, blip, watching]);

  if (lazy && demand.suspended) return 'suspended';
  if (!watching) return 'idle';
  return state;
};
