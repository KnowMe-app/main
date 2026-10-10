import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import styled from 'styled-components';

/*
 * Розгортання й згортання з плавною висотою — в обидва боки.
 *
 * `revealCss` (`styles/revealAnimation`) лише проявляє вже змонтоване, а
 * згорнуте просто зникало, тож деталі програми в стрічці «вистрибували» й
 * «провалювались»: користувачка казала, що анімації там немає зовсім. Тут
 * висота йде через `grid-template-rows: 0fr → 1fr` (рахувати її в пікселях
 * не треба, і вміст може рости, поки блок відкритий), разом із прозорістю.
 *
 * Згорнуте розмонтовується після анімації, а не лишається в DOM схованим:
 * усередині бувають поля з відкладеним записом (графік програми пише дату
 * на розмонтуванні), і вони мусять поводитись так само, як без анімації.
 * `overflow: hidden` стоїть лише на час руху: відкритий блок не обрізає ні
 * тіні, ні меню, ні липкого перегляду всередині.
 *
 * Без `matchMedia` (тести) чи з `prefers-reduced-motion` — миттєво.
 */
export const COLLAPSE_DURATION_MS = 260;

const prefersInstant = () => typeof window === 'undefined'
  || typeof window.matchMedia !== 'function'
  || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const Outer = styled.div`
  display: grid;
  grid-template-rows: ${({ $expanded }) => ($expanded ? '1fr' : '0fr')};
  opacity: ${({ $expanded }) => ($expanded ? 1 : 0)};
  transition:
    grid-template-rows ${COLLAPSE_DURATION_MS}ms cubic-bezier(0.2, 0, 0, 1),
    opacity ${COLLAPSE_DURATION_MS}ms ease;

  > div {
    min-height: 0;
    min-width: 0;
    overflow: ${({ $moving }) => ($moving ? 'hidden' : 'visible')};
  }

  @media (prefers-reduced-motion: reduce) { transition: none; }
`;

const Collapsible = ({ open, children, ...rest }) => {
  const instant = prefersInstant();
  const [mounted, setMounted] = useState(open);
  const [expanded, setExpanded] = useState(open);
  const [moving, setMoving] = useState(false);
  const outerRef = useRef(null);
  const firstRenderRef = useRef(true);

  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      return undefined;
    }
    if (instant) {
      setMounted(open);
      setExpanded(open);
      setMoving(false);
      return undefined;
    }
    setMoving(true);
    if (open) setMounted(true);
    else setExpanded(false);
    const timer = window.setTimeout(() => {
      setMoving(false);
      if (!open) setMounted(false);
    }, COLLAPSE_DURATION_MS + 40);
    return () => window.clearTimeout(timer);
  }, [instant, open]);

  // Щойно змонтоване стоїть на 0fr один кадр стилів, і лише тоді йде на 1fr —
  // інакше переходу не було б з чого починатись. Читання `offsetHeight`
  // фіксує стиль до наступного рендеру.
  useLayoutEffect(() => {
    if (!mounted || !open || expanded) return;
    if (outerRef.current) void outerRef.current.offsetHeight;
    setExpanded(true);
  }, [expanded, mounted, open]);

  if (!mounted) return null;
  return (
    <Outer ref={outerRef} $expanded={expanded} $moving={moving} aria-hidden={open ? undefined : true} {...rest}>
      <div>{children}</div>
    </Outer>
  );
};

export default Collapsible;
