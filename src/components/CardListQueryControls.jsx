import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import {
  BucketChip,
  BucketGrid,
  CheckGroup,
  CheckGroupNote,
  CheckGroupTitle,
  CheckHint,
  ToolButton,
  ToolDrawerNote,
} from './AddNewProfileAdminPanel.styled';
import {
  CARD_LIST_DIRECTIONS,
  CARD_LIST_FIELDS,
  CARD_LIST_MISSING,
  CARD_LIST_PRESETS,
  CARD_LIST_RANGES,
  describeCardListDirection,
  fieldHasMissing,
  findCardListPreset,
  getCardListField,
  normalizeCardListQuery,
  readFieldDate,
} from 'utils/cardListQuery';

/*
 * Шухляда «Сортування» на `AddNewProfile`: запит «Списку» чотирма питаннями
 * (`utils/cardListQuery`) — за яким полем, у якому порядку, за який період і
 * що робити з картками, де поля немає.
 *
 * Тут стояли сім радіокнопок режимів (GIT, GITnew, NoGIT, LA, LA2…), а потім
 * галочки станів дати дзвінка. І те, й те відповідало на одне питання —
 * «кому дзвонити» — і не вміло жодного іншого: список за датою публікації,
 * реєстрацією чи останнім входом був окремою кнопкою або не був ніде. Тепер
 * будь-яке поле, за яким база вміє впорядкувати сама, — це рядок у переліку
 * полів, а колишні режими — готові запити першим рядком.
 */

const RangeRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
`;

const RangeLabel = styled.label`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--km-muted);
`;

const RangeInput = styled.input`
  width: 104px;
  padding: 4px 8px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: var(--km-fill, var(--km-card));
  color: var(--km-text);
  font-family: inherit;
  font-size: 12px;

  &::placeholder {
    color: var(--km-muted);
  }

  &:focus {
    outline: none;
    border-color: var(--km-accent);
  }
