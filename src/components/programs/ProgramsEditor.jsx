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
 * Програм буває кілька — Україна й Грузія, різний вік, різні доплати, — і
 * кожна тут окрема картка. Згорнута вона каже одним рядком, що це за програма
 * й скільки платить; розгорнута — питає поля групами в тому порядку, у якому
 * їх читає донорка: кого шукаєте, де, вимоги, виплати, можливі доплати, що
 * покриваєте. Під формою — та сама картка, яку побачить донорка
 * (`ProgramCard`).
 *
 * Зберігається все саме, без кнопки: зміна лягає в базу за мить після
 * останнього дотику (`SAVE_DELAY_MS`) і ще раз — коли редактор закривають.
 * «Копія» — найшвидший спосіб завести другу програму: здебільшого вони
 * відрізняються віком і сумою, а не всім. Стрілки ставлять найцікавішу
 * програму першою, а «Сховати» знімає неактуальну з показу, не стираючи.
 *
 * Назви інших доплат підказує словник (`suggestions`): те, що вже написали
 * інші агенції (`multiData/programTerms`). Одне й те саме «за вагітність з
 * першого разу» інакше мало б стільки написань, скільки агенцій.
 */

const SAVE_DELAY_MS = 700;

const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 0;
`;

const EditorGuide = styled.div`
  display: grid;
  gap: 9px;
  padding: 13px 14px;
  border: 1px solid color-mix(in srgb, var(--km-accent, #E8791A) 24%, var(--km-border, #e7e1d8));
  border-radius: 14px;
  background: color-mix(in srgb, var(--km-accent, #E8791A) 6%, var(--km-card, #fff));

  > b { font-size: 14px; line-height: 1.35; }
  > span { color: var(--km-muted, #6f675f); font-size: 12px; line-height: 1.45; }
  > div { display: flex; flex-wrap: wrap; gap: 6px; }
  small {
    padding: 4px 8px;
    border-radius: 999px;
    background: var(--km-card, #fff);
    color: var(--km-muted, #6f675f);
    font-size: 11px;
    font-weight: 600;
  }
`;

const ProgramBox = styled.div`
  border: 1px ${({ $hidden }) => ($hidden ? 'dashed' : 'solid')} var(--km-border, #e7e1d8);
  border-left: 4px solid ${({ $hidden, $incomplete }) => ($hidden ? 'var(--km-muted, #6f675f)' : $incomplete ? '#D99A25' : 'var(--km-accent, #E8791A)')};
  border-radius: 14px;
  overflow: hidden;
`;

const HiddenMark = styled.em`
  font-style: normal;
  font-size: 11px;
  font-weight: 700;
  color: var(--km-muted, #6f675f);
`;

const MonthsRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  margin-top: 2px;
  font-size: 12px;
  color: var(--km-muted, #6f675f);
`;

const MonthsInput = styled.input`
  box-sizing: border-box;
  width: 56px;
  min-height: 34px;
  padding: 0 8px;
  border: 1px solid var(--km-border, #e7e1d8);
  border-radius: 9px;
  background: var(--km-bg, #faf8f5);
  color: var(--km-text, inherit);
  font: inherit;
  font-size: 15px;
  text-align: center;
`;

// Підсумок рахується з тих самих виплат і тим самим кодом, що й у картці
// програми (`programBreakdown`): агенція бачить число, яке побачить донорка.
const TotalBox = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--km-accent, #E8791A) 8%, transparent);

  > div { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
  > div span { font-size: 13px; color: var(--km-muted, #6f675f); }
  > div b { font-size: 16px; font-weight: 800; font-variant-numeric: tabular-nums; white-space: nowrap; }
  > div:first-child b { font-size: 20px; }
  small { font-size: 11.5px; line-height: 1.45; color: var(--km-muted, #6f675f); }
`;

const formatSumParts = sum => sum.parts
  .filter(part => part.amount > 0)
  .map(part => formatProgramMoney(part.amount, part.currency))
  .join(' + ');

const Hint = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--km-muted, #6f675f);
`;

const ProgramHead = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  padding: 12px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--km-accent, #E8791A) 7%, var(--km-card, #fff)), var(--km-card, #fff));
`;

const HeadText = styled.button`
  /* Кнопок у шапці пʼять (вище, нижче, сховати, копія, видалити); на
     вузькому екрані вони переносяться під назву, а не стискають її. */
  flex: 1 1 180px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;

  b { font-size: 15px; }
  span { font-size: 12px; color: var(--km-muted, #6f675f); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
`;

const HeadStatus = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  align-self: flex-start;
  padding: 4px 8px;
  border-radius: 999px;
  color: ${({ $complete }) => ($complete ? '#247a43' : '#9a6610')};
  background: ${({ $complete }) => ($complete ? '#ebf8ef' : '#fff4dc')};
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
`;

const SmallButton = styled.button`
  flex: 0 0 auto;
  min-height: 32px;
  padding: 0 10px;
  border-radius: 9px;
  border: 1px solid ${({ $danger }) => ($danger ? 'color-mix(in srgb, #C8483E 45%, transparent)' : 'var(--km-border, #e7e1d8)')};
  background: var(--km-card, #fff);
  color: ${({ $danger }) => ($danger ? '#C8483E' : 'inherit')};
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
`;

const HeadActions = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
`;

const MoreActions = styled.details`
  position: relative;
  summary {
    display: grid;
    place-items: center;
    width: 34px;
    min-height: 32px;
    border: 1px solid var(--km-border, #e7e1d8);
    border-radius: 9px;
    background: var(--km-card, #fff);
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
    min-width: 150px;
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 5px;
    border: 1px solid var(--km-border, #e7e1d8);
    border-radius: 10px;
    background: var(--km-card, #fff);
    box-shadow: 0 10px 28px rgba(30, 27, 24, .14);
  }
`;

const Body = styled.div`
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 14px 12px;
  background: color-mix(in srgb, var(--km-bg, #faf8f5) 54%, var(--km-card, #fff));
`;

const Group = styled.fieldset`
  /* fieldset за замовчуванням не стискається нижче за вміст
     (min-inline-size: min-content), і перемикач валют вилазив за край
     картки, обрізаючи «₴». */
  min-width: 0;
  margin: 0;
  padding: 12px;
  border: 1px solid var(--km-border, #e7e1d8);
  border-radius: 12px;
  background: var(--km-card, #fff);
  display: flex;
  flex-direction: column;
  gap: 8px;

  legend {
    padding: 0 5px;
    margin-left: -5px;
    margin-bottom: 2px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--km-muted, #6f675f);
  }
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));
  gap: 8px;
`;

const SmallLabel = styled.label`
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--km-muted, #6f675f);
  min-width: 0;
`;

const TextInput = styled.input`
  box-sizing: border-box;
  width: 100%;
  min-height: 40px;
  padding: 0 12px;
  border: 1px solid var(--km-border, #e7e1d8);
  border-radius: 10px;
  background: var(--km-bg, #faf8f5);
  color: var(--km-text, inherit);
  font: inherit;
  font-size: 15px;
`;

const TextArea = styled.textarea`
  box-sizing: border-box;
  width: 100%;
  min-height: 64px;
  padding: 10px 12px;
  border: 1px solid var(--km-border, #e7e1d8);
  border-radius: 10px;
  background: var(--km-bg, #faf8f5);
  color: var(--km-text, inherit);
  font: inherit;
  font-size: 14px;
  resize: vertical;
`;

const Segments = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

const Segment = styled.button`
  min-height: 34px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid ${({ $on }) => ($on ? 'var(--km-accent, #E8791A)' : 'var(--km-border, #e7e1d8)')};
  background: ${({ $on }) => ($on ? 'color-mix(in srgb, var(--km-accent, #E8791A) 14%, transparent)' : 'transparent')};
  color: ${({ $on }) => ($on ? 'var(--km-accent, #E8791A)' : 'inherit')};
  font: inherit;
  font-size: 13px;
  font-weight: ${({ $on }) => ($on ? 700 : 500)};
  cursor: pointer;
`;

const OtherRow = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr) auto;
  gap: 6px;
  align-items: start;

  @media (max-width: 480px) {
    grid-template-columns: minmax(0, 1fr) auto;
    > :nth-child(2) { grid-column: 1 / -1; grid-row: 2; }
  }
`;

const AddButton = styled.button`
  min-height: 44px;
  border-radius: 12px;
  border: 1px dashed color-mix(in srgb, var(--km-accent, #E8791A) 50%, transparent);
  background: transparent;
  color: var(--km-accent, #E8791A);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
`;

const PreviewLabel = styled.div`
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--km-muted, #6f675f);
`;

const PreviewDisclosure = styled.details`
  border-top: 1px solid var(--km-border, #e7e1d8);
  padding-top: 10px;
  summary { cursor: pointer; list-style: none; }
  summary::-webkit-details-marker { display: none; }
  &[open] summary { margin-bottom: 10px; }
`;

const Choice = ({ options, value, onChange, language }) => (
  <Segments>
    {options.map(option => (
      <Segment key={option.key} type="button" $on={value === option.key} aria-pressed={value === option.key} onClick={() => onChange(option.key)}>
        {uiText(option.label, language)}
      </Segment>
    ))}
  </Segments>
);

const summaryLine = (program, language) => {
  const normalized = normalizeProgram(program, program.id);
  const guaranteed = normalized ? programBreakdown(normalized).guaranteed : null;
  const useGuaranteed = guaranteed && guaranteed.parts.length === 1 && guaranteed.amount > 0;
  const pay = useGuaranteed ? { amount: guaranteed.amount, currency: guaranteed.currency } : programHeadlinePay(program);
  const amount = Number(pay?.amount);
  const prefix = useGuaranteed && guaranteed.approximate ? '≈ ' : '';
  return [
    program.location,
    Number.isFinite(amount) && amount > 0 ? `${prefix}${formatProgramMoney(amount, pay.currency)}` : uiText('виплату не вказано', language),
  ].filter(Boolean).join(' · ');
};

const LabeledPayments = ({ items, onChange, listId, suggestions, placeholder, addLabel, removeLabel, currency, language, rates }) => {
  const setItem = (index, patch) => onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
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
          <MoneyInput language={language} rates={rates} value={item} onChange={money => setItem(index, money)} />
          <SmallButton type="button" $danger aria-label={uiText(removeLabel, language)} onClick={() => onChange(items.filter((_, i) => i !== index))}>✕</SmallButton>
        </OtherRow>
      ))}
      <SmallButton type="button" onClick={() => onChange([...items, { label: '', amount: '', currency }])}>
        + {uiText(addLabel, language)}
      </SmallButton>
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

const ProgramForm = ({ program, onChange, language, rates, suggestions }) => {
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
  // Загальну суму агенція більше не вводить: її рахує `programBreakdown` з
  // виплат вище — і рахує так само, як побачить донорка. Ручне поле було
  // третім джерелом правди поруч із виплатами й підсумком і розходилось з
  // обома, щойно змінювалась хоч одна виплата.
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

  return (
    <Body>
      <Group>
        <legend>{uiText('Кого шукаєте', language)}</legend>
        <Choice
          language={language}
          value={program.type}
          onChange={type => set({ type })}
          options={PROGRAM_TYPES.map(key => ({ key, label: PROGRAM_TYPE_LABELS[key] }))}
        />
      </Group>

      <Group>
        <legend>{uiText('Програма', language)}</legend>
        <SmallLabel>
          {uiText('Де проходить', language)}
          <TextInput value={program.location || ''} placeholder={uiText('Наприклад: Київ; пологи в Грузії', language)} onChange={event => set({ location: event.target.value })} />
        </SmallLabel>
        <SmallLabel>
          {uiText('Примітка', language)}
          <TextArea value={program.note || ''} placeholder={uiText('Що ще важливо знати', language)} onChange={event => set({ note: event.target.value })} />
        </SmallLabel>
      </Group>

      <Group>
        <legend>{uiText('Вимоги', language)}</legend>
        <Grid>
          <SmallLabel>{uiText('Вік від', language)}<TextInput inputMode="numeric" value={program.requirements?.ageFrom ?? ''} onChange={event => setReq({ ageFrom: event.target.value })} /></SmallLabel>
          <SmallLabel>{uiText('Вік до', language)}<TextInput inputMode="numeric" value={program.requirements?.ageTo ?? ''} onChange={event => setReq({ ageTo: event.target.value })} /></SmallLabel>
          <SmallLabel>{uiText('ІМТ до', language)}<TextInput inputMode="decimal" value={program.requirements?.bmiMax ?? ''} onChange={event => setReq({ bmiMax: event.target.value })} /></SmallLabel>
          <SmallLabel>{uiText('Зріст від, см', language)}<TextInput inputMode="numeric" value={program.requirements?.heightFrom ?? ''} onChange={event => setReq({ heightFrom: event.target.value })} /></SmallLabel>
          <SmallLabel>{uiText('Пологів не більше', language)}<TextInput inputMode="numeric" value={program.requirements?.maxBirths ?? ''} onChange={event => setReq({ maxBirths: event.target.value })} /></SmallLabel>
        </Grid>
        <SmallLabel as="div">{uiText('Резус', language)}<Choice language={language} options={PROGRAM_RH_OPTIONS} value={program.requirements?.rh || 'any'} onChange={rh => setReq({ rh })} /></SmallLabel>
        <SmallLabel as="div">{uiText('Сімейний стан', language)}<Choice language={language} options={PROGRAM_MARITAL_OPTIONS} value={program.requirements?.marital || 'any'} onChange={marital => setReq({ marital })} /></SmallLabel>
        <SmallLabel as="div">{uiText('Власна дитина', language)}<Choice language={language} options={PROGRAM_KIDS_OPTIONS} value={program.requirements?.ownKids || 'any'} onChange={ownKids => setReq({ ownKids })} /></SmallLabel>
        <SmallLabel as="div">{uiText('Кесарів розтин', language)}<Choice language={language} options={PROGRAM_CSECTION_OPTIONS} value={program.requirements?.csectionMax || 'any'} onChange={csectionMax => setReq({ csectionMax })} /></SmallLabel>
      </Group>

      <Group>
        <legend>{uiText('Виплати', language)}</legend>
        {listGuaranteedPaymentFields(program.type).map(({ key, label }) => (
          <SmallLabel key={key} as="div">
            {uiText(label, language)}
            <MoneyInput id={`${idPrefix}-${key}`} language={language} rates={rates} value={program.payments?.[key]} onChange={money => setPay(key, money)} />
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
          </SmallLabel>
        ))}
        <LabeledPayments
          items={program.otherPayments || []}
          onChange={otherPayments => set({ otherPayments })}
          listId={`${idPrefix}-payment-terms`}
          suggestions={paymentSuggestions}
          placeholder="За що"
          addLabel="Інша виплата"
          removeLabel="Прибрати виплату"
          currency={currency}
          language={language}
          rates={rates}
        />
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
      </Group>

      <Group>
        <legend>{uiText('Можливі доплати', language)}</legend>
        {listBonusPaymentFields(program.type).map(({ key, label }) => (
          <SmallLabel key={key} as="div">
            {uiText(label, language)}
            <MoneyInput id={`${idPrefix}-${key}`} language={language} rates={rates} value={program.payments?.[key]} onChange={money => setPay(key, money)} />
          </SmallLabel>
        ))}
        <LabeledPayments
          items={program.bonuses || []}
          onChange={bonuses => set({ bonuses })}
          listId={`${idPrefix}-bonus-terms`}
          suggestions={bonusSuggestions}
          placeholder="За що"
          addLabel="Інша доплата"
          removeLabel="Прибрати доплату"
          currency={currency}
          language={language}
          rates={rates}
        />
      </Group>

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
          <small>
            {uiText('Так само порахує донорка: фінальна, щомісячні × місяці, перенос, договір та інші виплати. Можливі доплати вона відмітить сама.', language)}
          </small>
        </TotalBox>
      ) : null}

      <Group>
        <legend>{uiText('Що покриваєте', language)}</legend>
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
                {uiText(option.label, language)}
              </Segment>
            );
          })}
        </Segments>
      </Group>

      {normalized ? (
        <PreviewDisclosure>
          <PreviewLabel as="summary">▾ {uiText('Попередній перегляд у стрічці', language)}</PreviewLabel>
          <ProgramCard program={normalized} rates={rates} language={language} />
        </PreviewDisclosure>
      ) : null}
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

export const ProgramsEditor = ({ programs, onSave, language, rates, defaultType = 'ed', suggestions = null }) => {
  const [draft, setDraft] = useState(() => listEditablePrograms(programs));
  const [openId, setOpenId] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState('');
  const timerRef = useRef(null);
  const draftRef = useRef(draft);
  const dirtyRef = useRef(false);
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
    onSaveRef.current(Object.keys(record).length ? record : null);
  };

  useEffect(() => () => flush(), []); // eslint-disable-line react-hooks/exhaustive-deps

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
      <EditorGuide>
        <b>{uiText('Одна програма — одна зрозуміла пропозиція', language)}</b>
        <span>{uiText('Вкажіть гарантовані виплати окремо: застосунок сам порахує підсумок і покаже програму першою у свайп-зоні агенції.', language)}</span>
        <div>
          <small>{uiText('1 · Кого шукаєте', language)}</small>
          <small>{uiText('2 · Виплати', language)}</small>
          <small>{uiText('3 · Вимоги й покриття', language)}</small>
        </div>
      </EditorGuide>
      {draft.map((program, index) => {
        const open = openId === program.id;
        const normalized = normalizeProgram(program, program.id);
        const complete = Boolean(normalized && programBreakdown(normalized).guaranteed.amount > 0);
        return (
          <ProgramBox key={program.id} data-testid="program-editor" $hidden={program.hidden} $incomplete={!complete}>
            <ProgramHead style={program.hidden ? { opacity: 0.72 } : undefined}>
              <HeadText type="button" aria-expanded={open} onClick={() => { flush(); setOpenId(open ? '' : program.id); }}>
                <b>
                  {uiText(PROGRAM_TYPE_LABELS[program.type], language)}
                  {program.hidden ? <> <HiddenMark>· {uiText('прихована', language)}</HiddenMark></> : null}
                </b>
                <span>{summaryLine(program, language)}</span>
              </HeadText>
              <HeadStatus $complete={complete}>
                {complete ? '✓' : '•'} {uiText(complete ? 'Готова до показу' : 'Заповніть виплату', language)}
              </HeadStatus>
              <HeadActions>
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
              </HeadActions>
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
        <Segments>
          <AddButton type="button" style={{ flex: 1 }} onClick={() => add(defaultType)}>
            + {uiText('Додати програму', language)}
          </AddButton>
        </Segments>
      ) : null}
    </Wrap>
  );
};

export default ProgramsEditor;
