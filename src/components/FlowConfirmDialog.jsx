// Підтвердження Flow — одна модалка на всі незворотні чи масові дії:
// видалення запису, групи й усього Flow, злиття груп, імпорт з файлу
// (20.11, винесено з `FlowManager.jsx`). Що саме питається — `state.type`.
import React from 'react';
import { formatFlowMoney } from 'utils/flowView';
import { formatDisplayDate, formatFlowEntryCount, formatGroupTitle } from 'utils/flowEntries';
import { Backdrop, DangerBtn, Dialog, DialogActions, DialogText, GhostBtn, PrimaryBtn } from './FlowManager.styled';

export const FlowConfirmDialog = ({ state, importState, isImporting, rowAmountNumber, onCancel, onConfirm }) => {
  if (!state?.type) return null;
  return (
    <Backdrop $center onClick={onCancel}>
      <Dialog role="dialog" onClick={e => e.stopPropagation()}>
        <h2>
          {state.type === 'merge'
            ? `Обʼєднати «${state.category}» з «${state.target}»?`
            : state.type === 'category'
              ? `Видалити групу «${state.category}»?`
              : state.type === 'import'
                ? `Імпортувати ${formatFlowEntryCount(importState?.count || 0)}?`
                : state.type === 'clear'
                  ? 'Видалити весь Flow?'
                  : 'Видалити запис?'}
        </h2>
        {state.type === 'category' && (
          <DialogText data-testid="flow-category-delete-summary">
            {state.count > 0
              ? `Разом із нею ${state.count === 1 ? 'зникне' : 'зникнуть'} ${formatFlowEntryCount(state.count)} на ${formatFlowMoney(state.totalUah)} грн, зокрема в її підгрупах. Відновити їх не можна.`
              : 'Записів у групі немає.'}
          </DialogText>
        )}
        {state.type === 'merge' && (
          <DialogText data-testid="flow-category-merge-summary">
            {state.count > 0
              ? `Група «${state.target}» уже є. ${formatFlowEntryCount(state.count)} на ${formatFlowMoney(state.totalUah)} грн з «${state.category}» ${state.count === 1 ? 'переїде' : 'переїдуть'} до неї разом із підгрупами. Відмінити можна кнопкою «Назад».`
              : `Група «${state.target}» уже є, і «${state.category}» стане її частиною.`}
          </DialogText>
        )}
        {state.type === 'clear' && (
          <DialogText>Усі групи й записи зникнуть. Відновити їх не можна.</DialogText>
        )}
        {state.type === 'import' && importState && (
          <DialogText data-testid="flow-import-summary">
            <span>Файл «{importState.fileName}»</span>
            {Object.entries(importState.groups).map(([group, count]) => (
              <span key={group}>{formatGroupTitle(group)}: {count}</span>
            ))}
            {importState.undatedCount > 0 && (
              <span>Без дати: {importState.undatedCount} — стануть на 1 січня</span>
            )}
            {importState.skippedCount > 0 && <span>Пропущено без суми: {importState.skippedCount}</span>}
            <span>Записи додаються до наявних, а не замінюють їх.</span>
          </DialogText>
        )}
        {state.type === 'row' && state.row && (
          <DialogText>
            {formatDisplayDate(state.row.date)} · {formatFlowMoney(rowAmountNumber(state.row))} грн · {state.row.description}
          </DialogText>
        )}
        <DialogActions>
          <GhostBtn type="button" onClick={onCancel}>Скасувати</GhostBtn>
          {state.type === 'import' ? (
            <PrimaryBtn type="button" onClick={onConfirm} disabled={isImporting} data-testid="flow-import-confirm">
              {isImporting ? 'Імпортую…' : 'Імпортувати'}
            </PrimaryBtn>
          ) : state.type === 'merge' ? (
            <PrimaryBtn type="button" onClick={onConfirm} data-testid="flow-category-merge-confirm">
              Обʼєднати
            </PrimaryBtn>
          ) : (
            <DangerBtn type="button" onClick={onConfirm}>Видалити</DangerBtn>
          )}
        </DialogActions>
      </Dialog>
    </Backdrop>
  );
};
