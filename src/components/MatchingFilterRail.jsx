import React, { useCallback, useEffect, useRef } from 'react';
import {
  FilterApplyButton,
  FilterPopover,
  FilterPopoverBody,
  FilterPopoverFooter,
  FilterPopoverGhostButton,
  FilterPopoverHeader,
  FilterPopoverHeaderActions,
  FilterPopoverNote,
  FilterPopoverScrim,
  FilterPopoverTitle,
  FilterRail,
  FilterRailChip,
  FilterRailChipCaret,
  FilterRailChipClear,
  FilterRailChipShell,
  FilterRailScroller,
} from './Matching.styled';
import { buildMatchingFilterRailChips } from './SearchFilters';
import { uiText } from '../utils/uiTranslations';

/**
 * Єдина поверхня фільтрів стрічки.
 *
 * Що вона замінила і чому — в коментарі до `FilterRail` у `Matching.styled`.
 * Тут лишається те, що стосується поведінки:
 *
 * - **Скасування немає, і це навмисно.** Поки поповер відкритий, зміни — це
 *   чернетка (`draftFilters`), і єдине, що з нею можна зробити, — застосувати.
 *   Тож закриття будь-яким шляхом (кнопка, тап повз, Escape) застосовує
 *   набране: друга дія «закрити й забути» на тому самому жесті означала б, що
 *   читач втрачає роботу, не зробивши нічого явного. «Показати N» лишається
 *   головною кнопкою не тому, що без неї не застосується, а тому, що називає
 *   наслідок: N — це вже пораховано, по завантаженому, без жодного круга до
 *   бази.
 *
 * - **Панель груп живе не тут, а в сторінці.** `children` — це змонтований
 *   `FilterPanel`, і він мусить лишатись змонтованим і з закритим поповером:
 *   саме він тримає стан фільтрів, пише його в `localStorage` і перебирає
 *   групу ролі при зміні ролі читача. Тому закритий поповер — це
 *   `display: none`, а не знятий з дерева вузол.
 */
export const MatchingFilterRail = ({
  filters,
  language,
  roleOptionKeys,
  openGroup,
  onOpenGroup,
  onResetGroup,
  onResetAll,
  applyCount = 0,
  onApply,
  countsNote = '',
  children,
}) => {
  const scrollerRef = useRef(null);
  const chips = buildMatchingFilterRailChips(filters, language, { roleOptionKeys });
  const openChip = chips.find(chip => chip.filterName === openGroup) || null;
  // «Скинути все» з’являється від двох звужених груп: при одній вона
  // робить те саме, що й хрестик на тому єдиному чіпі, тобто лише
  // займає місце в ряду.
  const narrowedGroupCount = chips.filter(chip => chip.narrowed).length;

  const close = useCallback(() => {
    if (onApply) onApply();
    else onOpenGroup(null);
  }, [onApply, onOpenGroup]);

  /*
   * Щойно набір звужених груп змінився, ряд вертається на початок.
   *
   * Звужені чіпи стоять першими, але сам ряд лишається там, куди його
   * докрутили — і чіп, який тільки що звузили, опинявся за лівим краєм.
   */
  const narrowedSignature = chips.filter(chip => chip.narrowed).map(chip => chip.filterName).join(',');
  useEffect(() => {
    if (scrollerRef.current) scrollerRef.current.scrollLeft = 0;
  }, [narrowedSignature]);

  useEffect(() => {
    if (!openGroup) return undefined;
    const onKeyDown = event => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [close, openGroup]);

  return (
    <FilterRail>
      <FilterRailScroller ref={scrollerRef} role="group" aria-label={uiText('Фільтри стрічки', language)}>
        {chips.map(chip => {
          const isOpen = chip.filterName === openGroup;
          return (
            <FilterRailChipShell key={chip.filterName}>
              <FilterRailChip
                type="button"
                data-filter-group={chip.filterName}
                $narrowed={chip.narrowed}
                $danger={chip.danger}
                $open={isOpen}
                $clearable={chip.narrowed}
                aria-expanded={isOpen}
                aria-haspopup="dialog"
                title={uiText('Налаштувати: {group}', language, { group: chip.groupLabel })}
                onClick={() => onOpenGroup(isOpen ? null : chip.filterName)}
              >
                <span>{chip.text}</span>
                <FilterRailChipCaret aria-hidden="true">▾</FilterRailChipCaret>
              </FilterRailChip>
              {chip.narrowed && (
                <FilterRailChipClear
                  type="button"
                  $danger={chip.danger}
                  aria-label={uiText('Скинути групу «{group}»', language, { group: chip.groupLabel })}
                  title={uiText('Скинути групу «{group}»', language, { group: chip.groupLabel })}
                  onClick={() => onResetGroup(chip.filterName)}
                >
                  ✕
                </FilterRailChipClear>
              )}
            </FilterRailChipShell>
          );
        })}
        {narrowedGroupCount > 1 && (
          <FilterRailChip
            type="button"
            title={uiText('Скинути всі фільтри', language)}
            onClick={onResetAll}
          >
            <span>{uiText('Скинути все', language)}</span>
          </FilterRailChip>
        )}
      </FilterRailScroller>

      {openGroup && <FilterPopoverScrim onClick={close} />}
      <FilterPopover
        $open={Boolean(openGroup)}
        role="dialog"
        aria-modal="false"
        aria-label={openChip ? openChip.groupLabel : uiText('Фільтри стрічки', language)}
      >
        <FilterPopoverHeader>
          <FilterPopoverTitle>{openChip ? openChip.groupLabel : ''}</FilterPopoverTitle>
          <FilterPopoverHeaderActions>
            {openChip?.narrowed && (
              <FilterPopoverGhostButton
                type="button"
                onClick={() => onResetGroup(openGroup)}
              >
                {uiText('Усі', language)}
              </FilterPopoverGhostButton>
            )}
            <FilterPopoverGhostButton
              type="button"
              aria-label={uiText('Закрити групу фільтра', language)}
              onClick={close}
            >
              ✕
            </FilterPopoverGhostButton>
          </FilterPopoverHeaderActions>
        </FilterPopoverHeader>
        <FilterPopoverBody>
          {children}
          {countsNote && <FilterPopoverNote>{countsNote}</FilterPopoverNote>}
        </FilterPopoverBody>
        <FilterPopoverFooter>
          <FilterApplyButton type="button" onClick={close}>
            {uiText('Показати {count}', language, { count: applyCount })}
          </FilterApplyButton>
        </FilterPopoverFooter>
      </FilterPopover>
    </FilterRail>
  );
};

export default MatchingFilterRail;
