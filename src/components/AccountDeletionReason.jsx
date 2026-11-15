import React, { useState } from 'react';
import styled from 'styled-components';
import { uiText } from 'utils/uiTranslations';
import {
  ACCOUNT_DELETION_REASON_OPTIONS,
  ACCOUNT_DELETION_REASON_TEXT_MAX,
} from 'utils/accountDeletion';
import { CoordinatorContactButtons } from './CoordinatorRequest';

/*
 * Одне необовʼязкове питання перед видаленням акаунта і пропозиція допомогти.
 *
 * Кейс 14.11: людина шукала сурогатну маму, побачила порожню видачу й
 * видалила акаунт, а черга видалень знала лише час. Причина (код + кілька слів)
 * лягає в `accountDeletions/{uid}`, і адмін бачить її поруч з останніми
 * запитами людини.
 *
 * Стан живе тут і в `valueRef` викликача, а не в стані «Мого профілю»:
 * модалка (`InfoModal`) малює підтвердження новою функцією на кожен рендер
 * сторінки, і поле, кероване станом сторінки, перемонтовувалось би й губило
 * фокус на кожній літері.
 */

const Fieldset = styled.fieldset`
  margin: 12px 0 0;
  padding: 0;
  border: 0;
  display: grid;
  gap: 6px;
  text-align: left;
`;

const Legend = styled.legend`
  margin-bottom: 6px;
  padding: 0;
  font-size: 14px;
  font-weight: 600;
`;

const Option = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  font-size: 14px;
  cursor: pointer;

  input { width: 18px; height: 18px; margin: 0; accent-color: var(--km-accent, #C9600F); }
`;

const Text = styled.textarea`
  width: 100%;
  min-height: 64px;
  box-sizing: border-box;
  padding: 8px 10px;
  border: 0;
  border-radius: 10px;
  background: var(--km-fill, rgba(0, 0, 0, 0.05));
  color: inherit;
  font: inherit;
  font-size: 14px;
  resize: vertical;

  &:focus { outline: 2px solid var(--km-accent, #C9600F); outline-offset: 1px; }
`;

const Counter = styled.span`
  justify-self: end;
  font-size: 12px;
  color: var(--km-muted, #6b6b6b);
`;

const Help = styled.section`
  margin-top: 14px;
  padding: 12px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--km-accent, #C9600F) 8%, transparent);
  text-align: left;
`;

const HelpTitle = styled.p`
  margin: 0 0 4px;
  font-size: 14px;
  font-weight: 700;
`;

const HelpText = styled.p`
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
  color: var(--km-muted, #6b6b6b);
`;

const AccountDeletionReason = ({ language, valueRef, disabled = false }) => {
  const [reason, setReason] = useState(() => valueRef?.current?.reason || '');
  const [reasonText, setReasonText] = useState(() => valueRef?.current?.reasonText || '');

  const update = next => {
    if (valueRef) valueRef.current = { ...(valueRef.current || {}), ...next };
  };

  return (
    <>
      <Fieldset disabled={disabled} data-testid="delete-account-reason">
        <Legend>{uiText('Чому ви йдете? (необовʼязково)', language)}</Legend>
        {ACCOUNT_DELETION_REASON_OPTIONS.map(option => (
          <Option key={option.value}>
            <input
              type="radio"
              name="delete-account-reason"
              value={option.value}
              checked={reason === option.value}
              onChange={() => { setReason(option.value); update({ reason: option.value }); }}
            />
            {uiText(option.label, language)}
          </Option>
        ))}
        <Text
          aria-label={uiText('Кілька слів, якщо хочете', language)}
          placeholder={uiText('Кілька слів, якщо хочете', language)}
          maxLength={ACCOUNT_DELETION_REASON_TEXT_MAX}
          value={reasonText}
          onChange={event => {
            const value = event.target.value.slice(0, ACCOUNT_DELETION_REASON_TEXT_MAX);
            setReasonText(value);
            update({ reasonText: value });
          }}
        />
        <Counter aria-hidden="true">{reasonText.length}/{ACCOUNT_DELETION_REASON_TEXT_MAX}</Counter>
      </Fieldset>
      <Help data-testid="delete-account-help">
        <HelpTitle>{uiText('Можемо допомогти особисто', language)}</HelpTitle>
        <HelpText>{uiText('Не знайшли потрібне чи щось незрозуміло — напишіть координаторові, підберемо анкети разом.', language)}</HelpText>
        <CoordinatorContactButtons language={language} />
      </Help>
    </>
  );
};

export default AccountDeletionReason;
