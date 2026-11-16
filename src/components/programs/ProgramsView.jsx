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
  PROGRAM_TYPE_LABELS,
  describeProgramCoverage,
  describeProgramHighlights,
  describeProgramRequirements,
  programGuaranteedMoney,
  programGuaranteedUsd,
  evaluateProgram,
  formatProgramPlace,
  listProgramDifferences,
  programBreakdown,
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
import { getExtraLocale } from '../../utils/locales';
import { uiText } from '../../utils/uiTranslations';
import { revealCss } from '../../styles/revealAnimation';
import Collapsible, { COLLAPSE_DURATION_MS } from '../Collapsible';
import CalendarPicker from '../CalendarPicker';
import { getRoleColor } from '../matchingRoleColors';
import { readCardProgramsAt } from '../../utils/programsStore';
import { buildProgramInquiryText, resolveProgramInquiryLink } from '../../utils/programInquiry';

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

const ACCENT = 'var(--matching-accent, var(--km-accent, #C9600F))';
const BORDER = 'var(--matching-card-border, var(--km-border, #E8E8E2))';
// Текст — зі стрічки, коли блок у стрічці: її палітра своя (`--matching-*`) і
// від теми застосунку не залежить. Успадкований колір там бував білим на
// світлому — суми й вимоги просто зникали.
const TEXT = 'var(--matching-header-text, var(--km-text, #1A1A1A))';
const CARD_BG = 'var(--matching-card-bg, var(--km-card, #FFFFFF))';
// Приглушене — частка тексту на тлі картки, а не `--matching-muted-text`: у
// темній палітрі стрічки той токен — 88% білого, і підписи розділів, місто й
// оригінальна сума виглядали так само, як значення під ними, — ієрархія
// блоку зникала. Глобальний токен фарбує всю стрічку, тож пропорція своя
// лише тут; у світлій темі вона дає той самий сірий, що й був (≈ #686868).
const MUTED = `color-mix(in srgb, ${TEXT} 66%, ${CARD_BG})`;
// Контейнер програми — ледь тонований текстом, а не акцентом: у темній темі
// це трохи світліше за картку, у світлій — трохи темніше, і рамка лишається
// волосяною. Акцентний фон читався б кнопкою. 4% у темній темі від картки
// майже не відрізнялись — 5% видно в обох.
const PROGRAM_BG = `color-mix(in srgb, ${TEXT} 5%, ${CARD_BG})`;
const GOOD = 'var(--km-success, #2E9B55)';
const BAD = '#C8483E';
const UNSURE = '#B7791F';

// Згорнута програма — три-чотири рядки, тож п’ять програм уміщаються там,
// де раніше стояли три (≈ 800 px проти ≈ 990 px на 390 px ширини).
const VISIBLE_PROGRAMS = 5;

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

// Підпис розділу — звичайним реченням, як решта підписів матчингу:
// «ВИМОГИ», «ДОДАТКОВО ПОКРИВАЄТЬСЯ» великими літерами були єдиним місцем
// картки, що кричало.
const SectionTitle = styled.h5`
  margin: 0 0 6px;
  font-size: 13px;
  font-weight: 600;
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
  const units = getExtraLocale(language)?.units;
  if (units) return units.month(count);
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
  li.year > span { grid-column: 1 / -1; padding-top: 10px; font-weight: 700; color: ${MUTED}; letter-spacing: 0.04em; }
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
  const units = getExtraLocale(language)?.units;
  const weekUnit = language === 'en' ? 'wk' : units ? units.week : 'тиж.';
  const dayUnit = language === 'en' ? 'day' : units ? units.cycleDay : 'день';
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

const SubTitle = styled.p`
  margin: 10px 0 4px;
  font-size: 12.5px;
  color: ${MUTED};
`;

// Кроки програми — нумерованим списком; тривалість дрібніше під назвою.
const StepList = styled.ol`
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 13.5px;
  color: ${TEXT};

  li { display: grid; grid-template-columns: 22px minmax(0, 1fr); gap: 8px; align-items: start; }
  li > i {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: ${PROGRAM_BG};
    font-size: 12px;
    font-style: normal;
    font-weight: 700;
  }
  li small { display: block; font-size: 12px; color: ${MUTED}; }
