import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

/*
 * Що сторінка під спільною навігацією кладе в її рядок: стрілку «назад», меню
 * «⋮» і підпис вкладки, яку вона займає.
 *
 * Доти кожна з трьох сторінок (`Matching`, `ProfileCreationWorkspace`,
 * `MyProfile`) мала власний рядок шапки зі стрілкою, назвою й «⋮» — просто
 * під рядком навігації, тобто два рядки згори на телефоні, з яких другий
 * повторював назву вкладки, підсвіченої в першому. Тепер рядок один: стрілка
 * стоїть перед «Пошук анкет», меню — після «Мій профіль», а що в них
 * робити, знає сторінка — їй і належать дії меню (очистити анкету, вигляд
 * стрічки) та сенс «назад» (закрити форму, зняти пошук).
 */
const PrimaryNavigationSlotContext = createContext(null);

export const PrimaryNavigationSlotProvider = ({ children }) => {
  const [slot, setSlot] = useState(null);
  // DOM-вузол «гнізда» в рядку навігації (`PageHeaderSlot`), куди сторінка
  // порталом кладе свій верхній блок — див. `usePrimaryNavigationHeaderTarget`.
  const [headerNode, setHeaderNode] = useState(null);
  // Хто чекає на «сторінка перемалювалась» — відкрите меню (`subscribeMenu`).
  const menuListenersRef = useRef(new Set());
  const subscribeMenu = useCallback(listener => {
    menuListenersRef.current.add(listener);
    return () => menuListenersRef.current.delete(listener);
  }, []);
  const notifyMenu = useCallback(() => {
    menuListenersRef.current.forEach(listener => listener());
  }, []);
  const value = useMemo(
    () => ({ slot, setSlot, subscribeMenu, notifyMenu, headerNode, setHeaderNode }),
    [headerNode, notifyMenu, slot, subscribeMenu],
  );
  return <PrimaryNavigationSlotContext.Provider value={value}>{children}</PrimaryNavigationSlotContext.Provider>;
};

export const usePrimaryNavigationSlotState = () => useContext(PrimaryNavigationSlotContext)?.slot || null;

export const usePrimaryNavigationHeaderNodeSetter = () => useContext(PrimaryNavigationSlotContext)?.setHeaderNode || null;

// Та сама межа, що й у `PrimaryNavigation`: до неї вкладки внизу, а верхній
// рядок вільний під вміст сторінки.
export const PRIMARY_NAVIGATION_PHONE_QUERY = '(max-width: 600px)';

const readPhoneLayout = () => (
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(PRIMARY_NAVIGATION_PHONE_QUERY).matches
    : false
);

/**
 * Куди сторінці класти свій верхній блок на телефоні.
 *
 * На телефоні вкладки внизу, і верхній рядок навігації тримав саму назву
 * екрана («Мій профіль», «Пошук анкет») — а просто під ним сторінка ставила
 * ще рядок: пошук, лого з роллю й статусом. Тепер той рядок сторінки лягає в
 * рядок навігації замість назви: сторінка рендерить його порталом у вузол,
 * який віддає цей хук, — стан і обробники лишаються в сторінці, міняється
 * лише місце в DOM. На широкому екрані (і поки вузла ще немає) — `null`, і
 * сторінка малює блок на звичному місці.
 */
export const usePrimaryNavigationHeaderTarget = () => {
  const node = useContext(PrimaryNavigationSlotContext)?.headerNode || null;
  const [phone, setPhone] = useState(readPhoneLayout);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia(PRIMARY_NAVIGATION_PHONE_QUERY);
    const update = () => setPhone(query.matches);
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);
  return phone ? node : null;
};

/**
 * Підписка відкритого меню на рендери сторінки.
 *
 * Пункти меню складає сторінка (`renderMenu` через ref), а малює їх рядок
 * навігації — сусід сторінки в дереві, а не нащадок. Тож зміна стану сторінки
 * (перемкнули вигляд, мову, зняли позначку) рядка не перемальовувала, і
 * відкрите меню показувало попередній стан, доки його не закрили. Тут була
 * латка на саму мову — таймер після її зміни; решта станів лишалась
 * застарілою. Тепер сторінка після кожного свого коміту кличе слухачів, а
 * слухач є лише поки меню відкрите — закрите меню не коштує нічого.
 */
export const usePrimaryNavigationMenuSubscription = () => (
  useContext(PrimaryNavigationSlotContext)?.subscribeMenu || null
);

/**
 * Зареєструвати слот сторінки: `{ onBack, renderMenu, workspaceLabel }`.
 *
 * Обробники читаються через ref: сторінка складає їх наново на кожен рендер, і
 * реєструвати кожен такий рендер означало б перемальовувати навігацію по колу.
 * Перереєстрація стається лише тоді, коли міняється видиме — є стрілка чи
 * немає, є меню чи немає, який підпис.
 */
export const usePrimaryNavigationSlot = ({ onBack, renderMenu, workspaceLabel } = {}) => {
  const context = useContext(PrimaryNavigationSlotContext);
  const setSlot = context?.setSlot;
  const latestRef = useRef({ onBack, renderMenu });
  latestRef.current = { onBack, renderMenu };
  const hasBack = typeof onBack === 'function';
  const hasMenu = typeof renderMenu === 'function';
  const label = workspaceLabel || '';

  const back = useCallback(() => latestRef.current.onBack?.(), []);
  const menu = useCallback(props => latestRef.current.renderMenu?.(props) || null, []);

  useEffect(() => {
    if (!setSlot) return;
    setSlot({ onBack: hasBack ? back : null, renderMenu: hasMenu ? menu : null, workspaceLabel: label });
  }, [back, hasBack, hasMenu, label, menu, setSlot]);

  useEffect(() => {
    if (!setSlot) return undefined;
    return () => setSlot(null);
  }, [setSlot]);

  // Без залежностей навмисно: після кожного коміту сторінки ref уже свіжий, і
  // відкрите меню перечитує його (`usePrimaryNavigationMenuSubscription`).
  const notifyMenu = context?.notifyMenu;
  useEffect(() => {
    notifyMenu?.();
  });
};
