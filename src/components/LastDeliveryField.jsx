import React, { useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import { FiX } from 'react-icons/fi';
import {
  formatDeliveryDateForInput,
  readDeliveryDate,
  toStoredDeliveryDate,
} from '../utils/deliveryDateInput';
import { formatDeliveryRecency } from '../utils/deliveryRecency';
import { uiText } from '../utils/uiTranslations';

/*
 * «Останні пологи» — текстове поле, яке розуміє, як люди пишуть дату.
 *
 * Тут стояла маска `дд.мм.рррр`, і правильно вона приймала лише дату з нулями
 * попереду: набрана крапка зникала, «1.5.2019» ставало «15.20.19», рік
 * «2019» — «20.19», а майбутній рік ішов у базу мовчки. Картка таку дату не
 * показувала, тож людина вважала поле заповненим, а читач бачив пологи без
 * «коли». Із трьох СМ 23.10 правильної дати не лишила жодна.
 *
 * Тепер набране не переписується під пальцем: розбір (`deliveryDateInput`)
 * розуміє «12.05.2019», «1.5.19», «12052019», «05.2019», «травень 2019»,
 * «12 травня 2019», «2019», «6 місяців тому», «через 10 тижнів» — і під полем
 * одразу каже, що розпізнав і скільки від того минуло: «пологи 6 міс тому —
 * вірно?». Це перевірка очима: описку в році видно відразу, а не в картці.
 * Записується на blur і лише розпізнане — у тій точності, яку людина дала.
 */

const Control = styled.div`
  position: relative;
  width: 100%;
  min-width: 0;
`;

// Той самий вигляд, що в текстових полів анкети: заливка без рамки, рамка на фокусі.
const Input = styled.input`
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  background: var(--km-fill);
  border: 1.5px solid ${({ $error }) => ($error ? 'var(--km-danger, #B42318)' : 'transparent')};
  border-radius: 10px;
  padding: 10px 38px 10px 14px;
  font: inherit;
  color: var(--text);
  outline: none;
  &:focus { background: var(--card); border-color: ${({ $error }) => ($error ? 'var(--km-danger, #B42318)' : 'var(--accent)')}; box-shadow: 0 0 0 3px var(--km-accent-ring); }
`;

const ClearButton = styled.button`
  position: absolute;
  top: 50%;
  right: 8px;
  transform: translateY(-50%);
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
`;

const Note = styled.p`
  margin: 8px 0 0;
  font-size: 13px;
  line-height: 1.4;
  color: ${({ $error }) => ($error ? 'var(--km-danger, #B42318)' : 'var(--muted)')};
`;

const ERROR_TEXTS = {
  invalid: 'Не схоже на дату. Напишіть, наприклад, 12.05.2019, 05.2019 або «травень 2019».',
  noYear: 'Додайте рік: наприклад, 12.05.2019.',
  tooFar: 'Ця дата ще надто далеко в майбутньому — перевірте рік.',
  tooOld: 'Дата надто давня — перевірте рік.',
};

/** Що сказати під полем про набране: `{ error, text }` або `null`. */
export const describeDeliveryInput = (text, language = 'uk', now = new Date()) => {
  if (!String(text ?? '').trim()) return null;
  const read = readDeliveryDate(text, now);
  if (!read.ok) return { error: true, text: uiText(ERROR_TEXTS[read.reason] || ERROR_TEXTS.invalid, language) };
  const date = formatDeliveryDateForInput(read);
  if (read.future) {
    return { error: false, text: uiText('Розпізнано {date}: пологи очікуються через {weeks} тиж. Вірно?', language, { date, weeks: read.weeksAhead }) };
  }
  const ago = formatDeliveryRecency(toStoredDeliveryDate(read), language, now);
  return { error: false, text: uiText('Розпізнано {date}: пологи {ago} тому. Вірно?', language, { date, ago }) };
};

const textFromStored = (stored, now) => {
  const read = readDeliveryDate(stored, now);
  return read.ok ? formatDeliveryDateForInput(read) : String(stored ?? '').trim();
};

const LastDeliveryField = ({ value, onCommit, language = 'uk', now: nowProp, placeholder }) => {
  const now = useMemo(() => nowProp || new Date(), [nowProp]);
  const stored = String(value ?? '').trim();
  const [text, setText] = useState(() => textFromStored(stored, now));
  const focusedRef = useRef(false);

  // Записане приїхало з бази чи змінилось після збереження — поле показує
  // його, якщо людина саме зараз не набирає.
  useEffect(() => {
    if (!focusedRef.current) setText(textFromStored(stored, now));
  }, [stored, now]);

  const commit = () => {
    focusedRef.current = false;
    const trimmed = text.trim();
    if (!trimmed) {
      if (stored) onCommit('');
      return;
    }
    const read = readDeliveryDate(trimmed, now);
    // Нерозпізнане в базу не йде: під полем уже сказано, що не так, а набране
    // лишається в полі, щоб його виправити, а не набирати заново.
    if (!read.ok) return;
    setText(formatDeliveryDateForInput(read));
    const next = toStoredDeliveryDate(read);
    const current = readDeliveryDate(stored, now);
    if (!current.ok || toStoredDeliveryDate(current) !== next) onCommit(next);
  };

  const note = describeDeliveryInput(text, language, now);

  return (
    <>
      <Control>
        <Input
          type="text"
          autoComplete="off"
          data-testid="last-delivery-input"
          value={text}
          $error={Boolean(note?.error)}
          aria-invalid={note?.error ? 'true' : undefined}
          placeholder={placeholder || uiText('Наприклад: 12.05.2019 або 05.2019', language)}
          onFocus={() => { focusedRef.current = true; }}
          onChange={event => setText(event.target.value)}
          onBlur={commit}
          onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }}
        />
        {text ? (
          <ClearButton
            type="button"
            onMouseDown={event => event.preventDefault()}
            onClick={() => { setText(''); if (stored) onCommit(''); }}
            aria-label={uiText('Очистити поле', language)}
          >
            <FiX size={16} />
          </ClearButton>
        ) : null}
      </Control>
      {note ? (
        <Note data-testid="last-delivery-note" role="status" $error={note.error}>{note.text}</Note>
      ) : null}
    </>
  );
};

export default LastDeliveryField;
