import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import {
  FaBalanceScale,
  FaBus,
  FaCalendarAlt,
  FaChevronDown,
  FaChevronRight,
  FaFileSignature,
  FaGift,
  FaHeadset,
  FaHome,
  FaMapMarkerAlt,
  FaShieldAlt,
  FaStethoscope,
  FaTshirt,
  FaUsers,
  FaUtensils,
} from 'react-icons/fa';
import {
  PROGRAM_COVERAGE_MODES,
  PROGRAM_COVERAGE_PER,
  PROGRAM_FAMILY_OPTIONS,
  PROGRAM_OFFER_LABELS,
  describeProgramCoverage,
  describeProgramRequirements,
  evaluateProgram,
  formatProgramPlace,
  listProgramDifferences,
  programBreakdown,
  resolveProgramHighlights,
  summarizeCardPrograms,
} from '../../utils/donorPrograms';
import {
  PROGRAM_CURRENCIES,
  PROGRAM_CURRENCY_SIGNS,
  convertProgramAmount,
  formatProgramMoney,
  formatRateDate,
} from '../../utils/programCurrency';
import {
  buildSurrogacyTimeline,
  formatCycleDateForStorage,
  formatTimelineDate,
  groupTimelineByYear,
  parseCycleDate,
  projectCycleStart,
} from '../../utils/programTimeline';
import { formatDate } from '../inputValidations';
import { describeProgramWishes } from '../../utils/parentWishes';
import { uiText } from '../../utils/uiTranslations';
import { revealCss } from '../../styles/revealAnimation';
import Collapsible, { COLLAPSE_DURATION_MS } from '../Collapsible';
import CalendarPicker from '../CalendarPicker';

const COLLAPSE_SETTLE_MS = COLLAPSE_DURATION_MS + 60;

/*
 * Показ програм агенції чи клініки — один на стрічку, прев'ю «Мого профілю»
 * й попередній перегляд у редакторі програм.
 *
 * Програма — це комерційна пропозиція, і читають її двома кроками:
 *
 *  1. **Згорнута програма** (`ProgramListItem`) — окремий контейнер у тілі
 *     картки агенції: кого шукають і скільки одним рядком («Шукаємо донора
 *     ооцитів — 1 500 $»), де, **усі вимоги** до кандидатки, ознаки, які
 *     вибрала агенція, і її коментар. Рядок «Покриває: проїзд, житло +2»
 *     тут стояв і поступився вимогам: за ними кандидатка вирішує, чи
 *     читати далі, а покриття — уже в деталях.
 *  2. **Деталі програми** — під тим самим контейнером, кнопкою «Деталі
 *     програми» всередині нього: основна й гарантовані виплати рядками,
 *     додаткові — перемикачами, вимоги, переїзд, що ще дає програма (як
 *     саме покривається кожна витрата, своє агенції), коментар організатора
 *     і — у програмі СМ — приблизний графік від місячних до пологів.
 *
 * Сума в заголовку — діапазон (`presentPayRange`): від основної з
 * гарантованими виплатами (`programBreakdown`) до максимальної з усіма
 * додатковими (КС, двійня, досвід). Перемикачі додаткових виплат у деталях
 * рахують «Разом із відміченими» під собою, а заголовка не міняють. Власної
 * назви програми немає — назва це те, кого шукають.
 *
 * Досі програма була рядком без меж, і на картці з однією програмою вона
 * зливалась з описом агенції: заголовок «Програми», під ним «1 програма»,
 * потім «Донор ооцитів київ» (роль людини й сирий текст місця), а сума
 * повторювалась тричі різними словами — «за програму», «Разом за програму»,
 * «Винагорода за цикл». Стрілка біля суми й «Детальніше» внизу розгортали
 * різне, але виглядали однаково.
 *
 * Суми — у валюті, яку обрав читач (`displayCurrency`), і в згорнутій, і в
 * деталях: обрана гривня поруч із найбільшим числом у доларах означала, що
 * вибір нічого не змінив. Оригінал агенції лишається другим рядком, а курс
 * і його дата стоять один раз — під програмами.
 *
 * Кожна змінна кольору має запасну: блок живе і в стрічці (`--matching-*`), і
 * в «Моєму профілі», де оголошені лише `--km-*`. Акцент один — інтерактивне;
 * зелений, червоний і бурштиновий означають збіг з анкетою і більше нічого.
 */

const ACCENT = 'var(--matching-accent, var(--km-accent, #E8791A))';
const BORDER = 'var(--matching-card-border, var(--km-border, #E8E8E2))';
// Текст — зі стрічки, коли блок у стрічці: її палітра своя (`--matching-*`) і
// від теми застосунку не залежить. Успадкований колір там бував білим на
// світлому — суми й вимоги просто зникали.
const TEXT = 'var(--matching-header-text, var(--km-text, #1A1A1A))';
const MUTED = 'var(--matching-muted-text, var(--km-muted, #62665F))';
const CARD_BG = 'var(--matching-card-bg, var(--km-card, #FFFFFF))';
// Контейнер програми — ледь тонований текстом, а не акцентом: у темній темі
// це трохи світліше за картку, у світлій — трохи темніше, і рамка лишається
// волосяною. Акцентний фон читався б кнопкою.
const PROGRAM_BG = `color-mix(in srgb, ${TEXT} 4%, ${CARD_BG})`;
const GOOD = 'var(--km-success, #2E9B55)';
const BAD = '#C8483E';
const UNSURE = '#B7791F';

const VISIBLE_PROGRAMS = 3;

// Спільна анімація розгортання (`styles/revealAnimation`); редактор програм
// бере її звідси ж.
export { revealCss };

// --- гроші у валюті читача -----------------------------------------------------

/**
 * Сума так, як її показувати: у валюті читача першою, оригінал агенції —
 * другим рядком. Без курсу — сам оригінал, без «≈»: вигадане число гірше
 * за чесне в іншій валюті.
 */
export const presentMoney = (money, displayCurrency, rates) => {
  const amount = Number(money?.amount);
  if (!Number.isFinite(amount) || amount <= 0 || !money?.currency) return { primary: '', original: '', converted: false };
  const own = formatProgramMoney(amount, money.currency);
  const approximate = Boolean(money.approximate);
  if (!displayCurrency || displayCurrency === money.currency) {
    return { primary: `${approximate ? '≈ ' : ''}${own}`, original: '', converted: false };
  }
  const converted = convertProgramAmount(amount, money.currency, displayCurrency, rates || undefined);
  if (!Number.isFinite(converted)) return { primary: `${approximate ? '≈ ' : ''}${own}`, original: '', converted: false };
  const step = displayCurrency === 'UAH' ? 100 : 10;
  return {
    primary: `≈ ${formatProgramMoney(Math.round(converted / step) * step, displayCurrency)}`,
    original: own,
    converted: true,
  };
};

// Сума кількох виплат (`programBreakdown`) — одна частина або кілька валют
// без курсу; друге показується як є, частинами.
const presentSum = (sum, displayCurrency, rates) => {
  if (!sum || !(sum.amount > 0)) return { primary: '', original: '', converted: false };
  const parts = sum.parts.filter(part => part.amount > 0);
  if (parts.length !== 1) {
    return { primary: parts.map(part => formatProgramMoney(part.amount, part.currency)).join(' + '), original: '', converted: false };
  }
  return presentMoney({ amount: parts[0].amount, currency: parts[0].currency, approximate: sum.approximate }, displayCurrency, rates);
};

