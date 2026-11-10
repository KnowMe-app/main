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
 *
 * `onFreshStates` отримує прочитані стани (`{ id: state }`) **до** того, як
 * рядки відкриються: читач несе в стані й саму картку (`state.card`), і
 * рядок з кешу показується вже з нею, а не підміняється під пальцем.
 *
 * @param {object[]} rows
 * @param {{ reader: { read: Function, peek: Function }, enabled?: boolean, skip?: (row: object) => boolean, onFreshStates?: (states: object) => void }} options
 */
export const useFreshFeedStateGate = (rows, { reader, enabled = true, skip, onFreshStates }) => {
  const onFreshStatesRef = useRef(onFreshStates);
  onFreshStatesRef.current = onFreshStates;
  // Перевірене в цьому монтуванні: відповідь прийшла (зі станом чи без —
  // збій читання картку не ховає). Лічильник лише будить рендер.
  const checkedRef = useRef(new Set());
  const [version, setVersion] = useState(0);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const gate = useMemo(() => {
    if (!enabled) return { visible: rows, pendingIds: [] };
    return gateRowsByFeedState(rows, {
      peek: reader.peek,
      isChecked: id => checkedRef.current.has(id),
      skip,
    });
    // `version` — сигнал, що памʼять читача поповнилась.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, enabled, reader, skip, version]);

  const pendingKey = gate.pendingIds.join('|');
  useEffect(() => {
    if (!pendingKey) return;
    const ids = pendingKey.split('|');
    let cancelled = false;
    const states = {};
    Promise.all(ids.map(id => reader.read(id).then(state => {
      checkedRef.current.add(id);
      if (state) states[id] = state;
    }))).then(() => {
      if (cancelled || !mountedRef.current) return;
      if (Object.keys(states).length) onFreshStatesRef.current?.(states);
      setVersion(value => value + 1);
    });
    return () => { cancelled = true; };
  }, [pendingKey, reader]);

  return { rows: gate.visible, pendingCount: gate.pendingIds.length };
};

export default useFreshFeedStateGate;
