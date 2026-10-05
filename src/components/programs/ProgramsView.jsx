import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import {
  PROGRAM_COVERAGE_OPTIONS,
  PROGRAM_TYPE_LABELS,
  defaultProgramBonusKeys,
  describeProgramRequirements,
  evaluateProgram,
  programBreakdown,
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
 *
 * Шкала тексту тут одна на весь блок і не росте від місця до місця:
 * підпис розділу 11 px великими (`SectionLabel`), рядок 13 px, головна сума
 * 26 px, приглушене пояснення 11.5 px. Сума в рядку стрічки й «разом» у
 * картці програми — те саме число (`programBreakdown`).
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
  span { font-size: 12px; color: ${MUTED}; }
  em { font-style: normal; font-weight: 700; color: ${TEXT}; font-variant-numeric: tabular-nums; }
`;

const SummaryPay = styled.span`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  margin-left: auto;
  font-size: 15px;
  font-weight: 800;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;

  small { font-size: 11px; font-weight: 500; color: ${MUTED}; }
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
  border-top: 4px solid ${({ $state }) => ($state === 'match' ? GOOD : $state === 'mismatch' ? BAD : ACCENT)};
  border-radius: 15px;
  padding: 14px;
  background: var(--matching-card-bg, var(--km-card, #fff));
  box-shadow: 0 8px 24px color-mix(in srgb, ${TEXT} 7%, transparent);
  display: flex;
  flex-direction: column;
  gap: 12px;
  font-size: 13px;
  line-height: 1.35;
  opacity: ${({ $state }) => ($state === 'mismatch' ? 0.82 : 1)};
`;

const CardHead = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;

  b { font-size: 16px; font-weight: 800; }
  span { color: ${MUTED}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
`;

const Verdict = styled.span`
  && {
    margin-left: auto;
    flex: 0 0 auto;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 11.5px;
    font-weight: 700;
    color: ${({ $ok }) => ($ok ? GOOD : BAD)};
    background: color-mix(in srgb, ${({ $ok }) => ($ok ? GOOD : BAD)} 10%, transparent);
  }
`;

const SectionLabel = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: ${MUTED};

  small { font-size: 11px; font-weight: 500; letter-spacing: 0; text-transform: none; }
`;

const Hero = styled.div`
  padding: 13px 14px;
  border: 1px solid color-mix(in srgb, ${ACCENT} 22%, transparent);
  border-radius: 12px;
  background: linear-gradient(135deg, color-mix(in srgb, ${ACCENT} 13%, transparent), color-mix(in srgb, ${ACCENT} 4%, transparent));
`;

const HeroAmount = styled.div`
  font-size: 26px;
  font-weight: 800;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
`;

const Muted = styled.div`
  margin-top: 3px;
  font-size: 11.5px;
  color: ${MUTED};
  font-variant-numeric: tabular-nums;
`;

const Rows = styled.div`
  display: flex;
  flex-direction: column;
  padding: 2px 10px;
  border-radius: 10px;
  background: color-mix(in srgb, ${MUTED} 5%, transparent);
`;

const Row = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: baseline;
  gap: 10px;
  padding: 5px 0;
  border-top: 1px solid ${({ $first }) => ($first ? 'transparent' : `color-mix(in srgb, ${BORDER} 70%, transparent)`)};

  > span { color: ${MUTED}; }
  > span small { display: block; font-size: 11.5px; }
  > b { font-weight: 600; text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  > b small { display: block; font-size: 11.5px; font-weight: 500; color: ${MUTED}; }
`;

// Можлива доплата — перемикач, а не рядок: відмічене додається до «разом».
// Увесь рядок — одна кнопка: квадратик 14 px сам по собі не мішень для пальця.
const BonusRow = styled.button`
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 34px;
  padding: 4px 0;
  border: 0;
  border-top: 1px solid ${({ $first }) => ($first ? 'transparent' : `color-mix(in srgb, ${BORDER} 70%, transparent)`)};
  background: transparent;
  color: ${TEXT};
  font: inherit;
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
  > span { color: ${({ $on }) => ($on ? TEXT : MUTED)}; }
  > b { font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; color: ${({ $on }) => ($on ? TEXT : MUTED)}; }

  &:focus-visible { outline: 2px solid ${ACCENT}; outline-offset: 2px; border-radius: 6px; }
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

// Що покриває організація — не вимога, і виглядати як вимога не має: без рамки,
// з галочкою, на тлі. Поки обидва ряди чіпів були однакові, «Проїзд» стояв
// одразу під «без КР» і читався ще однією умовою.
const CoverChip = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 12px;
  color: ${TEXT};
  background: color-mix(in srgb, ${MUTED} 10%, transparent);

  &::before { content: '✓'; color: ${GOOD}; font-weight: 700; }
`;

const Note = styled.p`
  margin: 0;
  font-size: 12px;
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

const formatParts = sum => sum.parts
  .filter(part => part.amount > 0)
  .map(part => formatProgramMoney(part.amount, part.currency))
  .join(' + ');

/** Еквіваленти суми в двох інших валютах — один рядок, з «≈» і датою курсу. */
const equivalentsLine = (sum, rates, language) => {
  if (sum.parts.length !== 1 || !(sum.amount > 0)) return '';
  const described = describeProgramMoney({ amount: sum.amount, currency: sum.currency }, rates);
  if (!described?.equivalents.length) return '';
  const date = rates?.rateDate ? ` · ${uiText('курс НБУ на {date}', language, { date: formatRateDate(rates.rateDate) })}` : '';
  return `${described.equivalents.map(item => item.text).join(' · ')}${date}`;
};

const monthWord = (count, language) => {
  if (language === 'en') return count === 1 ? 'month' : 'months';
  return 'міс';
};

/**
 * Одна програма — калькулятор заробітку.
 *
 * Зверху одне число: **разом за програму** — гарантовані виплати (фінальна,
 * щомісячні × місяці, перенос, договір, дописані агенцією) плюс відмічені
 * можливі доплати; під ним еквіваленти за курсом НБУ. Нижче — з чого воно
 * складається, рядок на виплату, і можливі доплати перемикачами: читачка
 * відмічає, що стосується її, і «разом» перераховується. Досі над
 * розбивкою стояли два великі числа — «загальна сума» й «фінальна виплата»,
 * — і саме загальна не враховувала щомісячних, тобто показувала менше, ніж
 * агенція платить.
 *
 * `facts` — анкета читача (`extractViewerProgramFacts`): коли вона є, кожна
 * вимога показує, чи читач їй відповідає, а доплата за досвід відмічена
 * одразу.
 */
export const ProgramCard = ({ program, facts = null, rates, language, compactNote = false }) => {
  const [selectedBonuses, setSelectedBonuses] = useState(() => defaultProgramBonusKeys(program, facts));
  useEffect(() => {
    setSelectedBonuses(defaultProgramBonusKeys(program, facts));
  // Ідентичність обʼєктів міняється з кожним перемалюванням кешованої
  // картки; вибір читачки скидають лише факти, від яких залежить початковий.
  }, [program.id, facts?.experience]); // eslint-disable-line react-hooks/exhaustive-deps
  const result = facts ? evaluateProgram(program, facts) : null;
  const checkByKey = new Map((result?.checks || []).map(check => [check.key, check.ok]));
  const state = result ? (result.matches ? 'match' : 'mismatch') : 'neutral';
  const breakdown = programBreakdown(program, { selectedBonusKeys: selectedBonuses, rates });
  const { lines, bonuses, total, guaranteed } = breakdown;
  const selectedCount = bonuses.filter(item => item.selected).length;
  const requirements = describeProgramRequirements(program);
  const unknown = requirements.filter(item => checkByKey.get(item.key) === null).map(item => REQUIREMENT_FIX_HINTS[item.key]);
  const coverage = PROGRAM_COVERAGE_OPTIONS.filter(option => program.coverage?.includes(option.key));
  const toggleBonus = key => setSelectedBonuses(current => (current.includes(key)
    ? current.filter(item => item !== key)
    : [...current, key]));
  const lineAmount = line => {
    const own = formatProgramMoney(line.subtotal.amount, line.subtotal.currency);
    // Виплата в іншій валюті, ніж «разом», показує й свій внесок у суму —
    // інакше «разом» не звірити з рядками.
    if (line.subtotal.currency === breakdown.baseCurrency) return { own };
    const described = describeProgramMoney({ amount: line.subtotal.amount, currency: line.subtotal.currency }, rates);
    const inBase = described?.equivalents.find(item => item.currency === breakdown.baseCurrency);
    return { own, hint: inBase?.text || '' };
  };

  return (
    <Card $state={state} data-testid="program-card">
      <CardHead>
        <b>{uiText(PROGRAM_TYPE_LABELS[program.type], language)}</b>
        {program.location ? <span>{program.location}</span> : null}
        {result ? <Verdict $ok={result.matches}>{uiText(result.matches ? 'Вам підходить' : 'Не підходить', language)}</Verdict> : null}
      </CardHead>

      {total.amount > 0 ? (
        <Hero data-testid="program-total">
          <SectionLabel>
            {uiText('Разом за програму', language)}
            {selectedCount ? <small>{uiText('з обраними доплатами', language)}</small> : null}
          </SectionLabel>
          <HeroAmount>{total.approximate ? '≈ ' : ''}{formatParts(total)}</HeroAmount>
          {equivalentsLine(total, rates, language) ? <Muted>{equivalentsLine(total, rates, language)}</Muted> : null}
          {selectedCount ? (
            <Muted>{uiText('гарантовано {amount}', language, { amount: formatParts(guaranteed) })}</Muted>
          ) : null}
        </Hero>
      ) : null}

      {lines.length ? (
        <div>
          <SectionLabel>{uiText('Гарантовано', language)}</SectionLabel>
          <Rows>
            {lines.map((line, index) => {
              const amount = lineAmount(line);
              return (
                <Row key={line.key} $first={index === 0}>
                  <span>
                    {uiText(line.label, language)}
                    {line.months ? (
                      <small>
                        {formatProgramMoney(line.money.amount, line.money.currency)} × {line.months} {monthWord(line.months, language)}
                        {line.monthsEstimated ? ` · ${uiText('орієнтовно, термін вагітності', language)}` : ''}
                      </small>
                    ) : null}
                  </span>
                  <b>{amount.own}{amount.hint ? <small>{amount.hint}</small> : null}</b>
                </Row>
              );
            })}
          </Rows>
        </div>
      ) : null}

      {bonuses.length ? (
        <div>
          <SectionLabel>
            {uiText('Можливі доплати', language)}
            <small>{uiText('відмітьте, що стосується вас', language)}</small>
          </SectionLabel>
          <Rows>
            {bonuses.map((item, index) => (
              <BonusRow
                key={item.key}
                type="button"
                role="checkbox"
                aria-checked={item.selected}
                $on={item.selected}
                $first={index === 0}
                onClick={() => toggleBonus(item.key)}
              >
                <i aria-hidden="true">{item.selected ? '✓' : ''}</i>
                <span>{uiText(item.label, language)}</span>
                <b>+{formatProgramMoney(item.money.amount, item.money.currency)}</b>
              </BonusRow>
            ))}
          </Rows>
        </div>
      ) : null}

      {requirements.length ? (
        <div>
          <SectionLabel>{uiText('Вимоги', language)}</SectionLabel>
          <Chips>
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
          {unknown.length ? <Note style={{ marginTop: 6 }}>{[...new Set(unknown)].map(hint => uiText(hint, language)).join(' · ')}</Note> : null}
        </div>
      ) : null}

      {coverage.length ? (
        <div>
          <SectionLabel>{uiText('Що покриває', language)}</SectionLabel>
          <Chips>
            {coverage.map(option => <CoverChip key={option.key}>{uiText(option.label, language)}</CoverChip>)}
          </Chips>
        </div>
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
  // «≈» — коли хоч одну суму перераховано за курсом: у валюту читача або ще
  // всередині програми (виплата агенції в іншій валюті, `programBreakdown`).
  const converted = values.some(item => item.money.currency !== displayCurrency || item.money.approximate);
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
  // Програми донорок і СМ в одному діапазоні дають «1 600–23 000 $» — число,
  // яке не каже нічого жодній з них. Читачеві без свого типу (агенція,
  // адмін, прев'ю у «Моєму профілі») кожен тип іде своїм рядком.
  const perType = !viewerType && summary.byType.length > 1
    ? summary.byType.map(item => ({ type: item.type, range: formatPayRange(item.totals, displayCurrency, rates) }))
    : null;
  const range = perType ? '' : formatPayRange(summary.finals, displayCurrency, rates);
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
          {perType ? perType.map(item => (
            <span key={item.type}>
              {uiText(PROGRAM_TYPE_LABELS[item.type], language)}
              {item.range ? <> · <em>{item.range}</em></> : null}
            </span>
          )) : null}
          {summary.allTotal > summary.total && OTHER_TYPE_LABELS[viewerType === 'ed' ? 'sm' : 'ed'] ? (
            <span>
              {uiText('ще {count} — {audience}', language, {
                count: summary.allTotal - summary.total,
                audience: uiText(OTHER_TYPE_LABELS[viewerType === 'ed' ? 'sm' : 'ed'], language),
              })}
            </span>
          ) : null}
        </SummaryText>
        {range ? (
          <SummaryPay>
            {range}
            <small>{uiText('за програму', language)}</small>
          </SummaryPay>
        ) : null}
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