const plainMoney = (money, displayCurrency, rates) => presentMoney(money, displayCurrency, rates).primary;

// «1 500–2 300 $»: валюта одна — знак лише в кінці; «≈» один на весь діапазон.
const joinRange = (low, high) => {
  if (!low || !high || low === high) return low || high || '';
  const approx = /^≈ /.test(low) || /^≈ /.test(high);
  const lo = low.replace(/^≈ /, '');
  const hi = high.replace(/^≈ /, '');
  // Сума з кількох валют без курсу («1 000 $ + 500 €») діапазоном не стискається.
  if (lo.includes(' + ') || hi.includes(' + ')) return `${low} – ${high}`;
  const unit = /\s(\S+)$/;
  const loUnit = lo.match(unit)?.[1];
  const sameUnit = loUnit && loUnit === hi.match(unit)?.[1];
  return `${approx ? '≈ ' : ''}${sameUnit ? lo.replace(unit, '') : lo}–${hi}`;
};

/**
 * Винагорода програми діапазоном: від основної (з гарантованими виплатами)
 * до максимальної — з усіма додатковими. Без додаткових — одне число.
 */
export const presentPayRange = (breakdown, displayCurrency, rates) => {
  const low = presentSum(breakdown?.guaranteed, displayCurrency, rates);
  const grows = breakdown?.additional?.length > 0 && breakdown.max.amount > breakdown.guaranteed.amount;
  if (!grows) return { ...low, range: false };
  const high = presentSum(breakdown.max, displayCurrency, rates);
  if (!low.primary || !high.primary) return { ...low, range: false };
  return {
    primary: joinRange(low.primary, high.primary),
    original: low.original && high.original ? joinRange(low.original, high.original) : '',
    converted: low.converted || high.converted,
    range: true,
  };
};

// --- спільні частини -------------------------------------------------------------

const SectionTitle = styled.h5`
  margin: 0 0 6px;
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: ${MUTED};
`;

const Section = styled.section`
  & + & { margin-top: 14px; }
`;

// Доплата — перемикач, а не рядок: відмічене додається до суми в заголовку.
// Увесь рядок — одна кнопка: квадратик 14 px сам по собі не мішень для пальця.
const BonusRow = styled.button`
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 36px;
  padding: 4px 0;
  border: 0;
  background: transparent;
  color: ${TEXT};
  font: inherit;
  font-size: 13.5px;
  text-align: left;
  cursor: pointer;

  > i {
    display: grid;
    place-items: center;
    width: 18px;
    height: 18px;
    border-radius: 5px;
    border: 1.5px solid ${({ $on }) => ($on ? ACCENT : BORDER)};
    background: ${({ $on }) => ($on ? ACCENT : 'transparent')};
    color: #fff;
    font-size: 12px;
    font-style: normal;
    line-height: 1;
  }
  > span small { display: block; font-size: 12px; color: ${MUTED}; }
  > b { font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; color: ${({ $on }) => ($on ? TEXT : MUTED)}; }

  &:focus-visible { outline: 2px solid ${ACCENT}; outline-offset: 2px; border-radius: 6px; }
`;

const Chips = styled.ul`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
`;

const tone = ok => (ok === true ? GOOD : ok === false ? BAD : ok === null ? UNSURE : '');

// Вимога — рамка; збіг з анкетою читачки фарбує рамку й ставить значок.
const Chip = styled.li`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 26px;
  padding: 0 9px;
  border-radius: 999px;
  font-size: 12.5px;
  color: ${TEXT};
  border: 1px solid ${({ $ok }) => (tone($ok) ? `color-mix(in srgb, ${tone($ok)} 50%, transparent)` : BORDER)};
  background: ${({ $ok }) => (tone($ok) ? `color-mix(in srgb, ${tone($ok)} 8%, transparent)` : CARD_BG)};

  b { font-weight: 700; color: ${({ $ok }) => tone($ok) || TEXT}; }
  em { font-style: normal; color: ${MUTED}; }
  &.differs { font-weight: 600; }
`;

// Що покриває організація — не вимога, і виглядати як вимога не має: список
// зі значками, а не рамки. Подробиці (як саме покривають, межа, примітка)
// стоять під назвою дрібніше.
const CoverList = styled.ul`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 8px 14px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 13.5px;
  color: ${TEXT};

  li { display: grid; grid-template-columns: 16px minmax(0, 1fr); gap: 8px; align-items: start; }
  li > svg { width: 14px; height: 14px; margin-top: 2px; color: ${MUTED}; }
  li small { display: block; font-size: 12px; line-height: 1.4; color: ${MUTED}; }
`;

const PlaceList = styled.dl`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 4px 12px;
  margin: 0;
  font-size: 13.5px;

  dt { color: ${MUTED}; }
  dd { margin: 0; color: ${TEXT}; overflow-wrap: anywhere; }
`;

const Note = styled.p`
  margin: 0;
  font-size: 13.5px;
  line-height: 1.5;
  color: ${TEXT};
  white-space: pre-wrap;
  overflow-wrap: anywhere;
`;

const Hint = styled.p`
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.4;
  color: ${MUTED};
`;

const CurrencyGroup = styled.div`
  display: inline-flex;
  flex: 0 0 auto;
  padding: 2px;
  border: 1px solid ${BORDER};
  border-radius: 999px;
`;

const CurrencyButton = styled.button`
  min-width: 32px;
  min-height: 26px;
  padding: 0 8px;
  border: 0;
  border-radius: 999px;
  background: ${({ $on }) => ($on ? ACCENT : 'transparent')};
  color: ${({ $on }) => ($on ? '#fff' : MUTED)};
  font: inherit;
  font-size: 12.5px;
  font-weight: 700;
  cursor: pointer;

  &:hover { color: ${({ $on }) => ($on ? '#fff' : TEXT)}; }
  &:focus-visible { outline: 2px solid ${ACCENT}; outline-offset: 1px; }
`;

const REQUIREMENT_FIX_HINTS = Object.freeze({
  age: 'Вкажіть дату народження в анкеті',
  bmi: 'Вкажіть зріст і вагу в анкеті',
  height: 'Вкажіть зріст в анкеті',
  rh: 'Вкажіть групу крові в анкеті',
  marital: 'Вкажіть сімейний стан в анкеті',
  ownKids: 'Вкажіть кількість пологів в анкеті',
  births: 'Вкажіть кількість пологів в анкеті',
  csection: 'Вкажіть кількість КР в анкеті',
});

/** Перемикач валюти — сегментом поруч із заголовком програм. */
export const ProgramCurrencySwitch = ({ value, onChange, language }) => (
  <CurrencyGroup role="group" aria-label={uiText('Валюта сум', language)}>
    {PROGRAM_CURRENCIES.map(code => (
      <CurrencyButton
        key={code}
        type="button"
        $on={value === code}
        aria-pressed={value === code}
        title={code}
        aria-label={code}
        onClick={event => { event.stopPropagation(); onChange(code); }}
      >
        {PROGRAM_CURRENCY_SIGNS[code]}
      </CurrencyButton>
    ))}
  </CurrencyGroup>
);

const monthWord = (count, language) => {
  if (language === 'en') return count === 1 ? 'month' : 'months';
  return 'міс';
};

/** Що пропонує програма — назва пропозиції, а не роль людини. */
export const programHeading = (program, language) => uiText(PROGRAM_OFFER_LABELS[program?.type] || '', language);

