import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import {
  MAX_PROGRAMS,
  MAX_CUSTOM_REQUIREMENTS,
  CUSTOM_REQUIREMENT_MAX_LENGTH,
  MAX_CUSTOM_COVERAGE,
  CUSTOM_COVERAGE_MAX_LENGTH,
  PROGRAM_COVERAGE_MODES,
  PROGRAM_COVERAGE_OPTIONS,
  PROGRAM_COVERAGE_PER,
  PROGRAM_CSECTION_OPTIONS,
  PROGRAM_FAMILY_OPTIONS,
  PROGRAM_KIDS_OPTIONS,
  PROGRAM_MARITAL_OPTIONS,
  MAX_MONTHLY_MONTHS,
  DEFAULT_MONTHLY_MONTHS,
  PROGRAM_OFFER_LABELS,
  PROGRAM_REQUIREMENT_LABELS,
  PROGRAM_RH_OPTIONS,
  PROGRAM_TOTAL_FIELD,
  PROGRAM_TYPES,
  MAIN_PAYMENT_LABEL,
  createEmptyProgram,
  isGuaranteedPayment,
  formatProgramPlace,
  isProgramPresentable,
  listCoverageOptions,
  listExtraPaymentFields,
  listPrograms,
  normalizeProgram,
  programBreakdown,
  programHeadlinePay,
  programsToRecord,
} from '../../utils/donorPrograms';
import { DEFAULT_PROGRAM_CURRENCY, formatProgramMoney } from '../../utils/programCurrency';
import { uiText } from '../../utils/uiTranslations';
import { AutoGrowTextarea } from '../AutoGrowTextarea';
import { MoneyInput } from './MoneyInput';
import { ProgramCurrencySwitch, ProgramPreview, describeProgramOffer, revealCss } from './ProgramsView';

/*
 * Програми агенції чи клініки в «Моєму профілі».
 *
 * Форма — чотири розділи, кожен згортається сам по собі й згорнутим каже,
 * що в ньому вже є («3 виплати · 2 доплати за умовою»): основне, виплати,
 * вимоги до кандидатки, що ще дає програма (покриття, своє, переїзд).
 * Розділу «Як виглядає в картці» (вибір ознак) і етапів з місцями більше
 * немає — прибрано на прохання власниці продукту: ознаки картка бере типові
 * (`defaultProgramHighlightKeys`), а етапи пишуть в описі програми.
 * Досі все стояло одним полотном на чотири екрани телефона: вимоги з
 * «⋯» біля кожної, по кілька порожніх «Інша виплата» поспіль, підпис
 * ліворуч і поле на 64 px праворуч, де не вміщалась ні назва виплати, ні
 * приклад. Тепер:
 *
 * - підпис **над** полем, поле на всю ширину; сума з валютою й вік «від —
 *   до» лишаються парою в одному рядку;
 * - головна сума й доплати — окремі блоки: назва, сума і «+ Деталі: коли й
 *   за яких умов» — той самий підпис у кожного блока; «Прибрати доплату»
 *   прибирає саме цей блок;
 * - необовʼязкове додається на прохання, і порожньої «Інша доплата» ніколи
 *   не стоїть двох: кнопка зʼявляється знову, щойно попередній рядок
 *   заповнено;
 * - вимога — саме значення: рівнів («бажано», «індивідуально») і пояснень
 *   до кожної немає, сказати своє агенція може власною вимогою;
 * - текстові поля ростуть під текст (`AutoGrowTextarea`): `<input>` показував
 *   довгий текст шматком, і правити його на телефоні не виходило;
 * - відкрита виплата закривається кнопкою «OK»: вона записує набране (як
 *   blur) і згортає виплату — пальцем у порожнє місце не завжди влучиш, і
 *   ненароком відкривалась сусідня виплата.
 *
 * Основна виплата одна, без вибору «що означає головна сума» (за цикл,
 * фінальна, загальна, мінімум + «до …») і без пояснень під кожним
 * заголовком — прибрано на прохання власниці продукту. Кожна виплата понад
 * основну має одну позначку — «Гарантована» (`isGuaranteedPayment`):
 * гарантовані йдуть у суму програми, решта стоять у картці перемикачами.
 * Сума програми — основна плюс гарантовані, формулою під виплатами.
 *
 * Поруч із формою — та сама картка, яку побачить донорка: на широкому
 * екрані колонкою праворуч, на телефоні — вкладкою «Перегляд». Позиція
 * прокрутки на кожній вкладці своя й переживає перемикання.
 *
 * Зберігається все саме, без кнопки: зміна лягає в базу за мить після
 * останнього дотику (`SAVE_DELAY_MS`) і ще раз — коли редактор закривають;
 * стан запису стоїть у рядку вкладок відкритої програми.
 *
 * Назви інших доплат підказує словник (`suggestions`): те, що вже написали
 * інші агенції (`multiData/programTerms`).
 */

const SAVE_DELAY_MS = 700;


const ACCENT = 'var(--km-accent, #E8791A)';
const BORDER = 'var(--km-border, #E8E8E2)';
const MUTED = 'var(--km-muted, #62665F)';
const TEXT = 'var(--km-text, #1A1A1A)';
const CARD = 'var(--km-card, #fff)';
const FIELD_BG = 'var(--km-bg, #FAFAF8)';
const DANGER = '#C8483E';
const FOCUS_RING = `0 0 0 3px var(--km-accent-ring, color-mix(in srgb, ${ACCENT} 22%, transparent))`;
// Висоту липкої панелі прогресу «Мого профілю» сторінка кладе в цю змінну:
// липкий перегляд і прокрутка до розділу стають під неї, а не за неї.
const STICKY_OFFSET = 'var(--km-sticky-offset, 0px)';

// Спільний вигляд полів: та сама висота, рамка, фокус і вимкнений стан на
// текстовому полі, списку й числі.
const controlCss = `
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  min-height: 42px;
  padding: 0 12px;
  border: 1px solid ${BORDER};
  border-radius: 10px;
  background: ${FIELD_BG};
  color: ${TEXT};
  font: inherit;
  font-size: 15px;

  &::placeholder { color: color-mix(in srgb, ${MUTED} 75%, transparent); }
  &:focus { outline: none; border-color: ${ACCENT}; box-shadow: ${FOCUS_RING}; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

// Сума й список на широкому екрані не тягнуться на всю колонку: число
// праворуч у полі завширшки 800 px губилось від свого підпису.
const narrowCss = `
  .narrow { max-width: 320px; }
`;

const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 0;
`;

const SaveState = styled.span`
  flex: 0 0 auto;
  font-size: 12px;
  font-weight: 600;
  color: ${({ $state }) => ($state === 'failed' ? DANGER : $state === 'partial' ? '#B7791F' : $state === 'saved' ? 'var(--km-success, #2E9B55)' : MUTED)};
`;

const ProgramBox = styled.div`
  border: 1px ${({ $hidden }) => ($hidden ? 'dashed' : 'solid')} ${BORDER};
  border-radius: var(--km-radius, 14px);
  background: ${CARD};
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
  &:focus-visible { outline: 2px solid ${ACCENT}; outline-offset: 2px; border-radius: 6px; }
`;

const STATUS_TONES = Object.freeze({
  ready: { color: 'var(--km-success, #247a43)', bg: 'color-mix(in srgb, var(--km-success, #2E9B55) 14%, transparent)' },
  warn: { color: '#B7791F', bg: 'color-mix(in srgb, #B7791F 15%, transparent)' },
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
  transition: transform 0.15s ease;
  transform: rotate(${({ $open }) => ($open ? '180deg' : '0deg')});
`;

const SmallButton = styled.button`
  flex: 0 0 auto;
  min-height: 34px;
  padding: 0 11px;
  border-radius: 10px;
  border: 1px solid ${({ $danger }) => ($danger ? `color-mix(in srgb, ${DANGER} 45%, transparent)` : BORDER)};
  background: ${CARD};
  color: ${({ $danger }) => ($danger ? DANGER : TEXT)};
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;

  &:focus-visible { outline: none; box-shadow: ${FOCUS_RING}; }
  &:disabled { opacity: 0.45; cursor: not-allowed; }
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
  summary:focus-visible { outline: none; box-shadow: ${FOCUS_RING}; }
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
    box-shadow: 0 10px 28px rgba(0, 0, 0, .22);
  }
  > div > button { text-align: left; }
`;

// Форма й перегляд — дві колонки на широкому екрані; на телефоні одна з
// двох, вкладками (`ModeTabs`).
const Body = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 14px;
  padding: 12px;
  ${revealCss}

  @media (min-width: 1000px) {
    grid-template-columns: minmax(0, 1.15fr) minmax(300px, 0.85fr);
    align-items: start;
    padding: 14px;
  }
`;

const Toolbar = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 6px 10px;
  min-height: 24px;

  /* Довгий стан запису переходить під вкладки, а не стискає їх. */
  > [role='status'] { flex: 1 1 200px; text-align: right; line-height: 1.35; }

  @media (min-width: 1000px) {
    grid-column: 1 / -1;
    /* Вкладки на широкому екрані не потрібні: форма й перегляд стоять поруч. */
    display: ${({ $empty }) => ($empty ? 'none' : 'flex')};
  }
`;

const FormColumn = styled.div`
  display: ${({ $hiddenOnMobile }) => ($hiddenOnMobile ? 'none' : 'flex')};
  flex-direction: column;
  gap: 10px;
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
    top: calc(${STICKY_OFFSET} + 12px);
  }
