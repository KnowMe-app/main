import React from 'react';
import styled from 'styled-components';

const GroupWrapper = styled.div`
  & + & {
    margin-top: 12px;
  }
`;

const GroupLabel = styled.span`
  display: block;
  font-size: 10px;
  font-weight: 700;
  color: var(--matching-chip-label, var(--km-muted));
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 7px;
  line-height: 1;
`;

const ChipsRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

/*
 * Три стани, а не два, і третій — увесь сенс цієї правки.
 *
 * Фільтри тут відніманні: група стартує з усім увімкненим, і читач гасить
 * зайве. Поки «увімкнено» малювалось акцентом завжди, незаймана група крові
 * стояла пʼятьма жовтогарячими кружками — тобто найгучніше на екрані кричало
 * рівно те, що не фільтрує нічого. Тепер акцент носить лише **звужена** група:
 *
 *   $calm  — увімкнено, але в групі увімкнено все: фільтр не діє, і виглядає
 *            він як звичайний спокійний чіп;
 *   акцент — увімкнено в групі, де щось уже знято: саме ці значення й лишають
 *            картки в деці;
 *   off    — знято: пунктир і приглушений текст, щоб різниця читалась і без
 *            кольору (пунктир видно й у чорно-білому, і дальтоніку).
 */
const Chip = styled.button`
  min-height: 36px;
  min-width: 40px;
  padding: 7px 12px;
  border-radius: 20px;
  border: 1.5px ${({ $active }) => ($active ? 'solid' : 'dashed')}
    ${({ $active, $calm }) => {
    if (!$active) return 'var(--matching-chip-border, var(--km-border))';
    return $calm ? 'var(--matching-chip-border, var(--km-border))' : 'var(--km-accent)';
  }};
  background: ${({ $active, $calm }) => {
    if (!$active) return 'transparent';
    return $calm ? 'var(--matching-chip-bg, var(--km-card))' : 'var(--km-accent-light)';
  }};
  color: ${({ $active, $calm }) => {
    if (!$active) return 'var(--matching-chip-label, var(--km-muted))';
    return $calm ? 'var(--matching-chip-text, var(--km-text))' : 'var(--km-accent)';
  }};
  opacity: ${({ $active }) => ($active ? 1 : 0.62)};
  font-family: var(--km-font);
  font-size: 12px;
  font-weight: ${({ $active, $calm }) => (($active && !$calm) ? '600' : '400')};
  cursor: pointer;
  line-height: 1.5;
  transition: border-color 0.15s, background 0.15s, color 0.15s, opacity 0.15s, transform 0.15s;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;

  &:hover {
    border-color: var(--km-accent);
    color: var(--km-accent);
    opacity: 1;
    transform: translateY(-1px);
  }

  &:focus-visible {
    outline: 3px solid var(--km-accent-ring);
    outline-offset: 2px;
  }
`;

/* Число «скільки таких серед завантажених». Воно каже, що буде після тапу, —
 * без нього «31–33» не каже нічого. Нуль лишається на екрані, а не ховається:
 * чіп, що зникає під пальцем, смикає ряд саме тоді, коли в нього цілять. */
const ChipCount = styled.b`
  font-weight: 600;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  opacity: 0.62;
`;

/*
 * Дотик до чіпа — це вибір того, що читача цікавить, а не того, що ні.
 *
 * `selectOnly` (стрічка matching): з незайманої групи дотик до «не заміжня»
 * лишає увімкненою саму «не заміжня». Доти він її **вимикав**, і вибраними
 * ставали всі інші — рівно навпаки до того, чого людина хотіла. Далі дотики
 * додають і знімають значення по одному, а зняте останнє повертає групу в
 * незайманий стан: «нічого» — це не фільтр, а порожній екран.
 *
 * Без прапорця (картотека адміна) лишається віднімання — там групи й
 * задумані як «вимкни зайве».
 */
export const toggleFilterOption = ({ groupValues = {}, options = [], option, selectOnly = false }) => {
  if (!selectOnly) return { ...groupValues, [option]: !groupValues[option] };
  const visible = options.map(({ val }) => val);
  const groupIsCalm = visible.every(val => Boolean(groupValues[val]));
  if (groupIsCalm) {
    return visible.reduce((acc, val) => ({ ...acc, [val]: val === option }), { ...groupValues });
  }
  const next = { ...groupValues, [option]: !groupValues[option] };
  if (visible.every(val => !next[val])) {
    return visible.reduce((acc, val) => ({ ...acc, [val]: true }), next);
  }
  return next;
};

export const CheckboxGroup = ({ label, filterName, options, filters, onChange, optionCounts, selectOnly = false }) => {
  const groupValues = filters[filterName] || {};
  // Незаймана група — та, у якій увімкнено все. Саме вона нічого не фільтрує.
  const groupIsCalm = options.every(({ val }) => Boolean(groupValues[val]));

  const handleToggle = option => {
    onChange({
      ...filters,
      [filterName]: toggleFilterOption({ groupValues, options, option, selectOnly }),
    });
  };

  return (
    <GroupWrapper>
      {label && <GroupLabel>{label}</GroupLabel>}
      <ChipsRow>
        {options.map(({ val, label: optionLabel }) => {
          const isActive = Boolean(groupValues[val]);
          const readableLabel = typeof optionLabel === 'string' ? optionLabel : val;
          const groupLabel = label || filterName;
          const count = optionCounts ? optionCounts[val] || 0 : null;

          return (
            <Chip
              key={val}
              $active={isActive}
              $calm={groupIsCalm}
              aria-pressed={isActive}
              aria-label={count === null
                ? `${groupLabel}: ${readableLabel}`
                : `${groupLabel}: ${readableLabel}, ${count}`}
              onClick={() => handleToggle(val)}
              type="button"
            >
              {optionLabel}
              {count !== null && <ChipCount aria-hidden="true">{count}</ChipCount>}
            </Chip>
          );
        })}
      </ChipsRow>
    </GroupWrapper>
  );
};