`;

const InquiryButton = styled.a`
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  margin-top: 16px;
  border-radius: 12px;
  background: ${ACCENT};
  color: var(--km-on-accent, #fff);
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;

  &:focus-visible { outline: 2px solid ${ACCENT}; outline-offset: 2px; }
`;

const InquiryHint = styled.p`
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.4;
  text-align: center;
  color: ${MUTED};
`;

/**
 * «Написати про цю програму» — лист уже називає програму
 * (`utils/programInquiry`). Канал — з контактів картки (`contact.entries`),
 * дотик рахується як дотик до контакту (`contact.onContactAction`). Без
 * контактів кнопки немає: обіцяти лист, якого нема куди надіслати, гірше.
 */
const ProgramInquiry = ({ program, contact, rates, displayCurrency, language }) => {
  const [copied, setCopied] = useState(false);
  const breakdown = programBreakdown(program, { rates });
  const pay = breakdown.guaranteed.amount > 0 ? presentPayRange(breakdown, displayCurrency, rates).primary : '';
  const text = buildProgramInquiryText({
    offer: uiText(PROGRAM_TYPE_LABELS[program.type] || '', language),
    title: program.location ? formatProgramPlace(program.location) : '',
    pay,
  }, language);
  const link = resolveProgramInquiryLink(contact?.entries, text);
  if (!link) return null;
  const onClick = event => {
    event.stopPropagation();
    contact.onContactAction?.(link.channel);
    if (!link.prefilled && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => setCopied(true), () => {});
    }
  };
  return (
    <div data-testid="program-inquiry">
      <InquiryButton href={link.href} target="_blank" rel="noopener noreferrer" onClick={onClick}>
        {uiText('Написати про цю програму', language)}
      </InquiryButton>
      <InquiryHint>
        {link.prefilled
          ? uiText('Лист уже називає програму — лишиться надіслати', language)
          : uiText(copied ? 'Текст скопійовано — вставте його в чат' : 'Текст про програму скопіюється — вставте його в чат', language)}
      </InquiryHint>
    </div>
  );
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
  contact = null,
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
  // Одна основна виплата без доплат — та сама сума, що в заголовку, і рядок
  // її лише повторював би. Але «коли платять» («після народження») заголовок
  // не каже, і без цього рядка воно зникало з картки зовсім.
  const showPaidLines = paidLines.length > 0 && (guaranteedBonuses.length > 0 || additional.length > 0 || Boolean(main && bonusMeta(main)));

  const steps = Array.isArray(program.steps) ? program.steps : [];
  const showOffer = showPaidLines || additional.length > 0 || coverage.all.length > 0;
  const showProcess = steps.length > 0 || Boolean(relocation);

  // Деталі відповідають на три питання кандидатки по черзі (15.11, на
  // прохання власниці продукту): що я отримаю → що від мене треба → як це
  // відбувається. Доти розділи йшли за полями редактора: «Виплати»,
  // «Додаткові виплати», «Вимоги», «Переїзд», «Додатково покривається».
  const body = (
    <Details data-testid={framed ? undefined : 'program-card'}>
      {showOffer ? (
        <Section data-testid="program-offer">
          <SectionTitle>{uiText('Що ви отримаєте', language)}</SectionTitle>
          {showPaidLines ? (
            <div data-testid="program-payments">
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
            </div>
          ) : null}

          {additional.length ? (
            <div data-testid="program-bonuses">
              <SubTitle>{uiText('Може додатися — відмітьте, що про вас', language)}</SubTitle>
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
            </div>
          ) : null}

          {coverage.all.length ? (
            <>
              <SubTitle>{uiText('Додатково покривається', language)}</SubTitle>
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
            </>
          ) : null}
        </Section>
      ) : null}

      {requirements.length || wishes.length ? (
        <Section>
          <SectionTitle>{uiText('Що від вас потрібно', language)}</SectionTitle>
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

      {showProcess ? (
        <Section data-testid="program-process">
          <SectionTitle>{uiText('Як це відбувається', language)}</SectionTitle>
          {steps.length ? (
            <StepList data-testid="program-steps">
              {steps.map((step, index) => (
                <li key={`${index}-${step.text}`}>
                  <i aria-hidden="true">{index + 1}</i>
                  <span>
                    {step.text}
                    {step.duration ? <small>{step.duration}</small> : null}
                  </span>
                </li>
              ))}
            </StepList>
          ) : null}
          {relocation ? (
            <PlaceList style={steps.length ? { marginTop: 10 } : undefined}>
              <dt>{uiText('Переїзд', language)}</dt><dd>{relocation.when || uiText('так', language)}</dd>
              {familyLabel ? <><dt>{uiText('Сімʼя', language)}</dt><dd>{uiText(familyLabel, language)}</dd></> : null}
            </PlaceList>
          ) : null}
          {relocation?.note ? <Hint>{relocation.note}</Hint> : null}
        </Section>
      ) : null}

      {program.note ? (
        <Section>
          <SectionTitle>{uiText('Коментар організатора', language)}</SectionTitle>
          <Note data-testid="program-organizer-note">{program.note}</Note>
        </Section>
      ) : null}

      {/* Графік — наприкінці: спершу «що дає програма», потім «коли». */}
      {program.type === 'sm' ? (
        <Section>
          <ProgramTimeline language={language} lastCycle={timeline?.lastCycle} onLastCycleChange={timeline?.onLastCycleChange} />
        </Section>
      ) : null}

      {contact ? <ProgramInquiry program={program} contact={contact} rates={rates} displayCurrency={currency} language={language} /> : null}
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


// «з 2 програм», але «з 1 програми»: після «з» — родовий відмінок.
const programsGenitive = (count, language) => {
  if (language === 'en') return count === 1 ? 'program' : 'programs';
  const units = getExtraLocale(language)?.units;
  if (units) return units.programs(count);
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
  small { margin-left: 6px; font-size: 12px; font-weight: 400; color: ${MUTED}; }
`;

const PanelLine = styled.p`
  margin: -4px 0 8px 15px;
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
//
// Смужка ліворуч — колір ролі, для якої програма (`getRoleColor`: та сама
// таблиця, що в плашки «Донор ооцитів» і смужки рядка стрічки): п’ять сірих
// однакових контейнерів не казали, де донорська програма, а де СМ, доки їх не
// прочитаєш. Смужка — `border-left`, як у доріжки нотатки (`NoteLane`), а не
// накладений шар. Програма, що читачці не підходить, лишається на своєму
// місці (порядок задає агенція), лише блідне.
const typeStripe = (type, share) => {
  const color = getRoleColor(type);
  return color ? `color-mix(in srgb, ${color} ${share}%, transparent)` : BORDER;
};

const ProgramItem = styled.li`
  padding: 10px 12px 10px 11px;
  border: 1px solid ${BORDER};
  border-left: 3px solid ${({ $type, $off }) => typeStripe($type, $off ? 35 : 75)};
  border-radius: 14px;
  background: ${PROGRAM_BG};
  ${({ $off }) => ($off ? 'opacity: 0.72;' : '')}
  ${({ $best }) => ($best ? `border-color: color-mix(in srgb, ${ACCENT} 55%, transparent); border-left-color: ${ACCENT};` : '')}
`;

const ProgramHead = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 4px 10px;
  border-radius: 8px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;

  &:focus-visible { outline: 2px solid ${ACCENT}; outline-offset: 2px; }
`;

const Sum = styled.span`
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
`;

// Кого шукають — один раз над програмами цього типу, а не в кожній: три
// «Шукаємо донора ооцитів» поспіль займали по рядку й нічого не розрізняли.
// Кружок — той самий колір ролі, що й смужка програм під ним.
const ProgramGroup = styled.section`
  & + & { margin-top: 12px; }
`;

const ProgramGroupHead = styled.h5`
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 6px 1px;
  font-size: 14px;
  font-weight: 700;
  line-height: 1.3;
  color: ${TEXT};

  &::before {
    content: '';
    flex: none;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: ${({ $type }) => getRoleColor($type) || MUTED};
  }

  span { font-weight: 500; color: ${MUTED}; }
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

// Рядок згорнутої програми: назва — місце і та ознака, якою програма
// відрізняється від сусідніх того ж типу (`listProgramDifferences`). Самі
// гроші й покриття сюди не йдуть: сума стоїть праворуч, а покриття — у
// деталях.
const TITLE_FEATURE_SKIP = new Set(['bonuses', 'coverage']);
export const programRowTitle = (program, differs, language) => {
  const parts = [];
  if (program?.location) parts.push(formatProgramPlace(program.location));
  const feature = describeProgramHighlights(program)
    .find(item => differs?.has(item.key) && !TITLE_FEATURE_SKIP.has(item.key));
  if (feature) parts.push(highlightText(feature, language));
  return parts.join(' · ');
};

// Що з анкети читачки вимогу порушило — числом поруч, щоб було видно, наскільки.
const FAILED_FACT_TEXT = Object.freeze({
  age: facts => (facts?.age ? { text: 'вам {value}', variables: { value: facts.age } } : null),
  bmi: facts => (facts?.bmi ? { text: 'у вас {value}', variables: { value: Math.round(facts.bmi * 10) / 10 } } : null),
  height: facts => (facts?.heightCm ? { text: 'у вас {value} см', variables: { value: facts.heightCm } } : null),
});

/**
 * Висновок згорнутої програми одним рядком — замість ряду чипів усіх вимог.
 * Читачка з анкетою бачить «підходите» або саме те, що не так; без анкети
 * (агенція, батьки) — короткий перелік вимог, бо порівнювати нема з чим.
 */
export const describeProgramFit = (result, requirements, facts, language) => {
  const textOf = item => requirementText(item, language);
  if (!result) {
    const list = requirements.slice(0, 4).map(textOf);
    if (!list.length) return uiText('Без особливих вимог', language);
    const more = requirements.length - list.length;
    return `${uiText('Вимоги', language)}: ${list.join(' · ')}${more > 0 ? ` · +${more}` : ''}`;
  }
  const byKey = new Map(requirements.map(item => [item.key, item]));
  if (!result.matches) {
    const failed = result.checks.filter(check => check.ok === false).map(check => {
      const item = byKey.get(check.key);
      if (!item) return '';
      const fact = FAILED_FACT_TEXT[check.key]?.(facts);
      return fact ? `${textOf(item)} — ${uiText(fact.text, language, fact.variables)}` : textOf(item);
    }).filter(Boolean);
    return `✕ ${failed.length ? failed.join(' · ') : uiText('Не підходить', language)}`;
  }
  if (result.uncertain) {
    const unknown = result.checks.filter(check => check.ok === null).map(check => byKey.get(check.key)).filter(Boolean).map(textOf);
    return `? ${uiText('Може підходити', language)}${unknown.length ? ` · ${uiText('не вказано в анкеті', language)}: ${unknown.join(', ')}` : ''}`;
  }
  return result.checks.length
    ? `✓ ${uiText('Підходите за всіма вимогами', language)}`
    : `✓ ${uiText('Підходить', language)}`;
};

const RowTitle = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  min-width: 0;
  font-size: 14.5px;
  font-weight: 600;
  line-height: 1.3;
  color: ${TEXT};
  overflow-wrap: anywhere;
`;

const BestBadge = styled.span`
  display: inline-flex;
  align-items: center;
  min-height: 20px;
  padding: 0 7px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  color: var(--km-accent-text, #9A470A);
  background: color-mix(in srgb, ${ACCENT} 14%, transparent);
`;

const RowSum = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  text-align: right;

  ${Sum} { font-size: 16px; font-weight: 700; color: ${TEXT}; }
  small { font-size: 11.5px; color: ${MUTED}; }
  &[data-off] { opacity: 0.6; }
`;

const FitLine = styled.p`
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 12.5px;
  line-height: 1.4;
  font-weight: ${({ $state }) => ($state ? 600 : 400)};
  color: ${({ $state }) => tone($state === 'match' ? true : $state === 'mismatch' ? false : $state === 'uncertain' ? null : undefined) || MUTED};

  svg {
    flex: none;
    margin-left: auto;
    width: 10px;
    height: 10px;
    color: ${ACCENT};
    transition: transform 0.15s ease;
  }
  svg[data-open] { transform: rotate(180deg); }
`;

const programFitState = result => {
  if (!result) return '';
  if (!result.matches) return 'mismatch';
  return result.uncertain ? 'uncertain' : 'match';
};


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
const ProgramListItem = ({ program, open, onToggle, facts, rates, language, differs, displayCurrency, timeline = null, heading = true, best = false, contact = null }) => {
  const result = facts ? evaluateProgram(program, facts) : null;
  const fit = programFitState(result);
  const [selectedBonuses, toggleBonus] = useSelectedBonuses(program);
  const breakdown = useMemo(() => programBreakdown(program, { rates }), [program, rates]);
  const shown = breakdown.guaranteed.amount > 0 ? presentPayRange(breakdown, displayCurrency, rates) : null;
  const requirements = describeProgramRequirements(program);
  const bodyId = `program-body-${program.id}`;
  const offerLabel = programHeading(program, language);
  const title = programRowTitle(program, differs, language);
  const fitLine = describeProgramFit(result, requirements, facts, language);
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

  // Згорнута програма — один рядок (15.11, на прохання власниці продукту):
  // назва — те, чим програма відрізняється від сусідніх того ж типу
  // («Тбілісі · 21–28 років»), праворуч — винагорода, під ними — один рядок
  // висновку («✓ Підходите за всіма вимогами» або саме те, що не так).
  // Доти тут стояли всі вимоги чипами, ознаки й три рядки коментаря, і
  // чотири програми агенції займали три екрани телефона.
  return (
    <ProgramItem ref={itemRef} $type={program.type} $off={fit === 'mismatch'} $best={best} data-testid="program-list-item" onClick={event => event.stopPropagation()}>
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
        <RowTitle data-testid="program-title">
          {/* У списку агенції «кого шукають» стоїть над групою програм
              (`ProgramGroupHead`); окрема програма — прев'ю в редакторі —
              називає себе сама. */}
          {heading ? <span>{offerLabel}{title ? ` · ${title}` : ''}</span> : <span>{title || uiText(PROGRAM_TYPE_LABELS[program.type] || '', language) || offerLabel}</span>}
          {best ? <BestBadge data-testid="program-best">{uiText('Найкраща для вас', language)}</BestBadge> : null}
        </RowTitle>
        <RowSum data-testid="program-reward" data-off={fit === 'mismatch' ? '' : undefined}>
          {shown?.primary ? <Sum>{shown.primary}</Sum> : <small>{uiText('Суму уточнюйте в агенції', language)}</small>}
          {shown?.original ? <small data-testid="program-pay-label">{shown.original}</small> : null}
        </RowSum>
        <FitLine $state={fit} data-testid={fit ? 'program-verdict' : 'program-requirements'}>
          {fitLine}
          <FaChevronDown aria-hidden="true" data-open={open ? '' : undefined} />
        </FitLine>
      </ProgramHead>

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
            contact={contact}
          />
        </ProgramBody>
      </Collapsible>
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

// «оновлено сьогодні / вчора / 3 дні тому / 02.10» — коли власниця востаннє
// зберегла програми (`programsAt` картки). Свіжість — довіра: програма з
// весни могла вже не діяти.
export const describeProgramsUpdatedAt = (at, language, now = Date.now()) => {
  const time = Number(at);
  if (!Number.isFinite(time) || time <= 0) return '';
  const startOfDay = value => { const d = new Date(value); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const days = Math.round((startOfDay(now) - startOfDay(time)) / 86400000);
  if (days <= 0) return uiText('оновлено сьогодні', language);
  if (days === 1) return uiText('оновлено вчора', language);
  if (days < 7) return uiText('оновлено {count} дн. тому', language, { count: days });
  const d = new Date(time);
  const pad = value => String(value).padStart(2, '0');
  return uiText('оновлено {date}', language, { date: `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}` });
};

// Місця програм групи — до трьох, решта числом.
const summarizePlaces = programs => {
  const places = [...new Set(programs.map(program => formatProgramPlace(program.location || '')).filter(Boolean))];
  if (places.length <= 3) return places.join(', ');
  return `${places.slice(0, 3).join(', ')} +${places.length - 3}`;
};

const FIT_ORDER = Object.freeze({ match: 0, uncertain: 1, mismatch: 2, '': 0 });

/**
 * Порядок програм типу читачки — за збігом з її анкетою (15.11, на прохання
 * власниці продукту): спершу ті, що підходять (найвища винагорода — перша й
 * позначена «Найкраща для вас»), далі «може підходити», в кінці — що не
 * підходять. Порядок агенції лишається всередині кожного стану. Читачеві без
 * анкети (агенція, батьки, адмін) — порядок агенції як є.
 */
export const orderProgramsForViewer = (programs, facts, rates) => {
  if (!facts) return { ordered: programs, bestId: '' };
  const items = programs.map((program, index) => ({ program, index, fit: programFitState(evaluateProgram(program, facts)) }));
  const matched = items.filter(item => item.fit === 'match');
  const best = matched.reduce((top, item) => {
    const pay = programGuaranteedUsd(item.program, rates) || 0;
    return !top || pay > top.pay ? { item, pay } : top;
  }, null)?.item || null;
  const ordered = [...items].sort((a, b) => {
    if (best && a === best) return -1;
    if (best && b === best) return 1;
    return (FIT_ORDER[a.fit] - FIT_ORDER[b.fit]) || (a.index - b.index);
  }).map(item => item.program);
  return { ordered, bestId: best && programs.length > 1 ? best.program.id : '' };
};

/**
 * Програми агенції в картці стрічки.
 *
 * Заголовок — «Програми · N · оновлено …» з перемикачем валюти поруч. Далі
 * групи за типом: «Шукаємо донора ооцитів · 3», під ним діапазон і місця
 * («1 200–2 800 $ · Київ, Харків, Тбілісі») і для донорки чи СМ —
 * «Вам підходить 2 з 3». Програма — один рядок, відкрита одна на список.
 *
 * Програми чужого типу (донорці — програми СМ) не сховані, а згорнуті в
 * один рядок з діапазоном: «Також 1 програма для сурогатних мам».
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
  contact = null,
}) => {
  // Відкрита одна програма на список: розгорнуті поспіль дві-три програми
  // робили картку агенції на кілька екранів, і де закінчується одна й
  // починається інша, вже не було видно.
  const [openId, setOpenId] = useState(defaultOpenId || '');
  const [expandedGroups, setExpandedGroups] = useState(() => new Set());
  const [showAll, setShowAll] = useState(() => new Set());
  const summary = summarizeCardPrograms(card, { viewerType, facts });
  const programs = useMemo(() => (summary ? summary.evaluated.map(item => item.program) : []), [summary]);
  const differences = useMemo(() => listProgramDifferences(programs), [programs]);
  if (!summary) return null;
  // Програми одного типу — одна група під «Шукаємо …», навіть коли агенція
  // перемежувала типи: інакше «Шукаємо донора ооцитів» стояло б двічі. Групи
  // йдуть у порядку першої появи (`summarizeCardPrograms` ставить тип читача
  // першим).
  const groups = programs.reduce((acc, program) => {
    const group = acc.find(item => item.type === program.type);
    if (group) group.programs.push(program);
    else acc.push({ key: program.type || 'other', type: program.type, programs: [program] });
    return acc;
  }, []).map(group => {
    const own = Boolean(viewerType) && group.type === viewerType;
    const { ordered, bestId } = own ? orderProgramsForViewer(group.programs, facts, rates) : { ordered: group.programs, bestId: '' };
    return {
      ...group,
      own,
      programs: ordered,
      bestId,
      // Чужий тип для донорки чи СМ — згорнутим рядком; решті читачів усі
      // групи відкриті, як і були.
      foreign: Boolean(viewerType) && group.type !== viewerType,
      range: formatPayRange(group.programs.map(program => programGuaranteedMoney(program)).filter(Boolean), displayCurrency, rates),
      places: summarizePlaces(group.programs),
    };
  });
  // Рахується серед програм типу читача: решту видно, але звіряти анкету
  // донорки з вимогами програми СМ (і навпаки) нема сенсу.
  const matchedLine = summary.matched !== null
    ? uiText('Вам підходить {matched} з {total} {programs}', language, {
      matched: summary.matched,
      total: summary.ownTotal,
      programs: programsGenitive(summary.ownTotal, language),
    }) + (summary.uncertain
      ? uiText(' · ще {count} може підходити — уточніть анкету', language, { count: summary.uncertain })
      : '')
    : '';
  const updated = describeProgramsUpdatedAt(readCardProgramsAt(card), language);
  const toggle = id => {
    if (openId === id) {
      setOpenId('');
      return;
    }
    setOpenId(id);
    onOpen?.(id);
  };
  const toggleGroup = key => setExpandedGroups(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });
  // Курс називається один раз — коли бодай одну суму перераховано.
  const converted = Boolean(rates?.rateDate) && displayCurrency
    && programs.some(program => {
      const { lines, bonuses } = programBreakdown(program);
      return [...lines, ...bonuses].some(line => line.money?.currency && line.money.currency !== displayCurrency);
    });

  return (
    <Panel data-testid="programs-summary" onClick={event => event.stopPropagation()}>
      <PanelHead>
        <PanelTitle>
          {uiText('Програми', language)} <span>· {summary.total}</span>
          {updated ? <small data-testid="programs-updated">{updated}</small> : null}
        </PanelTitle>
        {onDisplayCurrencyChange && programs.length ? (
          <ProgramCurrencySwitch value={displayCurrency} onChange={onDisplayCurrencyChange} language={language} />
        ) : null}
      </PanelHead>
      {groups.map(group => {
        if (group.foreign && !expandedGroups.has(group.key)) {
          return (
            <ForeignGroupButton key={group.key} type="button" data-testid="program-group-foreign" onClick={event => { event.stopPropagation(); toggleGroup(group.key); }}>
              <span>
                <i aria-hidden="true" style={{ background: getRoleColor(group.type) || undefined }} />
                {uiText(FOREIGN_GROUP_LABELS[group.type] || 'Також програми: {count}', language, { count: group.programs.length })}
              </span>
              <b>{group.range}</b>
              <FaChevronDown aria-hidden="true" />
            </ForeignGroupButton>
          );
        }
        const limit = showAll.has(group.key) ? group.programs.length : VISIBLE_PROGRAMS;
        const visible = group.programs.slice(0, limit);
        const hiddenCount = group.programs.length - visible.length;
        return (
          <ProgramGroup key={group.key} data-testid="program-group">
            <ProgramGroupHead $type={group.type} data-testid="program-group-title">
              {programHeading({ type: group.type }, language)}
              {group.programs.length > 1 ? <span>· {group.programs.length}</span> : null}
              {group.foreign ? (
                <GroupCollapse type="button" onClick={event => { event.stopPropagation(); toggleGroup(group.key); }}>
                  {uiText('Згорнути', language)}
                </GroupCollapse>
              ) : null}
            </ProgramGroupHead>
            {group.range || group.places ? (
              <GroupFacts data-testid="program-group-facts">
                {group.range ? <em>{group.range}</em> : null}
                {group.range && group.places ? ' · ' : ''}
                {group.places}
              </GroupFacts>
            ) : null}
            {group.own && matchedLine ? <PanelLine $match={summary.matched > 0}>{matchedLine}</PanelLine> : null}
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
                  heading={false}
                  best={group.bestId === program.id}
                  contact={contact}
                />
              ))}
            </ProgramList>
            {hiddenCount > 0 ? (
              <MoreButton type="button" onClick={event => { event.stopPropagation(); setShowAll(prev => new Set(prev).add(group.key)); }}>
                {uiText('Показати ще {count}', language, { count: hiddenCount })}
              </MoreButton>
            ) : null}
          </ProgramGroup>
        );
      })}
      {converted ? (
        <RateNote>{uiText('≈ — за курсом НБУ на {date}', language, { date: formatRateDate(rates.rateDate) })}</RateNote>
      ) : null}
    </Panel>
  );
};

const FOREIGN_GROUP_LABELS = Object.freeze({
  sm: 'Також програми для сурогатних мам: {count}',
  ed: 'Також програми для донорок: {count}',
});

const ForeignGroupButton = styled.button`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto 12px;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 44px;
  margin-top: 12px;
  padding: 8px 12px;
  border: 0;
  border-radius: 12px;
  background: ${PROGRAM_BG};
  color: ${TEXT};
  font: inherit;
  font-size: 13.5px;
  font-weight: 600;
  text-align: left;
  cursor: pointer;

  span { display: flex; align-items: center; gap: 8px; min-width: 0; }
  i { flex: none; width: 8px; height: 8px; border-radius: 50%; background: ${MUTED}; }
  b { font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
  svg { width: 10px; height: 10px; color: ${ACCENT}; }
  &:focus-visible { outline: 2px solid ${ACCENT}; outline-offset: 2px; }
`;

const GroupCollapse = styled.button`
  margin-left: auto;
  padding: 0;
  border: 0;
  background: transparent;
  color: ${ACCENT};
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
`;

const GroupFacts = styled.p`
  margin: -2px 0 8px 15px;
  font-size: 12.5px;
  color: ${MUTED};

  em { font-style: normal; font-weight: 700; color: ${TEXT}; font-variant-numeric: tabular-nums; }
`;

// Стара назва: рядок стрічки звав блок саме так.
export const ProgramsSummary = AgencyProgramsPanel;