`;

const formatDottedDate = iso => {
  const date = readFieldDate(iso);
  if (!date) return '';
  const [year, month, day] = date.split('-');
  return `${day}.${month}.${year}`;
};

const CustomRangeInput = ({ label, value, onCommit }) => {
  const [text, setText] = useState(formatDottedDate(value));
  useEffect(() => {
    setText(formatDottedDate(value));
  }, [value]);

  const commit = () => {
    const trimmed = text.trim();
    if (!trimmed) {
      onCommit(null);
      return;
    }
    const iso = readFieldDate(trimmed);
    if (iso) onCommit(iso);
    else setText(formatDottedDate(value));
  };

  // Текст, а не `type="date"`: нативне поле дати на Android лише виділяло
  // сегмент плейсхолдера (див. графік програми). Розбір — той самий
  // `readFieldDate`, що читає дати полів.
  return (
    <RangeLabel>
      {label}
      <RangeInput
        type="text"
        inputMode="numeric"
        placeholder="дд.мм.рррр"
        value={text}
        aria-label={`Період ${label}`}
        onChange={event => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={event => {
          if (event.key === 'Enter') commit();
        }}
      />
    </RangeLabel>
  );
};

export const CardListQueryControls = ({ query, onChange, statsText = '' }) => {
  const normalized = normalizeCardListQuery(query);
  const field = getCardListField(normalized.field);
  const activePreset = findCardListPreset(normalized);
  const customRange = typeof normalized.range === 'object' ? normalized.range : null;
  const onlyMissing = normalized.missing === 'only';

  const emit = next => {
    if (typeof onChange === 'function') onChange(normalizeCardListQuery(next));
  };

  // Нове поле — з власними умовчаннями: діапазон «до сьогодні» дати дзвінка
  // чи «лише без значення» іншого поля тут нічого не означали б.
  const pickField = key => {
    const next = getCardListField(key);
    emit({ field: next.key, direction: next.defaultDirection, range: next.defaultRange, missing: 'exclude' });
  };

  const commitCustomRange = (edge, iso) => {
    const base = customRange || {};
    const next = { ...base, [edge]: iso || undefined };
    emit({ ...normalized, range: next.from || next.to ? next : field.defaultRange });
  };

  return (
    <div data-testid="card-list-query">
      <CheckGroup>
        <CheckGroupTitle>
          Готові списки
          <CheckGroupNote>те саме, що поля нижче, одним дотиком</CheckGroupNote>
        </CheckGroupTitle>
        <BucketGrid>
          {CARD_LIST_PRESETS.map(preset => (
            <BucketChip
              key={preset.key}
              type="button"
              $active={activePreset?.key === preset.key}
              aria-pressed={activePreset?.key === preset.key}
              onClick={() => emit(preset.query)}
            >
              {preset.label}
            </BucketChip>
          ))}
        </BucketGrid>
      </CheckGroup>

      <CheckGroup>
        <CheckGroupTitle>
          Сортувати за
          <CheckGroupNote>порядок і межі робить сама база — сторінка коштує один запит переліку</CheckGroupNote>
        </CheckGroupTitle>
        <BucketGrid>
          {CARD_LIST_FIELDS.map(item => (
            <BucketChip
              key={item.key}
              type="button"
              $active={item.key === field.key}
              aria-pressed={item.key === field.key}
              onClick={() => pickField(item.key)}
              title={item.hint}
            >
              {item.label}
            </BucketChip>
          ))}
        </BucketGrid>
        <CheckHint>{field.hint}</CheckHint>
      </CheckGroup>

      {!onlyMissing && (
        <CheckGroup>
          <CheckGroupTitle>Порядок</CheckGroupTitle>
          <BucketGrid>
            {CARD_LIST_DIRECTIONS.map(direction => (
              <BucketChip
                key={direction.key}
                type="button"
                $active={normalized.direction === direction.key}
                aria-pressed={normalized.direction === direction.key}
                onClick={() => emit({ ...normalized, direction: direction.key })}
              >
                {direction.arrow} {describeCardListDirection(field.key, direction.key)}
              </BucketChip>
            ))}
          </BucketGrid>
        </CheckGroup>
      )}

      {!onlyMissing && field.type !== 'key' && (
        <CheckGroup>
          <CheckGroupTitle>
            Період
            <CheckGroupNote>межа стає межею запиту, а не фільтром після нього</CheckGroupNote>
          </CheckGroupTitle>
          <BucketGrid>
            {field.ranges.map(rangeKey => (
              <BucketChip
                key={rangeKey}
                type="button"
                $active={normalized.range === rangeKey}
                aria-pressed={normalized.range === rangeKey}
                onClick={() => emit({ ...normalized, range: rangeKey })}
              >
                {CARD_LIST_RANGES[rangeKey]?.label || rangeKey}
              </BucketChip>
            ))}
          </BucketGrid>
          <RangeRow>
            <CustomRangeInput label="свої дати: з" value={customRange?.from} onCommit={iso => commitCustomRange('from', iso)} />
            <CustomRangeInput label="по" value={customRange?.to} onCommit={iso => commitCustomRange('to', iso)} />
            {customRange && (
              <ToolButton type="button" onClick={() => emit({ ...normalized, range: field.defaultRange })}>
                Скинути дати
              </ToolButton>
            )}
          </RangeRow>
        </CheckGroup>
      )}

      {fieldHasMissing(field) && (
        <CheckGroup>
          <CheckGroupTitle>
            Картки {field.missingLabel}
            <CheckGroupNote>
              {onlyMissing ? 'гортаються за id картки' : 'ідуть після решти, за id картки'}
            </CheckGroupNote>
          </CheckGroupTitle>
          <BucketGrid>
            {CARD_LIST_MISSING.map(option => (
              <BucketChip
                key={option.key}
                type="button"
                $active={normalized.missing === option.key}
                aria-pressed={normalized.missing === option.key}
                onClick={() => emit({ ...normalized, missing: option.key })}
              >
                {option.label}
              </BucketChip>
            ))}
          </BucketGrid>
        </CheckGroup>
      )}

      {statsText && (
        <ToolDrawerNote data-testid="card-list-stats">
          Остання сторінка: {statsText}
        </ToolDrawerNote>
      )}
    </div>
  );
};

export default CardListQueryControls;