`;

const ModeTabs = styled.div`
  display: flex;
  flex: 1 1 240px;
  max-width: 360px;
  padding: 3px;
  border-radius: 12px;
  background: color-mix(in srgb, ${MUTED} 12%, transparent);

  button {
    flex: 1 1 0;
    min-height: 34px;
    border: 0;
    border-radius: 9px;
    background: transparent;
    color: ${MUTED};
    font: inherit;
    font-size: 13.5px;
    font-weight: 600;
    cursor: pointer;
  }
  button[aria-selected='true'] { background: ${CARD}; color: ${TEXT}; box-shadow: 0 1px 4px rgba(0, 0, 0, .12); }
  button:focus-visible { outline: none; box-shadow: ${FOCUS_RING}; }

  @media (min-width: 1000px) { display: none; }
`;

// --- розділи -----------------------------------------------------------------

const SectionBox = styled.section`
  border: 1px solid ${BORDER};
  border-radius: 12px;
  background: ${CARD};
  scroll-margin-top: calc(${STICKY_OFFSET} + 12px);
`;

const SectionHeader = styled.button`
  display: grid;
  grid-template-columns: 26px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 52px;
  padding: 8px 12px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: ${TEXT};
  font: inherit;
  text-align: left;
  cursor: pointer;

  > i {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: color-mix(in srgb, ${ACCENT} 14%, transparent);
    color: ${ACCENT};
    font-size: 12.5px;
    font-style: normal;
    font-weight: 800;
  }
  > span { min-width: 0; }
  h4 { margin: 0; font-size: 15px; font-weight: 700; line-height: 1.3; }
  small { display: block; margin-top: 2px; font-size: 12.5px; line-height: 1.35; color: ${MUTED}; overflow-wrap: anywhere; }
  &:focus-visible { outline: none; box-shadow: ${FOCUS_RING}; }
`;

const SectionContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 4px 12px 14px;
  ${narrowCss}
  ${revealCss}
`;

const SubHead = styled.div`
  padding-top: 12px;
  border-top: 1px solid ${BORDER};

  h5 { margin: 0; font-size: 14px; font-weight: 700; color: ${TEXT}; }
  p { margin: 2px 0 0; font-size: 12.5px; line-height: 1.4; color: ${MUTED}; }
`;

// --- поля ----------------------------------------------------------------------

// Підпис над полем, поле на всю ширину: на телефоні поряд із підписом не
// вміщались ні назва виплати, ні приклад у полі.
const FieldBox = styled.div`
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;

  > label, > .label { font-size: 13px; font-weight: 600; color: ${TEXT}; line-height: 1.3; }
  > label small, > .label small { font-weight: 500; color: ${MUTED}; }
  > p { margin: 0; font-size: 12px; line-height: 1.4; color: ${MUTED}; }
`;

const Field = ({ id, label, hint, optional, language, grow = true, narrow = false, children, error }) => (
  <FieldBox className={`${grow ? 'grow' : 'fixed'}${narrow ? ' narrow' : ''}`}>
    {label ? (
      <label htmlFor={id}>
        {uiText(label, language)}
        {optional ? <small> · {uiText('необовʼязково', language)}</small> : null}
      </label>
    ) : null}
    {children}
    {error ? <FieldError role="alert">{error}</FieldError> : null}
    {hint ? <p>{hint}</p> : null}
  </FieldBox>
);

// Пара полів в одному рядку (сума й місяці, назва й сума); на вузькому
// екрані друге переходить під перше. Ширина росте лише по горизонталі:
// у колонці той самий flex-basis ставав висотою й розсував форму.
const FieldRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 10px;

  > .grow { flex: 1 1 160px; }
  > .fixed { flex: 0 0 auto; }
`;


const FieldError = styled.span`
  font-size: 12px;
  font-weight: 600;
  color: ${DANGER};
`;

// Текстове поле росте під текст (`AutoGrowTextarea`): у `<input>` довге
// «коли платять» чи примітку було видно шматком, і правити її на телефоні
// виходило навпомацки. Висота — від одного рядка, як у решти полів.
const TextInput = styled(AutoGrowTextarea)`
  ${controlCss}
  display: block;
  padding: 10px 12px;
  line-height: 1.4;
  resize: none;
  overflow: hidden;
  ${({ $invalid }) => ($invalid ? `border-color: ${DANGER};` : '')}
`;

// Назва доплати лишається `<input>`: лише він уміє `list` — підказки назв,
// які вже вживають інші агенції (`multiData/programTerms`).
const LabelInput = styled.input`
  ${controlCss}
`;

const TextArea = styled.textarea`
  ${controlCss}
  min-height: 72px;
  padding: 10px 12px;
  font-size: 14.5px;
  line-height: 1.45;
  resize: vertical;
`;

const Select = styled.select`
  ${controlCss}
  padding: 0 10px;
  cursor: pointer;
`;

const Num = styled.input`
  ${controlCss}
  flex: 0 0 auto;
  width: ${({ $w }) => $w || 76}px;
  padding: 0 8px;
  text-align: center;
  font-variant-numeric: tabular-nums;
  ${({ $invalid }) => ($invalid ? `border-color: ${DANGER};` : '')}
`;

const Range = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;

  > span { color: ${MUTED}; font-size: 14px; }
`;

const Segments = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

// Вибір — та сама пігулка скрізь: тип програми, покриття, ознаки картки.
const Pill = styled.button`
  min-height: 36px;
  padding: 0 13px;
  border-radius: 999px;
  border: 1px solid ${({ $on }) => ($on ? ACCENT : BORDER)};
  background: ${({ $on }) => ($on ? `color-mix(in srgb, ${ACCENT} 14%, transparent)` : 'transparent')};
  color: ${({ $on }) => ($on ? ACCENT : TEXT)};
  font: inherit;
  font-size: 13.5px;
  font-weight: ${({ $on }) => ($on ? 700 : 500)};
  cursor: pointer;

  &:focus-visible { outline: none; box-shadow: ${FOCUS_RING}; }
  &:disabled { opacity: 0.4; cursor: not-allowed; }
`;

// Що ще можна додати — пунктирні кнопки: це пропозиція, а не вибране.
const AddChip = styled.button`
  min-height: 36px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px dashed color-mix(in srgb, ${ACCENT} 55%, ${BORDER});
  background: transparent;
  color: ${ACCENT};
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;

  &:focus-visible { outline: none; box-shadow: ${FOCUS_RING}; }
`;

const LinkButton = styled.button`
  align-self: flex-start;
  max-width: 100%;
  text-align: left;
  min-height: 32px;
  padding: 0;
  border: 0;
  background: transparent;
  color: ${ACCENT};
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;

  &:hover { text-decoration: underline; text-underline-offset: 3px; }
  &:focus-visible { outline: none; box-shadow: ${FOCUS_RING}; border-radius: 4px; }
`;

// Видалення називає, що саме прибирає: «✕» поруч із сумою читався і як
// «очистити суму», і як «прибрати всю програму».
const RemoveButton = styled.button`
  flex: 0 0 auto;
  min-height: 32px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: ${MUTED};
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;

  &:hover { color: ${DANGER}; border-color: color-mix(in srgb, ${DANGER} 35%, transparent); }
  &:focus-visible { outline: none; box-shadow: ${FOCUS_RING}; }
`;

const CheckRow = styled.label`
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 36px;
  font-size: 14px;
  color: ${TEXT};
  cursor: pointer;

  input { width: 18px; height: 18px; margin: 0; accent-color: ${ACCENT}; }
  small { color: ${MUTED}; font-size: 12.5px; }
`;

// --- виплати ---------------------------------------------------------------------

// Виплата — один блок: назва, сума, як рахується, а коли й за якої умови —
// всередині нього ж. Межа блока — це й межа «Прибрати виплату».
const Block = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 12px 12px;
  border: 1px solid ${BORDER};
  border-left: 3px solid ${({ $tone }) => ($tone === 'bonus' ? '#B7791F' : $tone === 'separate' ? MUTED : ACCENT)};
  border-radius: 10px;
  background: ${FIELD_BG};
  ${revealCss}
