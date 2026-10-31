import React from 'react';
import {
  BucketChip,
  BucketGrid,
  CheckGroup,
  CheckGroupNote,
  CheckGroupTitle,
  CheckHint,
  CheckRow,
  ToolButton,
  ToolDrawerNote,
} from './AddNewProfileAdminPanel.styled';
import {
  CARD_LIST_OPTIONS,
  CARD_LIST_PRESETS,
  CARD_LIST_SEGMENTS,
  applyCardListPreset,
  findCardListPreset,
  normalizeCardListPlan,
} from 'utils/cardListPlan';

/*
 * Шухляда «Що в списку» на `AddNewProfile` — галочки плану двигуна
 * (`utils/cardListPlan`) замість семи радіокнопок режимів.
 *
 * Радіокнопки перемикали цілі завантажувачі, і кожен ніс свій набір
 * конструкцій: «кому дзвонити» не можна було взяти разом із картками без
 * дати, а вимкнути індексний відсів — не втративши кешу. Тут кожна
 * конструкція — своя галочка, а колишні режими лишились пресетами
 * «Швидкого вибору» (підказка на чіпі каже, який режим він заміняє).
 *
 * Останній обраний стан зняти не можна: порожній план — це не «усе», а
 * «нічого», і такий список коштував би обходу бази заради порожнього екрана.
 */
export const CardListPlanControls = ({
  plan,
  onChange,
  onPickFiles,
  loadedNodes = [],
  statsText = '',
}) => {
  const normalized = normalizeCardListPlan(plan);
  const activePreset = findCardListPreset(normalized);
  const checkedSegments = CARD_LIST_SEGMENTS.filter(segment => normalized.segments[segment.key]).length;

  const emit = next => {
    if (typeof onChange === 'function') onChange(normalizeCardListPlan(next));
  };

  const toggleSegment = key => emit({
    ...normalized,
    segments: { ...normalized.segments, [key]: !normalized.segments[key] },
  });

  const toggleOption = key => emit({ ...normalized, [key]: !normalized[key] });

  const renderOption = option => (
    <CheckRow key={option.key}>
      <input
        type="checkbox"
        name={`card-list-${option.key}`}
        checked={Boolean(normalized[option.key])}
        onChange={() => toggleOption(option.key)}
      />
      <span>
        {option.label}
        <CheckHint>{option.hint}</CheckHint>
      </span>
    </CheckRow>
  );

  const optionsOf = group => CARD_LIST_OPTIONS.filter(option => option.group === group);

  return (
    <div data-testid="card-list-plan">
      <CheckGroup>
        <CheckGroupTitle>
          Швидкий вибір
          <CheckGroupNote>колишні режими — одним дотиком</CheckGroupNote>
        </CheckGroupTitle>
        <BucketGrid>
          {CARD_LIST_PRESETS.map(preset => (
            <BucketChip
              key={preset.key}
              type="button"
              $active={activePreset?.key === preset.key}
              aria-pressed={activePreset?.key === preset.key}
              onClick={() => emit(applyCardListPreset(normalized, preset.key))}
              title={`Замість режимів: ${preset.legacyModes.join(', ')}`}
            >
              {preset.label}
            </BucketChip>
          ))}
        </BucketGrid>
      </CheckGroup>

      <CheckGroup>
        <CheckGroupTitle>
          Що показати
          <CheckGroupNote>за датою дзвінка; у списку — у цьому порядку, кожна картка раз</CheckGroupNote>
        </CheckGroupTitle>
        {CARD_LIST_SEGMENTS.map(segment => {
          const checked = Boolean(normalized.segments[segment.key]);
          const isLastChecked = checked && checkedSegments === 1;
          return (
            <CheckRow key={segment.key}>
              <input
                type="checkbox"
                name={`card-list-segment-${segment.key}`}
                checked={checked}
                disabled={isLastChecked}
                onChange={() => toggleSegment(segment.key)}
              />
              <span>
                {segment.label}
                <CheckHint>
                  {segment.hint}
                  {isLastChecked ? ' · хоча б одне лишається обраним' : ''}
                </CheckHint>
              </span>
            </CheckRow>
          );
        })}
      </CheckGroup>

      <CheckGroup>
        <CheckGroupTitle>
          Порядок
          <CheckGroupNote>без галочки — за датою дзвінка</CheckGroupNote>
        </CheckGroupTitle>
        {optionsOf('order').map(renderOption)}
      </CheckGroup>

      <CheckGroup>
        <CheckGroupTitle>
          Як вантажити
          <CheckGroupNote>швидкість і трафік, склад списку той самий</CheckGroupNote>
        </CheckGroupTitle>
        {optionsOf('load').map(renderOption)}
      </CheckGroup>

      <CheckGroup>
        <CheckGroupTitle>
          Джерело
          <CheckGroupNote>звідки беруться кандидати</CheckGroupNote>
        </CheckGroupTitle>
        {optionsOf('source').map(renderOption)}
        {normalized.fromFiles && (
          <ToolButton type="button" onClick={onPickFiles}>
            {loadedNodes.length
              ? `Файли вузлів: ${loadedNodes.join(', ')}`
              : 'Обрати файли вузлів (matchingCards, profileDetails, …)'}
          </ToolButton>
        )}
      </CheckGroup>

      {statsText && (
        <ToolDrawerNote data-testid="card-list-stats">
          Остання сторінка: {statsText}
        </ToolDrawerNote>
      )}
    </div>
  );
};

export default CardListPlanControls;
