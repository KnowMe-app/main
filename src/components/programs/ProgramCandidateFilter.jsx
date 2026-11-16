import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import styled from 'styled-components';
import { FilterRailChip, FilterRailChipClear, FilterRailChipShell } from '../Matching.styled';
import { evaluateCardForProgram, isProgramFilterActive } from '../../utils/programCandidateFilter';
import { PROGRAM_TYPE_LABELS, describeProgramRequirements } from '../../utils/donorPrograms';
import { uiText } from '../../utils/uiTranslations';
import { getRoleColor } from '../matchingRoleColors';
import { describeUnknownRequirements, programRowTitle } from './ProgramsView';

/*
 * Чип «Під програму» в рейці фільтрів стрічки (`utils/programCandidateFilter`)
 * і позначка на рядку кандидатки.
 *
 * Вибір — шторкою поверх сторінки (портал у `body`): рейка прокручується
 * вбік і обрізала б випадний список.
 */

const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 1300;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(0, 0, 0, 0.35);

  @media (min-width: 601px) { align-items: center; }
`;

const Sheet = styled.div`
  width: min(440px, 100%);
  max-height: 80vh;
  overflow: auto;
  box-sizing: border-box;
  padding: 16px 16px calc(16px + env(safe-area-inset-bottom, 0px));
  border-radius: 18px 18px 0 0;
  background: var(--km-card, #fff);
  color: var(--km-text, #1A1A1A);

  @media (min-width: 601px) { border-radius: 18px; }

  h3 { margin: 0 0 4px; font-size: 16px; font-weight: 700; }
  p { margin: 0 0 12px; font-size: 13px; line-height: 1.4; color: var(--km-muted, #62665F); }
`;

const Option = styled.button`
  display: grid;
  grid-template-columns: 10px minmax(0, 1fr);
  gap: 4px 10px;
  align-items: center;
  width: 100%;
  min-height: 52px;
  margin-top: 8px;
  padding: 10px 12px;
  border: 1.5px solid ${({ $on }) => ($on ? 'var(--km-accent, #C9600F)' : 'transparent')};
  border-radius: 12px;
  background: var(--km-fill, #F0EDE8);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;

  i { width: 10px; height: 10px; border-radius: 50%; background: var(--km-muted, #62665F); }
  b { font-size: 14px; font-weight: 600; }
  small { grid-column: 2; font-size: 12px; color: var(--km-muted, #62665F); }
  &:focus-visible { outline: 2px solid var(--km-accent, #C9600F); outline-offset: 2px; }
`;

const CloseRow = styled.button`
  width: 100%;
  min-height: 44px;
  margin-top: 12px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: var(--km-accent, #C9600F);
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
`;

/**
 * Як програма підписана в чипі й у шторці: «Донор ооцитів · Київ · 21–28 років».
 * Тип — коротким словом ролі, а не «Шукаємо донора ооцитів»: у чипі рейки
 * довга назва обрізалась саме на місці програми (перевірено наживо).
 */
export const programFilterLabel = (program, programs, language) => {
  const siblings = (programs || []).filter(item => item.type === program.type && item.id !== program.id);
  const differs = siblings.length ? new Set(['location', 'age']) : null;
  const title = programRowTitle(program, differs, language);
  return [uiText(PROGRAM_TYPE_LABELS[program.type] || '', language), title].filter(Boolean).join(' · ');
};

export const ProgramCandidateChip = ({ programs, value, onSelect, language }) => {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = event => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  if (!programs?.length) return null;
  const active = isProgramFilterActive(value);
  const chipText = active
    ? uiText('Під програму: {program}', language, { program: value.label })
    : uiText('Кандидатки під програму', language);
  return (
    <>
      <FilterRailChipShell data-testid="program-candidate-filter">
        <FilterRailChip type="button" data-filter-group="program" $narrowed={active} $clearable={active} onClick={() => setOpen(true)}>
          <span>{chipText}</span>
        </FilterRailChip>
        {active ? (
          <FilterRailChipClear
            type="button"
            aria-label={uiText('Скинути групу «{group}»', language, { group: chipText })}
            title={uiText('Скинути групу «{group}»', language, { group: chipText })}
            onClick={() => onSelect(null)}
          >
            ✕
          </FilterRailChipClear>
        ) : null}
      </FilterRailChipShell>
      {open && typeof document !== 'undefined' ? createPortal(
        <Backdrop onClick={() => setOpen(false)}>
          <Sheet role="dialog" aria-modal="true" aria-label={uiText('Кандидатки під програму', language)} onClick={event => event.stopPropagation()}>
            <h3>{uiText('Кандидатки під програму', language)}</h3>
            <p>{uiText('Стрічка покаже лише анкети, що проходять вимоги обраної програми. Що в анкеті не вказано, не відсіює — рядок скаже, чого бракує.', language)}</p>
            {programs.map(program => {
              const requirements = describeProgramRequirements(program).slice(0, 3)
                .map(item => uiText(item.text, language, item.variables)).join(' · ');
              return (
                <Option
                  key={program.id}
                  type="button"
                  $on={value?.id === program.id}
                  aria-pressed={value?.id === program.id}
                  onClick={() => { onSelect(program); setOpen(false); }}
                >
                  <i aria-hidden="true" style={{ background: getRoleColor(program.type) || undefined }} />
                  <b>{programFilterLabel(program, programs, language)}</b>
                  {requirements ? <small>{requirements}</small> : null}
                </Option>
              );
            })}
            {active ? (
              <Option type="button" onClick={() => { onSelect(null); setOpen(false); }}>
                <i aria-hidden="true" />
                <b>{uiText('Без програми — уся стрічка', language)}</b>
              </Option>
            ) : null}
            <CloseRow type="button" onClick={() => setOpen(false)}>{uiText('Закрити', language)}</CloseRow>
          </Sheet>
        </Backdrop>,
        document.body,
      ) : null}
    </>
  );
};

const FitNote = styled.p`
  margin: 8px 0 0;
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1.4;
  color: ${({ $uncertain }) => ($uncertain ? '#B7791F' : 'var(--km-success, #2E9B55)')};
`;

/**
 * Позначка на рядку кандидатки, коли стрічку звужено під програму:
 * «✓ Підходить під програму» або «? Не вказано: резус» — невідоме фільтр не
 * відсіює, і агенція мусить бачити, що саме уточнити.
 */
export const ProgramCandidateNote = ({ card, filter, language }) => {
  if (!isProgramFilterActive(filter)) return null;
  const result = evaluateCardForProgram(card, filter);
  if (!result || result.matches === false) return null;
  if (!result.uncertain) {
    return <FitNote data-testid="program-candidate-note">✓ {uiText('Підходить під програму', language)}</FitNote>;
  }
  const unknown = describeUnknownRequirements(result.checks, language);
  return (
    <FitNote $uncertain data-testid="program-candidate-note">
      ? {uiText('Може підходити — в анкеті не вказано', language)}{unknown.length ? `: ${unknown.join(', ')}` : ''}
    </FitNote>
  );
};