`;

const BlockHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 32px;

  b { min-width: 0; font-size: 14px; font-weight: 700; color: ${TEXT}; overflow-wrap: anywhere; }
  b small { display: block; font-size: 12px; font-weight: 500; color: ${MUTED}; }
`;

const Readout = styled.div`
  font-size: 12.5px;
  color: ${MUTED};
  font-variant-numeric: tabular-nums;

  b { color: ${TEXT}; font-weight: 700; }
`;

// Згорнута виплата — рядком, яким вона стоїть серед виплат картки: назва,
// коли платять, сума праворуч. Відкрита лише одна: розгорнуті всі разом
// займали кілька екранів, і щойно додана губилась серед них.
//
// Квадратика перемикача перед назвою додаткової виплати тут більше немає:
// у темній темі він був майже невидимий і читався як відступ абзацу — одні
// рядки починались з краю, інші ні. Рід виплати каже колір смуги ліворуч
// (додаткова — сіра) і позначка у відкритій виплаті. Стрілки праворуч від
// суми теж немає: рядок і так кнопка, а стрілка відволікала від суми.
const PaymentSummary = styled.button`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 48px;
  padding: 8px 12px;
  border: 1px solid ${BORDER};
  border-left: 3px solid ${({ $tone }) => ($tone === 'additional' ? MUTED : $tone === 'bonus' ? '#B7791F' : ACCENT)};
  border-radius: 10px;
  background: ${FIELD_BG};
  color: ${TEXT};
  font: inherit;
  text-align: left;
  cursor: pointer;

  > span { min-width: 0; font-size: 14px; font-weight: 600; overflow-wrap: anywhere; }
  > span small { display: block; margin-top: 1px; font-size: 12px; font-weight: 500; color: ${MUTED}; }
  > b { font-size: 14px; font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
  > b.empty { font-weight: 500; color: ${MUTED}; }
  &:focus-visible { outline: none; box-shadow: ${FOCUS_RING}; }
`;

const BlockTitle = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  min-height: 32px;
  padding: 0;
  border: 0;
  background: transparent;
  color: ${TEXT};
  font: inherit;
  text-align: left;
  cursor: pointer;

  b { min-width: 0; font-size: 14px; font-weight: 700; overflow-wrap: anywhere; }
  &:focus-visible { outline: none; box-shadow: ${FOCUS_RING}; border-radius: 6px; }
`;

// «OK» — кінець правки виплати: записує набране й згортає її. Стоїть
// праворуч унизу блока, під великим пальцем, на всю мішень 40 px.
const BlockFooter = styled.div`
  display: flex;
  justify-content: flex-end;
`;

const OkButton = styled.button`
  min-width: 96px;
  min-height: 40px;
  padding: 0 18px;
  border: 0;
  border-radius: 10px;
  background: ${ACCENT};
  color: #fff;
  font: inherit;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;

  &:focus-visible { outline: none; box-shadow: ${FOCUS_RING}; }
`;

// Підсумок рахується з тих самих виплат і тим самим кодом, що й у картці
// програми (`programBreakdown`), і показується формулою: агенція бачить, що
// саме додалось, що вже всередині, а що лишилось окремо.
const TotalBox = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
  border-radius: 12px;
  background: color-mix(in srgb, ${ACCENT} 9%, transparent);
  color: ${TEXT};

  > div { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
  > div span { font-size: 13px; font-weight: 600; }
  > div b { font-size: 20px; font-weight: 800; font-variant-numeric: tabular-nums; white-space: nowrap; }
  > p { margin: 0; font-size: 12.5px; line-height: 1.45; color: ${MUTED}; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
  > p.error { color: ${DANGER}; font-weight: 600; }
`;

// --- вимоги ----------------------------------------------------------------------

const ReqRow = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-bottom: 12px;
  border-bottom: 1px solid ${BORDER};

  &:last-of-type { border-bottom: 0; padding-bottom: 0; }
`;

const ReqHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;

  > div { display: flex; align-items: center; gap: 4px; }
  button { white-space: nowrap; }

  label, .label { font-size: 13px; font-weight: 600; color: ${TEXT}; }
`;

const ReqControls = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;

  > .value { flex: 1 1 128px; min-width: 0; display: flex; align-items: center; gap: 6px; }
  > .value > span { color: ${MUTED}; font-size: 13px; }
`;

const PreviewLabel = styled.div`
  font-size: 12px;
  font-weight: 600;
  color: ${MUTED};
`;

const PreviewHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
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

  &:focus-visible { outline: none; box-shadow: ${FOCUS_RING}; }
`;

const EmptyState = styled.div`
  padding: 18px 16px;
  border: 1px dashed ${BORDER};
  border-radius: var(--km-radius, 14px);
  text-align: center;
  color: ${MUTED};
  font-size: 13.5px;
  line-height: 1.5;

  b { display: block; margin-bottom: 4px; color: ${TEXT}; font-size: 15px; }
`;

const Issues = styled.ul`
  margin: 0;
  padding: 8px 12px 8px 28px;
  border-radius: 10px;
  background: color-mix(in srgb, #B7791F 12%, transparent);
  color: ${TEXT};
  font-size: 12.5px;
  line-height: 1.45;
`;

// --- логіка ----------------------------------------------------------------------

const formatSumParts = sum => sum.parts
  .filter(part => part.amount > 0)
  .map(part => formatProgramMoney(part.amount, part.currency))
  .join(' + ');

const sumText = sum => `${sum.approximate ? '≈ ' : ''}${formatSumParts(sum)}`;

