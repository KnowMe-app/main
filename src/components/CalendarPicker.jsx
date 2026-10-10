import React, { useMemo, useState } from 'react';
import styled from 'styled-components';
import { uiText } from '../utils/uiTranslations';

/*
 * Календар вибору дати — власний, а не `<input type="date">`.
 *
 * Нативне поле дати поводиться в кожному браузері по-своєму: у Chrome на
 * Android воно на дотик лише виділяло сегмент плейсхолдера й не відкривало ні
 * календаря, ні клавіатури, а у Firefox і Safari календар інший і з іншим
 * першим днем тижня. Тут сітка місяця — звичайні кнопки, тож працює однаково
 * всюди, де працює застосунок, і пальцем, і мишею, і з клавіатури.
 *
 * Тиждень починається з понеділка; майбутні дні можна заборонити (`maxDate`)
 * — для місячних «наперед» немає сенсу. Кольори мають запасні: календар живе і
 * в стрічці (`--matching-*`), і поза нею (`--km-*`).
 */

const ACCENT = 'var(--matching-accent, var(--km-accent, #E8791A))';
const BORDER = 'var(--matching-card-border, var(--km-border, #E8E8E2))';
const TEXT = 'var(--matching-header-text, var(--km-text, #1A1A1A))';
const MUTED = 'var(--matching-muted-text, var(--km-muted, #62665F))';
const CARD_BG = 'var(--matching-card-bg, var(--km-card, #FFFFFF))';

const MONTHS = Object.freeze({
  uk: ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
});
const WEEKDAYS = Object.freeze({
  uk: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'],
  en: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'],
});

const sameDay = (a, b) => Boolean(a && b)
  && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const atMidnight = date => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
};

/** Дні сітки місяця — з понеділка, з хвостами сусідніх місяців до повних тижнів. */
export const buildMonthGrid = (year, month) => {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = Math.ceil((offset + daysInMonth) / 7) * 7;
  return Array.from({ length: cells }, (_, index) => new Date(year, month, index - offset + 1));
};

const Wrap = styled.div`
  width: min(100%, 320px);
  margin: 0 0 12px;
  padding: 10px;
  border: 1px solid ${BORDER};
  border-radius: 14px;
  background: ${CARD_BG};
  color: ${TEXT};
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  box-sizing: border-box;
`;

const Head = styled.div`
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) 40px;
  align-items: center;
  margin-bottom: 6px;

  b { text-align: center; font-size: 14.5px; font-weight: 700; }
`;

const NavButton = styled.button`
  width: 40px;
  height: 40px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: ${TEXT};
  font: inherit;
  font-size: 18px;
  cursor: pointer;

  &:hover:not(:disabled) { background: color-mix(in srgb, ${TEXT} 8%, transparent); }
  &:disabled { opacity: 0.3; cursor: default; }
  &:focus-visible { outline: 2px solid ${ACCENT}; outline-offset: 1px; }
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 2px;
`;

const Weekday = styled.span`
  display: grid;
  place-items: center;
  height: 26px;
  font-size: 11.5px;
  font-weight: 700;
  color: ${MUTED};
`;

const Day = styled.button`
  height: 40px;
  border: 1px solid ${({ $today }) => ($today ? ACCENT : 'transparent')};
  border-radius: 10px;
  background: ${({ $selected }) => ($selected ? ACCENT : 'transparent')};
  color: ${({ $selected, $outside }) => ($selected ? '#fff' : $outside ? MUTED : TEXT)};
  opacity: ${({ $outside }) => ($outside ? 0.55 : 1)};
  font: inherit;
  font-size: 14px;
  font-weight: ${({ $selected }) => ($selected ? 700 : 500)};
  font-variant-numeric: tabular-nums;
  cursor: pointer;

  &:hover:not(:disabled) { background: ${({ $selected }) => ($selected ? ACCENT : `color-mix(in srgb, ${ACCENT} 14%, transparent)`)}; }
  &:disabled { opacity: 0.25; cursor: default; }
  &:focus-visible { outline: 2px solid ${ACCENT}; outline-offset: 1px; }
`;

const CalendarPicker = ({ value = null, onSelect, maxDate = null, language = 'uk' }) => {
  const lang = language === 'en' ? 'en' : 'uk';
  const today = useMemo(() => atMidnight(new Date()), []);
  const limit = maxDate ? atMidnight(maxDate) : null;
  const initial = value || limit || today;
  const [view, setView] = useState(() => ({ year: initial.getFullYear(), month: initial.getMonth() }));
  const days = buildMonthGrid(view.year, view.month);
  const shift = delta => setView(({ year, month }) => {
    const next = new Date(year, month + delta, 1);
    return { year: next.getFullYear(), month: next.getMonth() };
  });
  const nextMonthStart = new Date(view.year, view.month + 1, 1);
  const canGoNext = !limit || nextMonthStart <= limit;

  return (
    <Wrap data-testid="calendar-picker" role="group" aria-label={uiText('Календар', language)} onClick={event => event.stopPropagation()}>
      <Head>
        <NavButton type="button" aria-label={uiText('Попередній місяць', language)} onClick={() => shift(-1)}>‹</NavButton>
        <b aria-live="polite">{MONTHS[lang][view.month]} {view.year}</b>
        <NavButton type="button" aria-label={uiText('Наступний місяць', language)} disabled={!canGoNext} onClick={() => shift(1)}>›</NavButton>
      </Head>
      <Grid>
        {WEEKDAYS[lang].map(day => <Weekday key={day} aria-hidden="true">{day}</Weekday>)}
        {days.map(day => {
          const outside = day.getMonth() !== view.month;
          const selected = sameDay(day, value);
          const disabled = Boolean(limit && day > limit);
          return (
            <Day
              key={day.getTime()}
              type="button"
              $outside={outside}
              $selected={selected}
              $today={sameDay(day, today)}
              aria-pressed={selected}
              aria-label={`${day.getDate()} ${MONTHS[lang][day.getMonth()]} ${day.getFullYear()}`}
              disabled={disabled}
              onClick={() => onSelect?.(day)}
            >
              {day.getDate()}
            </Day>
          );
        })}
      </Grid>
    </Wrap>
  );
};

export default CalendarPicker;
