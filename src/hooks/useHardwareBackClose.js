import { useEffect, useRef } from 'react';

/**
 * Апаратна кнопка «назад» закриває відкритий шар, а не застосунок.
 *
 * Екран, який показує щось «поверх» списку — відкриту картку, форму, — в
 * історію браузера сам по собі нічого не кладе: адреса або не змінюється
 * взагалі, або переписується через `replace`. Для React це один і той самий
 * запис історії, тож апаратна кнопка андроїда знімає не шар, а всю сторінку —
 * людина, яка хотіла повернутись до списку, опиняється на попередньому
 * маршруті застосунку (а то й поза ним).
 *
 * Механізм тут рівно той, яким закривається форма в майстерні створення
 * (`ProfileCreationWorkspace`): відкритий шар кладе в історію **один** запис,
 * а `popstate` — тобто та сама апаратна кнопка, «назад» браузера чи жест —
 * його знімає, і саме це закриває шар. Стрілка в шапці мусить викликати те
 * саме закриття, інакше два жести «назад» на одному екрані дають різний
 * наслідок.
 *
 * Прибирати свій запис при закритті обовʼязково: інакше в історії лишається
 * порожній слід, і наступне натискання «назад» не робить нічого. Але знімати
 * можна лише **свій** запис (`window.history.state` несе позначку): якщо шар
 * пішов навігацією, історія вже рушила далі, і `back()` скасував би рівно той
 * перехід, заради якого шар і закрили.
 */
export const useHardwareBackClose = (isOpen, onClose, marker = 'appOverlayLayer') => {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const ownEntryRef = useRef(false);

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return undefined;

    window.history.pushState({ [marker]: true }, '');
    ownEntryRef.current = true;

    const handlePopState = () => {
      if (!ownEntryRef.current) return;
      ownEntryRef.current = false;
      const close = onCloseRef.current;
      if (typeof close === 'function') close();
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      if (ownEntryRef.current && window.history.state?.[marker]) {
        ownEntryRef.current = false;
        window.history.back();
      }
      ownEntryRef.current = false;
    };
    // `onCloseRef` завжди тримає свіжу функцію, тож ефект живе рівно один цикл
    // «шар відкрили / закрили» — інакше кожна зміна обробника клала б у
    // історію ще один запис.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, marker]);
};

export default useHardwareBackClose;