/** Сума для шапки згорнутої програми: та сама, що побачить донорка першою. */
const headPay = program => {
  const normalized = normalizeProgram(program, program.id);
  if (!normalized) return '';
  const offer = describeProgramOffer(normalized);
  if (offer.money?.amount > 0) return sumText(offer.money);
  const pay = programHeadlinePay(program);
  return Number(pay?.amount) > 0 ? formatProgramMoney(Number(pay.amount), pay.currency) : '';
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

const hasMoney = money => Number(money?.amount) > 0;
const blankRow = item => !String(item?.label || '').trim() && !hasMoney(item);

/**
 * Що в програмі не так, як здається агенції: рядок без суми чи без назви
 * мовчки не записується (`normalizeProgram`), вимога поза межами зникає.
 * Порожній щойно доданий рядок —
 * не помилка: його просто ще не заповнили.
 */
export const listProgramIssues = program => {
  const issues = [];
  const errors = validateProgramRequirements(program.requirements);
  if (Object.keys(errors).length) issues.push('Вимога поза допустимими межами не збережеться');
  const rows = [...(program.otherPayments || []), ...(program.bonuses || [])].filter(item => !blankRow(item));
  if (rows.some(item => !hasMoney(item))) issues.push('Доплата без суми не збережеться');
  if (rows.some(item => !String(item.label || '').trim())) issues.push('Доплата без назви не збережеться');
  return issues;
};

/**
 * Стан програми одним словом — і чому. «Готова до показу» означає саме
 * це: у програмі є що показати, головна сума, нічого не загубиться при
 * записі — і анкету агенції опубліковано. Без публікації програму не
 * побачить ніхто, хоч би якою повною вона була.
 */
export const programStatus = (program, { profilePublished } = {}) => {
  const normalized = normalizeProgram(program, program.id);
  if (program.hidden) return { tone: 'hidden', label: 'Прихована' };
  if (!normalized || !isProgramPresentable(normalized)) return { tone: 'warn', label: 'Чернетка — у стрічці не видно' };
  if (!(programBreakdown(normalized).guaranteed.amount > 0)) return { tone: 'warn', label: 'Додайте виплату' };
  if (listProgramIssues(program).length) return { tone: 'warn', label: 'Є що виправити' };
  if (profilePublished === false) return { tone: 'warn', label: 'Готова — анкету ще не опубліковано' };
  return { tone: 'ready', label: 'Готова до показу' };
};

// Щомісячну агенції СМ платять майже всі, тож нова програма СМ відкривається
// з нею. Це пропозиція, а не обовʼязок: стояла вона тут полем завжди, і
// програму без щомісячних скласти було неможливо — тепер її прибирають, як
// будь-яку іншу доплату. Основна виплата одна й стоїть завжди.
const SUGGESTED_PAYMENTS = Object.freeze({ ed: [], sm: ['monthly'] });

const isFreshProgram = program => !Object.values(program.payments || {}).some(hasMoney)
  && ![...(program.otherPayments || []), ...(program.bonuses || [])].length;

const uniqueLabels = labels => {
  const seen = new Set();
  return labels.filter(label => {
    const key = String(label || '').trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

// Приклади — мовою саме цієї програми: «у день пункції» сурогатній мамі не
// скаже нічого, як і «на 12 тижні» донорці.
const TYPE_EXAMPLES = Object.freeze({
  ed: {
    when: 'Наприклад: у день пункції',
    bonusName: 'Наприклад: за кількість клітин',
    place: 'Наприклад: Грузія, Тбілісі',
  },
  sm: {
    when: 'Наприклад: на 12 тижні',
    bonusName: 'Наприклад: підтвердження вагітності',
    place: 'Наприклад: Україна, Київ',
  },
});

const SECTIONS = Object.freeze([
  { key: 'basic', title: 'Основне' },
  { key: 'payments', title: 'Виплати' },
  { key: 'requirements', title: 'Вимоги до кандидатки' },
  { key: 'coverage', title: 'Що ще дає програма' },
]);

const REQUIREMENT_DEFS = Object.freeze([
  { key: 'bmi', kind: 'number', field: 'bmiMax', label: 'ІМТ, не більше' },
  { key: 'height', kind: 'number', field: 'heightFrom', label: 'Зріст, від', unit: 'см' },
  { key: 'rh', kind: 'select', field: 'rh', label: 'Резус', options: PROGRAM_RH_OPTIONS },
  { key: 'ownKids', kind: 'select', field: 'ownKids', label: 'Власна дитина', options: PROGRAM_KIDS_OPTIONS },
  { key: 'births', kind: 'number', field: 'maxBirths', label: 'Пологів, не більше' },
  { key: 'csection', kind: 'select', field: 'csectionMax', label: 'Кесарів розтин', options: PROGRAM_CSECTION_OPTIONS },
  { key: 'marital', kind: 'select', field: 'marital', label: 'Сімейний стан', options: PROGRAM_MARITAL_OPTIONS },
]);

const requirementFilled = (program, def) => {
  const value = program.requirements?.[def.field];
  if (def.kind === 'select') return Boolean(value) && value !== 'any';
  return value !== undefined && value !== null && String(value).trim() !== '';
};

const pluralUk = (count, one, few, many) => {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
};

const countText = (count, forms, language) => {
  if (language === 'en') return `${count} ${count === 1 ? forms.en[0] : forms.en[1]}`;
  return `${count} ${pluralUk(count, ...forms.uk)}`;
};

const WORDS = Object.freeze({
  payment: { uk: ['виплата', 'виплати', 'виплат'], en: ['payment', 'payments'] },
  bonus: { uk: ['доплата', 'доплати', 'доплат'], en: ['supplement', 'supplements'] },
  requirement: { uk: ['вимога', 'вимоги', 'вимог'], en: ['requirement', 'requirements'] },
  expense: { uk: ['витрата', 'витрати', 'витрат'], en: ['expense', 'expenses'] },
});


const CollapsibleSection = ({ index, sectionKey, title, summary, open, onToggle, language, children, idPrefix }) => {
  const contentId = `${idPrefix}-section-${sectionKey}`;
  return (
    <SectionBox data-section={sectionKey}>
      <SectionHeader type="button" aria-expanded={open} aria-controls={contentId} onClick={onToggle}>
        <i aria-hidden="true">{index}</i>
        <span>
          <h4>{uiText(title, language)}</h4>
          {!open && summary ? <small>{summary}</small> : null}
        </span>
        <Chevron $open={open} aria-hidden="true">▼</Chevron>
      </SectionHeader>
      {/* Згорнутий розділ лише ховається: набране в ньому живе в програмі, а
          не в полях, тож згортання нічого не губить. */}
      {open ? <SectionContent id={contentId}>{children}</SectionContent> : null}
    </SectionBox>
  );
};

/*
 * Подробиці виплати — коли й за якої умови її платять. У більшості виплат
 * немає жодної, тож вони відкриваються «+ Деталі», а заповнені стоять
 * відкритими самі. Підпис кнопки один на головну суму й на кожну доплату:
 * «коли, умови, у тому числі» поруч із «коли й за яких умов» читались як
 * дві різні речі.
 */
/**
 * Рід виплати понад основну: гарантована йде в суму програми, додаткова
 * стоїть у картці перемикачем, який кандидатка відмічає сама.
 */
const GuaranteedToggle = ({ id, checked, onChange, language }) => (
  <CheckRow htmlFor={id}>
    <input id={id} type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} />
    <span>{uiText('Сумується автоматично до загальної винагороди', language)}</span>
  </CheckRow>
);

/*
 * «Умови виплати» поруч із «Коли платять» агенції читали як синонім і
 * писали те саме двічі — поля більше немає. Старе значення `condition`
 * лишається видно й правиться, доки його не стерли: інакше в картці стояв
 * би текст, якого в редакторі не знайти.
 */
const PaymentDetails = ({ value, onChange, language, idPrefix, examples }) => {
  const filled = Boolean(value?.when);
  const [open, setOpen] = useState(filled);
  const legacyCondition = value?.condition !== undefined && value?.condition !== '';
  return (
    <>
      {!open && !filled ? (
        <LinkButton type="button" onClick={() => setOpen(true)}>
          + {uiText('Коли платять', language)}
        </LinkButton>
      ) : (
        <Field id={`${idPrefix}-when`} label="Коли платять" optional language={language}>
          <TextInput id={`${idPrefix}-when`} value={value?.when || ''} maxLength={60} placeholder={uiText(examples.when, language)} onChange={event => onChange({ when: event.target.value })} />
        </Field>
      )}
      {legacyCondition ? (
        <Field id={`${idPrefix}-condition`} label="Умови виплати" optional language={language}>
          <TextInput id={`${idPrefix}-condition`} value={value?.condition || ''} maxLength={120} onChange={event => onChange({ condition: event.target.value })} />
        </Field>
      ) : null}
    </>
  );
};

const ProgramForm = ({ program, onChange, language, rates, suggestions, saveState }) => {
  const [revealed, setRevealed] = useState(() => new Set(isFreshProgram(program) ? SUGGESTED_PAYMENTS[program.type === 'sm' ? 'sm' : 'ed'] : []));
  const entrySeq = useRef(0);
  const nextEntryId = () => { entrySeq.current += 1; return `custom-${entrySeq.current}`; };
  // Порядок виплат на екрані — порядок, у якому їх додавали. Відомі доплати
  // мають своє місце в переліку типу, і щойно додана ставала туди — часто
  // вище за видиме, тож кнопка зникала, а нового блока ніде не було.
  // Дописані впізнаються за позицією серед дописаних: нові завжди лягають
  // у кінець масиву, тож n-й запис цього списку — n-та дописана доплата.
  const [paymentOrder, setPaymentOrder] = useState(() => {
    const fresh = isFreshProgram(program) ? SUGGESTED_PAYMENTS[program.type === 'sm' ? 'sm' : 'ed'] : [];
    return [
      ...listExtraPaymentFields(program.type)
        .filter(field => program.payments?.[field.key] !== undefined || fresh.includes(field.key))
        .map(field => ({ id: `known-${field.key}`, key: field.key })),
      ...[...(program.otherPayments || []), ...(program.bonuses || [])].map(() => ({ id: nextEntryId(), custom: true })),
    ];
  });
  const [openPayment, setOpenPayment] = useState(() => (hasMoney(program.payments?.final) ? '' : 'final'));
  const focusPaymentRef = useRef('');
  const [mode, setMode] = useState('edit');
  const [openSections, setOpenSections] = useState(() => new Set(['basic', 'payments']));
  const [previewCurrency, setPreviewCurrency] = useState('');
  const scrollByMode = useRef({});
  const tabsRef = useRef(null);
  const set = patch => onChange({ ...program, ...patch });
  const setReq = patch => onChange({ ...program, requirements: { ...program.requirements, ...patch } });
  const idPrefix = `program-${program.id}`;
  const normalized = normalizeProgram(program, program.id);
  const currency = program.payments?.final?.currency || DEFAULT_PROGRAM_CURRENCY;
  const isSurrogacy = program.type === 'sm';
  const typeKey = isSurrogacy ? 'sm' : 'ed';
  const examples = TYPE_EXAMPLES[typeKey];
  const breakdown = normalized ? programBreakdown(normalized, { rates }) : null;

  // Кожна вкладка тримає свою прокрутку: перегляд відкривається там, де його
  // лишили, а повернення до форми — до того самого поля.
  const switchMode = next => {
    if (next === mode) return;
    scrollByMode.current[mode] = window.scrollY;
    setMode(next);
  };
  useLayoutEffect(() => {
    const saved = scrollByMode.current[mode];
    if (typeof saved === 'number') window.scrollTo(0, saved);
  }, [mode]);

  const toggleSection = key => setOpenSections(current => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });

  // `MoneyInput` віддає саму суму й валюту; кількість місяців і подробиці
  // виплати (коли, умова) лежать поруч у тому
  // самому обʼєкті й мусять пережити правку суми.
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
  const hide = key => setRevealed(current => { const next = new Set(current); next.delete(key); return next; });
  const removeLegacyTotal = () => {
    const { [PROGRAM_TOTAL_FIELD]: _removed, ...payments } = program.payments || {};
    onChange({ ...program, payments });
  };

  const hasComponents = Boolean(breakdown?.main && breakdown.main.key !== PROGRAM_TOTAL_FIELD);
  const legacyTotal = hasComponents ? normalized?.payments?.[PROGRAM_TOTAL_FIELD] : null;
  const bonusSuggestions = uniqueLabels([
    ...(suggestions?.bonus || []),
    ...(suggestions?.payment || []),
    ...listExtraPaymentFields(isSurrogacy ? 'ed' : 'sm').map(field => field.label),
  ]);
  const errors = validateProgramRequirements(program.requirements);
  const issues = listProgramIssues(program);
  const isShown = key => program.payments?.[key] !== undefined || revealed.has(key);
  const extraFields = listExtraPaymentFields(program.type);
  // Дописані доплати — один список. Старі записи тримали їх у двох масивах
  // (`otherPayments` — виплати, `bonuses` — доплати за умовою); перша ж
  // правка зводить обидва в `otherPayments`: лише там правила бази
  // приймають і «коли», і «умову».
  const customBonuses = [...(program.otherPayments || []), ...(program.bonuses || [])];
  const setCustomBonuses = next => set({ otherPayments: next, bonuses: [] });
  const customCoverage = program.customCoverage || [];
  const setCustomCoverage = next => set({ customCoverage: next });
  const relocation = program.relocation || {};
  const coverageDetails = program.coverageDetails || {};
  const coverageOptions = listCoverageOptions(program.type);
  const coverageKeys = (program.coverage || []).filter(key => coverageOptions.some(option => option.key === key));
  const setRelocation = patch => set({ relocation: { ...relocation, ...patch } });
  const setCoverageDetail = (key, patch) => set({ coverageDetails: { ...coverageDetails, [key]: { ...(coverageDetails[key] || {}), ...patch } } });
  const showRelocation = revealed.has('relocation') || Boolean(relocation.when || relocation.family || relocation.note);
  const money = (amount, cur) => formatProgramMoney(amount, cur);

  // --- згорнуті розділи кажуть, що в них уже є ---
  const summaries = {
    basic: [
      uiText(PROGRAM_OFFER_LABELS[program.type], language),
      program.location ? formatProgramPlace(program.location) : '',
      program.startNow ? uiText('старт одразу', language) : '',
      program.note ? uiText('є коментар', language) : '',
    ].filter(Boolean).join(' · '),
    payments: [
      breakdown?.main ? '' : uiText('Суму ще не вказано', language),
      breakdown?.bonuses.length ? countText(breakdown.bonuses.length, WORDS.payment, language) : '',
      breakdown?.guaranteed.amount > 0 ? uiText('сума програми {amount}', language, { amount: sumText(breakdown.guaranteed) }) : '',
    ].filter(Boolean).join(' · '),
    requirements: (() => {
      const count = (normalized?.requirements?.ageFrom !== undefined || normalized?.requirements?.ageTo !== undefined ? 1 : 0)
        + REQUIREMENT_DEFS.filter(def => requirementFilled(program, def)).length
        + (normalized?.customRequirements?.length || 0);
      return count ? countText(count, WORDS.requirement, language) : uiText('Без вимог', language);
    })(),
    coverage: [
      coverageKeys.length ? `${uiText('покриває', language)} ${countText(coverageKeys.length, WORDS.expense, language)}` : '',
      customCoverage.filter(item => String(item || '').trim()).length ? uiText('є своє', language) : '',
      showRelocation ? uiText('переїзд', language) : '',
    ].filter(Boolean).join(' · ') || uiText('Нічого не вказано', language),
  };

  // --- виплати: одна відкрита, решта рядками картки ---
  const togglePayment = id => setOpenPayment(current => (current === id ? '' : id));
  const openNewPayment = id => {
    setOpenPayment(id);
    focusPaymentRef.current = id;
  };
  // Щойно додана виплата стає під палець: прокрутка до неї й фокус на
  // першому полі. Без цього її доводилось шукати, і здавалось, що дотик не
  // спрацював.
  useEffect(() => {
    const id = focusPaymentRef.current;
    if (!id) return;
    focusPaymentRef.current = '';
    const node = document.querySelector(`[data-payment-row="${id}"]`);
    if (!node) return;
    if (typeof node.scrollIntoView === 'function') node.scrollIntoView({ block: 'center', behavior: 'smooth' });
    node.querySelector('input')?.focus({ preventScroll: true });
  });
  // Дотик до пропозиції не забирає фокус у поля суми: `MoneyInput` записує
  // суму на blur, перерахунок зсував розкладку між натисканням і відпусканням
  // пальця, і перший дотик влучав повз кнопку — додати доплату виходило
  // лише з другого разу.
  const keepFocus = event => event.preventDefault();
  const addKnownPayment = key => {
    const id = `known-${key}`;
    reveal(key);
    setPaymentOrder(current => [...current.filter(entry => entry.id !== id), { id, key }]);
    openNewPayment(id);
  };
  const addCustomPayment = () => {
    const id = nextEntryId();
    setPaymentOrder(current => [...current, { id, custom: true }]);
    setCustomBonuses([...customBonuses, { label: '', amount: '', currency }]);
    openNewPayment(id);
  };
  const paymentRows = (() => {
    const rows = [];
    const placed = new Set();
    let customIndex = 0;
    paymentOrder.forEach(entry => {
      if (entry.custom) {
        if (customIndex < customBonuses.length) rows.push({ id: entry.id, customIndex: customIndex++ });
        return;
      }
      if (placed.has(entry.key) || !isShown(entry.key) || !extraFields.some(field => field.key === entry.key)) return;
      placed.add(entry.key);
      rows.push({ id: entry.id, key: entry.key });
    });
    // Те, чого перелік не знав (зміна типу, запис ззовні), — у кінці.
    extraFields.forEach(field => {
      if (isShown(field.key) && !placed.has(field.key)) rows.push({ id: `known-${field.key}`, key: field.key });
    });
    for (; customIndex < customBonuses.length; customIndex += 1) rows.push({ id: `custom-extra-${customIndex}`, customIndex });
    return rows;
  })();

  const whenLine = value => [value?.when, value?.condition].filter(Boolean).join(' · ');
  const collapsedPayment = ({ id, testId, tone, label, amount, details, additional }) => (
    <PaymentSummary
      key={id}
      type="button"
      data-payment-row={id}
      data-testid={testId}
      $tone={additional ? 'additional' : tone}
      aria-expanded="false"
      aria-label={uiText('Змінити виплату: {label}', language, { label })}
      title={additional ? uiText('Додаткова — кандидатка відмічає сама', language) : undefined}
      onClick={() => togglePayment(id)}
    >
      <span>
        {label}
        {details.filter(Boolean).map(line => <small key={line}>{line}</small>)}
      </span>
      {amount ? <b>{amount}</b> : <b className="empty">{uiText('без суми', language)}</b>}
    </PaymentSummary>
  );
  // «OK» робить те, що робив би blur: поле, у якому стоїть курсор, віддає
  // набране (`MoneyInput` пише суму саме на blur), — і лише тоді виплата
  // згортається. `onMouseDown` не забирає фокус сам, інакше між натисканням і
  // відпусканням перерахунок суми зсував би кнопку з-під пальця.
  const finishPayment = () => {
    const active = document.activeElement;
    if (active && typeof active.blur === 'function' && active !== document.body) active.blur();
    setOpenPayment('');
  };
  const okFooter = label => (
    <BlockFooter>
      <OkButton type="button" onMouseDown={keepFocus} aria-label={uiText('Готово: {label}', language, { label })} onClick={finishPayment}>OK</OkButton>
    </BlockFooter>
  );
  const openHead = (id, label, remove) => (
    <BlockHead>
      <BlockTitle type="button" aria-expanded="true" onClick={() => togglePayment(id)}>
        <b>{label}</b>
      </BlockTitle>
      {remove ? (
        <RemoveButton type="button" aria-label={uiText('Прибрати доплату: {label}', language, { label })} onClick={remove}>
          {uiText('Прибрати доплату', language)}
        </RemoveButton>
      ) : null}
    </BlockHead>
  );
  const plusMoney = (amount, cur, approximate = false) => `+${approximate ? '≈ ' : ''}${money(amount, cur)}`;

  // --- головна сума ---
  const mainBlock = () => {
    const value = program.payments?.final;
    const label = uiText(MAIN_PAYMENT_LABEL, language);
    if (openPayment !== 'final') {
      return collapsedPayment({
        id: 'final',
        testId: 'payment-final',
        tone: 'main',
        label,
        amount: hasMoney(value) ? money(Number(value.amount), value.currency || currency) : '',
        details: [whenLine(value)],
      });
    }
    return (
      <Block key="final" $tone="main" data-testid="payment-final" data-payment-row="final">
        {openHead('final', label)}
        <FieldRow>
          <Field id={`${idPrefix}-final`} label="Сума" narrow language={language}>
            <MoneyInput
              compact
              id={`${idPrefix}-final`}
              ariaLabel={label}
              language={language}
              rates={rates}
              placeholder={uiText('сума', language)}
              value={value}
              onChange={next => setPay('final', next)}
            />
          </Field>
        </FieldRow>
        <PaymentDetails value={value} language={language} idPrefix={`${idPrefix}-final`} examples={examples} onChange={patch => setPayExtras('final', patch)} />
        {okFooter(label)}
      </Block>
    );
  };

  // --- відома доплата (досвід, повторна, щомісячно, КС…) ---
  const knownBonusBlock = ({ id, key }) => {
    const label = uiText(extraFields.find(field => field.key === key)?.label || key, language);
    const value = program.payments?.[key];
    const isMonthly = key === 'monthly';
    const months = Number(value?.months) || 0;
    const remove = () => {
      setPaymentOrder(current => current.filter(entry => entry.id !== id));
      removePay(key);
    };
    if (openPayment !== id) {
      const amount = Number(value?.amount) || 0;
      const cur = value?.currency || currency;
      return collapsedPayment({
        id,
        testId: `payment-${key}`,
        tone: 'bonus',
        label,
        additional: !isGuaranteedPayment(key, value),
        amount: amount > 0 ? plusMoney(isMonthly ? amount * (months || DEFAULT_MONTHLY_MONTHS) : amount, cur, isMonthly && !months) : '',
        details: [
          isMonthly && amount > 0 ? `${money(amount, cur)}/${uiText('міс', language)} × ${months || `≈ ${DEFAULT_MONTHLY_MONTHS}`}` : '',
          whenLine(value),
        ],
      });
    }
    return (
      <Block key={id} $tone="bonus" data-testid={`payment-${key}`} data-payment-row={id}>
        {openHead(id, label, remove)}
        <FieldRow>
          <Field id={`${idPrefix}-${key}`} label={isMonthly ? 'Сума на місяць' : 'Сума'} narrow language={language}>
            <MoneyInput
              compact
              id={`${idPrefix}-${key}`}
              ariaLabel={label}
              language={language}
              rates={rates}
              placeholder={uiText('сума', language)}
              value={value}
              onChange={next => setPay(key, next)}
            />
          </Field>
          {isMonthly ? (
            <Field id={`${idPrefix}-months`} label="Місяців" grow={false} language={language}>
              <Num
                id={`${idPrefix}-months`}
                inputMode="numeric"
                aria-label={uiText('Скільки місяців', language)}
                placeholder="—"
                value={value?.months ?? ''}
                onChange={event => {
                  const digits = event.target.value.replace(/[^0-9]/g, '').slice(0, 2);
                  const n = Number(digits);
                  setPayExtras('monthly', { months: digits && n >= 1 ? String(Math.min(n, MAX_MONTHLY_MONTHS)) : '' });
                }}
              />
            </Field>
          ) : null}
        </FieldRow>
        {isMonthly && hasMoney(value) ? (
          <Readout>
            {months
              ? <>{money(Number(value.amount), value.currency || currency)}/{uiText('міс', language)} × {months} = <b>{money(Number(value.amount) * months, value.currency || currency)}</b></>
              : uiText('Вкажіть кількість місяців — інакше рахуємо 9, і сума буде приблизною', language)}
          </Readout>
        ) : null}
        <GuaranteedToggle
          id={`${idPrefix}-${key}-guaranteed`}
          checked={isGuaranteedPayment(key, value)}
          language={language}
          onChange={checked => setPayExtras(key, { guaranteed: checked })}
        />
        <PaymentDetails
          value={value}
          language={language}
          idPrefix={`${idPrefix}-${key}`}
          examples={examples}
          onChange={patch => setPayExtras(key, patch)}
        />
        {okFooter(label)}
      </Block>
    );
  };

  // --- дописана доплата ---
  const customBonusBlock = ({ id, customIndex: index }) => {
    const item = customBonuses[index];
    const setItem = patch => setCustomBonuses(customBonuses.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)));
    const remove = () => {
      setPaymentOrder(current => current.filter(entry => entry.id !== id));
      setCustomBonuses(customBonuses.filter((_, i) => i !== index));
    };
    const blockId = `${idPrefix}-bonus-${index}`;
    const name = String(item.label || '').trim() || uiText('Доплата', language);
    if (openPayment !== id) {
      return collapsedPayment({
        id,
        testId: 'bonus-block',
        tone: 'bonus',
        label: name,
        additional: item.guaranteed !== true,
        amount: hasMoney(item) ? plusMoney(Number(item.amount), item.currency || currency) : '',
        details: [whenLine(item)],
      });
    }
    return (
      <Block key={id} $tone="bonus" data-testid="bonus-block" data-payment-row={id}>
        {openHead(id, name, remove)}
        <FieldRow>
          <Field id={`${blockId}-label`} label="За що доплата" language={language}>
            <LabelInput
              id={`${blockId}-label`}
              value={item.label || ''}
              maxLength={60}
              list={bonusSuggestions.length ? `${idPrefix}-bonus-terms` : undefined}
              placeholder={uiText(examples.bonusName, language)}
              onChange={event => setItem({ label: event.target.value })}
            />
          </Field>
          <Field id={`${blockId}-amount`} label="Сума" narrow language={language}>
            <MoneyInput compact id={`${blockId}-amount`} language={language} rates={rates} value={item} ariaLabel={uiText('Сума', language)} onChange={next => setItem(next || { amount: '' })} />
          </Field>
        </FieldRow>
        <GuaranteedToggle id={`${blockId}-guaranteed`} checked={item.guaranteed === true} language={language} onChange={checked => setItem({ guaranteed: checked })} />
        <PaymentDetails value={item} language={language} idPrefix={blockId} examples={examples} onChange={setItem} />
        {okFooter(name)}
      </Block>
    );
  };

  // --- підсумок формулою ---
  const totalBox = () => {
    if (!breakdown || !(breakdown.guaranteed.amount > 0)) return null;
    const term = line => (line.months
      ? `${money(Number(line.money.amount), line.money.currency)} × ${line.months}`
      : money(Number(line.subtotal.amount), line.subtotal.currency));
    const terms = [...(breakdown.main ? [breakdown.main] : []), ...breakdown.guaranteedBonuses];
    const grows = breakdown.additional.length > 0 && breakdown.max.amount > breakdown.guaranteed.amount;
    return (
      <TotalBox data-testid="program-editor-total">
        <div>
          <span>{uiText('Сума програми', language)}</span>
          <b>{sumText(breakdown.guaranteed)}</b>
        </div>
        {terms.length > 1 ? <p>{terms.map(term).join(' + ')}</p> : null}
        {grows ? <p>{uiText('З додатковими виплатами — до {amount}', language, { amount: sumText(breakdown.max) })}</p> : null}
        {breakdown.hasMonthlyEstimate ? (
          <p>{uiText('Вкажіть кількість місяців — інакше рахуємо 9, і сума буде приблизною', language)}</p>
        ) : null}
      </TotalBox>
    );
  };

  // --- вимога ---
  // Рівня («бажано», «індивідуально») і пояснення біля кожної вимоги більше
  // немає: вимога — саме значення. Своє агенція каже власною вимогою внизу.
  const requirementRow = def => {
    const label = uiText(def.label, language);
    const metaLabel = uiText(PROGRAM_REQUIREMENT_LABELS[def.key], language);
    const inputId = `${idPrefix}-req-${def.key}`;
    const error = errors[def.field];
    const clear = () => {
      hide(`req:${def.key}`);
      onChange({ ...program, requirements: { ...program.requirements, [def.field]: def.kind === 'select' ? 'any' : '' } });
    };
    return (
      <ReqRow key={def.key}>
        <ReqHead>
          <label htmlFor={inputId}>{label}</label>
          <RemoveButton type="button" aria-label={uiText('Прибрати вимогу: {label}', language, { label: metaLabel })} onClick={clear}>{uiText('Прибрати', language)}</RemoveButton>
        </ReqHead>
        <ReqControls>
          <div className="value">
            {def.kind === 'select' ? (
              <Select id={inputId} value={program.requirements?.[def.field] || 'any'} onChange={event => setReq({ [def.field]: event.target.value })}>
                {def.options.map(option => <option key={option.key} value={option.key}>{uiText(option.label, language)}</option>)}
              </Select>
            ) : (
              <>
                <Num
                  id={inputId}
                  inputMode="decimal"
                  $invalid={Boolean(error)}
                  aria-invalid={Boolean(error)}
                  placeholder="—"
                  value={program.requirements?.[def.field] ?? ''}
                  onChange={event => setReq({ [def.field]: event.target.value })}
                />
                {def.unit ? <span>{uiText(def.unit, language)}</span> : null}
              </>
            )}
          </div>
        </ReqControls>
        {error ? <FieldError role="alert">{uiText(error.text, language, error.vars)}</FieldError> : null}
      </ReqRow>
    );
  };

  // --- своя вимога ---
  const customRequirements = program.customRequirements || [];
  const setCustomRequirements = next => set({ customRequirements: next });
  const customRequirementRow = (item, index) => {
    const inputId = `${idPrefix}-req-custom-${index}`;
    const label = uiText('Своя вимога {n}', language, { n: index + 1 });
    const setItem = patch => setCustomRequirements(customRequirements.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)));
    return (
      <ReqRow key={inputId} data-testid="custom-requirement">
        <ReqHead>
          <label htmlFor={inputId}>{label}</label>
          <RemoveButton type="button" aria-label={uiText('Прибрати вимогу: {label}', language, { label: item.text || label })} onClick={() => setCustomRequirements(customRequirements.filter((_, i) => i !== index))}>{uiText('Прибрати', language)}</RemoveButton>
        </ReqHead>
        <ReqControls>
          <div className="value">
            <TextInput
              id={inputId}
              value={item.text || ''}
              maxLength={CUSTOM_REQUIREMENT_MAX_LENGTH}
              placeholder={uiText('Наприклад: без татуювань', language)}
              onChange={event => setItem({ text: event.target.value })}
            />
          </div>
        </ReqControls>
      </ReqRow>
    );
  };

  const sectionBody = {
    basic: (
      <>
        <Field label="Кого шукаєте" language={language}>
          <Segments role="group" aria-label={uiText('Кого шукаєте', language)}>
            {PROGRAM_TYPES.map(key => (
              <Pill key={key} type="button" $on={program.type === key} aria-pressed={program.type === key} onClick={() => set({ type: key })}>
                {uiText(PROGRAM_OFFER_LABELS[key], language)}
              </Pill>
            ))}
          </Segments>
        </Field>
        {/* Підказка під полем («Країна й місто. Якщо етапи…») і «Старт одразу»
            прибрані як шум на прохання власниці продукту. Уже поставлений
            «Старт одразу» лишається видно, доки його не знято: інакше в
            картці стояла б ознака, якої в редакторі не знайти. */}
        <Field id={`${idPrefix}-location`} label="Місце програми" language={language}>
          <TextInput id={`${idPrefix}-location`} value={program.location || ''} maxLength={80} placeholder={uiText(examples.place, language)} onChange={event => set({ location: event.target.value })} />
        </Field>
        {program.startNow === true ? (
          <CheckRow htmlFor={`${idPrefix}-start`}>
            <input id={`${idPrefix}-start`} type="checkbox" checked onChange={event => set({ startNow: event.target.checked || undefined })} />
            <span>{uiText('Старт одразу', language)}</span>
          </CheckRow>
        ) : null}
        <Field id={`${idPrefix}-note`} label="Коментар організатора" optional language={language}>
          <TextArea
            id={`${idPrefix}-note`}
            value={program.note || ''}
            maxLength={600}
            rows={3}
            placeholder={uiText('Важливе, чого немає серед полів програми', language)}
            onChange={event => set({ note: event.target.value })}
          />
        </Field>
      </>
    ),
    payments: (
      <>
        {mainBlock()}

        <SubHead>
          <h5>{uiText('Інші виплати', language)}</h5>
        </SubHead>
        {paymentRows.map(row => (row.key ? knownBonusBlock(row) : customBonusBlock(row)))}
        {bonusSuggestions.length ? (
          <datalist id={`${idPrefix}-bonus-terms`}>{bonusSuggestions.map(label => <option key={label} value={label} />)}</datalist>
        ) : null}
        <Segments>
          {extraFields.filter(field => !isShown(field.key)).map(field => (
            <AddChip key={field.key} type="button" aria-label={uiText('Додати доплату: {label}', language, { label: uiText(field.label, language) })} onMouseDown={keepFocus} onClick={() => addKnownPayment(field.key)}>+ {uiText(field.label, language)}</AddChip>
          ))}
          {/* Порожній рядок стоїть один: наступний додається, коли цей заповнено. */}
          {customBonuses.some(blankRow) ? null : (
            <AddChip type="button" onMouseDown={keepFocus} onClick={addCustomPayment}>
              + {uiText('Інша доплата', language)}
            </AddChip>
          )}
        </Segments>
        {legacyTotal ? (
          <Readout>
            {uiText('Стара загальна сума {amount} більше не показується', language, { amount: money(legacyTotal.amount, legacyTotal.currency) })}{' '}
            <SmallButton type="button" onClick={removeLegacyTotal}>{uiText('Прибрати', language)}</SmallButton>
          </Readout>
        ) : null}
        {totalBox()}
      </>
    ),
    requirements: (
      <>
        <ReqRow>
          <ReqHead><span className="label">{uiText('Вік, років', language)}</span></ReqHead>
          <ReqControls>
            <Range className="value">
              <Num
                $w={58}
                inputMode="numeric"
                aria-label={uiText('Вік від', language)}
                placeholder={uiText('від', language)}
                $invalid={Boolean(errors.ageFrom)}
                aria-invalid={Boolean(errors.ageFrom)}
                value={program.requirements?.ageFrom ?? ''}
                onChange={event => setReq({ ageFrom: event.target.value })}
              />
              <span>—</span>
              <Num
                $w={58}
                inputMode="numeric"
                aria-label={uiText('Вік до', language)}
                placeholder={uiText('до', language)}
                $invalid={Boolean(errors.ageTo)}
                aria-invalid={Boolean(errors.ageTo)}
                value={program.requirements?.ageTo ?? ''}
                onChange={event => setReq({ ageTo: event.target.value })}
              />
            </Range>
          </ReqControls>
          {errors.ageFrom || errors.ageTo ? <FieldError role="alert">{uiText((errors.ageFrom || errors.ageTo).text, language, (errors.ageFrom || errors.ageTo).vars)}</FieldError> : null}
        </ReqRow>
        {REQUIREMENT_DEFS.filter(def => requirementFilled(program, def) || revealed.has(`req:${def.key}`)).map(requirementRow)}
        {customRequirements.map(customRequirementRow)}
        <Segments>
          {REQUIREMENT_DEFS.filter(def => !requirementFilled(program, def) && !revealed.has(`req:${def.key}`)).map(def => (
            <AddChip key={def.key} type="button" onClick={() => reveal(`req:${def.key}`)}>+ {uiText(PROGRAM_REQUIREMENT_LABELS[def.key], language)}</AddChip>
          ))}
          {/* Порожня своя вимога стоїть одна: наступна додається, коли цю заповнено. */}
          {customRequirements.length < MAX_CUSTOM_REQUIREMENTS && !customRequirements.some(item => !String(item.text || '').trim()) ? (
            <AddChip type="button" onMouseDown={keepFocus} onClick={() => setCustomRequirements([...customRequirements, { text: '' }])}>+ {uiText('Своя вимога', language)}</AddChip>
          ) : null}
        </Segments>
      </>
    ),
    coverage: (
      <>
        <Field label="Що покриваєте й пропонуєте" language={language}>
          <Segments>
            {coverageOptions.map(option => {
              const on = (program.coverage || []).includes(option.key);
              return (
                <Pill
                  key={option.key}
                  type="button"
                  $on={on}
                  aria-pressed={on}
                  onClick={() => set({ coverage: on ? program.coverage.filter(key => key !== option.key) : [...(program.coverage || []), option.key] })}
                >
                  {on ? '✓ ' : ''}{uiText(option.label, language)}
                </Pill>
              );
            })}
          </Segments>
        </Field>
        {coverageKeys.map(key => {
          const option = PROGRAM_COVERAGE_OPTIONS.find(item => item.key === key);
          if (!option) return null;
          const detail = coverageDetails[key] || {};
          const label = uiText(option.label, language);
          const open = revealed.has(`cov:${key}`) || Object.keys(detail).length > 0;
          if (!open) return null;
          return (
            <Block key={key} $tone="separate">
              <BlockHead><b>{label}</b></BlockHead>
              <FieldRow>
                <Field id={`${idPrefix}-cov-${key}-mode`} label="Як покриваєте" language={language}>
                  <Select id={`${idPrefix}-cov-${key}-mode`} aria-label={uiText('Як покриваєте: {label}', language, { label })} value={detail.mode || ''} onChange={event => setCoverageDetail(key, { mode: event.target.value || undefined })}>
                    <option value="">{uiText('не вказано', language)}</option>
                    {PROGRAM_COVERAGE_MODES.map(item => <option key={item.key} value={item.key}>{uiText(item.label, language)}</option>)}
                  </Select>
                </Field>
                <Field id={`${idPrefix}-cov-${key}-limit`} label="Межа" optional language={language}>
                  <MoneyInput compact id={`${idPrefix}-cov-${key}-limit`} language={language} rates={rates} ariaLabel={uiText('Межа: {label}', language, { label })} placeholder={uiText('межа', language)} value={detail.limit} onChange={next => setCoverageDetail(key, { limit: next || undefined })} />
                </Field>
                {detail.limit ? (
                  <Field id={`${idPrefix}-cov-${key}-per`} label="За який час" grow={false} language={language}>
                    <Select id={`${idPrefix}-cov-${key}-per`} value={detail.per || 'total'} onChange={event => setCoverageDetail(key, { per: event.target.value })}>
                      {PROGRAM_COVERAGE_PER.map(per => <option key={per.key} value={per.key}>{uiText(per.label, language)}</option>)}
                    </Select>
                  </Field>
                ) : null}
              </FieldRow>
              <Field id={`${idPrefix}-cov-${key}-note`} label="Примітка" optional language={language}>
                <TextInput id={`${idPrefix}-cov-${key}-note`} value={detail.note || ''} maxLength={120} placeholder={uiText('Наприклад: крім таксі', language)} onChange={event => setCoverageDetail(key, { note: event.target.value })} />
              </Field>
            </Block>
          );
        })}
        {coverageKeys.some(key => !revealed.has(`cov:${key}`) && !Object.keys(coverageDetails[key] || {}).length) ? (
          <Segments>
            {coverageKeys.filter(key => !revealed.has(`cov:${key}`) && !Object.keys(coverageDetails[key] || {}).length).map(key => {
              const option = PROGRAM_COVERAGE_OPTIONS.find(item => item.key === key);
              return option ? <AddChip key={key} type="button" onClick={() => reveal(`cov:${key}`)}>+ {uiText('Як саме: {label}', language, { label: uiText(option.label, language).toLowerCase() })}</AddChip> : null;
            })}
          </Segments>
        ) : null}

        {customCoverage.map((item, index) => {
          const inputId = `${idPrefix}-cov-custom-${index}`;
          const label = uiText('Своє {n}', language, { n: index + 1 });
          return (
            <ReqRow key={inputId} data-testid="custom-coverage">
              <ReqHead>
                <label htmlFor={inputId}>{label}</label>
                <RemoveButton type="button" aria-label={uiText('Прибрати: {label}', language, { label: item || label })} onClick={() => setCustomCoverage(customCoverage.filter((_, i) => i !== index))}>{uiText('Прибрати', language)}</RemoveButton>
              </ReqHead>
              <TextInput
                id={inputId}
                value={item}
                maxLength={CUSTOM_COVERAGE_MAX_LENGTH}
                placeholder={uiText(isSurrogacy ? 'Наприклад: подарунок після пологів' : 'Наприклад: аванс на старті', language)}
                onChange={event => setCustomCoverage(customCoverage.map((entry, i) => (i === index ? event.target.value : entry)))}
              />
            </ReqRow>
          );
        })}
        <Segments>
          {/* Порожній свій пункт стоїть один: наступний додається, коли цей заповнено. */}
          {customCoverage.length < MAX_CUSTOM_COVERAGE && !customCoverage.some(item => !String(item || '').trim()) ? (
            <AddChip type="button" onMouseDown={keepFocus} onClick={() => setCustomCoverage([...customCoverage, ''])}>+ {uiText('Своє: подарунки, аванс…', language)}</AddChip>
          ) : null}
          {!showRelocation ? <AddChip type="button" onClick={() => reveal('relocation')}>+ {uiText('Переїзд', language)}</AddChip> : null}
        </Segments>
        {showRelocation ? (
          <Block $tone="separate">
            <BlockHead><b>{uiText('Переїзд', language)}</b></BlockHead>
            <FieldRow>
              <Field id={`${idPrefix}-reloc-when`} label="Коли переїзд" language={language}>
                <TextInput id={`${idPrefix}-reloc-when`} value={relocation.when || ''} maxLength={80} placeholder={uiText(isSurrogacy ? 'Наприклад: з 12 тижня' : 'Наприклад: на 5 днів стимуляції', language)} onChange={event => setRelocation({ when: event.target.value })} />
              </Field>
              <Field id={`${idPrefix}-family`} label="Сімʼя" grow={false} language={language}>
                <Select id={`${idPrefix}-family`} value={relocation.family || ''} onChange={event => setRelocation({ family: event.target.value })}>
                  {PROGRAM_FAMILY_OPTIONS.map(option => <option key={option.key} value={option.key}>{uiText(option.label, language)}</option>)}
                </Select>
              </Field>
            </FieldRow>
            <Field id={`${idPrefix}-reloc-note`} label="Примітка" optional language={language}>
              <TextInput id={`${idPrefix}-reloc-note`} value={relocation.note || ''} maxLength={120} placeholder={uiText('Наприклад: квартира біля клініки', language)} onChange={event => setRelocation({ note: event.target.value })} />
            </Field>
          </Block>
        ) : null}
      </>
    ),
  };

  return (
    <Body>
      <Toolbar ref={tabsRef} $empty={!saveState}>
        <ModeTabs role="tablist" aria-label={uiText('Режим', language)}>
          <button type="button" role="tab" aria-selected={mode === 'edit'} onClick={() => switchMode('edit')}>{uiText('Редагування', language)}</button>
          <button type="button" role="tab" aria-selected={mode === 'preview'} onClick={() => switchMode('preview')}>{uiText('Перегляд', language)}</button>
        </ModeTabs>
        {saveState ? <SaveState $state={saveState} role="status">{uiText(SAVE_LABELS[saveState], language)}</SaveState> : <span />}
      </Toolbar>

      <FormColumn $hiddenOnMobile={mode !== 'edit'}>
        {issues.length ? (
          <Issues aria-label={uiText('Що виправити', language)}>
            {issues.map(issue => <li key={issue}>{uiText(issue, language)}</li>)}
          </Issues>
        ) : null}
        {SECTIONS.map((section, index) => (
          <CollapsibleSection
            key={section.key}
            index={index + 1}
            sectionKey={section.key}
            idPrefix={idPrefix}
            title={section.title}
            summary={summaries[section.key]}
            open={openSections.has(section.key)}
            onToggle={() => toggleSection(section.key)}
            language={language}
          >
            {sectionBody[section.key]}
          </CollapsibleSection>
        ))}
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
  partial: 'Збережено частково — нові поля поки лише в цьому браузері',
  failed: 'Поки лише в цьому браузері',
});

