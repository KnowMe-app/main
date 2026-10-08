import React, { useCallback, useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import {
  FaBalanceScale,
  FaBus,
  FaChevronDown,
  FaFileSignature,
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
  PROGRAM_REQUIREMENT_LABELS,
  defaultProgramBonusKeys,
  describeProgramCoverage,
  describeProgramRequirements,
  evaluateProgram,
  formatProgramPlace,
  listProgramDifferences,
  listProgramStages,
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
import { uiText } from '../../utils/uiTranslations';

/*
 * Показ програм агенції чи клініки — один на стрічку, прев'ю «Мого профілю»
 * й попередній перегляд у редакторі програм.
 *
 * Програма — це комерційна пропозиція, і читають її двома кроками:
 *
 *  1. **Згорнута програма** (`ProgramListItem`) — окремий контейнер у тілі
 *     картки агенції: що пропонують і скільки одним рядком («Донорство
 *     ооцитів — 1 500 $»), де, до чотирьох ознак, які вибрала агенція, і
 *     одним рядком, що покривають («Проїзд, житло +2»).
 *  2. **Деталі програми** — під тим самим контейнером, кнопкою «Деталі
 *     програми» всередині нього: доплати перемикачами, вимоги з рівнями й
 *     поясненнями, етапи й переїзд, як саме покривається кожна витрата, умови.
 *
 * Сума програми одна й стоїть у заголовку: головна плюс відмічені доплати
 * (`programBreakdown`). Перемикач доплати міняє саме її — окремої плашки
 * «Сценарій з відміченими доплатами», блоку «За окрему процедуру» й підпису
 * «Разом донорці за програму» тут більше немає: це були три числа про одну
 * програму. Власної назви програми теж немає — назва це те, що пропонують.
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
`;

const NoteList = styled.ul`
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
  font-size: 12.5px;
  line-height: 1.45;
  color: ${MUTED};

  li + li { margin-top: 2px; }
  b { font-weight: 600; color: ${TEXT}; }
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

const LEVEL_SUFFIX = Object.freeze({ preferred: 'бажано', individual: 'індивідуально' });

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

const highlightText = (item, language, displayCurrency, rates) => {
  if (item.key === 'bonuses') return `+${item.variables.count} ${uiText(pluralBonuses(item.variables.count, language), language)}`;
  if (item.money) return uiText(item.text, language, { amount: plainMoney(item.money, displayCurrency, rates) });
  if (item.variables?.label) return uiText(item.text, language, { ...item.variables, label: uiText(item.variables.label, language).toLowerCase() });
  const base = uiText(item.text, language, item.variables);
  return item.level && LEVEL_SUFFIX[item.level] ? `${base} (${uiText(LEVEL_SUFFIX[item.level], language)})` : base;
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
    const label = uiText(item.label, language);
    return index === 0 ? label : label.toLowerCase();
  });
  const rest = all.length - names.length;
  return `${names.join(', ')}${rest > 0 ? ` +${rest}` : ''}`;
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

/**
 * Відмічені доплати програми. Тримається **зняте** читачкою, а не відмічене:
 * типово відмічено все (`defaultProgramBonusKeys`), і доплата, яку агенція
 * щойно додала в редакторі, мусить одразу стати в суму, а не чекати дотику.
 */
const useSelectedBonuses = program => {
  const [cleared, setCleared] = useState(() => new Set());
  useEffect(() => {
    setCleared(new Set());
  }, [program.id]);
  const selected = defaultProgramBonusKeys(program).filter(key => !cleared.has(key));
  const toggle = useCallback(key => setCleared(current => {
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
}) => {
  const [ownBonuses, toggleOwnBonus] = useSelectedBonuses(program);
  // У контейнері стрічки вибір тримає згорнута частина: її заголовок рахує
  // відмічені доплати (`describeProgramOffer`).
  const controlled = Array.isArray(controlledBonuses) && typeof onToggleBonus === 'function';
  const selectedBonuses = controlled ? controlledBonuses : ownBonuses;
  const currency = displayCurrency || '';
  const result = facts ? evaluateProgram(program, facts) : null;
  const checkByKey = new Map((result?.checks || []).map(check => [check.key, check.ok]));
  const { bonuses } = programBreakdown(program, { selectedBonusKeys: selectedBonuses, rates });
  const requirements = describeProgramRequirements(program);
  const unknown = requirements.filter(item => checkByKey.get(item.key) === null).map(item => REQUIREMENT_FIX_HINTS[item.key]);
  const coverage = describeProgramCoverage(program);
  const stages = listProgramStages(program);
  const relocation = program.relocation || null;
  const toggleBonus = controlled ? onToggleBonus : toggleOwnBonus;
  const state = result ? (result.matches ? (result.uncertain ? 'uncertain' : 'match') : 'mismatch') : '';
  const verdictText = {
    match: 'Вам підходить',
    uncertain: 'Може підходити — уточніть в агенції або доповніть анкету',
    mismatch: 'Не підходить за вимогами',
  }[state];
  const notes = requirements.filter(item => item.note);
  const familyLabel = PROGRAM_FAMILY_OPTIONS.find(option => option.key === relocation?.family && option.key)?.label || '';
  const plus = money => plainMoney(money, currency, rates).replace(/^(≈ )?/, (match, approx) => `${approx || ''}+`);

  const body = (
    <Details data-testid={framed ? undefined : 'program-card'}>
      {bonuses.length ? (
        <Section data-testid="program-bonuses">
          <SectionTitle>{uiText('Доплати', language)}</SectionTitle>
          {bonuses.map(item => {
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
                  {item.months ? (
                    <small>
                      {item.monthsEstimated
                        ? uiText('{amount}/міс · скільки місяців — уточніть в агенції', language, { amount: plainMoney(item.money, currency, rates) })
                        : uiText('{amount}/міс × {months} {unit}', language, { amount: plainMoney(item.money, currency, rates), months: item.months, unit: monthWord(item.months, language) })}
                    </small>
                  ) : null}
                  {meta ? <small>{meta}</small> : null}
                </span>
                <b>{plus(item.monthsEstimated ? { ...item.subtotal, approximate: true } : item.subtotal)}</b>
              </BonusRow>
            );
          })}
        </Section>
      ) : null}

      {requirements.length ? (
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
                  {LEVEL_SUFFIX[item.level] ? <em>· {uiText(LEVEL_SUFFIX[item.level], language)}</em> : null}
                </Chip>
              );
            })}
          </Chips>
          {notes.length ? (
            <NoteList>
              {notes.map(item => <li key={item.key}><b>{uiText(PROGRAM_REQUIREMENT_LABELS[item.key], language)}:</b> {item.note}</li>)}
            </NoteList>
          ) : null}
          {unknown.length ? <Hint>{[...new Set(unknown)].map(hint => uiText(hint, language)).join(' · ')}</Hint> : null}
        </Section>
      ) : null}

      {stages.length || relocation ? (
        <Section>
          <SectionTitle>{uiText('Де й коли', language)}</SectionTitle>
          <PlaceList>
            {stages.map((item, index) => (
              <React.Fragment key={`${item.stage}-${index}`}>
                <dt>{uiText(item.label, language)}</dt>
                <dd>{item.place}</dd>
              </React.Fragment>
            ))}
            {relocation?.when ? <><dt>{uiText('Переїзд', language)}</dt><dd>{relocation.when}</dd></> : null}
            {familyLabel ? <><dt>{uiText('Сімʼя', language)}</dt><dd>{uiText(familyLabel, language)}</dd></> : null}
          </PlaceList>
          {relocation?.note ? <Hint>{relocation.note}</Hint> : null}
        </Section>
      ) : null}

      {coverage.all.length ? (
        <Section>
          <SectionTitle>{uiText('Що покриває', language)}</SectionTitle>
          <CoverList aria-label={uiText('Витрати', language)}>
            {[...coverage.expenses, ...coverage.support].map(item => {
              const Icon = COVERAGE_ICONS[item.key] || FaShieldAlt;
              const detail = coverageDetailText(item, language, currency, rates);
              return (
                <li key={item.key}>
                  <Icon aria-hidden="true" />
                  <span>
                    {uiText(item.label, language)}
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
          <SectionTitle>{uiText('Умови й примітки', language)}</SectionTitle>
          <Note>{program.note}</Note>
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

const OTHER_TYPE_LABELS = Object.freeze({ ed: 'для донорок', sm: 'для сурогатних мам' });

// «з 2 програм», але «з 1 програми»: після «з» — родовий відмінок.
const programsGenitive = (count, language) => {
  if (language === 'en') return count === 1 ? 'program' : 'programs';
  return count % 10 === 1 && count % 100 !== 11 ? 'програми' : 'програм';
};

const pluralBonuses = (count, language) => {
  if (language === 'en') return count === 1 ? 'bonus' : 'bonuses';
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'доплата';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'доплати';
  return 'доплат';
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
`;

// Що пропонують і скільки — одним рядком: «Донорство ооцитів — 1 500 $».
// Сума стояла окремим великим числом під назвою, з підписом «кому за що»
// третім рядком, і програма займала пів екрана до першої ознаки.
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

const CoverageLine = styled.p`
  margin: 8px 0 0;
  font-size: 12.5px;
  line-height: 1.4;
  color: ${MUTED};

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
 * Сума програми — головна плюс відмічені доплати (без вибору — усі).
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
 */
const ProgramListItem = ({ program, open, onToggle, facts, rates, language, differs, displayCurrency }) => {
  const result = facts ? evaluateProgram(program, facts) : null;
  const fit = programFitState(result);
  const [selectedBonuses, toggleBonus] = useSelectedBonuses(program);
  const offer = describeProgramOffer(program, { rates, selectedBonusKeys: selectedBonuses });
  const shown = offer.money ? presentSum(offer.money, displayCurrency, rates) : null;
  const upTo = offer.breakdown.upTo ? presentSum(offer.breakdown.upTo, displayCurrency, rates).primary : '';
  const highlights = useMemo(() => {
    const items = resolveProgramHighlights(program);
    return items.map(item => ({ ...item, differs: Boolean(differs?.has(item.key)) }));
  }, [differs, program]);
  const coverageLine = summarizeCoverageLine(program, language);
  const bodyId = `program-body-${program.id}`;
  const offerLabel = programHeading(program, language);
  const place = program.location ? formatProgramPlace(program.location) : (listProgramStages(program)[0]?.place || '');
  const stagesCount = (program.stages || []).length;

  return (
    <ProgramItem data-testid="program-list-item" onClick={event => event.stopPropagation()}>
      <ProgramHead>
        <div>
          <ProgramTitle data-testid="program-title">
            {fit ? <FitMark role="img" $state={fit} title={uiText(FIT_LABELS[fit], language)} aria-label={uiText(FIT_LABELS[fit], language)}>{FIT_MARKS[fit]}</FitMark> : null}
            <span>
              {offerLabel}
              {shown?.primary ? <> — <Sum>{shown.primary}</Sum></> : null}
            </span>
          </ProgramTitle>
          {shown?.original || upTo || !shown?.primary ? (
            <PayLabel>
              {shown?.primary ? (
                <>
                  {shown.original}
                  {upTo ? <>{shown.original ? ' · ' : ''}<strong>{uiText('до {amount}', language, { amount: upTo })}</strong>{offer.breakdown.upToCondition ? ` — ${offer.breakdown.upToCondition}` : ''}</> : null}
                </>
              ) : uiText('Суму уточнюйте в агенції', language)}
            </PayLabel>
          ) : null}
          {place ? (
            <Place className={differs?.has('location') ? 'differs' : undefined}>
              <FaMapMarkerAlt aria-hidden="true" />
              <span>
                {place}
                {stagesCount > 1 ? ` · ${uiText('{count} етапи', language, { count: stagesCount })}` : ''}
              </span>
            </Place>
          ) : null}
        </div>
      </ProgramHead>

      {!open && highlights.length ? (
        <Highlights aria-label={uiText('Головне', language)}>
          {highlights.map(item => (
            <li key={item.key} className={item.differs ? 'differs' : undefined}>{highlightText(item, language, displayCurrency, rates)}</li>
          ))}
        </Highlights>
      ) : null}
      {!open && coverageLine ? (
        <CoverageLine><b>{uiText('Покриває', language)}:</b> {coverageLine}</CoverageLine>
      ) : null}

      {open ? (
        <ProgramBody id={bodyId}>
          <ProgramCard
            program={program}
            facts={facts}
            rates={rates}
            language={language}
            displayCurrency={displayCurrency}
            selectedBonuses={selectedBonuses}
            onToggleBonus={toggleBonus}
          />
        </ProgramBody>
      ) : null}

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
 * решта — «Показати ще». Деталі кожної розгортаються незалежно.
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
}) => {
  const [openIds, setOpenIds] = useState(() => new Set(defaultOpenId ? [defaultOpenId] : []));
  const [showAll, setShowAll] = useState(false);
  const summary = summarizeCardPrograms(card, { viewerType, facts });
  const programs = useMemo(() => (summary ? summary.evaluated.map(item => item.program) : []), [summary]);
  const differences = useMemo(() => listProgramDifferences(programs), [programs]);
  if (!summary) return null;
  const visible = showAll ? programs : programs.slice(0, VISIBLE_PROGRAMS);
  const hiddenCount = programs.length - visible.length;
  // Діапазон — лише коли частину програм сховано: видимі контейнери й так
  // називають кожну суму, а діапазон над ними повторив би їх утретє.
  const range = hiddenCount > 0 ? formatPayRange(summary.finals, displayCurrency, rates) : '';
  const matchedLine = summary.total === 0
    ? uiText('Програм для вас поки немає', language)
    : summary.matched !== null
      ? uiText('Вам підходить {matched} з {total} {programs}', language, {
        matched: summary.matched,
        total: summary.total,
        programs: programsGenitive(summary.total, language),
      })
      : '';
  const otherType = viewerType === 'ed' ? 'sm' : 'ed';
  const othersCount = summary.allTotal - summary.total;
  const toggle = id => {
    setOpenIds(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else {
        next.add(id);
        onOpen?.(id);
      }
      return next;
    });
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
          {range ? <>{matchedLine ? ' · ' : ''}<em>{range}</em></> : null}
        </PanelLine>
      ) : null}
      {visible.length ? (
        <ProgramList>
          {visible.map(program => (
            <ProgramListItem
              key={program.id}
              program={program}
              open={openIds.has(program.id)}
              onToggle={() => toggle(program.id)}
              facts={viewerType === program.type ? facts : null}
              rates={rates}
              language={language}
              differs={differences.get(program.id)}
              displayCurrency={displayCurrency}
            />
          ))}
        </ProgramList>
      ) : null}
      {hiddenCount > 0 ? (
        <MoreButton type="button" onClick={event => { event.stopPropagation(); setShowAll(true); }}>
          {uiText('Показати ще {count}', language, { count: hiddenCount })}
        </MoreButton>
      ) : null}
      {othersCount > 0 && OTHER_TYPE_LABELS[otherType] && viewerType ? (
        <RateNote>
          {uiText('ще {count} — {audience}', language, {
            count: othersCount,
            audience: uiText(OTHER_TYPE_LABELS[otherType], language),
          })}
        </RateNote>
      ) : null}
      {converted ? (
        <RateNote>{uiText('≈ — за курсом НБУ на {date}', language, { date: formatRateDate(rates.rateDate) })}</RateNote>
      ) : null}
    </Panel>
  );
};

// Стара назва: рядок стрічки звав блок саме так.
export const ProgramsSummary = AgencyProgramsPanel;

