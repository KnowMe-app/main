import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import {
  PROGRAM_COVERAGE_OPTIONS,
  PROGRAM_TYPE_LABELS,
  PROGRAM_TOTAL_FIELD,
  calculateProgramTotal,
  defaultProgramBonusKeys,
  describeProgramRequirements,
  evaluateProgram,
  listProgramBonuses,
  listProgramPayments,
  summarizeCardPrograms,
} from '../../utils/donorPrograms';
import {
  PROGRAM_CURRENCIES,
  PROGRAM_CURRENCY_SIGNS,
  convertProgramAmount,
  describeProgramMoney,
  formatProgramMoney,
  formatRateDate,
} from '../../utils/programCurrency';
import { uiText } from '../../utils/uiTranslations';

/*
 * Показ програм агенції чи клініки — один на стрічку, відкриту картку й
 * попередній перегляд у формі агенції.
 *
 * Агенція бачить у своїй формі рівно той блок, який побачить донорка: інакше
 * «як це прочитають» доводилось би вгадувати.
 *
 * Кожна змінна кольору має запасну: блок живе і в стрічці (`--matching-*`), і
 * в «Моєму профілі», де оголошені лише `--km-*`.
 */

const ACCENT = 'var(--matching-accent, var(--km-accent, #E8791A))';
const BORDER = 'var(--matching-card-border, var(--km-border, #e7e1d8))';
// Текст — зі стрічки, коли блок у стрічці: її палітра своя (`--matching-*`) і
// від теми застосунку не залежить. Успадкований колір там бував білим на
// світлому — суми й вимоги просто зникали.
const TEXT = 'var(--matching-header-text, var(--km-text, #1e1b18))';
const MUTED = 'var(--matching-muted-text, var(--km-muted, #6f675f))';
const GOOD = '#2E9B55';
const BAD = '#C8483E';

const SummaryButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  min-height: 44px;
  padding: 8px 12px;
  border: 1px solid ${({ $match }) => ($match ? `color-mix(in srgb, ${GOOD} 45%, transparent)` : BORDER)};
  border-radius: 12px;
  background: ${({ $match }) => ($match ? `color-mix(in srgb, ${GOOD} 8%, transparent)` : 'transparent')};
  color: ${TEXT};
  font: inherit;
  text-align: left;
  cursor: pointer;

  &:focus-visible { outline: 2px solid ${ACCENT}; outline-offset: 2px; }
`;

const SummaryText = styled.span`
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;

  b { font-size: 14px; font-weight: 700; }
  span { font-size: 12.5px; color: ${MUTED}; }
`;

const SummaryPay = styled.span`
  font-size: 15px;
  font-weight: 800;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
`;

const Caret = styled.span`
  font-size: 11px;
  color: ${MUTED};
  transform: rotate(${({ $open }) => ($open ? '180deg' : '0deg')});
`;

const List = styled.div`
  color: ${TEXT};
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 10px;
`;

const Card = styled.article`
  color: ${TEXT};
  border: 1px solid ${BORDER};
  border-left: 3px solid ${({ $state }) => ($state === 'match' ? GOOD : $state === 'mismatch' ? BAD : ACCENT)};
  border-radius: 12px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 9px;
  opacity: ${({ $state }) => ($state === 'mismatch' ? 0.78 : 1)};
`;

const CardHead = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 8px;
  font-size: 13px;
  color: ${MUTED};

  b { color: ${TEXT}; font-size: 14px; }
`;

const Verdict = styled.span`
  margin-left: auto;
  font-size: 12px;
  font-weight: 700;
  color: ${({ $ok }) => ($ok ? GOOD : BAD)};
`;

const MainPay = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 2px 10px;

  strong { font-size: 22px; font-weight: 800; font-variant-numeric: tabular-nums; }
  span { font-size: 12.5px; color: ${MUTED}; font-variant-numeric: tabular-nums; }
`;

const PayLabel = styled.div`
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: ${MUTED};
`;

const PayTable = styled.dl`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 4px 12px;
  margin: 0;
  font-size: 13px;

  dt { color: ${MUTED}; }
  dd { margin: 0; text-align: right; font-variant-numeric: tabular-nums; }
  dd small { display: block; font-size: 11.5px; color: ${MUTED}; }
`;

const BonusChoice = styled.label`
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  cursor: pointer;

  input { margin: 0; accent-color: ${ACCENT}; }
  span { color: ${MUTED}; }
  strong { color: ${TEXT}; font-weight: 600; text-align: right; }
`;

const Chips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
`;

const Chip = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 12px;
  color: ${TEXT};
  border: 1px solid ${({ $ok }) => ($ok === true ? `color-mix(in srgb, ${GOOD} 45%, transparent)` : $ok === false ? `color-mix(in srgb, ${BAD} 50%, transparent)` : BORDER)};
  background: ${({ $ok }) => ($ok === true ? `color-mix(in srgb, ${GOOD} 9%, transparent)` : $ok === false ? `color-mix(in srgb, ${BAD} 9%, transparent)` : 'transparent')};
`;

const Note = styled.p`
  margin: 0;
  font-size: 12.5px;
  color: ${MUTED};
  white-space: pre-wrap;
