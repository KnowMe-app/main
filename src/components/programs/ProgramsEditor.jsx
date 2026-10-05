import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import {
  MAX_PROGRAMS,
  PROGRAM_COVERAGE_OPTIONS,
  PROGRAM_CSECTION_OPTIONS,
  PROGRAM_KIDS_OPTIONS,
  PROGRAM_MARITAL_OPTIONS,
  DEFAULT_MONTHLY_MONTHS,
  MAX_MONTHLY_MONTHS,
  PROGRAM_RH_OPTIONS,
  PROGRAM_TOTAL_FIELD,
  PROGRAM_TYPES,
  PROGRAM_TYPE_LABELS,
  createEmptyProgram,
  isProgramPresentable,
  listBonusPaymentFields,
  listGuaranteedPaymentFields,
  listPrograms,
  normalizeProgram,
  programBreakdown,
  programHeadlinePay,
  programsToRecord,
} from '../../utils/donorPrograms';
import { DEFAULT_PROGRAM_CURRENCY, formatProgramMoney } from '../../utils/programCurrency';
import { uiText } from '../../utils/uiTranslations';
import { MoneyInput } from './MoneyInput';
import { ProgramCard } from './ProgramsView';

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

  > span:first-child { display: flex; align-items: baseline; gap: 6px; max-width: 100%; }
  b { font-size: 15px; font-weight: 700; white-space: nowrap; }
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
`;

const Select = styled.select`
  ${inputCss}
  padding-right: 8px;
  cursor: pointer;
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

const LabeledPayments = ({ items, onChange, listId, suggestions, placeholder, removeLabel, language, rates }) => {
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
        <OtherRow key={`${listId}-${index}`}>
          <TextInput
            value={item.label || ''}
            list={suggestions.length ? listId : undefined}
            placeholder={uiText(placeholder, language)}
            aria-label={uiText(placeholder, language)}
            onChange={event => setItem(index, { label: event.target.value })}
          />
          <MoneyInput language={language} rates={rates} value={item} ariaLabel={uiText('Сума', language)} onChange={money => setItem(index, money)} />
          <RemoveButton type="button" aria-label={uiText(removeLabel, language)} title={uiText(removeLabel, language)} onClick={() => onChange(items.filter((_, i) => i !== index))}>✕</RemoveButton>
        </OtherRow>
      ))}
    </>
  );
};