export const ProgramsEditor = ({ programs, onSave, language, rates, defaultType = 'ed', suggestions = null, profilePublished, onEditingChange }) => {
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
      if (mountedRef.current && seq === saveSeqRef.current) setSaveState(ok === false ? 'failed' : ok === 'partial' ? 'partial' : 'saved');
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

  // Відкрита програма — це редагування: сторінка стискає свою липку панель
  // прогресу, щоб та не забирала пів екрана телефона над полями.
  useEffect(() => {
    onEditingChange?.(Boolean(openId));
  }, [openId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onEditingChange?.(false), []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleHidden = program => update(draft.map(item => (item.id === program.id ? { ...item, hidden: !item.hidden } : item)));

  return (
    <Wrap>
      {/* Стан запису стоїть у рядку вкладок відкритої програми; без відкритої — тут. */}
      {saveState && !openId ? (
        <SaveState $state={saveState} role="status">{uiText(SAVE_LABELS[saveState], language)}</SaveState>
      ) : null}
      {!draft.length ? (
        <EmptyState>
          <b>{uiText('Програм ще немає', language)}</b>
          {uiText('Додайте першу — донорки й сурогатні мами побачать її у вашій картці в стрічці.', language)}
        </EmptyState>
      ) : null}
      {draft.map((program, index) => {
        const open = openId === program.id;
        const status = programStatus(program, { profilePublished });
        const pay = headPay(program);
        return (
          <ProgramBox key={program.id} data-testid="program-editor" $hidden={program.hidden}>
            <ProgramHead $open={open} style={program.hidden ? { opacity: 0.75 } : undefined}>
              <HeadText type="button" aria-expanded={open} onClick={() => { flush(); setOpenId(open ? '' : program.id); }}>
                <span>
                  <b>{uiText(PROGRAM_OFFER_LABELS[program.type], language)}</b>
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
                saveState={saveState}
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