`;

const CurrencyRow = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 12px;
  color: ${MUTED};
`;

const CurrencyButton = styled.button`
  min-width: 34px;
  min-height: 28px;
  padding: 0 8px;
  border-radius: 999px;
  border: 1px solid ${({ $on }) => ($on ? ACCENT : BORDER)};
  background: ${({ $on }) => ($on ? `color-mix(in srgb, ${ACCENT} 14%, transparent)` : 'transparent')};
  color: ${({ $on }) => ($on ? ACCENT : 'inherit')};
  font: inherit;
  font-weight: 700;
  cursor: pointer;
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

export const ProgramCurrencySwitch = ({ value, onChange, language, rates }) => (
  <CurrencyRow>
    <span>{uiText('Показувати в', language)}</span>
    {PROGRAM_CURRENCIES.map(code => (
      <CurrencyButton key={code} type="button" $on={value === code} aria-pressed={value === code} onClick={event => { event.stopPropagation(); onChange(code); }}>
        {PROGRAM_CURRENCY_SIGNS[code]}
      </CurrencyButton>
    ))}
    {rates?.rateDate ? <span>· {uiText('курс НБУ на {date}', language, { date: formatRateDate(rates.rateDate) })}</span> : null}
  </CurrencyRow>
);

/** Сума агенції першою, далі еквіваленти з «≈». */
const MoneyLine = ({ money, rates, prefix = '' }) => {
  const described = describeProgramMoney(money, rates);
  if (!described) return null;
  return (
    <dd>
      {prefix}{described.text}
      {described.equivalents.length ? <small>{described.equivalents.map(item => item.text).join(' · ')}</small> : null}
    </dd>
  );
};

/**
 * Одна програма. `facts` — анкета читача (`extractViewerProgramFacts`): коли
 * вона є, кожна вимога показує, чи читач їй відповідає.
 */
export const ProgramCard = ({ program, facts = null, rates, language, compactNote = false }) => {
  const [selectedBonuses, setSelectedBonuses] = useState(() => defaultProgramBonusKeys(program, facts));
  useEffect(() => {
    setSelectedBonuses(defaultProgramBonusKeys(program, facts));
  // Object identities may change when a cached card rerenders; only facts that
  // affect defaults should reset the user's local selection.
  }, [program.id, facts?.births, facts?.csections, facts?.experience]); // eslint-disable-line react-hooks/exhaustive-deps
  const result = facts ? evaluateProgram(program, facts) : null;
  const checkByKey = new Map((result?.checks || []).map(check => [check.key, check.ok]));
  const state = result ? (result.matches ? 'match' : 'mismatch') : 'neutral';
  const payments = listProgramPayments(program);
  const total = program.payments?.[PROGRAM_TOTAL_FIELD]
    ? { key: PROGRAM_TOTAL_FIELD, label: 'Загальна сума за програму', money: program.payments[PROGRAM_TOTAL_FIELD] }
    : null;
  // Головна — фінальна виплата; без неї головною стає загальна сума.
  const [main, ...paymentRest] = payments[0]?.key === 'final' ? payments : [total, ...payments];
  const rest = main && main !== total && total ? [total, ...paymentRest] : paymentRest;
  const bonuses = listProgramBonuses(program);
  const calculatedTotals = calculateProgramTotal(program, selectedBonuses);
  const mainMoney = main ? describeProgramMoney(main.money, rates) : null;
  const requirements = describeProgramRequirements(program);
  const unknown = requirements.filter(item => checkByKey.get(item.key) === null).map(item => REQUIREMENT_FIX_HINTS[item.key]);
  const coverage = PROGRAM_COVERAGE_OPTIONS.filter(option => program.coverage?.includes(option.key));

  return (
    <Card $state={state} data-testid="program-card">
      <CardHead>
        <b>{uiText(PROGRAM_TYPE_LABELS[program.type], language)}</b>
        {program.location ? <span>· {program.location}</span> : null}
        {result ? <Verdict $ok={result.matches}>{uiText(result.matches ? 'Вам підходить' : 'Не підходить', language)}</Verdict> : null}
      </CardHead>

      {calculatedTotals.length ? (
        <div>
          <PayLabel>{uiText('Загальна сума за програму', language)}</PayLabel>
          <MainPay>
            {calculatedTotals.map(item => <strong key={item.currency}>{formatProgramMoney(item.amount, item.currency)}</strong>)}
          </MainPay>
        </div>
      ) : null}

      {mainMoney ? (
        <div>
          <PayLabel>{uiText(main.label, language)}</PayLabel>
          <MainPay>
            <strong>{mainMoney.text}</strong>
            {mainMoney.equivalents.map(item => <span key={item.currency}>{item.text}</span>)}
          </MainPay>
        </div>
      ) : null}

      {rest.length ? (
        <PayTable>
          {rest.map(item => (
            <React.Fragment key={item.key}>
              <dt>{uiText(item.label, language)}</dt>
              <MoneyLine money={item.money} rates={rates} />
            </React.Fragment>
          ))}
        </PayTable>
      ) : null}

      {bonuses.length ? (
        <div>
          <PayLabel>{uiText('Можливі доплати', language)}</PayLabel>
          <PayTable>
            {bonuses.map(item => (
              <BonusChoice key={item.key}>
                <input
                  type="checkbox"
                  checked={selectedBonuses.includes(item.key)}
                  onChange={() => setSelectedBonuses(current => (current.includes(item.key)
                    ? current.filter(key => key !== item.key)
                    : [...current, item.key]))}
                />
                <span>{uiText(item.label, language)}</span>
                <strong>+{formatProgramMoney(item.money.amount, item.money.currency)}</strong>
              </BonusChoice>
            ))}
          </PayTable>
        </div>
      ) : null}

      {requirements.length ? (
        <Chips aria-label={uiText('Вимоги', language)}>
          {requirements.map(item => {
            const ok = checkByKey.has(item.key) ? checkByKey.get(item.key) : undefined;
            return (
              <Chip key={item.key} $ok={ok}>
                {ok === true ? '✓' : ok === false ? '✕' : null}
                {uiText(item.text, language, item.variables)}
              </Chip>
            );
          })}
        </Chips>
      ) : null}

      {unknown.length ? <Note>{[...new Set(unknown)].map(hint => uiText(hint, language)).join(' · ')}</Note> : null}

      {coverage.length ? (
        <Chips aria-label={uiText('Що покриває', language)}>
          {coverage.map(option => <Chip key={option.key}>{uiText(option.label, language)}</Chip>)}
        </Chips>
      ) : null}

      {program.note && !compactNote ? <Note>{program.note}</Note> : null}
    </Card>
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
    return min === max ? formatProgramMoney(min, currency) : `${formatProgramMoney(min, currency).replace(/ \S+$/, '')}–${formatProgramMoney(max, currency)}`;
  }
  const converted = values.some(item => item.money.currency !== displayCurrency);
  const step = displayCurrency === 'UAH' ? 100 : 10;
  const nums = values.map(item => Math.round(item.converted / step) * step);
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const range = min === max
    ? formatProgramMoney(min, displayCurrency)
    : `${formatProgramMoney(min, displayCurrency).replace(/ \S+$/, '')}–${formatProgramMoney(max, displayCurrency)}`;
  return converted ? `≈ ${range}` : range;
};

const OTHER_TYPE_LABELS = Object.freeze({ ed: 'для донорок', sm: 'для сурогатних мам' });

// «з 2 програм», але «з 1 програми»: після «з» — родовий відмінок.
const programsGenitive = (count, language) => {
  if (language === 'en') return count === 1 ? 'program' : 'programs';
  return count % 10 === 1 && count % 100 !== 11 ? 'програми' : 'програм';
};

const pluralPrograms = (count, language) => {
  if (language === 'en') return count === 1 ? 'program' : 'programs';
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'програма';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'програми';
  return 'програм';
};

/**
 * Рядок стрічки: «Вам підходить 2 з 3 програм · 1 600–2 500 $», дотик —
 * список програм. Для читача, якому програми не адресовані (агенція, адмін),
 * — просто «3 програми · …».
 */
export const ProgramsSummary = ({
  card,
  viewerType = '',
  facts = null,
  rates,
  displayCurrency,
  onDisplayCurrencyChange,
  language,
  defaultOpen = false,
  onOpen,
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const summary = summarizeCardPrograms(card, { viewerType, facts });
  if (!summary) return null;
  const range = formatPayRange(summary.finals, displayCurrency, rates);
  const headline = summary.matched !== null
    ? uiText('Вам підходить {matched} з {total} {programs}', language, {
      matched: summary.matched,
      total: summary.total,
      programs: programsGenitive(summary.total, language),
    })
    : `${summary.total} ${pluralPrograms(summary.total, language)}`;
  const toggle = event => {
    event.stopPropagation();
    setOpen(previous => !previous);
    if (!open) onOpen?.();
  };

  return (
    <div onClick={event => event.stopPropagation()}>
      <SummaryButton type="button" $match={summary.matched > 0} aria-expanded={open} onClick={toggle} data-testid="programs-summary">
        <SummaryText>
          <b>{headline}</b>
          {summary.allTotal > summary.total && OTHER_TYPE_LABELS[viewerType === 'ed' ? 'sm' : 'ed'] ? (
            <span>
              {uiText('ще {count} — {audience}', language, {
                count: summary.allTotal - summary.total,
                audience: uiText(OTHER_TYPE_LABELS[viewerType === 'ed' ? 'sm' : 'ed'], language),
              })}
            </span>
          ) : null}
        </SummaryText>
        {range ? <SummaryPay>{range}</SummaryPay> : null}
        <Caret $open={open} aria-hidden="true">▼</Caret>
      </SummaryButton>
      {open ? (
        <List>
          <ProgramCurrencySwitch value={displayCurrency} onChange={onDisplayCurrencyChange} language={language} rates={rates} />
          {summary.evaluated.map(({ program }) => (
            <ProgramCard key={program.id} program={program} facts={viewerType === program.type ? facts : null} rates={rates} language={language} />
          ))}
        </List>
      ) : null}
    </div>
  );
};
