import React, { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { FiChevronDown, FiX } from 'react-icons/fi';
import { calendarMonthNames } from './CalendarPicker';
import { formatDateToDisplay } from './inputValidations';
import { parseProfileDate, readPastDateIssue } from '../utils/profileDate';
import { uiText } from '../utils/uiTranslations';

/*
 * «Останні пологи» — місяць і рік зі списку, а не дата, набрана текстом.
 *
 * Поле було текстовим з маскою `дд.мм.рррр`, і правильно воно приймало лише
 * дату з нулями попереду. Набрана крапка зникала, тож «1.5.2019» ставало
 * «15.20.19», рік «2019» — «20.19», «05.2019» — «05.20.19», а майбутній рік
 * ішов у базу без жодного слова. Картка таку дату мовчки не показує
 * (`deliveryRecency`), тож людина вважала поле заповненим, а агенція бачила
 * пологи без «коли». Із трьох СМ, які заповнили анкету 23.10, правильної дати
 * не лишила жодна: одна поле пропустила й далі не заповнила вже нічого, в
 * іншої лягло «13.01.22», у третьої — 2027 рік.
 *
 * Точний день тут і не потрібен: картка каже «останні 14 міс тому», а агенція
 * питає, чи минуло досить часу після пологів. Тож питаємо те, що людина
 * памʼятає напевно, — місяць і рік. Списки на телефоні відкриваються
 * колесом вибору, без клавіатури, і майбутнього в них немає. День лишається
 * той, що вже був записаний (уточнюючи рік, людина його не губить), а для нової
 * дати — перше число.
 */

export const LAST_DELIVERY_YEARS_BACK = 45;

const pad2 = value => String(value).padStart(2, '0');

const EMPTY_SELECTION = Object.freeze({ month: '', year: '', day: '' });

const readSelection = (stored, now) => {
  if (!stored || readPastDateIssue(stored, now)) return EMPTY_SELECTION;
  const parsed = parseProfileDate(stored);
  return parsed ? { month: String(Number(parsed.mo)), year: parsed.y, day: parsed.d } : EMPTY_SELECTION;
};

/**
 * Дата з вибраних місяця й року — у тому ж `дд.мм.рррр`, яким поле живе в
 * анкеті (у базу її переводить `normalizeStoredDates`). День — записаний
 * раніше, урізаний до довжини місяця й до сьогодні, інакше перше число.
 */
export const composeLastDeliveryDate = ({ month, year, day }, now = new Date()) => {
  const m = Number(month);
  const y = Number(year);
  if (!m || !y) return '';
  let d = Math.min(Math.max(Number(day) || 1, 1), new Date(y, m, 0).getDate());
  if (y === now.getFullYear() && m === now.getMonth() + 1) d = Math.min(d, now.getDate());
  return `${pad2(d)}.${pad2(m)}.${y}`;
};

const sameDate = (a, b) => {
  const left = parseProfileDate(a);
  const right = parseProfileDate(b);
  return Boolean(left && right) && left.d === right.d && left.mo === right.mo && left.y === right.y;
};

const Row = styled.div`
  position: relative;
  display: flex;
  gap: 8px;
  padding-right: 34px;
`;

const SelectWrap = styled.div`
  position: relative;
  flex: ${({ $grow }) => $grow};
  min-width: 0;

  svg {
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--muted);
    pointer-events: none;
  }
`;

// Заливка без рамки, як у текстових полів анкети; рамка — на фокусі.
const Select = styled.select`
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  appearance: none;
  background: var(--km-fill);
  border: 1.5px solid transparent;
  border-radius: 10px;
  padding: 10px 34px 10px 14px;
  font: inherit;
  color: ${({ $empty }) => ($empty ? 'var(--muted)' : 'var(--text)')};
  outline: none;
  &:focus { background: var(--card); border-color: var(--accent); box-shadow: 0 0 0 3px var(--km-accent-ring); }
`;

const ClearButton = styled.button`
  position: absolute;
  top: 50%;
  right: 0;
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

const Issue = styled.p`
  margin: 8px 0 0;
  font-size: 13px;
  line-height: 1.4;
  color: var(--km-danger, #B42318);
`;

const LastDeliveryField = ({ value, onCommit, language = 'uk', now: nowProp }) => {
  const now = useMemo(() => nowProp || new Date(), [nowProp]);
  const stored = String(value ?? '').trim();
  const issue = readPastDateIssue(stored, now);
  const fromValue = useMemo(() => readSelection(stored, now), [stored, now]);
  const [draft, setDraft] = useState(fromValue);
  useEffect(() => { setDraft(fromValue); }, [fromValue]);

  const months = calendarMonthNames(language);
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const years = useMemo(
    () => Array.from({ length: LAST_DELIVERY_YEARS_BACK + 1 }, (_, index) => String(currentYear - index)),
    [currentYear],
  );

  const choose = patch => {
    const next = { ...draft, ...patch };
    setDraft(next);
    if (!next.month || !next.year) return;
    const composed = composeLastDeliveryDate(next, now);
    if (!composed || readPastDateIssue(composed, now) || sameDate(composed, stored)) return;
    onCommit(composed);
  };

  const clear = () => {
    setDraft(EMPTY_SELECTION);
    if (stored) onCommit('');
  };

  return (
    <>
      <Row>
        <SelectWrap $grow="1.4">
          <Select
            aria-label={uiText('Місяць', language)}
            data-testid="last-delivery-month"
            value={draft.month}
            $empty={!draft.month}
            onChange={event => choose({ month: event.target.value })}
          >
            <option value="" disabled>{uiText('Місяць', language)}</option>
            {months.map((label, index) => (
              <option
                key={label}
                value={String(index + 1)}
                disabled={Number(draft.year) === currentYear && index + 1 > currentMonth}
              >
                {label}
              </option>
            ))}
          </Select>
          <FiChevronDown size={16} aria-hidden="true" />
        </SelectWrap>
        <SelectWrap $grow="1">
          <Select
            aria-label={uiText('Рік', language)}
            data-testid="last-delivery-year"
            value={draft.year}
            $empty={!draft.year}
            onChange={event => choose({ year: event.target.value })}
          >
            <option value="" disabled>{uiText('Рік', language)}</option>
            {years.map(year => (
              <option
                key={year}
                value={year}
                disabled={Number(year) === currentYear && Number(draft.month) > currentMonth}
              >
                {year}
              </option>
            ))}
          </Select>
          <FiChevronDown size={16} aria-hidden="true" />
        </SelectWrap>
        {stored || draft.month || draft.year ? (
          <ClearButton type="button" onClick={clear} aria-label={uiText('Очистити поле', language)}>
            <FiX size={16} />
          </ClearButton>
        ) : null}
      </Row>
      {issue && !(draft.month && draft.year) ? (
        <Issue data-testid="last-delivery-issue" role="status">
          {issue === 'future'
            ? uiText('Збережено {date}, а ця дата ще не настала. Оберіть місяць і рік ще раз.', language, { date: formatDateToDisplay(stored) })
            : uiText('Збережено «{value}» — це не дата. Оберіть місяць і рік ще раз.', language, { value: stored })}
        </Issue>
      ) : null}
    </>
  );
};

export default LastDeliveryField;
