import React, { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import {
  PROGRAM_COVERAGE_OPTIONS,
  PROGRAM_TYPE_LABELS,
  defaultProgramBonusKeys,
  describeProgramHighlights,
  describeProgramRequirements,
  evaluateProgram,
  listProgramDifferences,
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
 * Показ програм агенції чи клініки — один на стрічку, прев'ю «Мого профілю»
 * й попередній перегляд у редакторі програм.
 *
 * Програма — це комерційна пропозиція, і читають її двома кроками:
 *
 *  1. **Список** (`AgencyProgramsPanel`) — по рядку на програму: тип і місце,
 *     сума за програму, три-чотири ознаки. Ознаки, якими програма
 *     відрізняється від інших програм того ж типу в цієї агенції,
 *     підсвічені (`listProgramDifferences`): дві донорські програми, що
 *     різняться лише віком і сумою, кажуть саме це, і читати обидві
 *     цілком не треба. Донорці й СМ рядок одразу каже, чи програма їй
 *     підходить.
 *  2. **Деталі** (`ProgramCard`) — під рядком, на дотик: сума й з чого вона
 *     складається, можливі доплати перемикачами («а якщо КС»), вимоги з
 *     позначкою збігу, що покриває агенція, умови.
 *
 * Досі програми стояли повними картками в горизонтальній карусельці над
 * іменем агенції: хто це, читач дізнавався аж під програмами, другу програму
 * треба було гортати вбік, щоб узагалі дізнатись, що вона є, а порожня
 * програма займала пів екрана білим. І кожна картка програми була вкладеною
 * плашкою з тінню й градієнтом усередині картки стрічки — тобто окремим
 * міні-застосунком, а не частиною картки.
 *
 * Мова оформлення — та сама, що в розділах анкети (`ProfileFacts`):
 * волосяна риска між розділами, заголовок з рискою кольору ролі, підпис
 * ліворуч і значення праворуч. Вкладених плашок із фоном у рядку немає
 * (див. «Ліва межа картки одна» в CLAUDE.md).
 *
 * Кожна змінна кольору має запасну: блок живе і в стрічці (`--matching-*`), і
 * в «Моєму профілі», де оголошені лише `--km-*`.
 */

const ACCENT = 'var(--matching-accent, var(--km-accent, #E8791A))';
const BORDER = 'var(--matching-card-border, var(--km-border, #E8E8E2))';
// Текст — зі стрічки, коли блок у стрічці: її палітра своя (`--matching-*`) і
// від теми застосунку не залежить. Успадкований колір там бував білим на
// світлому — суми й вимоги просто зникали.
const TEXT = 'var(--matching-header-text, var(--km-text, #1A1A1A))';
const MUTED = 'var(--matching-muted-text, var(--km-muted, #62665F))';
const GOOD = 'var(--km-success, #2E9B55)';
const BAD = '#C8483E';
const UNSURE = '#B7791F';

const VISIBLE_PROGRAMS = 3;

// --- спільні частини ---------------------------------------------------------

// Заголовок розділу — той самий, що в розділах анкети (`DetailTitle` у
// `ProfileFacts`): риска кольору ролі й короткий жирний підпис.
const SectionTitle = styled.h4`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 2px 8px;
  margin: 0 0 8px;
  font-size: 12.5px;
  font-weight: 700;
  letter-spacing: 0.01em;
  color: ${TEXT};

  &::before {
    content: '';
    flex: 0 0 auto;
    width: 3px;
    height: 13px;
    border-radius: 2px;
    background: ${({ $accent }) => $accent || ACCENT};
  }

  small {
    margin-left: auto;
    white-space: nowrap;
    font-size: 11.5px;
    font-weight: 500;
    color: ${MUTED};
  }
`;

const Section = styled.section`
  padding-top: 12px;
  margin-top: 12px;
  border-top: 1px solid ${BORDER};

  &:first-child {
    margin-top: 0;
    padding-top: 0;
    border-top: 0;
  }
`;

const MoneyRows = styled.dl`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  column-gap: 12px;
  row-gap: 6px;
  margin: 0;
  font-size: 13.5px;
  line-height: 1.4;

  dt { margin: 0; color: ${MUTED}; min-width: 0; }
  dt small { display: block; font-size: 11.5px; }
  dd { margin: 0; color: ${TEXT}; font-weight: 600; text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  dd small { display: block; font-size: 11.5px; font-weight: 500; color: ${MUTED}; }
`;

// Можлива доплата — перемикач, а не рядок: відмічене додається до «разом».
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
  > span { color: ${({ $on }) => ($on ? TEXT : MUTED)}; }
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
  background: ${({ $ok }) => (tone($ok) ? `color-mix(in srgb, ${tone($ok)} 8%, transparent)` : 'transparent')};

  b { font-weight: 700; color: ${({ $ok }) => tone($ok) || TEXT}; }
`;

// Що покриває організація — не вимога, і виглядати як вимога не має: список
// з галочками, а не рамки. Поки обидва ряди були чіпами, «Проїзд» стояв
// одразу під «без КР» і читався ще однією умовою.
const CoverList = styled.ul`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 4px 12px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 13.5px;
  color: ${TEXT};

  li { display: flex; gap: 6px; align-items: baseline; }
  li::before { content: '✓'; color: ${GOOD}; font-weight: 700; }
`;

const Note = styled.p`
  margin: 0;
  font-size: 13.5px;
  line-height: 1.5;
  color: ${TEXT};
  opacity: 0.86;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
`;

const Hint = styled.p`
  margin: 6px 0 0;
  font-size: 11.5px;
  color: ${MUTED};
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

/** Назва програми: тип і місце — те, що відрізняє програми в чатах агенцій. */
export const programHeading = (program, language) => uiText(PROGRAM_TYPE_LABELS[program?.type] || '', language);

// --- деталі програми ---------------------------------------------------------

const Details = styled.div`
  color: ${TEXT};
  font-size: 13.5px;
  line-height: 1.4;
`;

// Попередній перегляд у редакторі показує програму окремо від рядка
// стрічки, тож там вона має власну рамку; у стрічці рамки немає.
const Framed = styled.article`
  padding: 14px;
  border: 1px solid ${BORDER};
  border-radius: var(--km-radius, 14px);
  background: var(--matching-card-bg, var(--km-card, #fff));
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

const Total = styled.div`
  font-size: 24px;
  font-weight: 800;
  line-height: 1.15;
  letter-spacing: -0.01em;
  color: ${TEXT};
  font-variant-numeric: tabular-nums;
`;

const TotalMeta = styled.div`
  margin-top: 3px;
  font-size: 11.5px;
  color: ${MUTED};
  font-variant-numeric: tabular-nums;
`;

const Verdict = styled.p`
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: ${({ $state }) => tone($state === 'match' ? true : $state === 'mismatch' ? false : null)};
`;

/**
 * Одна програма — деталі під рядком списку.
 *
 * Розділи йдуть у порядку, у якому їх питає читачка: скільки (разом за
 * програму, і з чого воно складається) → що може додатись (перемикачі
 * можливих доплат: відмічене додається до «разом») → чи підходжу я
 * (вимоги з позначкою збігу) → що мені покриють → умови. Розділу без
 * даних немає зовсім: програма, де агенція вказала саму суму, — це сума,
 * а не п'ять порожніх заголовків.
 *
 * `facts` — анкета читача (`extractViewerProgramFacts`): коли вона є, кожна
 * вимога показує, чи читач їй відповідає, а доплата за досвід відмічена
 * одразу. `framed` — окрема картка з назвою (попередній перегляд у
 * редакторі); у стрічці назву вже несе рядок списку.
 */
export const ProgramCard = ({ program, facts = null, rates, language, framed = false, accent = '' }) => {
  const [selectedBonuses, setSelectedBonuses] = useState(() => defaultProgramBonusKeys(program, facts));
  useEffect(() => {
    setSelectedBonuses(defaultProgramBonusKeys(program, facts));
  // Ідентичність обʼєктів міняється з кожним перемалюванням кешованої
  // картки; вибір читачки скидають лише факти, від яких залежить початковий.
  }, [program.id, facts?.experience]); // eslint-disable-line react-hooks/exhaustive-deps
  const result = facts ? evaluateProgram(program, facts) : null;
  const checkByKey = new Map((result?.checks || []).map(check => [check.key, check.ok]));
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
  const state = result ? (result.matches ? (result.uncertain ? 'uncertain' : 'match') : 'mismatch') : '';
  const verdictText = {
    match: 'Вам підходить',
    uncertain: 'Може підходити — доповніть анкету',
    mismatch: 'Не підходить за вимогами',
  }[state];
  // Один рядок розбивки, що дорівнює «разом», нічого не пояснює: «Винагорода
  // за цикл 10 000 $» під «Разом 10 000 $» — те саме число двічі.
  const showBreakdown = lines.length > 1 || lines.some(line => line.months);

  const body = (
    <Details data-testid={framed ? undefined : 'program-card'}>
      {total.amount > 0 ? (
        <Section data-testid="program-total">
          <SectionTitle $accent={accent}>
            {uiText('Разом за програму', language)}
            {selectedCount ? <small>{uiText('з обраними доплатами', language)}</small> : null}
          </SectionTitle>
          <Total>{total.approximate ? '≈ ' : ''}{formatParts(total)}</Total>
          {equivalentsLine(total, rates, language) ? <TotalMeta>{equivalentsLine(total, rates, language)}</TotalMeta> : null}
          {selectedCount ? (
            <TotalMeta>{uiText('гарантовано {amount}', language, { amount: formatParts(guaranteed) })}</TotalMeta>
          ) : null}
          {showBreakdown ? (
            <MoneyRows style={{ marginTop: 10 }} aria-label={uiText('Гарантовано', language)}>
              {lines.map(line => {
                const amount = lineAmount(line);
                return (
                  <React.Fragment key={line.key}>
                    <dt>
                      {uiText(line.label, language)}
                      {line.months ? (
                        <small>
                          {formatProgramMoney(line.money.amount, line.money.currency)} × {line.months} {monthWord(line.months, language)}
                          {line.monthsEstimated ? ` · ${uiText('орієнтовно, термін вагітності', language)}` : ''}
                        </small>
                      ) : null}
                    </dt>
                    <dd>{amount.own}{amount.hint ? <small>{amount.hint}</small> : null}</dd>
                  </React.Fragment>
                );
              })}
            </MoneyRows>
          ) : (
            <TotalMeta>{lines[0] ? uiText(lines[0].label, language) : null}</TotalMeta>
          )}
        </Section>
      ) : null}

      {bonuses.length ? (
        <Section>
          <SectionTitle $accent={accent}>
            {uiText('Можливі доплати', language)}
            <small>{uiText('відмітьте, що стосується вас', language)}</small>
          </SectionTitle>
          {bonuses.map(item => (
            <BonusRow
              key={item.key}
              type="button"
              role="checkbox"
              aria-checked={item.selected}
              $on={item.selected}
              onClick={() => toggleBonus(item.key)}
            >
              <i aria-hidden="true">{item.selected ? '✓' : ''}</i>
              <span>{uiText(item.label, language)}</span>
              <b>+{formatProgramMoney(item.money.amount, item.money.currency)}</b>
            </BonusRow>
          ))}
        </Section>
      ) : null}

      {requirements.length ? (
        <Section>
          <SectionTitle $accent={accent}>{uiText('Вимоги', language)}</SectionTitle>
          {verdictText ? <Verdict $state={state} style={{ marginBottom: 8 }}>{uiText(verdictText, language)}</Verdict> : null}
          <Chips>
            {requirements.map(item => {
              const ok = checkByKey.has(item.key) ? checkByKey.get(item.key) : undefined;
              return (
                <Chip key={item.key} $ok={ok}>
                  {ok === true ? <b aria-hidden="true">✓</b> : ok === false ? <b aria-hidden="true">✕</b> : null}
                  {uiText(item.text, language, item.variables)}
                </Chip>
              );
            })}
          </Chips>
          {unknown.length ? <Hint>{[...new Set(unknown)].map(hint => uiText(hint, language)).join(' · ')}</Hint> : null}
        </Section>
      ) : null}

      {coverage.length ? (
        <Section>
          <SectionTitle $accent={accent}>{uiText('Що покриває', language)}</SectionTitle>
          <CoverList>
            {coverage.map(option => <li key={option.key}>{uiText(option.label, language)}</li>)}
          </CoverList>
        </Section>
      ) : null}

      {program.note ? (
        <Section>
          <SectionTitle $accent={accent}>{uiText('Умови й примітки', language)}</SectionTitle>
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
        {program.location ? <span>{program.location}</span> : null}
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

const pluralPrograms = (count, language) => {
  if (language === 'en') return count === 1 ? 'program' : 'programs';
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'програма';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'програми';
  return 'програм';
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
  flex-direction: column;
  gap: 3px;
  margin-bottom: 4px;
`;

const PanelLine = styled.p`
  margin: 0;
  font-size: 12.5px;
  color: ${({ $match }) => ($match ? GOOD : MUTED)};
  font-weight: ${({ $match }) => ($match ? 600 : 400)};

  em { font-style: normal; font-weight: 700; color: ${TEXT}; font-variant-numeric: tabular-nums; }
`;

const ProgramList = styled.ol`
  margin: 0;
  padding: 0;
  list-style: none;
`;

const ProgramItem = styled.li`
  border-top: 1px solid ${BORDER};

  &:first-child { border-top: 0; }
`;

const ProgramButton = styled.button`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 4px 12px;
  width: 100%;
  min-height: 56px;
  padding: 10px 0;
  border: 0;
  background: transparent;
  color: ${TEXT};
  font: inherit;
  text-align: left;
  cursor: pointer;

  &:focus-visible { outline: 2px solid ${ACCENT}; outline-offset: 2px; border-radius: 8px; }
`;

const ProgramTitle = styled.span`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 2px 6px;
  min-width: 0;
  font-size: 14.5px;
  line-height: 1.3;

  b { font-weight: 700; }
  > span { color: ${MUTED}; }
  > span.differs { color: ${TEXT}; }
`;

// Значок збігу — колір і форма, а не лише колір: ✓ / ✕ / ?.
const FitMark = styled.i`
  display: inline-grid;
  place-items: center;
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  font-size: 11px;
  font-style: normal;
  font-weight: 800;
  color: #fff;
  background: ${({ $state }) => tone($state === 'match' ? true : $state === 'mismatch' ? false : null)};
`;

const ProgramPay = styled.span`
  grid-row: span 2;
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;

  > span { display: flex; flex-direction: column; align-items: flex-end; }
  b { font-size: 16px; font-weight: 800; font-variant-numeric: tabular-nums; }
  small { font-size: 11px; color: ${MUTED}; }
  > i {
    font-style: normal;
    font-size: 11px;
    color: ${MUTED};
    transform: rotate(${({ $open }) => ($open ? '180deg' : '0deg')});
    transition: transform 0.15s ease;
  }
`;

// Крапка-роздільник висить у проміжку перед ознакою; на початку перенесеного
// рядка вона виходить за ліву межу й обрізається (`overflow: hidden`), тож
// рядок ніколи не починається з «·».
const Highlights = styled.span`
  display: flex;
  flex-wrap: wrap;
  gap: 2px 14px;
  min-width: 0;
  overflow: hidden;
  font-size: 12.5px;
  line-height: 1.4;
  color: ${MUTED};

  > span { position: relative; }
  > span + span::before { content: '·'; position: absolute; left: -9px; color: ${MUTED}; }
  > span.differs { color: ${TEXT}; font-weight: 500; }
`;

const ProgramBody = styled.div`
  padding: 2px 0 14px;
`;

const MoreButton = styled.button`
  width: 100%;
  min-height: 40px;
  border: 0;
  border-top: 1px solid ${BORDER};
  background: transparent;
  color: ${ACCENT};
  font: inherit;
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
`;

const highlightText = (item, language) => {
  if (item.key === 'bonuses') return `+${item.variables.count} ${uiText(pluralBonuses(item.variables.count, language), language)}`;
  if (item.key === 'coverage') return uiText('покриття: {count}', language, item.variables);
  return uiText(item.text, language, item.variables);
};

const programFitState = result => {
  if (!result) return '';
  if (!result.matches) return 'mismatch';
  return result.uncertain ? 'uncertain' : 'match';
};

const FIT_LABELS = Object.freeze({ match: 'Вам підходить', uncertain: 'Може підходити', mismatch: 'Не підходить' });
const FIT_MARKS = Object.freeze({ match: '✓', uncertain: '?', mismatch: '✕' });

/**
 * Рядок списку — сама пропозиція одним поглядом.
 *
 * Ліворуч тип і місце, під ними до чотирьох ознак; праворуч сума за
 * програму. Ознаки, якими програма відрізняється від інших програм того
 * ж типу (`differs`), стоять першими й темнішим кольором — решта сіра.
 */
const ProgramListItem = ({ program, open, onToggle, facts, rates, language, differs, accent }) => {
  const result = facts ? evaluateProgram(program, facts) : null;
  const fit = programFitState(result);
  const breakdown = programBreakdown(program, { rates });
  const pay = breakdown.guaranteed.amount > 0
    ? `${breakdown.guaranteed.approximate ? '≈ ' : ''}${formatParts(breakdown.guaranteed)}`
    : '';
  const highlights = useMemo(() => {
    const items = describeProgramHighlights(program);
    const flagged = items.map(item => ({ ...item, differs: Boolean(differs?.has(item.key)) }));
    return [...flagged.filter(item => item.differs), ...flagged.filter(item => !item.differs)].slice(0, 4);
  }, [differs, program]);
  const bodyId = `program-body-${program.id}`;

  return (
    <ProgramItem data-testid="program-list-item">
      <ProgramButton type="button" aria-expanded={open} aria-controls={open ? bodyId : undefined} onClick={event => { event.stopPropagation(); onToggle(); }}>
        <ProgramTitle>
          {fit ? <FitMark role="img" $state={fit} title={uiText(FIT_LABELS[fit], language)} aria-label={uiText(FIT_LABELS[fit], language)}>{FIT_MARKS[fit]}</FitMark> : null}
          <b>{programHeading(program, language)}</b>
          {program.location ? <span className={differs?.has('location') ? 'differs' : undefined}>{program.location}</span> : null}
        </ProgramTitle>
        <ProgramPay $open={open}>
          <span>
            {pay ? <b>{pay}</b> : <small>{uiText('сума — у агенції', language)}</small>}
            {pay ? <small>{uiText('за програму', language)}</small> : null}
          </span>
          <i aria-hidden="true">▼</i>
        </ProgramPay>
        {highlights.length ? (
          <Highlights>
            {highlights.map(item => <span key={item.key} className={item.differs ? 'differs' : undefined}>{highlightText(item, language)}</span>)}
          </Highlights>
        ) : <span />}
      </ProgramButton>
      {open ? (
        <ProgramBody id={bodyId}>
          <ProgramCard program={program} facts={facts} rates={rates} language={language} accent={accent} />
        </ProgramBody>
      ) : null}
    </ProgramItem>
  );
};

/**
 * Програми агенції в картці стрічки.
 *
 * Угорі — одним рядком, що тут є: донорці чи СМ «Вам підходить 2 з 3
 * програм», решті «3 програми»; під ним суми за програму (кожен тип — своїм
 * діапазоном: «1 600–23 000 $» не каже нічого ні донорці, ні СМ). Далі
 * список, по рядку на програму, перші три; решта — «Показати ще». Дотик до
 * рядка розгортає деталі просто під ним, відкритою буває одна програма.
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
  accent = '',
  onOpen,
}) => {
  const [openId, setOpenId] = useState(defaultOpenId);
  const [showAll, setShowAll] = useState(false);
  const summary = summarizeCardPrograms(card, { viewerType, facts });
  const programs = useMemo(() => (summary ? summary.evaluated.map(item => item.program) : []), [summary]);
  const differences = useMemo(() => listProgramDifferences(programs), [programs]);
  if (!summary) return null;
  const perType = !viewerType && summary.byType.length > 1
    ? summary.byType.map(item => ({ type: item.type, range: formatPayRange(item.totals, displayCurrency, rates) }))
    : null;
  // Одну програму сума вже називає її рядок — діапазон над ним повторив би те
  // саме число.
  const range = perType || summary.total < 2 ? '' : formatPayRange(summary.finals, displayCurrency, rates);
  // Донорка, якій агенція пропонує самі програми СМ: «Вам підходить 0 з 0»
  // не каже нічого — каже рядок «ще N — для сурогатних мам» нижче.
  const headline = summary.total === 0
    ? uiText('Програм для вас поки немає', language)
    : summary.matched !== null
    ? uiText('Вам підходить {matched} з {total} {programs}', language, {
      matched: summary.matched,
      total: summary.total,
      programs: programsGenitive(summary.total, language),
    })
    : `${summary.total} ${uiText(pluralPrograms(summary.total, language), language)}`;
  const otherType = viewerType === 'ed' ? 'sm' : 'ed';
  const othersCount = summary.allTotal - summary.total;
  const visible = showAll ? programs : programs.slice(0, VISIBLE_PROGRAMS);
  const hiddenCount = programs.length - visible.length;
  const toggle = id => {
    setOpenId(current => (current === id ? '' : id));
    if (openId !== id) onOpen?.(id);
  };

  return (
    <Panel data-testid="programs-summary" onClick={event => event.stopPropagation()}>
      <PanelHead>
        <SectionTitle $accent={accent} style={{ marginBottom: 0 }}>{uiText('Програми', language)}</SectionTitle>
        <PanelLine $match={summary.matched > 0}>
          {headline}
          {range ? <> · <em>{range}</em> {uiText('за програму', language)}</> : null}
        </PanelLine>
        {perType ? perType.map(item => (
          <PanelLine key={item.type}>
            {uiText(PROGRAM_TYPE_LABELS[item.type], language)}
            {item.range ? <> · <em>{item.range}</em></> : null}
          </PanelLine>
        )) : null}
      </PanelHead>
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
              accent={accent}
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
        <PanelLine style={{ marginTop: 4 }}>
          {uiText('ще {count} — {audience}', language, {
            count: othersCount,
            audience: uiText(OTHER_TYPE_LABELS[otherType], language),
          })}
        </PanelLine>
      ) : null}
      {openId && onDisplayCurrencyChange ? (
        <div style={{ marginTop: 6 }}>
          <ProgramCurrencySwitch value={displayCurrency} onChange={onDisplayCurrencyChange} language={language} rates={rates} />
        </div>
      ) : null}
    </Panel>
  );
};

// Стара назва: рядок стрічки звав блок саме так.
export const ProgramsSummary = AgencyProgramsPanel;