const requirementText = (item, language) => uiText(item.text, language, item.variables && item.variables.label
  ? { ...item.variables, label: uiText(item.variables.label, language) }
  : item.variables);

// Побажання — чіп поруч із вимогами, але без «✕»: за ним не відмовляють.
const WishChip = ({ item }) => (
  <Chip $ok={item.ok} data-testid={`program-wish-${item.key}`}>
    {item.ok ? <b aria-hidden="true">✓</b> : null}
    {item.text}
  </Chip>
);

const highlightText = (item, language) => {
  if (item.variables?.label) return uiText(item.text, language, { ...item.variables, label: uiText(item.variables.label, language).toLowerCase() });
  return uiText(item.text, language, item.variables);
};

const COVERAGE_ICONS = Object.freeze({
  travel: FaBus,
  housing: FaHome,
  food: FaUtensils,
  clothes: FaTshirt,
  exams: FaStethoscope,
  insurance: FaShieldAlt,
  legal: FaBalanceScale,
  notary: FaFileSignature,
  support: FaHeadset,
  family: FaUsers,
});

const coverageDetailText = (item, language, displayCurrency, rates) => {
  const parts = [];
  const mode = PROGRAM_COVERAGE_MODES.find(option => option.key === item.mode);
  if (mode) parts.push(uiText(mode.label, language));
  if (item.limit) {
    const per = PROGRAM_COVERAGE_PER.find(option => option.key === (item.per || 'total'));
    const amount = plainMoney(item.limit, displayCurrency, rates);
    parts.push(item.per ? `${uiText('до {amount}', language, { amount })} ${uiText(per.label, language)}` : uiText('до {amount}', language, { amount }));
  }
  if (item.note) parts.push(item.note);
  return parts.join(' · ');
};

/**
 * Згорнутий рядок покриття: «Проїзд, житло +2». Число «покриття: 4» не
 * казало, що саме покривають, а саме це й питають.
 */
export const summarizeCoverageLine = (program, language, limit = 2) => {
  const { all } = describeProgramCoverage(program);
  if (!all.length) return '';
  const names = all.slice(0, limit).map((item, index) => {
    if (item.custom) return item.label;
    const label = uiText(item.label, language);
    return index === 0 ? label : label.toLowerCase();
  });
  const rest = all.length - names.length;
  return `${names.join(', ')}${rest > 0 ? ` +${rest}` : ''}`;
};

// --- приблизний графік програми ---------------------------------------------

// Кнопка графіка — картка-запрошення, а не ще одна пігулка: голий підпис
// у рамці губився серед чіпів вимог, і що там за ним — не казав нічого.
// Тонована підкладка кольору акценту, значок календаря, назва й під нею
// що саме складеться.
const TimelineToggle = styled.button`
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  margin: 4px 0 2px;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, ${ACCENT} 35%, transparent);
  border-radius: 14px;
  background: color-mix(in srgb, ${ACCENT} 9%, ${CARD_BG});
  color: ${TEXT};
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.15s ease, border-color 0.15s ease;

  &:hover { background: color-mix(in srgb, ${ACCENT} 14%, ${CARD_BG}); border-color: ${ACCENT}; }
  &:focus-visible { outline: 2px solid ${ACCENT}; outline-offset: 2px; }

  .icon {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 38px;
    border-radius: 11px;
    background: ${ACCENT};
    color: #fff;
    font-size: 17px;
  }
  .text { display: flex; flex: 1; flex-direction: column; gap: 2px; min-width: 0; }
  .title { font-size: 14.5px; font-weight: 700; color: ${ACCENT}; }
  .sub { font-size: 12.5px; color: ${MUTED}; }
  .chevron { flex: none; color: ${ACCENT}; font-size: 13px; }
`;

const TimelineControls = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 8px 14px;
  margin-bottom: 10px;

  label { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; color: ${MUTED}; }
  .date-field { display: flex; flex-direction: column; gap: 4px; }
  .date-row { display: flex; align-items: center; gap: 6px; }
  .calendar-button {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border: 1px solid ${BORDER};
    border-radius: 10px;
    background: ${CARD_BG};
    color: ${ACCENT};
    font-size: 16px;
    cursor: pointer;
  }
  .calendar-button[data-on] { border-color: ${ACCENT}; background: color-mix(in srgb, ${ACCENT} 12%, ${CARD_BG}); }
  .calendar-button:focus-visible { outline: 2px solid ${ACCENT}; outline-offset: 2px; }
  input.date {
    width: 11ch;
    min-height: 38px;
    padding: 0 10px;
    border: 1px solid ${BORDER};
    border-radius: 10px;
    background: ${CARD_BG};
    color: ${TEXT};
    font: inherit;
    font-size: 16px;
    font-variant-numeric: tabular-nums;
    box-sizing: content-box;
  }
  input.date:focus { outline: none; border-color: ${ACCENT}; box-shadow: 0 0 0 3px color-mix(in srgb, ${ACCENT} 20%, transparent); }
  label.check { flex-direction: row; align-items: center; gap: 8px; min-height: 38px; font-size: 13.5px; color: ${TEXT}; cursor: pointer; }
  label.check input { width: 18px; height: 18px; margin: 0; accent-color: ${ACCENT}; }
`;

// Дві колонки на весь список, а не на рядок: ліворуч дата з днем тижня й
// днем циклу чи тижнем вагітності — разом, одним блоком; праворуч назва
// події, і всі назви починаються з одного вертикального краю. Колонка
// ширини за найдовшою датою (`max-content`), тому «04.01 пн (12 тиж.)» і
// «30.10 пт (19 день)» не зсувають подію. Тире між ними пішло: рівний край
// і так відділяє назву.
const TimelineList = styled.ol`
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 13.5px;
  line-height: 1.45;
  color: ${TEXT};
  ${revealCss}

  li { display: contents; }
  li > span { padding: 4px 0; }
  li + li > span { border-top: 1px solid color-mix(in srgb, ${BORDER} 60%, transparent); }
  /* Проміжок — відступом першої комірки, а не column-gap: інакше риска між
     рядками рвалась би посередині. */
  .when { padding-right: 16px; white-space: nowrap; font-variant-numeric: tabular-nums; }
  time { font-weight: 700; }
  em { font-style: normal; color: ${MUTED}; }
  li.key time, li.key .what { color: ${ACCENT}; font-weight: 700; }
  li.key em { color: ${ACCENT}; }
  li.year > span { grid-column: 1 / -1; padding-top: 10px; font-weight: 800; color: ${MUTED}; letter-spacing: 0.04em; }
`;

const TIMELINE_SAVE_DELAY_MS = 800;

// Поле дати — текст `дд.мм.рррр`, а не `<input type="date">`. Нативне поле в
// Chrome на Android на дотик лише виділяло сегмент плейсхолдера («рррр»), а
// ні календаря, ні клавіатури не відкривало — увести дату місячних було
// нічим. Цифрова клавіатура й маска крапками — той самий набір дати, що й у
// формі анкети (`formatDate` з `inputValidations`). Поруч — власний календар
// (`CalendarPicker`): вибирати день дотиком зручніше, ніж набирати, а свій
// календар, на відміну від нативного, однаковий у кожному браузері.
const toTimelineInputValue = date => {
  if (!date) return '';
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${d}.${m}.${date.getFullYear()}`;
};
const KEY_TIMELINE_EVENTS = new Set(['transfer', 'week40']);

