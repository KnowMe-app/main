import React, { forwardRef, useCallback, useRef } from 'react';
import { useAutoResize } from '../hooks/useAutoResize';

/*
 * Однорядкове за змістом поле, яке росте під текст.
 *
 * `<input>` показує один рядок, і довгий текст («Кожного 10-го числа місяця,
 * за умови…») у ньому видно шматком, що ховається за край: правити його на
 * телефоні виходило навпомацки. Тут той самий текст переноситься й поле
 * виростає по висоті (`useAutoResize`), а значення лишається одним рядком:
 * Enter нового рядка не додає (у формі він означає «готово» — `onEnter`), а
 * вставлені переноси стають пробілами. Тож у базу їде те саме, що їхало з
 * `<input>`.
 *
 * `multiline` — для справжнього тексту в кілька абзаців (коментар програми,
 * куди вставляють оголошення): переноси лишаються, Enter додає рядок, а
 * висота так само стартує з одного рядка й росте під текст.
 */
const AutoGrowTextarea = forwardRef(({ value, onChange, onKeyDown, onEnter, multiline = false, ...rest }, forwardedRef) => {
  const innerRef = useRef(null);
  useAutoResize(innerRef, value);
  const setRef = useCallback(node => {
    innerRef.current = node;
    if (typeof forwardedRef === 'function') forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
  }, [forwardedRef]);
  const handleChange = event => {
    const raw = event.target.value;
    if (!multiline && /[\r\n]/.test(raw)) event.target.value = raw.replace(/\s*[\r\n]+\s*/g, ' ');
    onChange?.(event);
  };
  const handleKeyDown = event => {
    onKeyDown?.(event);
    if (multiline || event.defaultPrevented || event.key !== 'Enter' || event.shiftKey || event.nativeEvent?.isComposing) return;
    event.preventDefault();
    onEnter?.(event);
  };
  return <textarea ref={setRef} rows={1} value={value} onChange={handleChange} onKeyDown={handleKeyDown} {...rest} />;
});

AutoGrowTextarea.displayName = 'AutoGrowTextarea';

export default AutoGrowTextarea;
export { AutoGrowTextarea };
