import React from 'react';
import styled from 'styled-components';
import { uiTokens } from './styles';

// Верхній рядок картки адміна на `AddNewProfile`: «Назад / Вперед» (відміна
// правок, як у Word) і перемикачі. Картку з посилань `/edit/:userId`
// (Telegram-сповіщення) відкриває той самий екран — `EditProfileRedirect`.

export const TopButtons = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  background: var(--km-card);
  padding: 6px 0;

  @media (max-width: 768px) {
    background: ${uiTokens.colors.pageBg};
  }
`;

export const TopButtonsGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex-wrap: wrap;
`;

export const EditActionButton = styled.button`
  width: 40px;
  height: 40px;
  padding: 0;
  border-radius: 12px;
  border: 1px solid transparent;
  background: none;
  color: var(--km-accent);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease,
    transform 0.2s ease;

  &:hover {
    background-color: var(--km-accent-light);
    border-color: var(--km-accent-mid);
    color: var(--km-accent);
    transform: translateY(-1px);
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
    transform: none;
  }
`;

const EditActionIcon = styled.svg`
  width: 20px;
  height: 20px;
`;

export const TopToggleButton = styled(EditActionButton)`
  width: auto;
  min-width: 40px;
  padding: 0 10px;
  gap: 6px;
  color: var(--km-accent);
  background-color: ${({ $active }) => ($active ? 'var(--km-accent-light)' : 'transparent')};
  border-color: ${({ $active }) => ($active ? 'var(--km-accent-mid)' : 'transparent')};
  font-size: 13px;
  font-weight: 700;
`;

export const TopToggleStatus = styled.span`
  font-size: 11px;
  font-weight: 700;
`;

export const ProfileHistoryButtons = ({ onUndo, onRedo, canUndo, canRedo }) => (
  <>
    <EditActionButton
      type="button"
      onClick={onUndo}
      title="Відмінити останню зміну"
      aria-label="Відмінити останню зміну"
      disabled={!canUndo}
    >
      <EditActionIcon viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M9 7L5 11L9 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M6 11H14C17.314 11 20 13.686 20 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </EditActionIcon>
    </EditActionButton>
    <EditActionButton
      type="button"
      onClick={onRedo}
      title="Відмінити відміну"
      aria-label="Повернути зміну"
      disabled={!canRedo}
    >
      <EditActionIcon viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M15 7L19 11L15 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M18 11H10C6.686 11 4 13.686 4 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </EditActionIcon>
    </EditActionButton>
  </>
);