const uniqueLabels = labels => {
  const seen = new Set();
  return labels.filter(label => {
    const key = String(label || '').trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const ChoiceSelect = ({ id, label, options, value, onChange, language }) => (
  <Field>
    <label htmlFor={id}>{uiText(label, language)}</label>
    <Select id={id} value={value || 'any'} onChange={event => onChange(event.target.value)}>
      {options.map(option => <option key={option.key} value={option.key}>{uiText(option.label, language)}</option>)}
    </Select>
  </Field>
);

const ProgramForm = ({ program, onChange, language, rates, suggestions }) => {
  const [revealed, setRevealed] = useState(() => new Set());
  const [mode, setMode] = useState('form');
  const set = patch => onChange({ ...program, ...patch });
  const setReq = patch => onChange({ ...program, requirements: { ...program.requirements, ...patch } });
  // `MoneyInput` віддає саму суму й валюту; кількість місяців щомісячної
  // виплати лежить поруч у тому самому обʼєкті й мусить пережити правку суми.
  const setPay = (key, money) => onChange({
    ...program,
    payments: {
      ...program.payments,
      [key]: key === 'monthly' && program.payments?.monthly?.months !== undefined && money
        ? { ...money, months: program.payments.monthly.months }
        : money,
    },
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
  const guaranteedFields = listGuaranteedPaymentFields(program.type);
  const bonusFields = listBonusPaymentFields(program.type);
  const otherPayments = program.otherPayments || [];
  const bonuses = program.bonuses || [];
  const noteLength = String(program.note || '').length;

  const renderMoneyField = ({ key, label }, { removable }) => (
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
          <span>{uiText('порожньо — {months} міс, термін вагітності', language, { months: DEFAULT_MONTHLY_MONTHS })}</span>
        </MonthsRow>
      ) : null}
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
        placeholder={uiText('не важливо', language)}
        value={program.requirements?.[key] ?? ''}
        onChange={event => setReq({ [key]: event.target.value })}
      />
      {errors[key] ? <FieldError role="alert">{uiText(errors[key].text, language, errors[key].vars)}</FieldError> : null}
    </Field>
  );

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
                <Segment key={key} type="button" $on={program.type === key} aria-pressed={program.type === key} onClick={() => set({ type: key })}>
                  {uiText(PROGRAM_TYPE_LABELS[key], language)}
                </Segment>
              ))}
            </Segments>
          </Field>
          <Field>
            <label htmlFor={`${idPrefix}-location`}>{uiText('Де проходить', language)}</label>
            <TextInput
              id={`${idPrefix}-location`}
              value={program.location || ''}
              maxLength={80}
              placeholder={uiText('Наприклад: Київ; пологи в Грузії', language)}
              onChange={event => set({ location: event.target.value })}
            />
          </Field>
        </Step>

        <Step>
          <StepHead>
            <h4>{uiText('Виплати', language)}</h4>
            <p>{uiText('Те, що гарантовано отримає кожна учасниця. Суму «разом» застосунок порахує сам.', language)}</p>
          </StepHead>
          {guaranteedFields.filter(field => isShown(field.key)).map(field => renderMoneyField(field, { removable: !always.includes(field.key) }))}
          <LabeledPayments
            items={otherPayments}
            onChange={next => set({ otherPayments: next })}
            listId={`${idPrefix}-payment-terms`}
            suggestions={paymentSuggestions}
            placeholder="За що"
            removeLabel="Прибрати виплату"
            language={language}
            rates={rates}
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
                <span>{uiText('Разом гарантовано', language)}</span>
                <b>{breakdown.guaranteed.approximate ? '≈ ' : ''}{formatSumParts(breakdown.guaranteed)}</b>
              </div>
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
            <p>{uiText('Порожнє поле — «не має значення». За вимогами кандидатка одразу бачить, чи програма їй підходить.', language)}</p>
          </StepHead>
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
          </Field>
          <Grid $min={120}>
            {numberField('bmiMax', 'ІМТ до')}
            {numberField('heightFrom', 'Зріст від', 'см')}
            {numberField('maxBirths', 'Пологів не більше')}
          </Grid>
          <Grid $min={210}>
            <ChoiceSelect id={`${idPrefix}-rh`} label="Резус" options={PROGRAM_RH_OPTIONS} value={program.requirements?.rh} onChange={rh => setReq({ rh })} language={language} />
            <ChoiceSelect id={`${idPrefix}-marital`} label="Сімейний стан" options={PROGRAM_MARITAL_OPTIONS} value={program.requirements?.marital} onChange={marital => setReq({ marital })} language={language} />
            <ChoiceSelect id={`${idPrefix}-kids`} label="Власна дитина" options={PROGRAM_KIDS_OPTIONS} value={program.requirements?.ownKids} onChange={ownKids => setReq({ ownKids })} language={language} />
            <ChoiceSelect id={`${idPrefix}-cs`} label="Кесарів розтин" options={PROGRAM_CSECTION_OPTIONS} value={program.requirements?.csectionMax} onChange={csectionMax => setReq({ csectionMax })} language={language} />
          </Grid>
        </Step>

        <Step>
          <StepHead>
            <h4>{uiText('Що покриваєте', language)}<small>{uiText('необовʼязково', language)}</small></h4>
            <p>{uiText('Позначте, за що учасниці не доведеться платити самій.', language)}</p>
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
        </Step>

        <Step>
          <StepHead>
            <h4>{uiText('Умови й примітки', language)}<small>{uiText('необовʼязково', language)}</small></h4>
            <p>{uiText('Тривалість і візити, що не покривається, важливі обмеження — те, про що інакше питали б у чаті.', language)}</p>
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
      </FormColumn>

      <PreviewColumn $hiddenOnMobile={mode !== 'preview'} aria-label={uiText('Як побачать у стрічці', language)}>
        <PreviewLabel>{uiText('Так програму побачать у стрічці', language)}</PreviewLabel>
        {normalized && isProgramPresentable(normalized) ? (
          <ProgramCard program={normalized} rates={rates} language={language} framed />
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
                  <b>{uiText(PROGRAM_TYPE_LABELS[program.type], language)}</b>
                </span>
                <span>
                  <em>{program.location}{program.location && pay ? ' · ' : ''}{pay ? <strong>{pay}</strong> : null}</em>
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
