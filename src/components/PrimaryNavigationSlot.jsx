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
  const value = useMemo(() => ({ slot, setSlot }), [slot]);
  return <PrimaryNavigationSlotContext.Provider value={value}>{children}</PrimaryNavigationSlotContext.Provider>;
};

export const usePrimaryNavigationSlotState = () => useContext(PrimaryNavigationSlotContext)?.slot || null;

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
};
