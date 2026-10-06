import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import {
  HIGHLIGHTS_NONE,
  MAX_PROGRAMS,
  MAX_PROGRAM_HIGHLIGHTS,
  PROGRAM_COVERAGE_MODES,
  PROGRAM_COVERAGE_OPTIONS,
  PROGRAM_COVERAGE_PER,
  PROGRAM_CSECTION_OPTIONS,
  PROGRAM_FAMILY_OPTIONS,
  PROGRAM_KIDS_OPTIONS,
  PROGRAM_MARITAL_OPTIONS,
  DEFAULT_MONTHLY_MONTHS,
  MAX_MONTHLY_MONTHS,
  PROGRAM_OFFER_LABELS,
  PROGRAM_PAY_KINDS,
  PROGRAM_REQUIREMENT_LABELS,
  PROGRAM_REQUIREMENT_LEVELS,
  PROGRAM_RH_OPTIONS,
  PROGRAM_STAGE_OPTIONS,
  PROGRAM_TOTAL_FIELD,
  PROGRAM_TYPES,
  PROGRAM_TYPE_LABELS,
  createEmptyProgram,
  defaultProgramHighlightKeys,
  formatProgramPlace,
  isProgramPresentable,
  listBonusPaymentFields,
  listGuaranteedPaymentFields,
  listProgramHighlightOptions,
  listPrograms,
  normalizeProgram,
  programBreakdown,
  programHeadlinePay,
  programsToRecord,
  resolveProgramPayKind,
} from '../../utils/donorPrograms';
import { DEFAULT_PROGRAM_CURRENCY, formatProgramMoney } from '../../utils/programCurrency';
import { uiText } from '../../utils/uiTranslations';
import { MoneyInput } from './MoneyInput';
import { ProgramCurrencySwitch, ProgramPreview } from './ProgramsView';

/*
 * Програми агенції чи клініки в «Моєму профілі».
 *
 * Форма збудована навколо того, як програму прочитають, а не навколо схеми
 * запису: розділи йдуть рівно в тому порядку, у якому їх показує картка
 * програми (`ProgramCard`), — основне, виплати й підсумок, можливі
 * доплати, вимоги, що покриваєте, умови. Досі вимоги (десяток полів і
 * чотири ряди перемикачів) стояли перед виплатами, хоч саме сума —
 * перше, що бачить донорка, а кожна можлива доплата висіла порожнім полем
 * «сума», навіть якщо агенція за неї не платить: форма займала чотири
 * екрани телефона й виглядала як таблиця бази, а не пропозиція.
 *
 * Тепер видно лише те, що стосується програми:
 * - головна виплата (а для СМ і щомісячна) — завжди; решта виплат і всі
 *   можливі доплати — кнопками «+ Перенос ембріона», «+ Двійня», і
 *   з'являються полем, лише коли їх додали чи вони вже заповнені;
 * - вимоги — компактно: вік «від — до» одним рядком, вибір списком; поле
 *   поза межами, які приймає база, каже про це одразу, а не зникає мовчки
 *   при записі (`normalizeProgram` такі значення відкидає).
 *
 * Поруч із формою — та сама картка, яку побачить донорка: на широкому
 * екрані колонкою праворуч, на телефоні — перемикачем «Форма / Перегляд».
 *
 * Зберігається все саме, без кнопки: зміна лягає в базу за мить після
 * останнього дотику (`SAVE_DELAY_MS`) і ще раз — коли редактор закривають;
 * стан запису видно вгорі («Зберігаємо…», «Збережено»). «Копія» —
 * найшвидший спосіб завести другу програму: здебільшого вони відрізняються
 * віком і сумою, а не всім. Стрілки ставлять найцікавішу програму першою,
 * «Сховати» знімає неактуальну з показу, не стираючи. Програма, у якій ще
 * нічого не вказано, — чернетка (`isProgramPresentable`): у стрічці її не
 * видно, і шапка каже це прямо.
 *
 * Назви інших доплат підказує словник (`suggestions`): те, що вже написали
 * інші агенції (`multiData/programTerms`). Одне й те саме «за вагітність з
 * першого разу» інакше мало б стільки написань, скільки агенцій.
 */

const SAVE_DELAY_MS = 700;

const ACCENT = 'var(--km-accent, #E8791A)';
const BORDER = 'var(--km-border, #E8E8E2)';
const MUTED = 'var(--km-muted, #62665F)';
const CARD = 'var(--km-card, #fff)';
const FIELD_BG = 'var(--km-bg, #FAFAF8)';
const DANGER = '#C8483E';

const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 0;
`;

const Intro = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 6px 12px;

  > p { margin: 0; flex: 1 1 260px; color: ${MUTED}; font-size: 13px; line-height: 1.5; }
`;

const SaveState = styled.span`
  flex: 0 0 auto;
  font-size: 12px;
  font-weight: 600;
  color: ${({ $state }) => ($state === 'failed' ? DANGER : $state === 'saved' ? 'var(--km-success, #2E9B55)' : MUTED)};
`;

const ProgramBox = styled.div`
  border: 1px ${({ $hidden }) => ($hidden ? 'dashed' : 'solid')} ${BORDER};
  border-radius: var(--km-radius, 14px);
  background: ${CARD};
  overflow: hidden;
`;

const ProgramHead = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 10px 10px 14px;
  border-bottom: ${({ $open }) => ($open ? `1px solid ${BORDER}` : '0')};
