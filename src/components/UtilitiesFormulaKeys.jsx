import React, { useCallback, useEffect, useState } from 'react';
import styled from 'styled-components';
import { evalUtilityExpr, formatMoney, isFormula, isNumber } from 'utils/utilitiesModel';

/*
 * Знаки формули під полем, у якому набирають (17.11, на прохання власниці
 * продукту). Поля комуналки рахують вираз, як клітинка Excel (`1340-571.13`,
 * `299/31*30`), але числова клавіатура телефона (`inputMode="decimal"`) не має
 * ні `+`, ні `*`, ні дужок — формулу на ній не набрати. Тож поки фокус у полі
 * з `data-formula`, під ним стоїть рядок знаків і результат виразу.
 *
 * Рядок один на сторінку: він слухає `focusin`/`focusout` контейнера, а не
 * вбудований у кожне поле — полів-чисел тут десяток різних компонентів.
 * Стоїть він `position: fixed` за координатами поля, а не над клавіатурою:
 * сторінка під клавіатуру не стискається (`interactive-widget=resizes-visual`),
 * і «низ екрана» тоді лежить під клавіатурою.
 *
 * Кнопки не забирають фокус (`onMouseDown` + `preventDefault`): інакше blur
 * поля записував би недонабрану формулу. Знак вставляється в місце курсора
 * через нативний сеттер `value` і подію `input` — так його бачить `onChange`
 * React-поля.
 */

const BAR_HEIGHT = 44;
const BAR_GAP = 6;

const KEYS = [
  { label: '+', insert: '+' },
  { label: '−', insert: '-' },
  { label: '×', insert: '*' },
  { label: '÷', insert: '/' },
  { label: '(', insert: '(' },
  { label: ')', insert: ')' },
];

const valueSetter = typeof window !== 'undefined'
  ? Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
  : null;

export const insertIntoInput = (input, text) => {
  if (!input || input.readOnly) return;
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? start;
  const next = `${input.value.slice(0, start)}${text}${input.value.slice(end)}`;
  if (valueSetter) valueSetter.call(input, next);
  else input.value = next;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  const caret = start + text.length;
  try { input.setSelectionRange(caret, caret); } catch { /* деякі типи полів не мають виділення */ }
};

const Bar = styled.div`
  position: fixed;
  height: ${BAR_HEIGHT}px;
  z-index: 1200;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px;
  border-radius: 12px;
  background: var(--km-card, #fff);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.16);
  border: 1px solid var(--km-border, #e4ded6);
  max-width: calc(100vw - 16px);
  box-sizing: border-box;
`;

const Key = styled.button`
  min-width: 34px;
  height: 34px;
  border: 0;
  border-radius: 9px;
  background: var(--km-fill, #f1ede8);
  color: var(--km-text, #1c1b1a);
  font: inherit;
  font-size: 17px;
  font-weight: 600;
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  &:active { background: var(--km-accent, #c9600f); color: var(--km-on-accent, #fff); }
`;

const Result = styled.span`
  padding: 0 8px;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  color: ${({ $bad }) => ($bad ? 'var(--km-danger, #c0392b)' : 'var(--km-text, #1c1b1a)')};
`;

// Під полем, а коли там немає місця (поле внизу видимої частини, зокрема над
// клавіатурою), — над ним. Видима частина — `visualViewport`: клавіатура
// ховає низ сторінки, а `innerHeight` її не помічає.
export const placeBar = (rect, viewport) => {
  const width = Math.min(300, viewport.width - 16);
  const left = Math.max(viewport.left + 8, Math.min(rect.left, viewport.left + viewport.width - width - 8));
  const below = rect.bottom + BAR_GAP;
  const visibleBottom = viewport.top + viewport.height;
  const top = below + BAR_HEIGHT <= visibleBottom - 4 ? below : Math.max(viewport.top + 4, rect.top - BAR_GAP - BAR_HEIGHT);
  return { top, left };
};

const readViewport = () => {
  const vv = window.visualViewport;
  return vv
    ? { top: vv.offsetTop, left: vv.offsetLeft, width: vv.width, height: vv.height }
    : { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight };
};

const placeFor = input => placeBar(input.getBoundingClientRect(), readViewport());

export const FormulaKeys = ({ containerRef }) => {
  const [input, setInput] = useState(null);
  const [position, setPosition] = useState(null);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return undefined;
    const onFocusIn = event => {
      const target = event.target;
      if (target instanceof HTMLInputElement && target.dataset.formula && !target.readOnly) {
        setInput(target);
        setPosition(placeFor(target));
      }
    };
    const onFocusOut = event => {
      // Фокус переходить на інше поле — його `focusin` сам перепризначить рядок.
      if (event.target instanceof HTMLInputElement && event.target.dataset.formula) {
        setInput(current => (current === event.target ? null : current));
      }
    };
    root.addEventListener('focusin', onFocusIn);
    root.addEventListener('focusout', onFocusOut);
    return () => {
      root.removeEventListener('focusin', onFocusIn);
      root.removeEventListener('focusout', onFocusOut);
    };
  }, [containerRef]);

  useEffect(() => {
    if (!input) return undefined;
    const update = () => setPosition(placeFor(input));
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
    };
  }, [input]);

  const press = useCallback(text => {
    if (!input) return;
    insertIntoInput(input, text);
  }, [input]);

  if (!input || !position) return null;
  // Значення читається з самого поля: набір у ньому міняє стан сторінки
  // (`localEdits`), і рядок перемальовується разом з нею.
  const { value } = input;
  const parsed = evalUtilityExpr(value);
  const showResult = isFormula(value);
  return (
    <Bar data-testid="utilities-formula-keys" style={{ top: position.top, left: position.left }} role="toolbar" aria-label="Знаки формули">
      {KEYS.map(key => (
        <Key
          key={key.label}
          type="button"
          aria-label={`Вставити ${key.label}`}
          onMouseDown={event => event.preventDefault()}
          onClick={() => press(key.insert)}
        >
          {key.label}
        </Key>
      ))}
      {showResult ? (
        <Result data-testid="utilities-formula-result" $bad={!isNumber(parsed)}>
          {isNumber(parsed) ? `= ${formatMoney(parsed)}` : '…'}
        </Result>
      ) : null}
    </Bar>
  );
};

export default FormulaKeys;
