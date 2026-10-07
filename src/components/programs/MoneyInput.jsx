import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import {
  DEFAULT_PROGRAM_CURRENCY,
  PROGRAM_CURRENCIES,
  PROGRAM_CURRENCY_SIGNS,
  describeProgramMoney,
  formatRateDate,
  parseProgramAmount,
} from '../../utils/programCurrency';
import { uiText } from '../../utils/uiTranslations';

/*
 * Сума й валюта одним полем — так, як їх вводять у Flow: число плюс вибір
 * UAH / USD / EUR. Під полем одразу видно еквіваленти за курсом НБУ, тож
 * агенція ще до збереження бачить, як її «1 600 $» прочитає донорка, що рахує
 * в гривнях.
 */

const Row = styled.div`
  display: flex;
  gap: 6px;
  align-items: stretch;
`;

const AmountInput = styled.input`
  flex: 1 1 auto;
  min-width: 0;
  box-sizing: border-box;
  min-height: 40px;
  padding: 0 12px;
  border: 1px solid var(--km-border, #e7e1d8);
  border-radius: 10px;
  background: var(--km-bg, #faf8f5);
  color: inherit;
  font: inherit;
  font-size: 15px;
  font-variant-numeric: tabular-nums;

  &:focus { outline: 2px solid color-mix(in srgb, var(--km-accent, #E8791A) 40%, transparent); outline-offset: 0; }
`;

const Currencies = styled.div`
  display: inline-flex;
  border: 1px solid var(--km-border, #e7e1d8);
  border-radius: 10px;
  overflow: hidden;
  flex: 0 0 auto;
`;

const CurrencyButton = styled.button`
  min-width: 38px;
  border: 0;
  border-left: 1px solid var(--km-border, #e7e1d8);
  background: ${({ $on }) => ($on ? 'var(--km-accent, #E8791A)' : 'transparent')};
  color: ${({ $on }) => ($on ? '#fff' : 'var(--km-text, inherit)')};
  font: inherit;
  /* Розмір явний: успадкований брався з батька, і в рядку «Інша виплата»
     (не всередині підпису поля) значки валют були більші й жирніші, ніж у
     сусідніх полях. */
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;

  &:first-child { border-left: 0; }
`;

// Компактна валюта — список на три знаки, прикріплений до суми: три кнопки
// поруч із кожною сумою займали більше місця, ніж саме число, і форма з
// пʼятьма виплатами ставала пʼятьма рядами кнопок.
const CompactRow = styled.div`
  display: inline-flex;
  align-items: stretch;
  width: 100%;
  min-width: 0;
  border: 1px solid var(--km-border, #e7e1d8);
  border-radius: 10px;
  background: var(--km-bg, #faf8f5);
  overflow: hidden;

  &:focus-within { outline: 2px solid color-mix(in srgb, var(--km-accent, #E8791A) 40%, transparent); }

  input {
    flex: 1 1 auto;
    min-width: 0;
    width: 100%;
    min-height: 38px;
    padding: 0 10px;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 15px;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }
  input:focus { outline: none; }
  select {
    flex: 0 0 auto;
    padding: 0 8px;
    border: 0;
    border-left: 1px solid var(--km-border, #e7e1d8);
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
  }
`;

const Hint = styled.div`
  margin-top: 4px;
  font-size: 11.5px;
  color: var(--km-muted, #6f675f);
  font-variant-numeric: tabular-nums;
`;

// Порожнє поле суми — це «не платимо», а не «0 $»: сіре «0» читалось як
// уже вписана нульова виплата.
export const MoneyInput = ({ id, value, onChange, language, rates, placeholder, ariaLabel, compact = false }) => {
  const currency = value?.currency || DEFAULT_PROGRAM_CURRENCY;
  const [draft, setDraft] = useState(value?.amount ?? '');
  useEffect(() => { setDraft(value?.amount ?? ''); }, [value?.amount]);

  const commit = (nextAmount, nextCurrency = currency) => {
    const amount = parseProgramAmount(nextAmount);
    onChange(amount ? { amount, currency: nextCurrency } : { amount: '', currency: nextCurrency });
  };
  const described = describeProgramMoney({ amount: parseProgramAmount(draft), currency }, rates);

  if (compact) {
    // Еквіваленти — підказкою поля, а не рядком під ним: агенція бачить їх у
    // перегляді картки поруч, а під кожною сумою вони подвоювали висоту форми.
    const title = described?.equivalents?.length ? described.equivalents.map(item => item.text).join(' · ') : undefined;
    return (
      <CompactRow title={title}>
        <input
          id={id}
          aria-label={ariaLabel}
          inputMode="decimal"
          value={draft}
          placeholder={placeholder ?? uiText('сума', language)}
          onChange={event => setDraft(event.target.value)}
          onBlur={() => commit(draft)}
        />
        <select aria-label={uiText('Валюта', language)} value={currency} onChange={event => commit(draft, event.target.value)}>
          {PROGRAM_CURRENCIES.map(code => <option key={code} value={code}>{PROGRAM_CURRENCY_SIGNS[code]}</option>)}
        </select>
      </CompactRow>
    );
  }

  return (
    <div>
      <Row>
        <AmountInput
          id={id}
          aria-label={ariaLabel}
          inputMode="decimal"
          value={draft}
          placeholder={placeholder ?? uiText('сума', language)}
          onChange={event => setDraft(event.target.value)}
          onBlur={() => commit(draft)}
        />
        <Currencies role="group" aria-label={uiText('Валюта', language)}>
          {PROGRAM_CURRENCIES.map(code => (
            <CurrencyButton
              key={code}
              type="button"
              $on={currency === code}
              aria-pressed={currency === code}
              title={code}
              onClick={() => commit(draft, code)}
            >
              {PROGRAM_CURRENCY_SIGNS[code]}
            </CurrencyButton>
          ))}
        </Currencies>
      </Row>
      {described?.equivalents?.length ? (
        <Hint>
          {described.equivalents.map(item => item.text).join(' · ')}
          {described.rateDate ? ` · ${uiText('курс НБУ на {date}', language, { date: formatRateDate(described.rateDate) })}` : ''}
        </Hint>
      ) : null}
    </div>
  );
};

export default MoneyInput;