`;

const HeadText = styled.button`
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: 2px 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;

  > span:first-child { display: flex; align-items: baseline; gap: 6px; max-width: 100%; min-width: 0; }
  b { min-width: 0; font-size: 15px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  em { font-style: normal; font-size: 13px; color: ${MUTED}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  > span:last-child { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 8px; font-size: 13px; }
  strong { font-weight: 700; font-variant-numeric: tabular-nums; }
`;

const STATUS_TONES = Object.freeze({
  ready: { color: '#247a43', bg: '#ebf8ef' },
  warn: { color: '#9a6610', bg: '#fff4dc' },
  hidden: { color: MUTED, bg: 'color-mix(in srgb, currentColor 8%, transparent)' },
});

const Status = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 700;
  white-space: nowrap;
  color: ${({ $tone }) => STATUS_TONES[$tone].color};
  background: ${({ $tone }) => STATUS_TONES[$tone].bg};
`;

const Chevron = styled.span`
  flex: 0 0 auto;
  font-size: 11px;
  color: ${MUTED};
  transform: rotate(${({ $open }) => ($open ? '180deg' : '0deg')});
`;

const SmallButton = styled.button`
  flex: 0 0 auto;
  min-height: 34px;
  padding: 0 11px;
  border-radius: 10px;
  border: 1px solid ${({ $danger }) => ($danger ? `color-mix(in srgb, ${DANGER} 45%, transparent)` : BORDER)};
  background: ${CARD};
  color: ${({ $danger }) => ($danger ? DANGER : 'inherit')};
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;

  &:disabled { opacity: 0.45; cursor: default; }
`;

const MoreActions = styled.details`
  position: relative;
  flex: 0 0 auto;

  summary {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border: 1px solid ${BORDER};
    border-radius: 10px;
    background: ${CARD};
    cursor: pointer;
    list-style: none;
    font-weight: 800;
  }
  summary::-webkit-details-marker { display: none; }
  > div {
    position: absolute;
    z-index: 5;
    top: calc(100% + 5px);
    right: 0;
    min-width: 170px;
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 5px;
    border: 1px solid ${BORDER};
    border-radius: 10px;
    background: ${CARD};
    box-shadow: 0 10px 28px rgba(30, 27, 24, .14);
  }
  > div > button { text-align: left; }
`;

// Форма й перегляд — дві колонки на широкому екрані; на телефоні одна з
// двох, перемикачем (`ModeSwitch`).
const Body = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
  padding: 14px;

  @media (min-width: 1000px) {
    grid-template-columns: minmax(0, 1.15fr) minmax(300px, 0.85fr);
    align-items: start;
  }
`;

const FormColumn = styled.div`
  display: ${({ $hiddenOnMobile }) => ($hiddenOnMobile ? 'none' : 'flex')};
  flex-direction: column;
  gap: 18px;
  min-width: 0;

  @media (min-width: 1000px) { display: flex; }
`;

const PreviewColumn = styled.aside`
  display: ${({ $hiddenOnMobile }) => ($hiddenOnMobile ? 'none' : 'flex')};
  flex-direction: column;
  gap: 8px;
  min-width: 0;

  @media (min-width: 1000px) {
    display: flex;
    position: sticky;
    top: 12px;
  }
`;

const ModeSwitch = styled.div`
  display: flex;
  padding: 3px;
  border-radius: 12px;
  background: color-mix(in srgb, ${MUTED} 10%, transparent);

  button {
    flex: 1 1 0;
    min-height: 34px;
    border: 0;
    border-radius: 9px;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }
  button[aria-pressed='true'] { background: ${CARD}; box-shadow: 0 1px 4px rgba(0, 0, 0, .08); }

  @media (min-width: 1000px) { display: none; }
`;

const Step = styled.section`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 18px;
  border-top: 1px solid ${BORDER};

  &:first-child { padding-top: 0; border-top: 0; }
`;

const StepHead = styled.header`
  display: flex;
  flex-direction: column;
  gap: 3px;

  h4 { margin: 0; font-size: 15px; font-weight: 700; }
  h4 small { margin-left: 6px; font-size: 12px; font-weight: 500; color: ${MUTED}; }
  p { margin: 0; font-size: 12.5px; line-height: 1.45; color: ${MUTED}; }
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;

  > label, > span { font-size: 13px; font-weight: 600; }
  > label small, > span small { font-weight: 400; color: ${MUTED}; }
`;

const FieldError = styled.span`
  && { font-size: 12px; font-weight: 500; color: ${DANGER}; }
`;

const FieldRow = styled.div`
  display: flex;
  align-items: flex-end;
  gap: 8px;

  > :first-child { flex: 1 1 auto; min-width: 0; }
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(${({ $min }) => $min || 150}px, 1fr));
  gap: 12px;
`;

const inputCss = `
  box-sizing: border-box;
  width: 100%;
  min-height: 42px;
  padding: 0 12px;
  border: 1px solid ${BORDER};
  border-radius: 10px;
  background: ${FIELD_BG};
  color: var(--km-text, inherit);
  font: inherit;
  font-size: 15px;
`;

const TextInput = styled.input`
  ${inputCss}
  border-color: ${({ $invalid }) => ($invalid ? DANGER : BORDER)};
  ${({ $compact }) => ($compact ? 'min-height: 36px; font-size: 13.5px;' : '')}
`;

const Select = styled.select`
  ${inputCss}
  padding-right: 8px;
  cursor: pointer;
  ${({ $compact }) => ($compact ? 'min-height: 36px; font-size: 13.5px;' : '')}
`;

const RangeInputs = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 6px;

  > span { color: ${MUTED}; font-size: 13px; }
`;

const TextArea = styled.textarea`
  ${inputCss}
  min-height: 92px;
  padding: 10px 12px;
  font-size: 14px;
  line-height: 1.45;
  resize: vertical;
`;

const Counter = styled.span`
  && { align-self: flex-end; font-size: 11.5px; font-weight: 400; color: ${({ $over }) => ($over ? DANGER : MUTED)}; }
`;

const Segments = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

const Segment = styled.button`
  min-height: 36px;
  padding: 0 13px;
  border-radius: 999px;
  border: 1px solid ${({ $on }) => ($on ? ACCENT : BORDER)};
  background: ${({ $on }) => ($on ? `color-mix(in srgb, ${ACCENT} 12%, transparent)` : CARD)};
  color: ${({ $on }) => ($on ? ACCENT : 'inherit')};
  font: inherit;
  font-size: 13.5px;
  font-weight: ${({ $on }) => ($on ? 700 : 500)};
  cursor: pointer;
`;

// Що ще можна додати — пунктирні кнопки: це пропозиція, а не вибране.
const AddChip = styled.button`
  min-height: 34px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px dashed color-mix(in srgb, ${ACCENT} 55%, ${BORDER});
  background: transparent;
  color: ${ACCENT};
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
`;

const RemoveButton = styled.button`
  flex: 0 0 auto;
  width: 42px;
  height: 42px;
  border-radius: 10px;
  border: 1px solid ${BORDER};
  background: ${CARD};
  color: ${MUTED};
  font: inherit;
  font-size: 15px;
  cursor: pointer;
`;

const MonthsRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  font-size: 12.5px;
  color: ${MUTED};
`;

const MonthsInput = styled.input`
  ${inputCss}
  width: 60px;
  min-height: 36px;
  text-align: center;
`;

const OtherRow = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr) auto;
  gap: 8px;
  align-items: start;

  @media (max-width: 520px) {
    grid-template-columns: minmax(0, 1fr) auto;
    > :nth-child(2) { grid-column: 1 / -1; grid-row: 2; }
  }
`;

// Підсумок рахується з тих самих виплат і тим самим кодом, що й у картці
// програми (`programBreakdown`): агенція бачить число, яке побачить донорка.
const TotalBox = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
  border-radius: 12px;
  background: color-mix(in srgb, ${ACCENT} 8%, transparent);

  > div { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
  > div span { font-size: 13px; color: ${MUTED}; }
  > div b { font-size: 16px; font-weight: 800; font-variant-numeric: tabular-nums; white-space: nowrap; }
  > div:first-child b { font-size: 20px; }
  small { font-size: 11.5px; line-height: 1.45; color: ${MUTED}; }
`;

const Hint = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  color: ${MUTED};
`;

const PreviewLabel = styled.div`
  font-size: 12px;
  font-weight: 600;
  color: ${MUTED};
`;

const AddProgram = styled.button`
  min-height: 48px;
  border-radius: var(--km-radius, 14px);
  border: 1px dashed color-mix(in srgb, ${ACCENT} 50%, transparent);
  background: transparent;
  color: ${ACCENT};
  font: inherit;
  font-weight: 700;
  cursor: pointer;
`;

const EmptyState = styled.div`
  padding: 18px 16px;
  border: 1px dashed ${BORDER};
  border-radius: var(--km-radius, 14px);
  text-align: center;
  color: ${MUTED};
  font-size: 13.5px;
  line-height: 1.5;

  b { display: block; margin-bottom: 4px; color: var(--km-text, inherit); font-size: 15px; }
`;

const LinkButton = styled.button`
  align-self: flex-start;
  min-height: 28px;
  padding: 0;
  border: 0;
  background: transparent;
  color: ${ACCENT};
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;

  &:hover { text-decoration: underline; text-underline-offset: 3px; }
  &:focus-visible { outline: 2px solid ${ACCENT}; outline-offset: 2px; border-radius: 4px; }
`;

const DetailsBox = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 12px;
  border-left: 2px solid ${BORDER};
`;

const QualifierRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  margin-top: 6px;

  > select { flex: 0 1 190px; }
  > input { flex: 1 1 200px; }
`;

const CheckRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;

  input { width: 18px; height: 18px; accent-color: ${ACCENT}; }
`;

const ReqGroup = styled.fieldset`
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 0;
  border: 0;

  legend { margin-bottom: 6px; padding: 0; font-size: 12px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: ${MUTED}; }
`;

const CoverageRow = styled.div`
  display: grid;
  grid-template-columns: 110px minmax(0, 1fr) minmax(0, 1.2fr) minmax(0, 0.8fr);
  gap: 8px;
  align-items: center;

  > b { font-size: 13.5px; }
  > input { grid-column: 2 / -1; }

  @media (max-width: 620px) {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    > b { grid-column: 1 / -1; }
    > input { grid-column: 1 / -1; }
  }
`;

const HighlightList = styled.ol`
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;

  li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-height: 38px;
    padding: 0 8px 0 10px;
    border: 1px solid ${BORDER};
    border-radius: 10px;
  }
  li[data-on='true'] { border-color: color-mix(in srgb, ${ACCENT} 55%, ${BORDER}); }
  label { display: flex; align-items: center; gap: 8px; min-width: 0; font-size: 13.5px; cursor: pointer; }
  input { width: 17px; height: 17px; accent-color: ${ACCENT}; }
  li > span { display: flex; gap: 4px; }
`;

const IconButton = styled.button`
  width: 30px;
  height: 30px;
  border: 1px solid ${BORDER};
  border-radius: 8px;
  background: ${CARD};
  color: var(--km-text, inherit);
  font: inherit;
  cursor: pointer;

  &:disabled { opacity: 0.35; cursor: not-allowed; }
  &:hover:not(:disabled) { background: color-mix(in srgb, currentColor 7%, ${CARD}); }
`;

const PreviewHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
`;

const formatSumParts = sum => sum.parts
  .filter(part => part.amount > 0)
  .map(part => formatProgramMoney(part.amount, part.currency))
  .join(' + ');

/** Сума за програму для шапки: та сама, що побачить донорка першою. */
const headPay = program => {
  const normalized = normalizeProgram(program, program.id);
  const guaranteed = normalized ? programBreakdown(normalized).guaranteed : null;
  if (guaranteed && guaranteed.parts.length === 1 && guaranteed.amount > 0) {
    return `${guaranteed.approximate ? '≈ ' : ''}${formatProgramMoney(guaranteed.amount, guaranteed.currency)}`;
  }
  const pay = programHeadlinePay(program);
  const amount = Number(pay?.amount);
  return Number.isFinite(amount) && amount > 0 ? formatProgramMoney(amount, pay.currency) : '';
};

/**
 * Стан програми одним словом — і чому. Чернетка (нічого не вказано) у
 * стрічці не показується; програма без суми показується, але без
 * головного, що в ній шукають.
 */
const programStatus = program => {
  const normalized = normalizeProgram(program, program.id);
  if (program.hidden) return { tone: 'hidden', label: 'Прихована' };
  if (!normalized || !isProgramPresentable(normalized)) return { tone: 'warn', label: 'Чернетка — у стрічці не видно' };
  if (!(programBreakdown(normalized).guaranteed.amount > 0)) return { tone: 'warn', label: 'Додайте виплату' };
  return { tone: 'ready', label: 'Готова до показу' };
};

// Межі, які приймає база (`normalizeProgram`, правила `multiData/programs`):
// поза ними значення при записі просто зникає — тож форма каже про це одразу.
const REQUIREMENT_LIMITS = Object.freeze({
  ageFrom: { min: 16, max: 60 },
  ageTo: { min: 16, max: 60 },
  bmiMax: { min: 15, max: 45 },
  heightFrom: { min: 130, max: 200 },
  maxBirths: { min: 0, max: 10 },
});

const readNumber = value => {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const n = Number(raw.replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
};

export const validateProgramRequirements = (requirements = {}) => {
  const errors = {};
  Object.entries(REQUIREMENT_LIMITS).forEach(([key, { min, max }]) => {
    const n = readNumber(requirements[key]);
    if (n === null) return;
    if (Number.isNaN(n)) errors[key] = { text: 'Лише число' };
    else if (n < min || n > max) errors[key] = { text: 'Від {min} до {max}', vars: { min, max } };
  });
  const from = readNumber(requirements.ageFrom);
  const to = readNumber(requirements.ageTo);
  if (!errors.ageFrom && !errors.ageTo && Number.isFinite(from) && Number.isFinite(to) && from > to) {
    errors.ageTo = { text: '«До» менше за «від»' };
  }
  return errors;
};

const NOTE_MAX = 600;

// Виплати, які стоять полем завжди: без головної програма не має суми, а
// щомісячну агенції СМ платять майже всі.
const ALWAYS_SHOWN_PAYMENTS = Object.freeze({ ed: ['final'], sm: ['final', 'monthly'] });

const hasMoney = money => Number(money?.amount) > 0;

const uniqueLabels = labels => {
  const seen = new Set();
  return labels.filter(label => {
    const key = String(label || '').trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const ChoiceSelect = ({ id, label, options, value, onChange, language, fallback = 'any' }) => (
  <Field>
    <label htmlFor={id}>{uiText(label, language)}</label>
    <Select id={id} value={value || fallback} onChange={event => onChange(event.target.value)}>
      {options.map(option => <option key={option.key} value={option.key}>{uiText(option.label, language)}</option>)}
    </Select>
  </Field>
);

// Подробиці виплати графіка — під самою виплатою, згорнуті, доки їх не
// попросили: у більшості виплат їх немає, а чотири порожні поля під кожною
// сумою знову зробили б форму таблицею.
const PaymentDetails = ({ value, onChange, language, rates, idPrefix }) => {
  const filled = Boolean(value?.when || value?.condition || value?.includes);
  const [open, setOpen] = useState(filled);
  if (!open) {
    return (
      <LinkButton type="button" onClick={() => setOpen(true)}>
        + {uiText('коли, умова, що входить', language)}
      </LinkButton>
    );
  }
  const includes = value?.includes || null;
  return (
    <DetailsBox>
      <Grid $min={150}>
        <Field>
          <label htmlFor={`${idPrefix}-when`}>{uiText('Коли платять', language)}</label>
          <TextInput id={`${idPrefix}-when`} value={value?.when || ''} maxLength={60} placeholder={uiText('Наприклад: на 12 тижні', language)} onChange={event => onChange({ when: event.target.value })} />
        </Field>
        <Field>
          <label htmlFor={`${idPrefix}-condition`}>{uiText('За якої умови', language)}</label>
          <TextInput id={`${idPrefix}-condition`} value={value?.condition || ''} maxLength={120} placeholder={uiText('Наприклад: після підтвердження вагітності', language)} onChange={event => onChange({ condition: event.target.value })} />
        </Field>
      </Grid>
      <Field>
        <span>{uiText('У тому числі', language)} <small>· {uiText('сума всередині цієї виплати, до разом не додається', language)}</small></span>
        <OtherRow>
          <TextInput
            aria-label={uiText('На що саме', language)}
            value={includes?.label || ''}
            maxLength={60}
            placeholder={uiText('Наприклад: одяг', language)}
            onChange={event => onChange({ includes: { amount: includes?.amount || '', currency: includes?.currency || value?.currency || DEFAULT_PROGRAM_CURRENCY, label: event.target.value } })}
          />
          <MoneyInput
            language={language}
            rates={rates}
            ariaLabel={uiText('Сума всередині виплати', language)}
            value={includes}
            onChange={money => onChange({ includes: money ? { ...money, label: includes?.label || '' } : null })}
          />
          <RemoveButton type="button" aria-label={uiText('Прибрати подробиці', language)} title={uiText('Прибрати подробиці', language)} onClick={() => { onChange({ when: '', condition: '', includes: null }); setOpen(false); }}>✕</RemoveButton>
        </OtherRow>
      </Field>
    </DetailsBox>
  );
};

const LabeledPayments = ({ items, onChange, listId, suggestions, placeholder, removeLabel, language, rates, withDetails = false }) => {
  const setItem = (index, patch) => onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  if (!items.length) return null;
  return (
    <>
      {suggestions.length ? (
        <datalist id={listId}>
          {suggestions.map(label => <option key={label} value={label} />)}
        </datalist>
      ) : null}
      {items.map((item, index) => (
        <Field key={`${listId}-${index}`}>
          <OtherRow>
            <TextInput
              value={item.label || ''}
              list={suggestions.length ? listId : undefined}
              placeholder={uiText(placeholder, language)}
              aria-label={uiText(placeholder, language)}
              onChange={event => setItem(index, { label: event.target.value })}
            />
            <MoneyInput language={language} rates={rates} value={item} ariaLabel={uiText('Сума', language)} onChange={money => setItem(index, money || { amount: '' })} />
            <RemoveButton type="button" aria-label={uiText(removeLabel, language)} title={uiText(removeLabel, language)} onClick={() => onChange(items.filter((_, i) => i !== index))}>✕</RemoveButton>
          </OtherRow>
          {withDetails ? (
            <PaymentDetails value={item} language={language} rates={rates} idPrefix={`${listId}-${index}`} onChange={patch => setItem(index, patch)} />
          ) : (
            <TextInput
              aria-label={uiText('Умова доплати', language)}
              value={item.condition || ''}
              maxLength={120}
              placeholder={uiText('Умова, наприклад: якщо пологи кесаревим', language)}
              onChange={event => setItem(index, { condition: event.target.value })}
            />
          )}
        </Field>
      ))}
    </>
  );
};

// Рівень вимоги й пояснення — під самою вимогою. «Не вказано» лишає її
// звичайною: строгою, якщо значення є, і відсутньою, якщо ні.
const RequirementQualifier = ({ requirementKey, meta, onChange, language, idPrefix }) => {
  const own = meta?.[requirementKey] || {};
  const [noteOpen, setNoteOpen] = useState(Boolean(own.note));
  const showNote = noteOpen || Boolean(own.note) || own.level === 'preferred' || own.level === 'individual';
  return (
    <QualifierRow>
      <Select
        aria-label={uiText('Рівень вимоги: {label}', language, { label: uiText(PROGRAM_REQUIREMENT_LABELS[requirementKey], language) })}
        value={own.level || ''}
        onChange={event => onChange(requirementKey, { ...own, level: event.target.value })}
        $compact
      >
        <option value="">{uiText('Рівень: як вказано', language)}</option>
        {PROGRAM_REQUIREMENT_LEVELS.map(option => <option key={option.key} value={option.key}>{uiText(option.label, language)}</option>)}
      </Select>
      {showNote ? (
        <TextInput
          id={`${idPrefix}-${requirementKey}-note`}
          aria-label={uiText('Пояснення: {label}', language, { label: uiText(PROGRAM_REQUIREMENT_LABELS[requirementKey], language) })}
          value={own.note || ''}
          maxLength={120}
          placeholder={uiText('Наприклад: через 2 роки після КР', language)}
          onChange={event => onChange(requirementKey, { ...own, note: event.target.value })}
          $compact
        />
      ) : (
        <LinkButton type="button" onClick={() => setNoteOpen(true)}>+ {uiText('пояснення', language)}</LinkButton>
      )}
    </QualifierRow>
  );
};

/*
 * Головне в згорнутій картці — вибір з того, що вже є в програмі, а не
 * новий текст: ознака «до 30 років» береться з вимоги віку, і правка вимоги
 * міняє її сама. Відмічено — те, що побачать у стрічці; стрілки — порядок.
 */
const HighlightsPicker = ({ program, normalized, onChange, language }) => {
  const [showAll, setShowAll] = useState(false);
  const options = listProgramHighlightOptions(normalized);
  const custom = Array.isArray(program.highlights) && program.highlights.length > 0;
  const chosen = custom
    ? program.highlights.filter(key => key === HIGHLIGHTS_NONE || options.some(option => option.key === key))
    : defaultProgramHighlightKeys(normalized);
  const selected = chosen.filter(key => key !== HIGHLIGHTS_NONE);
  if (!options.length) {
    return <Hint><span>{uiText('Заповніть виплати, вимоги чи покриття — і тут зʼявиться, що винести в картку.', language)}</span></Hint>;
  }
  const write = keys => onChange(keys.length ? keys : [HIGHLIGHTS_NONE]);
  const toggle = key => (selected.includes(key)
    ? write(selected.filter(item => item !== key))
    : selected.length < MAX_PROGRAM_HIGHLIGHTS ? write([...selected, key]) : null);
  const move = (key, delta) => {
    const index = selected.indexOf(key);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= selected.length) return;
    const next = [...selected];
    [next[index], next[target]] = [next[target], next[index]];
    write(next);
  };
  const rest = options.filter(option => !selected.includes(option.key));
  const ordered = [...selected.map(key => options.find(option => option.key === key)).filter(Boolean), ...(showAll || !selected.length ? rest : [])];
  const optionText = option => {
    if (option.money) return uiText(option.text, language, { amount: formatProgramMoney(option.money.amount, option.money.currency) });
    if (option.variables?.label) return uiText(option.text, language, { ...option.variables, label: uiText(option.variables.label, language).toLowerCase() });
    if (option.key === 'bonuses') return uiText('+{count} доплати', language, option.variables);
    return uiText(option.text, language, option.variables);
  };
  return (
    <>
      <HighlightList>
        {ordered.map(option => {
          const index = selected.indexOf(option.key);
          const on = index >= 0;
          return (
            <li key={option.key} data-on={on ? 'true' : undefined}>
              <label>
                <input type="checkbox" checked={on} disabled={!on && selected.length >= MAX_PROGRAM_HIGHLIGHTS} onChange={() => toggle(option.key)} />
                <span>{optionText(option)}</span>
              </label>
              {on && selected.length > 1 ? (
                <span>
                  <IconButton type="button" disabled={index === 0} aria-label={uiText('Вище', language)} title={uiText('Вище', language)} onClick={() => move(option.key, -1)}>↑</IconButton>
                  <IconButton type="button" disabled={index === selected.length - 1} aria-label={uiText('Нижче', language)} title={uiText('Нижче', language)} onClick={() => move(option.key, 1)}>↓</IconButton>
                </span>
              ) : null}
            </li>
          );
        })}
      </HighlightList>
      {rest.length && selected.length ? (
        <LinkButton type="button" aria-expanded={showAll} onClick={() => setShowAll(value => !value)}>
          {showAll ? uiText('Сховати решту', language) : `+ ${uiText('Інші ознаки ({count})', language, { count: rest.length })}`}
        </LinkButton>
      ) : null}
      <Hint>
        <span>{uiText('До {max} ознак. Сума й покриття в картці стоять завжди.', language, { max: MAX_PROGRAM_HIGHLIGHTS })}</span>
        {custom ? <SmallButton type="button" onClick={() => onChange(undefined)}>{uiText('Як типово', language)}</SmallButton> : null}
      </Hint>
    </>
  );
};

const ProgramForm = ({ program, onChange, language, rates, suggestions }) => {
  const [revealed, setRevealed] = useState(() => new Set());
  const [mode, setMode] = useState('form');
  const [previewCurrency, setPreviewCurrency] = useState('');
  const set = patch => onChange({ ...program, ...patch });
  const setReq = patch => onChange({ ...program, requirements: { ...program.requirements, ...patch } });
  const setMeta = (key, value) => {
    const next = { ...(program.requirementMeta || {}) };
    if (!value?.level && !value?.note) delete next[key];
    else next[key] = value;
    onChange({ ...program, requirementMeta: next });
  };
  // `MoneyInput` віддає саму суму й валюту; кількість місяців і подробиці
  // виплати (коли, умова, що входить) лежать поруч у тому самому обʼєкті й
  // мусять пережити правку суми.
  const setPay = (key, money) => {
    const current = program.payments?.[key] || {};
    const { amount: _amount, currency: _currency, ...extras } = current;
    onChange({
      ...program,
      payments: { ...program.payments, [key]: money ? { ...extras, ...money } : (Object.keys(extras).length ? { ...extras, amount: '' } : money) },
    });
  };
  const setPayExtras = (key, patch) => onChange({
    ...program,
    payments: { ...program.payments, [key]: { ...(program.payments?.[key] || { amount: '', currency }), ...patch } },
  });
  const removePay = key => {
    const { [key]: _removed, ...payments } = program.payments || {};
    setRevealed(current => { const next = new Set(current); next.delete(key); return next; });
    onChange({ ...program, payments });
  };
  const reveal = key => setRevealed(current => new Set(current).add(key));
  const setMonths = value => onChange({
    ...program,
    payments: { ...program.payments, monthly: { ...(program.payments?.monthly || { amount: '', currency }), months: value } },
  });
  const removeLegacyTotal = () => {
    const { [PROGRAM_TOTAL_FIELD]: _removed, ...payments } = program.payments || {};
    onChange({ ...program, payments });
  };
  const idPrefix = `program-${program.id}`;
  const normalized = normalizeProgram(program, program.id);
  const currency = program.payments?.final?.currency || DEFAULT_PROGRAM_CURRENCY;
  const payKind = resolveProgramPayKind(program);
  // Загальну суму агенція не вводить: її рахує `programBreakdown` з виплат —
  // і рахує так само, як побачить донорка. Ручне поле було третім джерелом
  // правди поруч із виплатами й підсумком і розходилось з обома.
  const breakdown = normalized ? programBreakdown(normalized, { rates }) : null;
  const hasComponents = Boolean(breakdown?.lines.some(line => line.key !== PROGRAM_TOTAL_FIELD));
  const legacyTotal = hasComponents ? normalized?.payments?.[PROGRAM_TOTAL_FIELD] : null;
  // Підказки — словник інших агенцій і власні назви інших програм, без
  // повторів: людина, що завела «Бонус за ранній перенос» в одній програмі,
  // не набирає його вдруге в копії.
  const paymentSuggestions = uniqueLabels([...(suggestions?.payment || [])]);
  const bonusSuggestions = uniqueLabels([
    ...(suggestions?.bonus || []),
    ...listBonusPaymentFields(program.type === 'ed' ? 'sm' : 'ed').map(field => field.label),
  ]);
  const errors = validateProgramRequirements(program.requirements);
  const always = ALWAYS_SHOWN_PAYMENTS[program.type] || ['final'];
  const isShown = key => always.includes(key) || hasMoney(program.payments?.[key]) || revealed.has(key);
  const guaranteedFields = listGuaranteedPaymentFields(program.type).filter(field => field.key !== 'final');
  const bonusFields = listBonusPaymentFields(program.type);
  const otherPayments = program.otherPayments || [];
  const bonuses = program.bonuses || [];
  const stages = program.stages || [];
  const relocation = program.relocation || {};
  const coverageDetails = program.coverageDetails || {};
  const noteLength = String(program.note || '').length;
  const stageOptions = PROGRAM_STAGE_OPTIONS[program.type === 'sm' ? 'sm' : 'ed'];
  const mainLabel = {
    cycle: 'Винагорода за цикл донації',
    final: 'Фінальна виплата',
    total: 'Загальна винагорода',
    guaranteed: 'Гарантований мінімум',
  }[payKind];
  const setStage = (index, patch) => set({ stages: stages.map((item, i) => (i === index ? { ...item, ...patch } : item)) });
  const setRelocation = patch => set({ relocation: { ...relocation, ...patch } });
  const setCoverageDetail = (key, patch) => set({ coverageDetails: { ...coverageDetails, [key]: { ...(coverageDetails[key] || {}), ...patch } } });

  const renderMoneyField = ({ key, label }, { removable, details = false }) => (
    <Field key={key}>
      <span>{uiText(label, language)}</span>
      <FieldRow>
        <MoneyInput
          id={`${idPrefix}-${key}`}
          ariaLabel={uiText(label, language)}
          language={language}
          rates={rates}
          placeholder={uiText('сума', language)}
          value={program.payments?.[key]}
          onChange={money => setPay(key, money)}
        />
        {removable ? (
          <RemoveButton type="button" aria-label={uiText('Прибрати: {label}', language, { label: uiText(label, language) })} onClick={() => removePay(key)}>✕</RemoveButton>
        ) : null}
      </FieldRow>
      {key === 'monthly' ? (
        <MonthsRow>
          <span>{uiText('Скільки місяців', language)}</span>
          <MonthsInput
            inputMode="numeric"
            aria-label={uiText('Скільки місяців', language)}
            placeholder={String(DEFAULT_MONTHLY_MONTHS)}
            value={program.payments?.monthly?.months ?? ''}
            onChange={event => {
              const digits = event.target.value.replace(/[^0-9]/g, '').slice(0, 2);
              const months = Number(digits);
              setMonths(digits && months >= 1 ? String(Math.min(months, MAX_MONTHLY_MONTHS)) : '');
            }}
          />
          <span>{uiText('без цього разом за програму не рахується', language)}</span>
        </MonthsRow>
      ) : null}
      {details ? <PaymentDetails value={program.payments?.[key]} language={language} rates={rates} idPrefix={`${idPrefix}-${key}`} onChange={patch => setPayExtras(key, patch)} /> : null}
    </Field>
  );

  const numberField = (key, label, unit = '') => (
    <Field>
      <label htmlFor={`${idPrefix}-${key}`}>{uiText(label, language)}{unit ? <small> · {uiText(unit, language)}</small> : null}</label>
      <TextInput
        id={`${idPrefix}-${key}`}
        inputMode="decimal"
        $invalid={Boolean(errors[key])}
        aria-invalid={Boolean(errors[key])}
        placeholder={uiText('не вказано', language)}
        value={program.requirements?.[key] ?? ''}
        onChange={event => setReq({ [key]: event.target.value })}
      />
      {errors[key] ? <FieldError role="alert">{uiText(errors[key].text, language, errors[key].vars)}</FieldError> : null}
    </Field>
  );
  const qualifier = key => <RequirementQualifier requirementKey={key} meta={program.requirementMeta} onChange={setMeta} language={language} idPrefix={idPrefix} />;

  return (
    <Body>
      <ModeSwitch role="group" aria-label={uiText('Режим', language)}>
        <button type="button" aria-pressed={mode === 'form'} onClick={() => setMode('form')}>{uiText('Форма', language)}</button>
        <button type="button" aria-pressed={mode === 'preview'} onClick={() => setMode('preview')}>{uiText('Як побачать', language)}</button>
      </ModeSwitch>

      <FormColumn $hiddenOnMobile={mode !== 'form'}>
        <Step>
          <StepHead>
            <h4>{uiText('Основне', language)}</h4>
          </StepHead>
          <Field>
            <span>{uiText('Кого шукаєте', language)}</span>
            <Segments role="group" aria-label={uiText('Кого шукаєте', language)}>
              {PROGRAM_TYPES.map(key => (
                <Segment key={key} type="button" $on={program.type === key} aria-pressed={program.type === key} onClick={() => set({ type: key, payKind: undefined, payMax: undefined })}>
                  {uiText(PROGRAM_TYPE_LABELS[key], language)}
                </Segment>
              ))}
            </Segments>
          </Field>
          <Grid $min={200}>
            <Field>
              <label htmlFor={`${idPrefix}-name`}>{uiText('Назва програми', language)} <small>· {uiText('необовʼязково', language)}</small></label>
              <TextInput
                id={`${idPrefix}-name`}
                value={program.name || ''}
                maxLength={60}
                placeholder={uiText('Наприклад: Донорство в Грузії', language)}
                onChange={event => set({ name: event.target.value })}
              />
            </Field>
            <Field>
              <label htmlFor={`${idPrefix}-location`}>{uiText('Де проходить', language)}</label>
              <TextInput
                id={`${idPrefix}-location`}
                value={program.location || ''}
                maxLength={80}
                placeholder={uiText('Наприклад: Київ', language)}
                onChange={event => set({ location: event.target.value })}
              />
            </Field>
          </Grid>
          <CheckRow>
            <input id={`${idPrefix}-start`} type="checkbox" checked={program.startNow === true} onChange={event => set({ startNow: event.target.checked || undefined })} />
            <label htmlFor={`${idPrefix}-start`}>{uiText('Старт одразу — набір відкритий зараз', language)}</label>
          </CheckRow>
        </Step>

        <Step>
          <StepHead>
            <h4>{uiText('Винагорода', language)}</h4>
            <p>{uiText('Що отримає кандидатка. Вид суми визначає підпис у картці — «за цикл», «фінальна», «загалом» чи «гарантовано, до …».', language)}</p>
          </StepHead>
          <Field>
            <span>{uiText('Вид суми', language)}</span>
            <Segments role="group" aria-label={uiText('Вид суми', language)}>
              {PROGRAM_PAY_KINDS[program.type === 'sm' ? 'sm' : 'ed'].map(option => (
                <Segment key={option.key} type="button" $on={payKind === option.key} aria-pressed={payKind === option.key} onClick={() => set({ payKind: option.key })}>
                  {uiText(option.label, language)}
                </Segment>
              ))}
            </Segments>
          </Field>
          {renderMoneyField({ key: 'final', label: mainLabel }, { removable: false, details: program.type === 'sm' })}
          {payKind === 'guaranteed' ? (
            <Field>
              <span>{uiText('До (максимум)', language)}</span>
              <OtherRow>
                <MoneyInput
                  language={language}
                  rates={rates}
                  ariaLabel={uiText('Максимальна сума', language)}
                  placeholder={uiText('сума', language)}
                  value={program.payMax}
                  onChange={money => set({ payMax: money ? { ...money, condition: program.payMax?.condition || '' } : undefined })}
                />
                <TextInput
                  aria-label={uiText('Від чого залежить максимум', language)}
                  value={program.payMax?.condition || ''}
                  maxLength={120}
                  placeholder={uiText('Наприклад: залежно від кількості ооцитів', language)}
                  onChange={event => set({ payMax: { ...(program.payMax || { amount: '', currency }), condition: event.target.value } })}
                />
                <span />
              </OtherRow>
            </Field>
          ) : null}
        </Step>

        <Step>
          <StepHead>
            <h4>{uiText('Графік виплат', language)}<small>{uiText(program.type === 'sm' ? 'перенос, тижні вагітності, щомісячні' : 'необовʼязково', language)}</small></h4>
            <p>{uiText(payKind === 'total'
              ? 'Загальна винагорода вже містить ці виплати — у картці вони стоять розбивкою і до суми не додаються.'
              : 'Виплати, які отримує кожна учасниця, з умовою й терміном. Разом застосунок порахує сам — коли графік повний.', language)}</p>
          </StepHead>
          {guaranteedFields.filter(field => isShown(field.key)).map(field => renderMoneyField(field, { removable: !always.includes(field.key), details: true }))}
          <LabeledPayments
            items={otherPayments}
            onChange={next => set({ otherPayments: next })}
            listId={`${idPrefix}-payment-terms`}
            suggestions={paymentSuggestions}
            placeholder="За що"
            removeLabel="Прибрати виплату"
            language={language}
            rates={rates}
            withDetails
          />
          <Segments>
            {guaranteedFields.filter(field => !isShown(field.key)).map(field => (
              <AddChip key={field.key} type="button" onClick={() => reveal(field.key)}>+ {uiText(field.label, language)}</AddChip>
            ))}
            <AddChip type="button" onClick={() => set({ otherPayments: [...otherPayments, { label: '', amount: '', currency }] })}>
              + {uiText('Інша виплата', language)}
            </AddChip>
          </Segments>
          {legacyTotal ? (
            <Hint>
              <span>
                {uiText('Раніше введена загальна сума {amount} більше не показується — разом рахуємо з виплат', language, {
                  amount: formatProgramMoney(legacyTotal.amount, legacyTotal.currency),
                })}
              </span>
              <SmallButton type="button" onClick={removeLegacyTotal}>{uiText('Прибрати', language)}</SmallButton>
            </Hint>
          ) : null}
          {breakdown && breakdown.guaranteed.amount > 0 ? (
            <TotalBox data-testid="program-editor-total">
              <div>
                <span>{uiText(payKind === 'total' ? 'Загальна винагорода' : 'Разом гарантовано', language)}</span>
                <b>{breakdown.reliable ? `${breakdown.guaranteed.approximate ? '≈ ' : ''}${formatSumParts(breakdown.guaranteed)}` : '—'}</b>
              </div>
              {!breakdown.reliable && breakdown.hasMonthlyEstimate ? (
                <small>{uiText('Вкажіть, скільки місяців щомісячна виплата, — інакше разом у картці не показується (≈ {amount} за 9 міс).', language, { amount: formatSumParts(breakdown.guaranteed) })}</small>
              ) : null}
              {breakdown.upTo ? (
                <div>
                  <span>{uiText('Максимум', language)}</span>
                  <b>{breakdown.upTo.approximate ? '≈ ' : ''}{formatSumParts(breakdown.upTo)}</b>
                </div>
              ) : null}
              {breakdown.bonuses.length ? (
                <div>
                  <span>{uiText('З усіма можливими доплатами', language)}</span>
                  <b>{breakdown.max.approximate ? '≈ ' : ''}{formatSumParts(breakdown.max)}</b>
                </div>
              ) : null}
            </TotalBox>
          ) : null}
        </Step>

        <Step>
          <StepHead>
            <h4>{uiText('Можливі доплати', language)}<small>{uiText('необовʼязково', language)}</small></h4>
            <p>{uiText('Отримує не кожна — за КС, двійню, досвід. У «разом» не входять: учасниця відмітить їх сама.', language)}</p>
          </StepHead>
          {bonusFields.filter(field => isShown(field.key)).map(field => renderMoneyField(field, { removable: true }))}
          <LabeledPayments
            items={bonuses}
            onChange={next => set({ bonuses: next })}
            listId={`${idPrefix}-bonus-terms`}
            suggestions={bonusSuggestions}
            placeholder="За що"
            removeLabel="Прибрати доплату"
            language={language}
            rates={rates}
          />
          <Segments>
            {bonusFields.filter(field => !isShown(field.key)).map(field => (
              <AddChip key={field.key} type="button" onClick={() => reveal(field.key)}>+ {uiText(field.label, language)}</AddChip>
            ))}
            <AddChip type="button" onClick={() => set({ bonuses: [...bonuses, { label: '', amount: '', currency }] })}>
              + {uiText('Інша доплата', language)}
            </AddChip>
          </Segments>
        </Step>

        <Step>
          <StepHead>
            <h4>{uiText('Вимоги до кандидатки', language)}<small>{uiText('необовʼязково', language)}</small></h4>
            <p>{uiText('Порожнє — «не вказано». «Без обмежень», «бажано» й «індивідуально» — рівень під вимогою; за строгими вимогами кандидатка одразу бачить, чи програма їй підходить.', language)}</p>
          </StepHead>
          <ReqGroup>
            <legend>{uiText('Вік і тіло', language)}</legend>
            <Field>
              <span>{uiText('Вік', language)}</span>
              <RangeInputs>
                <TextInput
                  inputMode="numeric"
                  aria-label={uiText('Вік від', language)}
                  placeholder={uiText('від', language)}
                  $invalid={Boolean(errors.ageFrom)}
                  aria-invalid={Boolean(errors.ageFrom)}
                  value={program.requirements?.ageFrom ?? ''}
                  onChange={event => setReq({ ageFrom: event.target.value })}
                />
                <span>—</span>
                <TextInput
                  inputMode="numeric"
                  aria-label={uiText('Вік до', language)}
                  placeholder={uiText('до', language)}
                  $invalid={Boolean(errors.ageTo)}
                  aria-invalid={Boolean(errors.ageTo)}
                  value={program.requirements?.ageTo ?? ''}
                  onChange={event => setReq({ ageTo: event.target.value })}
                />
              </RangeInputs>
              {errors.ageFrom || errors.ageTo ? <FieldError role="alert">{uiText((errors.ageFrom || errors.ageTo).text, language, (errors.ageFrom || errors.ageTo).vars)}</FieldError> : null}
              {qualifier('age')}
            </Field>
            <Grid $min={150}>
              <div>{numberField('bmiMax', 'ІМТ до')}{qualifier('bmi')}</div>
              <div>{numberField('heightFrom', 'Зріст від', 'см')}{qualifier('height')}</div>
            </Grid>
          </ReqGroup>
          <ReqGroup>
            <legend>{uiText('Здоровʼя', language)}</legend>
            <ChoiceSelect id={`${idPrefix}-rh`} label="Резус" options={PROGRAM_RH_OPTIONS} value={program.requirements?.rh} onChange={rh => setReq({ rh })} language={language} />
            {qualifier('rh')}
          </ReqGroup>
          <ReqGroup>
            <legend>{uiText('Діти й пологи', language)}</legend>
            <Grid $min={180}>
              <div>
                <ChoiceSelect id={`${idPrefix}-kids`} label="Власна дитина" options={PROGRAM_KIDS_OPTIONS} value={program.requirements?.ownKids} onChange={ownKids => setReq({ ownKids })} language={language} />
                {qualifier('ownKids')}
              </div>
              <div>{numberField('maxBirths', 'Пологів не більше')}{qualifier('births')}</div>
              <div>
                <ChoiceSelect id={`${idPrefix}-cs`} label="Кесарів розтин" options={PROGRAM_CSECTION_OPTIONS} value={program.requirements?.csectionMax} onChange={csectionMax => setReq({ csectionMax })} language={language} />
                {qualifier('csection')}
              </div>
            </Grid>
          </ReqGroup>
          <ReqGroup>
            <legend>{uiText('Сімейний стан', language)}</legend>
            <ChoiceSelect id={`${idPrefix}-marital`} label="Сімейний стан" options={PROGRAM_MARITAL_OPTIONS} value={program.requirements?.marital} onChange={marital => setReq({ marital })} language={language} />
            {qualifier('marital')}
          </ReqGroup>
        </Step>

        <Step>
          <StepHead>
            <h4>{uiText('Де й коли', language)}<small>{uiText('необовʼязково', language)}</small></h4>
            <p>{uiText('Етапи в різних містах чи країнах, переїзд і чи можна з сімʼєю.', language)}</p>
          </StepHead>
          {stages.map((item, index) => (
            <OtherRow key={`stage-${index}`}>
              <Select aria-label={uiText('Етап', language)} value={item.stage || 'other'} onChange={event => setStage(index, { stage: event.target.value })}>
                {stageOptions.map(option => <option key={option.key} value={option.key}>{uiText(option.label, language)}</option>)}
              </Select>
              <TextInput aria-label={uiText('Де', language)} value={item.place || ''} maxLength={80} placeholder={uiText('Місто чи країна', language)} onChange={event => setStage(index, { place: event.target.value })} />
              <RemoveButton type="button" aria-label={uiText('Прибрати етап', language)} title={uiText('Прибрати етап', language)} onClick={() => set({ stages: stages.filter((_, i) => i !== index) })}>✕</RemoveButton>
            </OtherRow>
          ))}
          {stages.length < 6 ? (
            <Segments>
              <AddChip type="button" onClick={() => set({ stages: [...stages, { stage: stageOptions[stages.length]?.key || 'other', place: '' }] })}>+ {uiText('Етап і місце', language)}</AddChip>
            </Segments>
          ) : null}
          <Grid $min={200}>
            <Field>
              <label htmlFor={`${idPrefix}-reloc-when`}>{uiText('Переїзд', language)}</label>
              <TextInput id={`${idPrefix}-reloc-when`} value={relocation.when || ''} maxLength={80} placeholder={uiText('Наприклад: з 12 тижня вагітності', language)} onChange={event => setRelocation({ when: event.target.value })} />
            </Field>
            <ChoiceSelect id={`${idPrefix}-family`} label="Сімʼя" options={PROGRAM_FAMILY_OPTIONS} value={relocation.family || ''} fallback="" onChange={family => setRelocation({ family })} language={language} />
          </Grid>
          <TextInput aria-label={uiText('Примітка про переїзд', language)} value={relocation.note || ''} maxLength={120} placeholder={uiText('Наприклад: квартира на двох, діти — за домовленістю', language)} onChange={event => setRelocation({ note: event.target.value })} />
        </Step>

        <Step>
          <StepHead>
            <h4>{uiText('Що покриваєте', language)}<small>{uiText('необовʼязково', language)}</small></h4>
            <p>{uiText('Позначте, за що учасниці не доведеться платити самій, і як саме: оплачуєте, компенсуєте за чеками чи видаєте кошти.', language)}</p>
          </StepHead>
          <Segments>
            {PROGRAM_COVERAGE_OPTIONS.map(option => {
              const on = (program.coverage || []).includes(option.key);
              return (
                <Segment
                  key={option.key}
                  type="button"
                  $on={on}
                  aria-pressed={on}
                  onClick={() => set({ coverage: on ? program.coverage.filter(key => key !== option.key) : [...(program.coverage || []), option.key] })}
                >
                  {on ? '✓ ' : ''}{uiText(option.label, language)}
                </Segment>
              );
            })}
          </Segments>
          {(program.coverage || []).map(key => {
            const option = PROGRAM_COVERAGE_OPTIONS.find(item => item.key === key);
            if (!option) return null;
            const detail = coverageDetails[key] || {};
            // Подробиці — на прохання: здебільшого «житло» без умов і є вся
            // відповідь, і п'ять порожніх рядків під чіпами лише подовжували форму.
            const filledDetail = Boolean(detail.mode || detail.limit || detail.note);
            if (!filledDetail && !revealed.has(`cov:${key}`)) {
              return (
                <LinkButton key={key} type="button" onClick={() => reveal(`cov:${key}`)}>
                  + {uiText('як саме: {label}', language, { label: uiText(option.label, language).toLowerCase() })}
                </LinkButton>
              );
            }
            return (
              <CoverageRow key={key}>
                <b>{uiText(option.label, language)}</b>
                <Select aria-label={uiText('Як покриваєте: {label}', language, { label: uiText(option.label, language) })} value={detail.mode || ''} onChange={event => setCoverageDetail(key, { mode: event.target.value || undefined })}>
                  <option value="">{uiText('Як — не вказано', language)}</option>
                  {PROGRAM_COVERAGE_MODES.map(mode => <option key={mode.key} value={mode.key}>{uiText(mode.label, language)}</option>)}
                </Select>
                <MoneyInput language={language} rates={rates} ariaLabel={uiText('Межа: {label}', language, { label: uiText(option.label, language) })} placeholder={uiText('межа', language)} value={detail.limit} onChange={money => setCoverageDetail(key, { limit: money || undefined })} />
                <Select aria-label={uiText('За який час: {label}', language, { label: uiText(option.label, language) })} value={detail.per || 'total'} onChange={event => setCoverageDetail(key, { per: event.target.value })}>
                  {PROGRAM_COVERAGE_PER.map(per => <option key={per.key} value={per.key}>{uiText(per.label, language)}</option>)}
                </Select>
                <TextInput aria-label={uiText('Умова: {label}', language, { label: uiText(option.label, language) })} value={detail.note || ''} maxLength={120} placeholder={uiText('Наприклад: крім таксі', language)} onChange={event => setCoverageDetail(key, { note: event.target.value })} />
              </CoverageRow>
            );
          })}
        </Step>

        <Step>
          <StepHead>
            <h4>{uiText('Умови й примітки', language)}<small>{uiText('необовʼязково', language)}</small></h4>
            <p>{uiText('Те, про що інакше питали б у чаті: тривалість, візити, що не покривається.', language)}</p>
          </StepHead>
          <Field>
            <TextArea
              aria-label={uiText('Умови й примітки', language)}
              value={program.note || ''}
              maxLength={NOTE_MAX}
              placeholder={uiText('Наприклад: 2–3 візити до клініки, проживання на час стимуляції — за наш рахунок', language)}
              onChange={event => set({ note: event.target.value })}
            />
            <Counter $over={noteLength >= NOTE_MAX}>{noteLength}/{NOTE_MAX}</Counter>
          </Field>
        </Step>

        <Step>
          <StepHead>
            <h4>{uiText('Головне в картці', language)}</h4>
            <p>{uiText('Що побачать у згорнутій картці одразу під сумою. Вибирайте з уже вказаного — текст оновиться сам, коли зміните програму.', language)}</p>
          </StepHead>
          {normalized ? <HighlightsPicker program={program} normalized={normalized} language={language} onChange={highlights => set({ highlights })} /> : null}
        </Step>
      </FormColumn>

      <PreviewColumn $hiddenOnMobile={mode !== 'preview'} aria-label={uiText('Як побачать у стрічці', language)}>
        <PreviewHead>
          <PreviewLabel>{uiText('Так програму побачать у стрічці', language)}</PreviewLabel>
          <ProgramCurrencySwitch value={previewCurrency || currency} onChange={setPreviewCurrency} language={language} />
        </PreviewHead>
        {normalized && isProgramPresentable(normalized) ? (
          <div data-testid="program-card">
            <ProgramPreview program={normalized} rates={rates} language={language} displayCurrency={previewCurrency || currency} />
          </div>
        ) : (
          <EmptyState>
            <b>{uiText('Поки що нічого показати', language)}</b>
            {uiText('Вкажіть місце, виплату чи умови — і програма з’явиться в стрічці.', language)}
          </EmptyState>
        )}
      </PreviewColumn>
    </Body>
  );
};

const nextProgramId = existing => {
  const taken = new Set(existing.map(program => program.id));
  let id = `p${Date.now().toString(36)}`;
  while (taken.has(id)) id = `${id}x`;
  return id;
};

const listEditablePrograms = programs => listPrograms(programs, { includeHidden: true }).map(program => ({ ...program }));

const SAVE_LABELS = Object.freeze({
  saving: 'Зберігаємо…',
  saved: 'Збережено',
  failed: 'Поки лише в цьому браузері',
});

export const ProgramsEditor = ({ programs, onSave, language, rates, defaultType = 'ed', suggestions = null }) => {
  const [draft, setDraft] = useState(() => listEditablePrograms(programs));
  const [openId, setOpenId] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState('');
  const [saveState, setSaveState] = useState('');
  const timerRef = useRef(null);
  const draftRef = useRef(draft);
  const dirtyRef = useRef(false);
  const mountedRef = useRef(true);
  const saveSeqRef = useRef(0);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const lastSavedRef = useRef(JSON.stringify(programsToRecord(programs)));

  // Анкета читається асинхронно, тож програми можуть приїхати вже після
  // монтування. Підхоплюється лише зміна **ззовні** — не відлуння власного
  // збереження: інакше нормалізоване значення («3» у віці — ще не вік)
  // перетирало б поле, яке людина саме набирає.
  const incoming = JSON.stringify(programsToRecord(programs));
  useEffect(() => {
    if (incoming === lastSavedRef.current || dirtyRef.current) return;
    lastSavedRef.current = incoming;
    const next = listEditablePrograms(programs);
    draftRef.current = next;
    setDraft(next);
  }, [incoming]); // eslint-disable-line react-hooks/exhaustive-deps

  const flush = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    const record = programsToRecord(draftRef.current);
    lastSavedRef.current = JSON.stringify(record);
    const result = onSaveRef.current(Object.keys(record).length ? record : null);
    // `onSave` може повернути проміс із тим, чи прийняла база запис: тоді
    // стан запису видно вгорі. Без проміса стану не вигадуємо. Відповідь
    // старішого запису, що приїхала після новішого, стан не перебиває.
    if (!result || typeof result.then !== 'function') return;
    saveSeqRef.current += 1;
    const seq = saveSeqRef.current;
    if (mountedRef.current) setSaveState('saving');
    result.then(ok => {
      if (mountedRef.current && seq === saveSeqRef.current) setSaveState(ok === false ? 'failed' : 'saved');
    });
  };

  // Закрита вкладка не розмонтовує компонента, тож останні 0,7 с набраного
  // (`SAVE_DELAY_MS`) інакше губились би разом із нею: `pagehide` записує
  // відкладене одразу.
  useEffect(() => {
    // StrictMode у розробці знімає й ставить ефект ще раз — позначка мусить
    // повертатись, інакше стан запису не показувався б ніколи.
    mountedRef.current = true;
    const onPageHide = () => flush();
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      mountedRef.current = false;
      flush();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const update = next => {
    draftRef.current = next;
    dirtyRef.current = true;
    setDraft(next);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(flush, SAVE_DELAY_MS);
  };

  const add = type => {
    const program = createEmptyProgram(type, nextProgramId(draft));
    update([...draft, program]);
    setOpenId(program.id);
  };

  const duplicate = program => {
    const copy = { ...program, id: nextProgramId(draft), hidden: false };
    update([...draft, copy]);
    setOpenId(copy.id);
  };

  // Порядок — це порядок у записі (`programsToRecord` ставить `order` за
  // позицією), тож пересунути програму означає переставити її в масиві.
  const move = (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= draft.length) return;
    const next = [...draft];
    [next[index], next[target]] = [next[target], next[index]];
    update(next);
  };

  const toggleHidden = program => update(draft.map(item => (item.id === program.id ? { ...item, hidden: !item.hidden } : item)));

  return (
    <Wrap>
      <Intro>
        <p>{uiText('Кожна програма — окрема пропозиція: кого шукаєте, де і скільки платите. Решта — за бажанням; порожні розділи читачі не побачать.', language)}</p>
        {saveState ? <SaveState $state={saveState} role="status">{uiText(SAVE_LABELS[saveState], language)}</SaveState> : null}
      </Intro>
      {!draft.length ? (
        <EmptyState>
          <b>{uiText('Програм ще немає', language)}</b>
          {uiText('Додайте першу — донорки й сурогатні мами побачать її у вашій картці в стрічці.', language)}
        </EmptyState>
      ) : null}
      {draft.map((program, index) => {
        const open = openId === program.id;
        const status = programStatus(program);
        const pay = headPay(program);
        return (
          <ProgramBox key={program.id} data-testid="program-editor" $hidden={program.hidden}>
            <ProgramHead $open={open} style={program.hidden ? { opacity: 0.75 } : undefined}>
              <HeadText type="button" aria-expanded={open} onClick={() => { flush(); setOpenId(open ? '' : program.id); }}>
                <span>
                  <b>{program.name || uiText(PROGRAM_OFFER_LABELS[program.type], language)}</b>
                  {program.name ? <em>{uiText(PROGRAM_OFFER_LABELS[program.type], language)}</em> : null}
                </span>
                <span>
                  <em>{formatProgramPlace(program.location)}{program.location && pay ? ' · ' : ''}{pay ? <strong>{pay}</strong> : null}</em>
                  <Status $tone={status.tone}>{uiText(status.label, language)}</Status>
                </span>
              </HeadText>
              {confirmDeleteId === program.id ? (
                <>
                  <SmallButton type="button" $danger onClick={() => { update(draft.filter(item => item.id !== program.id)); setConfirmDeleteId(''); }}>{uiText('Видалити', language)}</SmallButton>
                  <SmallButton type="button" onClick={() => setConfirmDeleteId('')}>{uiText('Ні', language)}</SmallButton>
                </>
              ) : (
                <MoreActions>
                  <summary aria-label={uiText('Дії програми', language)}>⋮</summary>
                  <div>
                    {draft.length > 1 ? (
                      <>
                        <SmallButton type="button" disabled={index === 0} onClick={() => move(index, -1)}>↑ {uiText('Вище', language)}</SmallButton>
                        <SmallButton type="button" disabled={index === draft.length - 1} onClick={() => move(index, 1)}>↓ {uiText('Нижче', language)}</SmallButton>
                      </>
                    ) : null}
                    <SmallButton type="button" aria-pressed={Boolean(program.hidden)} onClick={() => toggleHidden(program)}>
                      {uiText(program.hidden ? 'Показати' : 'Сховати', language)}
                    </SmallButton>
                    <SmallButton type="button" onClick={() => duplicate(program)} disabled={draft.length >= MAX_PROGRAMS}>{uiText('Створити копію', language)}</SmallButton>
                    <SmallButton type="button" $danger onClick={() => setConfirmDeleteId(program.id)}>{uiText('Видалити програму', language)}</SmallButton>
                  </div>
                </MoreActions>
              )}
              <Chevron $open={open} aria-hidden="true">▼</Chevron>
            </ProgramHead>
            {open ? (
              <ProgramForm
                program={program}
                language={language}
                rates={rates}
                suggestions={suggestions}
                onChange={next => update(draft.map(item => (item.id === program.id ? next : item)))}
              />
            ) : null}
          </ProgramBox>
        );
      })}
      {draft.length < MAX_PROGRAMS ? (
        <AddProgram type="button" onClick={() => add(defaultType)}>
          + {uiText('Додати програму', language)}
        </AddProgram>
      ) : null}
    </Wrap>
  );
};

export default ProgramsEditor;
