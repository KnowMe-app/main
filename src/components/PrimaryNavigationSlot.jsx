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
  // Хто чекає на «сторінка перемалювалась» — відкрите меню (`subscribeMenu`).
  const menuListenersRef = useRef(new Set());
  const subscribeMenu = useCallback(listener => {
    menuListenersRef.current.add(listener);
    return () => menuListenersRef.current.delete(listener);
  }, []);
  const notifyMenu = useCallback(() => {
    menuListenersRef.current.forEach(listener => listener());
  }, []);
  const value = useMemo(() => ({ slot, setSlot, subscribeMenu, notifyMenu }), [notifyMenu, slot, subscribeMenu]);
  return <PrimaryNavigationSlotContext.Provider value={value}>{children}</PrimaryNavigationSlotContext.Provider>;
};

export const usePrimaryNavigationSlotState = () => useContext(PrimaryNavigationSlotContext)?.slot || null;

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