/**
 * Приблизний графік програми СМ: від першого дня місячних до пологів.
 *
 * Дата місячних — поле анкети читачки (`lastCycle`): записане підставляється
 * само, порожнє вона вводить тут, і будь-яке правиться. Уведене пишеться в її
 * анкету (`onLastCycleChange`), з паузою, щоб набір дати по цифрі не писав
 * кожну проміжну, — і негайно на blur та коли графік зникає з екрана (згорнули
 * деталі, пішли зі сторінки): поки запис чекав лише таймера, дата, обрана за
 * мить до згортання чи перезавантаження, не доїжджала в анкету, і наступне
 * відкриття знову питало її. Без колбека (прев'ю агенції в редакторі) графік
 * лише рахується. Рядок — «27.11 пн (19 день)  Перенос ембріона»: ліворуч дата з
 * днем тижня й днем циклу (перенос, диферелін) або тижнем вагітності, праворуч
 * подія з одного вертикального краю; де починається новий рік — рядок із роком. Дати рахує `programTimeline` тією
 * самою логікою робочих днів, що й графік стимуляції.
 */
export const ProgramTimeline = ({ lastCycle = '', onLastCycleChange, language }) => {
  const [open, setOpen] = useState(false);
  const saved = formatCycleDateForStorage(parseCycleDate(lastCycle));
  const [value, setValue] = useState(() => toTimelineInputValue(parseCycleDate(saved)));
  const [dipherelin, setDipherelin] = useState(false);
  const savedRef = useRef(saved);
  useEffect(() => {
    // Записане ззовні (інша вкладка, «Мій профіль») підхоплюється, поки
    // читачка не почала правити своє.
    if (saved !== savedRef.current) {
      savedRef.current = saved;
      setValue(toTimelineInputValue(parseCycleDate(saved)));
    }
  }, [saved]);
  // Останні значення — у ref: запис на розмонтуванні й `pagehide` бачить їх, а
  // не ті, що були на першому рендері.
  const pendingRef = useRef({ value, onLastCycleChange });
  pendingRef.current = { value, onLastCycleChange };
  const commit = useCallback(() => {
    const { value: typed, onLastCycleChange: save } = pendingRef.current;
    const next = formatCycleDateForStorage(parseCycleDate(typed));
    if (!save || !next || next === savedRef.current) return;
    savedRef.current = next;
    save(next);
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(commit, TIMELINE_SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [commit, onLastCycleChange, value]);
  useEffect(() => {
    window.addEventListener('pagehide', commit);
    return () => {
      window.removeEventListener('pagehide', commit);
      commit();
    };
  }, [commit]);

  if (!open) {
    return (
      <TimelineToggle type="button" aria-label={uiText('Приблизний графік програми', language)} onClick={event => { event.stopPropagation(); setOpen(true); }}>
        <span className="icon" aria-hidden="true"><FaCalendarAlt /></span>
        <span className="text">
          <span className="title">{uiText('Приблизний графік програми', language)}</span>
          <span className="sub">{uiText('Від місячних до пологів — дати по днях', language)}</span>
        </span>
        <FaChevronRight className="chevron" aria-hidden="true" />
      </TimelineToggle>
    );
  }
  // Дата з календаря пишеться одразу: вибір дотиком — уже завершений намір,
  // і чекати таймера чи blur тут нема чого.
  const selectDate = date => {
    const next = toTimelineInputValue(date);
    setValue(next);
    pendingRef.current = { ...pendingRef.current, value: next };
    commit();
  };
  return <TimelineReveal><TimelineBody {...{ value, setValue, selectDate, commit, dipherelin, setDipherelin, language }} /></TimelineReveal>;
};

// Графік розгортається з кнопки тією самою висотою, що й деталі програми.
const TimelineReveal = ({ children }) => {
  const [open, setOpen] = useState(false);
  useEffect(() => { setOpen(true); }, []);
  return <Collapsible open={open}>{children}</Collapsible>;
};

const TimelineBody = ({ value, setValue, selectDate, commit, dipherelin, setDipherelin, language }) => {
  const inputId = useId();
  // Порожня дата — календар відкритий одразу: вибрати день дотиком швидше,
  // ніж набирати його цифрами.
  const [calendarOpen, setCalendarOpen] = useState(() => !parseCycleDate(value));
  const { date: start, projected } = projectCycleStart(parseCycleDate(value));
  const items = buildSurrogacyTimeline(start, { dipherelin });
  const weekUnit = language === 'en' ? 'wk' : 'тиж.';
  const dayUnit = language === 'en' ? 'day' : 'день';
  return (
    <div data-testid="program-timeline" onClick={event => event.stopPropagation()}>
      <SectionTitle>{uiText('Приблизний графік програми', language)}</SectionTitle>
      <TimelineControls>
        <div className="date-field">
          <label htmlFor={inputId}>{uiText('Перший день останньої менструації', language)}</label>
          <div className="date-row">
            <input
              id={inputId}
              className="date"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              maxLength={10}
              placeholder={uiText('дд.мм.рррр', language)}
              value={value}
              onChange={event => setValue(formatDate(event.target.value, true))}
              onBlur={commit}
            />
            <button
              type="button"
              className="calendar-button"
              aria-label={uiText('Вибрати дату в календарі', language)}
              aria-expanded={calendarOpen}
              data-on={calendarOpen ? 'true' : undefined}
              onClick={() => setCalendarOpen(current => !current)}
            >
              <FaCalendarAlt aria-hidden="true" />
            </button>
          </div>
        </div>
        <label className="check">
          <input type="checkbox" checked={dipherelin} onChange={event => setDipherelin(event.target.checked)} />
          {uiText('Стимуляція з дифереліном', language)}
        </label>
      </TimelineControls>
      <Collapsible open={calendarOpen}>
        <CalendarPicker
          value={parseCycleDate(value)}
          language={language}
          onSelect={date => { selectDate(date); setCalendarOpen(false); }}
        />
      </Collapsible>
      {items.length ? (
        <>
          {projected ? (
            <Hint>{uiText('Рахуємо від наступних очікуваних місячних — {date} (цикл 28 днів)', language, { date: formatTimelineDate(start, language) })}</Hint>
          ) : null}
          <TimelineList aria-label={uiText('Приблизний графік програми', language)}>
            {groupTimelineByYear(items).map(item => (item.year ? (
              <li key={item.key} className="year"><span>{item.year}</span></li>
            ) : (
              <li key={item.key} className={KEY_TIMELINE_EVENTS.has(item.key) ? 'key' : undefined}>
                <span className="when">
                  <time dateTime={formatCycleDateForStorage(item.date)}>{formatTimelineDate(item.date, language)}</time>
                  {item.cycleDay !== undefined ? <em> ({item.cycleDay} {dayUnit})</em> : null}
                  {item.week !== undefined ? <em> ({item.week} {weekUnit})</em> : null}
                </span>
                <span className="what">{uiText(item.label, language)}</span>
              </li>
            )))}
          </TimelineList>
          <Hint>{uiText('Дати приблизні: точний графік складає лікар клініки.', language)}</Hint>
        </>
      ) : (
        <Hint>{uiText('Вкажіть дату — і графік складеться сам.', language)}</Hint>
      )}
    </div>
  );
};

// --- деталі програми ---------------------------------------------------------

const Details = styled.div`
  color: ${TEXT};
  font-size: 13.5px;
  line-height: 1.4;
`;

// Попередній перегляд у редакторі показує програму окремо від рядка
// стрічки, тож там вона має власну рамку; у стрічці рамку несе контейнер.
const Framed = styled.article`
  padding: 14px;
  border: 1px solid ${BORDER};
  border-radius: var(--km-radius, 14px);
  background: ${CARD_BG};
`;

const FramedHead = styled.header`
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px 8px;
  margin-bottom: 12px;

  b { font-size: 16px; font-weight: 700; color: ${TEXT}; }
  span { font-size: 13px; color: ${MUTED}; }
`;

const Verdict = styled.p`
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: ${({ $state }) => tone($state === 'match' ? true : $state === 'mismatch' ? false : null)};
`;

const bonusMeta = item => [item.when, item.condition].filter(Boolean).join(' · ');

// Основна й гарантовані виплати — рядки без перемикача: вони вже в сумі.
const PaymentLine = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  min-height: 32px;
  padding: 2px 0;
  font-size: 13.5px;
  color: ${TEXT};

  > span small { display: block; font-size: 12px; color: ${MUTED}; }
  > b { font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
`;

const monthlyDetail = (item, currency, rates, language) => (item.monthsEstimated
  ? uiText('{amount}/міс · скільки місяців — уточніть в агенції', language, { amount: plainMoney(item.money, currency, rates) })
  : uiText('{amount}/міс × {months} {unit}', language, { amount: plainMoney(item.money, currency, rates), months: item.months, unit: monthWord(item.months, language) }));

/**
 * Відмічені читачкою додаткові виплати. Типово не відмічено жодної: сума в
 * заголовку — те, що отримує кожна, а додаткове кандидатка додає сама, якщо
 * воно її стосується.
 */
const useSelectedBonuses = program => {
  const [chosen, setChosen] = useState(() => new Set());
  useEffect(() => {
    setChosen(new Set());
  }, [program.id]);
  const selected = [...chosen];
  const toggle = useCallback(key => setChosen(current => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  }), []);
  return [selected, toggle];
};

/**
 * Деталі програми — під згорнутою частиною того самого контейнера.
 *
 * Розділ без даних не малюється: програма, де агенція вказала саму суму, —
 * це сума в заголовку, а не п'ять порожніх заголовків. Головна сума тут не
 * повторюється: її вже назвав заголовок, а деталі кажуть те, чого там немає.
 *
 * `facts` — анкета читача (`extractViewerProgramFacts`): коли вона є, кожна
 * вимога показує, чи читач їй відповідає. `framed` — окрема картка з назвою
 * (старий попередній перегляд).
 */
export const ProgramCard = ({
  program,
  facts = null,
  rates,
  language,
  framed = false,
  displayCurrency = '',
  selectedBonuses: controlledBonuses,
  onToggleBonus,
  timeline = null,
}) => {
  const [ownBonuses, toggleOwnBonus] = useSelectedBonuses(program);
  // У контейнері стрічки вибір тримає згорнута частина: так він переживає
  // перемальовування деталей.
  const controlled = Array.isArray(controlledBonuses) && typeof onToggleBonus === 'function';
  const selectedBonuses = controlled ? controlledBonuses : ownBonuses;
  const currency = displayCurrency || '';
  const result = facts ? evaluateProgram(program, facts) : null;
  const checkByKey = new Map((result?.checks || []).map(check => [check.key, check.ok]));
  const { main, guaranteedBonuses, additional, total } = programBreakdown(program, { selectedBonusKeys: selectedBonuses, rates });
  const requirements = describeProgramRequirements(program);
  const wishes = describeProgramWishes(program, language, facts);
  const unknown = requirements.filter(item => checkByKey.get(item.key) === null).map(item => REQUIREMENT_FIX_HINTS[item.key]);
  const coverage = describeProgramCoverage(program);
  const relocation = program.relocation || null;
  const toggleBonus = controlled ? onToggleBonus : toggleOwnBonus;
  const state = result ? (result.matches ? (result.uncertain ? 'uncertain' : 'match') : 'mismatch') : '';
  const verdictText = {
    match: 'Вам підходить',
    uncertain: 'Може підходити — уточніть в агенції або доповніть анкету',
    mismatch: 'Не підходить за вимогами',
  }[state];
  const familyLabel = PROGRAM_FAMILY_OPTIONS.find(option => option.key === relocation?.family && option.key)?.label || '';
  const plus = money => plainMoney(money, currency, rates).replace(/^(≈ )?/, (match, approx) => `${approx || ''}+`);
  const lineMoney = item => (item.monthsEstimated ? { ...item.subtotal, approximate: true } : item.subtotal);
  const paidLines = [...(main ? [main] : []), ...guaranteedBonuses];

  const body = (
    <Details data-testid={framed ? undefined : 'program-card'}>
      {paidLines.length > 0 && (guaranteedBonuses.length > 0 || additional.length > 0) ? (
        <Section data-testid="program-payments">
          <SectionTitle>{uiText('Виплати', language)}</SectionTitle>
          {paidLines.map(item => {
            const meta = bonusMeta(item);
            return (
              <PaymentLine key={item.key}>
                <span>
                  {uiText(item.label, language)}
                  {item.months ? <small>{monthlyDetail(item, currency, rates, language)}</small> : null}
                  {meta ? <small>{meta}</small> : null}
                </span>
                <b>{item === main ? plainMoney(item.subtotal, currency, rates) : plus(lineMoney(item))}</b>
              </PaymentLine>
            );
          })}
        </Section>
      ) : null}

      {additional.length ? (
        <Section data-testid="program-bonuses">
          <SectionTitle>{uiText('Додаткові виплати', language)}</SectionTitle>
          {additional.map(item => {
            const meta = bonusMeta(item);
            return (
              <BonusRow
                key={item.key}
                type="button"
                role="checkbox"
                aria-checked={item.selected}
                $on={item.selected}
                onClick={event => { event.stopPropagation(); toggleBonus(item.key); }}
              >
                <i aria-hidden="true">{item.selected ? '✓' : ''}</i>
                <span>
                  {uiText(item.label, language)}
                  {item.months ? <small>{monthlyDetail(item, currency, rates, language)}</small> : null}
                  {meta ? <small>{meta}</small> : null}
                </span>
                <b>{plus(lineMoney(item))}</b>
              </BonusRow>
            );
          })}
          {/* Заголовок програми — діапазон «від … до …» і від вибору не
              міняється; відмічене читачкою рахується тут, під перемикачами. */}
          {additional.some(item => item.selected) && total.amount > 0 ? (
            <PaymentLine data-testid="program-selected-total">
              <span>{uiText('Разом із відміченими', language)}</span>
              <b>{presentSum(total, currency, rates).primary}</b>
            </PaymentLine>
          ) : null}
        </Section>
      ) : null}

      {requirements.length || wishes.length ? (
        <Section>
          <SectionTitle>{uiText('Вимоги', language)}</SectionTitle>
          {verdictText ? <Verdict $state={state}>{uiText(verdictText, language)}</Verdict> : null}
          <Chips>
            {requirements.map(item => {
              const ok = checkByKey.has(item.key) ? checkByKey.get(item.key) : undefined;
              return (
                <Chip key={item.key} $ok={ok}>
                  {ok === true ? <b aria-hidden="true">✓</b> : ok === false ? <b aria-hidden="true">✕</b> : null}
                  {requirementText(item, language)}
                </Chip>
              );
            })}
            {wishes.map(item => <WishChip key={`wish-${item.key}`} item={item} />)}
          </Chips>
          {unknown.length ? <Hint>{[...new Set(unknown)].map(hint => uiText(hint, language)).join(' · ')}</Hint> : null}
        </Section>
      ) : null}

      {relocation ? (
        <Section>
          <SectionTitle>{uiText('Переїзд', language)}</SectionTitle>
          <PlaceList>
            {relocation?.when ? <><dt>{uiText('Переїзд', language)}</dt><dd>{relocation.when}</dd></> : null}
            {familyLabel ? <><dt>{uiText('Сімʼя', language)}</dt><dd>{uiText(familyLabel, language)}</dd></> : null}
          </PlaceList>
          {relocation?.note ? <Hint>{relocation.note}</Hint> : null}
        </Section>
      ) : null}

      {coverage.all.length ? (
        <Section>
          <SectionTitle>{uiText('Додатково покривається', language)}</SectionTitle>
          <CoverList aria-label={uiText('Додатково покривається', language)}>
            {[...coverage.expenses, ...coverage.support, ...coverage.custom].map(item => {
              const Icon = item.custom ? FaGift : COVERAGE_ICONS[item.key] || FaShieldAlt;
              const detail = item.custom ? '' : coverageDetailText(item, language, currency, rates);
              return (
                <li key={item.key}>
                  <Icon aria-hidden="true" />
                  <span>
                    {item.custom ? item.label : uiText(item.label, language)}
                    {detail ? <small>{detail}</small> : null}
                  </span>
                </li>
              );
            })}
          </CoverList>
        </Section>
      ) : null}

      {program.note ? (
        <Section>
          <SectionTitle>{uiText('Коментар організатора', language)}</SectionTitle>
          <Note>{program.note}</Note>
        </Section>
      ) : null}

      {/* Графік — наприкінці: спершу «що дає програма», потім «коли». */}
      {program.type === 'sm' ? (
        <Section>
          <ProgramTimeline language={language} lastCycle={timeline?.lastCycle} onLastCycleChange={timeline?.onLastCycleChange} />
        </Section>
      ) : null}
    </Details>
  );

  if (!framed) return body;
  return (
    <Framed data-testid="program-card">
      <FramedHead>
        <b>{programHeading(program, language)}</b>
        {program.location ? <span>{formatProgramPlace(program.location)}</span> : null}
      </FramedHead>
      {body}
    </Framed>
  );
};

/** Діапазон головних виплат у валюті читача: «1 600–2 500 $» або «≈ 1 360–2 130 €». */
export const formatPayRange = (finals, displayCurrency, rates) => {
  const values = finals
    .map(money => ({ money, converted: convertProgramAmount(money.amount, money.currency, displayCurrency, rates) }))
    .filter(item => Number.isFinite(item.converted));
  if (!values.length) {
    // Без курсу — діапазон у валюті першої програми, і лише з тих, що в ній.
    const currency = finals[0]?.currency;
    const same = finals.filter(money => money.currency === currency).map(money => money.amount);
    if (!same.length) return '';
    const min = Math.min(...same);
    const max = Math.max(...same);
    return min === max ? formatProgramMoney(min, currency) : `${formatProgramMoney(min, currency).replace(/\s+\S+$/, '')}–${formatProgramMoney(max, currency)}`;
  }
  // «≈» — коли хоч одну суму перераховано за курсом: у валюту читача або ще
  // всередині програми (виплата агенції в іншій валюті, `programBreakdown`).
  const converted = values.some(item => item.money.currency !== displayCurrency || item.money.approximate);
  const step = displayCurrency === 'UAH' ? 100 : 10;
  const nums = values.map(item => Math.round(item.converted / step) * step);
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const range = min === max
    ? formatProgramMoney(min, displayCurrency)
    : `${formatProgramMoney(min, displayCurrency).replace(/\s+\S+$/, '')}–${formatProgramMoney(max, displayCurrency)}`;
  return converted ? `≈ ${range}` : range;
};

// --- список програм агенції --------------------------------------------------

const RANGE_TYPE_LABELS = Object.freeze({ ed: 'Донорам', sm: 'Сурогатним мамам' });

// «з 2 програм», але «з 1 програми»: після «з» — родовий відмінок.
const programsGenitive = (count, language) => {
  if (language === 'en') return count === 1 ? 'program' : 'programs';
  return count % 10 === 1 && count % 100 !== 11 ? 'програми' : 'програм';
};

const Panel = styled.section`
  color: ${TEXT};
`;

const PanelHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
`;

const PanelTitle = styled.h4`
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: ${TEXT};

  span { font-weight: 500; color: ${MUTED}; }
`;

const PanelLine = styled.p`
  margin: -4px 0 8px;
  font-size: 12.5px;
  color: ${({ $match }) => ($match ? GOOD : MUTED)};
  font-weight: ${({ $match }) => ($match ? 600 : 400)};

  em { font-style: normal; font-weight: 700; color: ${TEXT}; font-variant-numeric: tabular-nums; }
`;

const ProgramList = styled.ol`
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
`;

// Кожна програма — свій контейнер: при двох-трьох програмах межа між ними
// мусить бути видно без читання, а без меж програма зливалась з описом
// агенції над нею.
const ProgramItem = styled.li`
  padding: 12px 12px 4px;
  border: 1px solid ${BORDER};
  border-radius: 14px;
  background: ${PROGRAM_BG};
`;

const ProgramHead = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 2px 12px;
  border-radius: 8px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;

  &:focus-visible { outline: 2px solid ${ACCENT}; outline-offset: 2px; }
`;

// Кого шукають — заголовком, а скільки — окремим рядком «Винагорода від
// 28 100 $» під ним. Через тире в одному рядку («Шукаємо сурогатну маму —
// 28 100 $») сума читалась як ціна, а не як винагорода кандидатці, і не
// казала, що з додатковими виплатами вона більша.
const ProgramTitle = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 16px;
  font-weight: 700;
  line-height: 1.3;
  color: ${TEXT};
  overflow-wrap: anywhere;
`;

const Sum = styled.span`
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
`;

const Reward = styled.div`
  margin-top: 2px;
  font-size: 15px;
  font-weight: 600;
  line-height: 1.35;
  color: ${TEXT};

  ${Sum} { font-weight: 700; }
`;

const Place = styled.div`
  display: flex;
  align-items: baseline;
  gap: 5px;
  margin-top: 2px;
  font-size: 13px;
  color: ${MUTED};
  overflow-wrap: anywhere;

  svg { flex: 0 0 auto; width: 10px; height: 10px; transform: translateY(1px); }
  &.differs { color: ${TEXT}; }
`;

// Значок збігу — колір і форма, а не лише колір: ✓ / ✕ / ?.
const FitMark = styled.i`
  display: inline-grid;
  place-items: center;
  flex: 0 0 auto;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  font-size: 10px;
  font-style: normal;
  font-weight: 800;
  color: #fff;
  background: ${({ $state }) => tone($state === 'match' ? true : $state === 'mismatch' ? false : null)};
`;

const PayLabel = styled.div`
  margin-top: 1px;
  font-size: 12.5px;
  line-height: 1.4;
  color: ${MUTED};

  strong { font-weight: 600; color: ${TEXT}; }
`;

const Highlights = styled.ul`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 10px 0 0;
  padding: 0;
  list-style: none;

  li {
    display: inline-flex;
    align-items: center;
    min-height: 24px;
    padding: 0 9px;
    border-radius: 999px;
    border: 1px solid ${BORDER};
    background: ${CARD_BG};
    font-size: 12.5px;
    color: ${TEXT};
  }
  li.differs { border-color: color-mix(in srgb, ${TEXT} 45%, transparent); font-weight: 600; }
`;

const CollapsedRequirements = styled(Chips)`
  margin-top: 10px;
`;

// Коментар організатора в згорнутій картці — три рядки, решта в деталях.
const OrganizerNote = styled.p`
  display: -webkit-box;
  margin: 8px 0 0;
  overflow: hidden;
  font-size: 12.5px;
  line-height: 1.45;
  color: ${MUTED};
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;

  b { font-weight: 600; color: ${TEXT}; }
`;

const ProgramBody = styled.div`
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid ${BORDER};
`;

// Розгортання — словом, у самому контейнері, якого воно стосується:
// стрілка біля суми й «Детальніше» під карткою розгортали різне, а виглядали
// однаково.
export const SectionToggle = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  padding: 0;
  border: 0;
  background: transparent;
  color: ${ACCENT};
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;

  svg { width: 10px; height: 10px; transition: transform 0.15s ease; transform: rotate(${({ $open }) => ($open ? '180deg' : '0deg')}); }
  &:hover { text-decoration: underline; text-underline-offset: 3px; }
  &:focus-visible { outline: 2px solid ${ACCENT}; outline-offset: 2px; border-radius: 6px; }
`;

const MoreButton = styled.button`
  width: 100%;
  min-height: 38px;
  margin-top: 8px;
  border: 1px dashed ${BORDER};
  border-radius: 12px;
  background: transparent;
  color: ${ACCENT};
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;

  &:focus-visible { outline: 2px solid ${ACCENT}; outline-offset: 2px; }
`;

const RateNote = styled.p`
  margin: 8px 0 0;
  font-size: 11.5px;
  color: ${MUTED};
`;

const programFitState = result => {
  if (!result) return '';
  if (!result.matches) return 'mismatch';
  return result.uncertain ? 'uncertain' : 'match';
};

const FIT_LABELS = Object.freeze({ match: 'Вам підходить', uncertain: 'Може підходити', mismatch: 'Не підходить' });
const FIT_MARKS = Object.freeze({ match: '✓', uncertain: '?', mismatch: '✕' });

/**
 * Сума програми — основна плюс гарантовані виплати плюс відмічені читачкою
 * додаткові (без вибору — жодної).
 *
 * Підписів на кшталт «Разом донорці за програму» чи «Винагорода донорці за
 * цикл» під нею більше немає: сума стоїть у заголовку поруч із тим, що
 * пропонують («Донорство ооцитів — 1 500 $»), і пояснювати її другим рядком
 * означало повторити заголовок іншими словами.
 */
export const describeProgramOffer = (program, { rates = null, selectedBonusKeys = null } = {}) => {
  const breakdown = programBreakdown(program, { rates, selectedBonusKeys });
  return { money: breakdown.total.amount > 0 ? breakdown.total : null, breakdown };
};

/**
 * Згорнута програма — пропозиція одним поглядом, у власному контейнері.
 *
 * Винагорода — діапазоном у заголовку («Винагорода 1 500–2 300 $»): від
 * основної з гарантованими до максимальної з усіма додатковими. Чіпів
 * «+5 доплат» і «≈ 540 €/міс» під ним більше немає — вони повторювали те
 * саме число частинами.
 *
 * Розгортання й згортання — плавні (`Collapsible`), і згорнута частина
 * (вимоги, ознаки, коментар) поступається деталям так само плавно.
 */
const ProgramListItem = ({ program, open, onToggle, facts, rates, language, differs, displayCurrency, timeline = null }) => {
  const result = facts ? evaluateProgram(program, facts) : null;
  const fit = programFitState(result);
  const [selectedBonuses, toggleBonus] = useSelectedBonuses(program);
  const breakdown = useMemo(() => programBreakdown(program, { rates }), [program, rates]);
  const shown = breakdown.guaranteed.amount > 0 ? presentPayRange(breakdown, displayCurrency, rates) : null;
  const highlights = useMemo(() => {
    const items = resolveProgramHighlights(program);
    return items.map(item => ({ ...item, differs: Boolean(differs?.has(item.key)) }));
  }, [differs, program]);
  const requirements = describeProgramRequirements(program);
  const wishes = describeProgramWishes(program, language, facts);
  const checkByKey = new Map((result?.checks || []).map(check => [check.key, check.ok]));
  const bodyId = `program-body-${program.id}`;
  const offerLabel = programHeading(program, language);
  const place = program.location ? formatProgramPlace(program.location) : '';
  const itemRef = useRef(null);
  const wasOpenRef = useRef(open);
  // Відкрита програма закриває іншу (одна відкрита на список), і та, що
  // згорнулась вище, тягне цю вгору — інколи за край екрана. Тоді її
  // заголовок повертається в поле зору, коли рух скінчився.
  useEffect(() => {
    const opened = open && !wasOpenRef.current;
    wasOpenRef.current = open;
    if (!opened) return undefined;
    const timer = window.setTimeout(() => {
      const node = itemRef.current;
      if (!node || typeof node.getBoundingClientRect !== 'function') return;
      if (node.getBoundingClientRect().top < 0 && typeof node.scrollIntoView === 'function') {
        node.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, COLLAPSE_SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  return (
    <ProgramItem ref={itemRef} data-testid="program-list-item" onClick={event => event.stopPropagation()}>
      {/* Заголовок розгортає деталі, як і кнопка під програмою: по назві
          тицяють першою, і мертвий дотик читався як «деталей немає». */}
      <ProgramHead
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-controls={open ? bodyId : undefined}
        data-testid="program-head"
        onClick={event => { event.stopPropagation(); onToggle(); }}
        onKeyDown={event => {
          if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
          event.preventDefault();
          onToggle();
        }}
      >
        <div>
          <ProgramTitle data-testid="program-title">
            {fit ? <FitMark role="img" $state={fit} title={uiText(FIT_LABELS[fit], language)} aria-label={uiText(FIT_LABELS[fit], language)}>{FIT_MARKS[fit]}</FitMark> : null}
            <span>{offerLabel}</span>
          </ProgramTitle>
          {shown?.primary ? (
            <Reward data-testid="program-reward">
              {uiText('Винагорода', language)} <Sum>{shown.primary}</Sum>
            </Reward>
          ) : null}
          {shown?.original || !shown?.primary ? (
            <PayLabel data-testid="program-pay-label">
              {shown?.primary ? shown.original : uiText('Суму уточнюйте в агенції', language)}
            </PayLabel>
          ) : null}
          {place ? (
            <Place className={differs?.has('location') ? 'differs' : undefined}>
              <FaMapMarkerAlt aria-hidden="true" />
              <span>{place}</span>
            </Place>
          ) : null}
        </div>
      </ProgramHead>

      <Collapsible open={!open}>
        {requirements.length || wishes.length ? (
          <CollapsedRequirements aria-label={uiText('Вимоги', language)} data-testid="program-requirements">
            {requirements.map(item => {
              const ok = checkByKey.has(item.key) ? checkByKey.get(item.key) : undefined;
              return (
                <Chip key={item.key} $ok={ok} className={differs?.has(item.key) ? 'differs' : undefined}>
                  {ok === true ? <b aria-hidden="true">✓</b> : ok === false ? <b aria-hidden="true">✕</b> : null}
                  {requirementText(item, language)}
                </Chip>
              );
            })}
            {wishes.map(item => <WishChip key={`wish-${item.key}`} item={item} />)}
          </CollapsedRequirements>
        ) : null}
        {highlights.length ? (
          <Highlights aria-label={uiText('Головне', language)}>
            {highlights.map(item => (
              <li key={item.key} className={item.differs ? 'differs' : undefined}>{highlightText(item, language)}</li>
            ))}
          </Highlights>
        ) : null}
        {program.note ? (
          <OrganizerNote data-testid="program-organizer-note"><b>{uiText('Коментар організатора', language)}:</b> {program.note}</OrganizerNote>
        ) : null}
      </Collapsible>

      <Collapsible open={open} id={bodyId}>
        <ProgramBody>
          <ProgramCard
            program={program}
            facts={facts}
            rates={rates}
            language={language}
            displayCurrency={displayCurrency}
            selectedBonuses={selectedBonuses}
            onToggleBonus={toggleBonus}
            timeline={timeline}
          />
        </ProgramBody>
      </Collapsible>

      <SectionToggle
        type="button"
        $open={open}
        aria-expanded={open}
        aria-controls={open ? bodyId : undefined}
        onClick={event => { event.stopPropagation(); onToggle(); }}
      >
        <span>{uiText(open ? 'Згорнути деталі' : 'Деталі програми', language)}</span>
        <FaChevronDown aria-hidden="true" />
      </SectionToggle>
    </ProgramItem>
  );
};

/** Одна програма окремо — попередній перегляд у редакторі, і згорнута, і розгорнута. */
export const ProgramPreview = ({ program, rates, language, displayCurrency, defaultOpen = false }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <ProgramList as="div">
      <ProgramListItem program={program} open={open} onToggle={() => setOpen(value => !value)} rates={rates} language={language} displayCurrency={displayCurrency} />
    </ProgramList>
  );
};

/**
 * Програми агенції в картці стрічки.
 *
 * Заголовок — «Програми · N» з перемикачем валюти поруч; донорці чи СМ під
 * ним — «Вам підходить 1 з 2». Далі контейнер на програму, перші три;
 * решта — «Показати ще». Деталі відкриті в однієї програми: розгорнута
 * згортає ту, що була відкрита до неї.
 *
 * Програми чужого типу (донорці — програми СМ) у список не йдуть: вони
 * названі рядком «ще 1 — для сурогатних мам».
 */
export const AgencyProgramsPanel = ({
  card,
  viewerType = '',
  facts = null,
  rates,
  displayCurrency,
  onDisplayCurrencyChange,
  language,
  defaultOpenId = '',
  onOpen,
  timeline = null,
}) => {
  // Відкрита одна програма на список: розгорнуті поспіль дві-три програми
  // робили картку агенції на кілька екранів, і де закінчується одна й
  // починається інша, вже не було видно.
  const [openId, setOpenId] = useState(defaultOpenId || '');
  const [showAll, setShowAll] = useState(false);
  const summary = summarizeCardPrograms(card, { viewerType, facts });
  const programs = useMemo(() => (summary ? summary.evaluated.map(item => item.program) : []), [summary]);
  const differences = useMemo(() => listProgramDifferences(programs), [programs]);
  if (!summary) return null;
  const visible = showAll ? programs : programs.slice(0, VISIBLE_PROGRAMS);
  const hiddenCount = programs.length - visible.length;
  // Діапазон — лише коли частину програм сховано: видимі контейнери й так
  // називають кожну суму, а діапазон над ними повторив би їх утретє.
  // Донорські й сурогатні суми різняться на порядок, і спільний діапазон
  // «1 500–28 100 $» не казав нічого ні донорці, ні СМ — тож за кількох типів
  // діапазон стоїть окремо на кожен, підписаний, кому він.
  const rangeParts = hiddenCount > 0
    ? (summary.byType.length > 1
      ? summary.byType.map(item => ({
        type: item.type,
        label: uiText(RANGE_TYPE_LABELS[item.type] || '', language),
        text: formatPayRange(item.totals, displayCurrency, rates),
      })).filter(item => item.text)
      : [{ type: '', label: '', text: formatPayRange(summary.finals, displayCurrency, rates) }].filter(item => item.text))
    : [];
  const range = rangeParts.length ? (
    <>
      {rangeParts.map((part, index) => (
        <React.Fragment key={part.type || 'all'}>
          {index ? ' · ' : ''}
          {part.label ? `${part.label}: ` : ''}
          <em>{part.text}</em>
        </React.Fragment>
      ))}
    </>
  ) : null;
  // Рахується серед програм типу читача: решту видно, але звіряти анкету
  // донорки з вимогами програми СМ (і навпаки) нема сенсу.
  const matchedLine = summary.matched !== null
    ? uiText('Вам підходить {matched} з {total} {programs}', language, {
      matched: summary.matched,
      total: summary.ownTotal,
      programs: programsGenitive(summary.ownTotal, language),
    })
    : '';
  const toggle = id => {
    if (openId === id) {
      setOpenId('');
      return;
    }
    setOpenId(id);
    onOpen?.(id);
  };
  // Курс називається один раз — коли бодай одну суму перераховано.
  const converted = Boolean(rates?.rateDate) && displayCurrency
    && programs.some(program => {
      const { lines, bonuses } = programBreakdown(program);
      return [...lines, ...bonuses].some(line => line.money?.currency && line.money.currency !== displayCurrency);
    });

  return (
    <Panel data-testid="programs-summary" onClick={event => event.stopPropagation()}>
      <PanelHead>
        <PanelTitle>{uiText('Програми', language)} <span>· {summary.total}</span></PanelTitle>
        {onDisplayCurrencyChange && programs.length ? (
          <ProgramCurrencySwitch value={displayCurrency} onChange={onDisplayCurrencyChange} language={language} />
        ) : null}
      </PanelHead>
      {matchedLine || range ? (
        <PanelLine $match={summary.matched > 0}>
          {matchedLine}
          {range ? <>{matchedLine ? ' · ' : ''}{range}</> : null}
        </PanelLine>
      ) : null}
      {visible.length ? (
        <ProgramList>
          {visible.map(program => (
            <ProgramListItem
              key={program.id}
              program={program}
              open={openId === program.id}
              onToggle={() => toggle(program.id)}
              facts={viewerType === program.type ? facts : null}
              rates={rates}
              language={language}
              differs={differences.get(program.id)}
              displayCurrency={displayCurrency}
              timeline={timeline}
            />
          ))}
        </ProgramList>
      ) : null}
      {hiddenCount > 0 ? (
        <MoreButton type="button" onClick={event => { event.stopPropagation(); setShowAll(true); }}>
          {uiText('Показати ще {count}', language, { count: hiddenCount })}
        </MoreButton>
      ) : null}
      {converted ? (
        <RateNote>{uiText('≈ — за курсом НБУ на {date}', language, { date: formatRateDate(rates.rateDate) })}</RateNote>
      ) : null}
    </Panel>
  );
};

// Стара назва: рядок стрічки звав блок саме так.
export const ProgramsSummary = AgencyProgramsPanel;

