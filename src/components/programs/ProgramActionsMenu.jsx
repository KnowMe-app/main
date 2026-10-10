import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styled from 'styled-components';

/*
 * Меню «⋮» програми в редакторі — поверх сторінки, а не всередині картки.
 *
 * Тут стояв `<details>` з абсолютно позиціонованим списком. Згорнута програма
 * — низький контейнер, а «Мій профіль» обрізає картку розділу
 * (`overflow: clip`, щоб кути лишались заокругленими), тож список дій
 * обрізався межею картки: «Видалити програму» й «Створити копію» на останній
 * програмі не було видно зовсім. Тепер список рендериться порталом у
 * `document.body` з `position: fixed` біля кнопки: жоден `overflow` предків
 * його не ріже. Не влазить униз — відкривається вгору; по ширині
 * притискається до екрана. Закривається дотиком поза ним, Escape, вибором дії.
 */

const ACCENT = 'var(--km-accent, #E8791A)';
const BORDER = 'var(--km-border, #E8E8E2)';
const TEXT = 'var(--km-text, #1A1A1A)';
const CARD = 'var(--km-card, #fff)';
const FOCUS_RING = `0 0 0 3px var(--km-accent-ring, color-mix(in srgb, ${ACCENT} 22%, transparent))`;

const GAP = 5;
const EDGE = 8;

const Trigger = styled.button`
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 1px solid ${BORDER};
  border-radius: 10px;
  background: ${CARD};
  color: ${TEXT};
  font: inherit;
  font-weight: 800;
  cursor: pointer;

  &:focus-visible { outline: none; box-shadow: ${FOCUS_RING}; }
`;

const Popover = styled.div`
  position: fixed;
  z-index: 10000;
  min-width: 170px;
  max-width: calc(100vw - ${EDGE * 2}px);
  max-height: calc(100vh - ${EDGE * 2}px);
  overflow-y: auto;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  border: 1px solid ${BORDER};
  border-radius: 10px;
  background: ${CARD};
  color: ${TEXT};
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.22);
  box-sizing: border-box;

  > button { text-align: left; }
`;

const ProgramActionsMenu = ({ label, children }) => {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);
  const close = useCallback(() => setOpen(false), []);

  const place = useCallback(() => {
    const trigger = triggerRef.current;
    const popover = popoverRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const width = popover?.offsetWidth || 170;
    const height = popover?.offsetHeight || 0;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const below = rect.bottom + GAP;
    const fitsBelow = below + height <= viewportHeight - EDGE;
    const top = fitsBelow || rect.top - GAP - height < EDGE
      ? Math.min(below, Math.max(EDGE, viewportHeight - EDGE - height))
      : rect.top - GAP - height;
    const left = Math.min(Math.max(EDGE, rect.right - width), viewportWidth - EDGE - width);
    setPosition({ top, left: Math.max(EDGE, left) });
  }, []);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = event => {
      if (popoverRef.current?.contains(event.target) || triggerRef.current?.contains(event.target)) return;
      close();
    };
    const onKeyDown = event => {
      if (event.key !== 'Escape') return;
      close();
      triggerRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    // Прокрутка будь-якого предка (`capture`) зсуває кнопку — меню йде за нею.
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [close, open, place]);

  return (
    <>
      <Trigger
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={event => { event.stopPropagation(); setOpen(current => !current); }}
      >
        ⋮
      </Trigger>
      {open && typeof document !== 'undefined' ? createPortal(
        <Popover
          ref={popoverRef}
          role="menu"
          aria-label={label}
          style={position ? { top: position.top, left: position.left } : { visibility: 'hidden', top: 0, left: 0 }}
          // Дія закриває меню, коли вона спрацювала; кнопки підтвердження
          // (видалення) рендерить уже шапка програми.
          onClick={event => { if (event.target.closest('button:not(:disabled)')) close(); }}
        >
          {children}
        </Popover>,
        document.body,
      ) : null}
    </>
  );
};

export default ProgramActionsMenu;
