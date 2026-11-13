import { useEffect, useMemo, useRef, useState } from 'react';

import { gateRowsByFeedState } from '../utils/searchFeedDenial';

/**
 * Рядки стрічки — лише ті, чий свіжий стан у базі дозволяє показ.
 *
 * Картки на екран здебільшого приходять з кешу пристрою (знімок деки, список
 * стрічки, колекції), а там лежить `feedDate` таким, яким його бачили до
 * шести годин тому. Сховану чи видалену відтоді анкету (`feedDate: false`)
 * стрічка показувала б далі. Тому кожна картка без свіжого стану в памʼяті
 * вкладки чекає на точкове читання (`reader.read`) і **до нього не
 * показується** — мигнути й зникнути з-під пальця гірше, ніж зʼявитись на
 * частку секунди пізніше. Сторінки, що щойно прийшли з бази, свій стан
 * записують у памʼять самі (`primeMatchingFeedState`), тож платять за
 * перевірку лише картки з кешу.
 *
 * `enabled: false` — стрічка адміна: вона навмисно показує й сховані анкети.
 * `ready: false` — рядки без стану ще чекають, але читання не починається:
 * спершу журнал змін (`utils/matchingCardChanges`).
 *
 * `onFreshStates` отримує прочитані стани (`{ id: state }`) **до** того, як
 * рядки відкриються: читач несе в стані й саму картку (`state.card`), і
 * рядок з кешу показується вже з нею, а не підміняється під пальцем.
 *
 * @param {object[]} rows
 * @param {{ reader: { read: Function, peek: Function }, enabled?: boolean, skip?: (row: object) => boolean, onFreshStates?: (states: object) => void }} options
 */
/**
 * Стеля очікування: картка, яку за цей час не перевірили, показується так
 * само, як після збою перевірки. Без мережі чи з поганою мережею перевірка
 * чекає на сесію Firebase, журнал змін і тайм-аут читання, і на телефоні
 * стрічка стояла скелетоном по десять секунд і більше, хоча дека лежала на
 * пристрої (13.11). Відповідь, що приїде пізніше, схованої картки однаково не
 * пропустить: стан ляже в памʼять читача, і рядок зникне.
 */
export const FEED_STATE_GATE_MAX_WAIT_MS = 3000;

export const useFreshFeedStateGate = (rows, { reader, enabled = true, ready = true, skip, onFreshStates, maxWaitMs = FEED_STATE_GATE_MAX_WAIT_MS }) => {
  const onFreshStatesRef = useRef(onFreshStates);
  onFreshStatesRef.current = onFreshStates;
  const readerRef = useRef(reader);
  readerRef.current = reader;
  // Перевірене в цьому монтуванні: відповідь прийшла (зі станом чи без —
  // збій читання картку не ховає) або минула стеля очікування. Лічильник
  // лише будить рендер.
  const checkedRef = useRef(new Set());
  // Читання вже запущене. Окремо від «перевірене»: стеля очікування показує
  // картку, але читання однаково мусить відбутися, щойно журнал готовий, —
  // інакше схованість картки, показаної до журналу, не перевірилась би ніколи.
  const startedRef = useRef(new Set());
  const [version, setVersion] = useState(0);

  const gate = useMemo(() => {
    if (!enabled) return { visible: rows, pendingIds: [] };
    return gateRowsByFeedState(rows, {
      peek: reader.peek,
      isChecked: id => checkedRef.current.has(id),
      skip,
    });
    // `version` — сигнал, що памʼять читача поповнилась.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, enabled, ready, reader, skip, version]);

  const unreadKey = useMemo(() => {
    if (!enabled || !ready) return '';
    return gateRowsByFeedState(rows, {
      peek: reader.peek,
      isChecked: id => startedRef.current.has(id),
      skip,
    }).pendingIds.join('|');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, enabled, ready, reader, skip, version]);

  const pendingKey = gate.pendingIds.join('|');

  useEffect(() => {
    if (!pendingKey || !(maxWaitMs > 0)) return undefined;
    const timer = setTimeout(() => {
      pendingKey.split('|').forEach(id => checkedRef.current.add(id));
      setVersion(value => value + 1);
    }, maxWaitMs);
    return () => clearTimeout(timer);
  }, [pendingKey, maxWaitMs]);

  useEffect(() => {
    // Без `ready` (журнал змін ще не прочитано) `unreadKey` порожній:
    // перевірені стани пристрою поки не чинні, і читати кожну картку з бази
    // зарано — більшість із них журнал зараз підтвердить без запиту.
    if (!unreadKey) return;
    const ids = unreadKey.split('|');
    ids.forEach(id => startedRef.current.add(id));
    const states = {};
    Promise.all(ids.map(id => reader.read(id).then(state => {
      checkedRef.current.add(id);
      if (state) states[id] = state;
    }))).then(() => {
      // Відповідь чинна, доки читач той самий, — навіть коли картку вже
      // показала стеля очікування: пізній стан мусить сховати картку, яку
      // тим часом сховали в базі. Тут стояв ще прапорець «змонтовано»
      // (`mountedRef`), який прибирання ставило в `false` і ніщо не вертало
      // в `true`: React у режимі розробки монтує ефекти двічі, а повторне
      // монтування буває й у проді, — і відповідь відкидалась назавжди.
      // Картки висіли «на перевірці», і без мережі стрічка стояла
      // скелетоном, хоча дека з пристрою була (13.11, телефон).
      if (readerRef.current !== reader) return;
      if (Object.keys(states).length) onFreshStatesRef.current?.(states);
      setVersion(value => value + 1);
    });
  }, [unreadKey, reader]);

  return { rows: gate.visible, pendingCount: gate.pendingIds.length };
};

export default useFreshFeedStateGate;
