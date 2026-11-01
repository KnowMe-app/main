import React, { useEffect, useState } from 'react';
import styled, { css } from 'styled-components';
import { ToolCount } from './AddNewProfileAdminPanel.styled';
import { readFieldDate } from 'utils/cardListQuery';
import {
  CARD_LIST_COLLECTION_GROUPS,
  CARD_LIST_MORE_COLLECTIONS,
  CARD_LIST_PERIOD_LABELS,
  CARD_LIST_PRIMARY_COLLECTIONS,
  collectionOffersPeriod,
  describeCardListPeriodField,
  getCardListCollection,
  getCardListOrder,
  listCardListPeriods,
} from 'utils/cardListCollections';

/*
 * Панель «Списку» на `AddNewProfile`: три питання, кожне одним рядком.
 *
 * 1. **Показати** — яка колекція карток. Кожна колекція стоїть рівно в
 *    одному місці: чіпом на виду або в «Ще», з поясненням одним реченням.
 * 2. **Порядок** і **період** — лише ті, що мають сенс у цій колекції.
 * 3. **Фільтри** — звуження, і кожне діюче видно чіпом із ✕.
 *
 * Тут була шухляда «Сортування» з п'ятьма групами (готові списки, поле,
 * порядок, період, «картки без значення») поруч із рядом чіпів-добірок, і ті
 * самі «Обрані» стояли трьома різними кнопками. Розібратись у ній міг лише
 * той, хто її писав. Запит двигуна з вибору збирає `utils/cardListCollections`.
 *
 * Добірки поза двигуном (цикл, черга доповнень, «хто шукав») приходять ззовні
 * (`specialViews`): у них свої завантажувачі, але для адміна це такі самі
 * відповіді на «що показати», тож стоять вони в тому самому ряду.
 */

const Panel = styled.section`
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 8px 0;
  padding: 12px;
  background: var(--km-card);
  border: 1px solid var(--km-border);
  border-radius: var(--km-radius, 14px);
`;

const Row = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
`;

const RowLabel = styled.span`
  flex-basis: 100%;
  font-size: 12px;
  color: var(--km-muted);
`;

const chipBase = css`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: none;
  font-family: inherit;
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;

  &:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--km-accent-ring);
  }

  &:disabled {
    opacity: 0.5;
    cursor: wait;
  }
`;

// Колекція — суцільний акцент, як вибраний чіп на решті екранів матчингу.
const CollectionChip = styled.button`
  ${chipBase}
  min-height: 34px;
  padding: 0 14px;
  border-radius: 999px;
  background: ${({ $active }) => ($active ? 'var(--km-accent)' : 'var(--km-fill, var(--km-bg))')};
  color: ${({ $active }) => ($active ? 'var(--km-on-accent, #fff)' : 'var(--km-text)')};
  font-size: 13px;
  font-weight: ${({ $active }) => ($active ? 700 : 500)};
`;

// «Одне з кількох» усередині колекції — доріжка з білим вибраним сегментом,
// та сама, що в глибині пошуку: порядок і період — уточнення, а не вибір
// колекції, і кричати акцентом поруч з нею їм не треба.
const Track = styled.div`
  display: inline-flex;
  flex-wrap: wrap;
  gap: 2px;
  max-width: 100%;
  padding: 3px;
  border-radius: 10px;
  background: var(--km-fill, var(--km-bg));
`;

const Segment = styled.button`
  ${chipBase}
  min-height: 30px;
  padding: 0 10px;
  border-radius: 8px;
  background: ${({ $active }) => ($active ? 'var(--km-card)' : 'transparent')};
  box-shadow: ${({ $active }) => ($active ? '0 1px 2px rgba(0, 0, 0, 0.12)' : 'none')};
  color: ${({ $active }) => ($active ? 'var(--km-text)' : 'var(--km-muted)')};
  font-size: 12px;
  font-weight: ${({ $active }) => ($active ? 700 : 500)};
`;

const Summary = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding-top: 10px;
  border-top: 1px solid var(--km-border);
`;

const SummaryText = styled.p`
  flex: 1;
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
  color: var(--km-text);
`;

const SummaryStatus = styled.span`
  color: var(--km-muted);
  white-space: nowrap;
`;

const PlainButton = styled.button`
  ${chipBase}
  min-height: 30px;
  padding: 0 10px;
  border-radius: 8px;
  background: var(--km-fill, var(--km-bg));
  color: var(--km-text);
  font-size: 12px;
  font-weight: 600;

  ${({ $active }) => $active && css`
    background: var(--km-accent-light);
    color: var(--km-accent);
  `}
`;

const LinkButton = styled.button`
  ${chipBase}
  padding: 4px 2px;
  background: none;
  color: var(--km-muted);
  font-size: 12px;
  text-decoration: underline;
  text-underline-offset: 2px;
`;

// Діючий фільтр — та сама заливка, що й вибраний чіп фільтра, з ✕ праворуч:
// що звужує список, видно без відкритої шухляди.
const FilterChip = styled.button`
  ${chipBase}
  min-height: 30px;
  padding: 0 8px 0 11px;
  border-radius: 999px;
  background: ${({ $danger }) => ($danger ? 'var(--km-danger-bg)' : 'var(--km-accent-light)')};
  color: ${({ $danger }) => ($danger ? 'var(--km-danger)' : 'var(--km-accent)')};
  font-size: 12px;
  font-weight: 600;
  white-space: normal;
  text-align: left;
`;

const ChipCross = styled.span`
  font-size: 15px;
  line-height: 1;
  opacity: 0.8;
`;

const Drawer = styled.div`
  padding: 10px;
  border: 1px solid var(--km-border);
  border-radius: 10px;
  background: var(--km-bg);
`;

const MoreGroup = styled.div`
  & + & {
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px solid var(--km-border);
  }
`;

const MoreGroupTitle = styled.div`
  margin: 0 0 4px;
  padding: 0 10px;
  font-size: 11px;
  font-weight: 700;
  color: var(--km-muted);
`;

const MoreItem = styled.button`
  ${chipBase}
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  width: 100%;
  padding: 7px 10px;
  border-radius: 8px;
  background: ${({ $active }) => ($active ? 'var(--km-accent-light)' : 'transparent')};
  color: var(--km-text);
  text-align: left;
  white-space: normal;

  &:hover:not(:disabled) {
    background: var(--km-fill, var(--km-card));
  }
`;

const MoreItemLabel = styled.span`
  font-size: 13px;
  font-weight: 600;
  color: ${({ $active }) => ($active ? 'var(--km-accent)' : 'var(--km-text)')};
`;

const MoreItemHint = styled.span`
  font-size: 12px;
  color: var(--km-muted);
`;

const CheckLabel = styled.label`
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  color: var(--km-text);
  cursor: pointer;

  input {
    margin: 0;
    accent-color: var(--km-accent);
  }
`;

const DateLabel = styled.label`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--km-muted);
`;

const DateInput = styled.input`
  width: 104px;
  padding: 5px 8px;
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

const StatsNote = styled.p`
  margin: 0;
  font-size: 11px;
  color: var(--km-muted);
  overflow-wrap: anywhere;
`;

const pluralCards = count => {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'картка';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'картки';
  return 'карток';
};

/** Скільки показано словами: «Усього 34 картки» чи «Завантажено 40 — є ще». */
export const describeCardListStatus = ({ loading = false, count = 0, hasMore = false } = {}) => {
  if (loading && count === 0) return 'Завантажуємо…';
  if (count === 0) return hasMore ? 'На цій сторінці нічого — далі є ще.' : 'Карток немає.';
  if (hasMore) return `Завантажено ${count} — є ще.`;
  return `Усього ${count} ${pluralCards(count)}.`;
};

const formatDotted = iso => {
  const date = readFieldDate(iso);
  if (!date) return '';
  const [year, month, day] = date.split('-');
  return `${day}.${month}.${year}`;
};

// Текст, а не `type="date"`: нативне поле дати на Android лише виділяло
// сегмент плейсхолдера (див. графік програми). Розбір — той самий
// `readFieldDate`, що читає дати полів.
const CustomDateInput = ({ label, value, onCommit }) => {
  const [text, setText] = useState(formatDotted(value));
  useEffect(() => {
    setText(formatDotted(value));
  }, [value]);

  const commit = () => {
    const trimmed = text.trim();
    if (!trimmed) {
      onCommit(null);
      return;
    }
    const iso = readFieldDate(trimmed);
    if (iso) onCommit(iso);
    else setText(formatDotted(value));
  };

  return (
    <DateLabel>
      {label}
      <DateInput
        type="text"
        inputMode="numeric"
        placeholder="дд.мм.рррр"
        value={text}
        aria-label={`Період: ${label}`}
        onChange={event => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={event => {
          if (event.key === 'Enter') commit();
        }}
      />
    </DateLabel>
  );
};

const SPECIAL_VIEW_GROUP_LABEL = 'Черги адміна';

export const CardListPanel = ({
  // Вибір «Списку»: колекція, порядок, період, галочка «без дати» —
  // `resolveCardListSelection` від поточного запиту.
  selection,
  onSelect,
  // Що зараз на екрані: 'list' — «Список»; 'idle' — ще нічого не обрано;
  // 'search' — видача пошуку; ключ добірки з `specialViews`; 'duplicates',
  // 'json' — службові перегляди з «Інструментів».
  view = 'idle',
  specialViews = [],
  status = {},
  searchText = '',
  searchFiltersApplied = true,
  onRefresh,
  statsText = '',
  filterChips = [],
  filtersOpen = false,
  onToggleFilters,
  onRemoveFilter,
  onResetFilters,
  filtersApply = true,
  filtersDrawer = null,
  children,
}) => {
  const [moreOpen, setMoreOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);

  const collection = getCardListCollection(selection?.collection);
  const order = getCardListOrder(collection, selection?.order);
  const periods = listCardListPeriods(collection, order);
  const customPeriod = selection?.period && typeof selection.period === 'object' ? selection.period : null;
  const listShown = view === 'list';
  const activeSpecial = specialViews.find(item => item.key === view) || null;

  const select = next => {
    if (typeof onSelect === 'function') onSelect({ ...selection, ...next });
  };

  const pickCollection = key => {
    setMoreOpen(false);
    // Повторний дотик до відкритої колекції — «оновити», а не «скинути»:
    // обраний порядок і період лишаються.
    if (collection.key === key) {
      if (listShown) onRefresh?.();
      // Поверх колекції стоїть інший перегляд (дублікати, пошук): дотик
      // повертає саме її, з обраним порядком і періодом.
      else onSelect?.({ ...selection });
      return;
    }
    setCustomOpen(false);
    // Нова колекція — зі своїми умовчаннями: порядок «спершу сьогоднішні»
    // нічого не означав би в «Обраних».
    onSelect?.({ collection: key });
  };

  const pickSpecial = item => {
    setMoreOpen(false);
    item.onSelect?.();
  };

  const commitCustomEdge = (edge, iso) => {
    const base = customPeriod || {};
    const next = { ...base, [edge]: iso || undefined };
    select({ period: next.from || next.to ? next : periods[0] });
  };

  const primarySpecial = specialViews.filter(item => item.primary);
  const moreSpecial = specialViews.filter(item => !item.primary);
  const activeMoreCollection = listShown && !collection.primary ? collection : null;
  const activeMoreSpecial = activeSpecial && !activeSpecial.primary ? activeSpecial : null;
  const moreLabel = activeMoreCollection?.label || activeMoreSpecial?.label || 'Ще';
  const moreActive = Boolean(activeMoreCollection || activeMoreSpecial);

  let summary;
  if (view === 'search') {
    summary = (
      <>
        Результати пошуку{searchText ? ` «${searchText}»` : ''}.
        {filterChips.length > 0 && (searchFiltersApplied
          ? ' Фільтри звужують видачу.'
          : ' Фільтри до пошуку не застосовуються (⚙ біля рядка пошуку).')}
      </>
    );
  } else if (listShown) {
    summary = collection.hint;
  } else if (activeSpecial) {
    summary = activeSpecial.hint;
  } else if (view === 'duplicates') {
    summary = 'Дублікати в завантаженому списку («Інструменти»).';
  } else if (view === 'json') {
    summary = 'Картки зі списку JSON і те, що за ними знайдено.';
  } else {
    summary = 'Оберіть, які картки показати.';
  }

  const showStatus = view !== 'idle' && !(activeSpecial && activeSpecial.ownStatus);
  const offersPeriod = listShown && collectionOffersPeriod(collection, order);

  return (
    <Panel data-testid="card-list-panel">
      <Row role="group" aria-label="Що показати">
        {CARD_LIST_PRIMARY_COLLECTIONS.map(item => {
          const active = listShown && collection.key === item.key;
          return (
            <CollectionChip
              key={item.key}
              type="button"
              $active={active}
              aria-pressed={active}
              title={active ? 'Відкрито · ще дотик — оновити з бази' : item.hint}
              onClick={() => pickCollection(item.key)}
            >
              {item.label}
            </CollectionChip>
          );
        })}
        {primarySpecial.map(item => (
          <CollectionChip
            key={item.key}
            type="button"
            $active={view === item.key}
            aria-pressed={view === item.key}
            title={item.hint}
            disabled={item.disabled}
            onClick={() => pickSpecial(item)}
          >
            {item.loading ? '…' : item.label}
          </CollectionChip>
        ))}
        <CollectionChip
          type="button"
          $active={moreActive}
          aria-expanded={moreOpen}
          aria-haspopup="true"
          onClick={() => setMoreOpen(previous => !previous)}
        >
          {moreLabel} {moreOpen ? '▴' : '▾'}
        </CollectionChip>
      </Row>

      {moreOpen && (
        <Drawer data-testid="card-list-more">
          {CARD_LIST_COLLECTION_GROUPS.map(group => {
            const items = CARD_LIST_MORE_COLLECTIONS.filter(item => item.group === group.key);
            if (!items.length) return null;
            return (
              <MoreGroup key={group.key}>
                <MoreGroupTitle>{group.label}</MoreGroupTitle>
                {items.map(item => {
                  const active = listShown && collection.key === item.key;
                  return (
                    <MoreItem
                      key={item.key}
                      type="button"
                      $active={active}
                      aria-pressed={active}
                      onClick={() => pickCollection(item.key)}
                    >
                      <MoreItemLabel $active={active}>{item.label}</MoreItemLabel>
                      <MoreItemHint>{item.hint}</MoreItemHint>
                    </MoreItem>
                  );
                })}
              </MoreGroup>
            );
          })}
          {moreSpecial.length > 0 && (
            <MoreGroup>
              <MoreGroupTitle>{SPECIAL_VIEW_GROUP_LABEL}</MoreGroupTitle>
              {moreSpecial.map(item => (
                <MoreItem
                  key={item.key}
                  type="button"
                  $active={view === item.key}
                  aria-pressed={view === item.key}
                  disabled={item.disabled}
                  onClick={() => pickSpecial(item)}
                >
                  <MoreItemLabel $active={view === item.key}>{item.loading ? `${item.label}…` : item.label}</MoreItemLabel>
                  <MoreItemHint>{item.hint}</MoreItemHint>
                </MoreItem>
              ))}
            </MoreGroup>
          )}
        </Drawer>
      )}

      <Summary>
        <SummaryText data-testid="card-list-summary">
          {summary}
          {showStatus && <> <SummaryStatus>{describeCardListStatus(status)}</SummaryStatus></>}
        </SummaryText>
        {listShown && typeof onRefresh === 'function' && (
          <PlainButton type="button" onClick={onRefresh} title="Перечитати перелік і анкети з бази, повз кеш">
            ↻ Оновити
          </PlainButton>
        )}
      </Summary>

      {listShown && collection.orders.length > 1 && (
        <Row>
          <RowLabel>Порядок</RowLabel>
          <Track role="radiogroup" aria-label="Порядок">
            {collection.orders.map(item => (
              <Segment
                key={item.key}
                type="button"
                role="radio"
                aria-checked={order.key === item.key}
                $active={order.key === item.key}
                onClick={() => select({ order: item.key })}
              >
                {item.label}
              </Segment>
            ))}
          </Track>
        </Row>
      )}

      {offersPeriod && (
        <Row>
          <RowLabel>{describeCardListPeriodField(collection, order) || 'Період'}</RowLabel>
          <Track role="radiogroup" aria-label="Період">
            {periods.map(period => {
              const active = !customPeriod && !customOpen && selection?.period === period;
              return (
                <Segment
                  key={period}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  $active={active}
                  onClick={() => {
                    setCustomOpen(false);
                    select({ period });
                  }}
                >
                  {CARD_LIST_PERIOD_LABELS[period] || period}
                </Segment>
              );
            })}
            {collection.customPeriod && (
              <Segment
                type="button"
                role="radio"
                aria-checked={Boolean(customPeriod || customOpen)}
                $active={Boolean(customPeriod || customOpen)}
                onClick={() => setCustomOpen(true)}
              >
                Свої дати
              </Segment>
            )}
          </Track>
          {(customPeriod || customOpen) && (
            <Row>
              <CustomDateInput label="з" value={customPeriod?.from} onCommit={iso => commitCustomEdge('from', iso)} />
              <CustomDateInput label="по" value={customPeriod?.to} onCommit={iso => commitCustomEdge('to', iso)} />
            </Row>
          )}
        </Row>
      )}

      {listShown && collection.withMissing && (
        <CheckLabel>
          <input
            type="checkbox"
            checked={Boolean(selection?.withMissing)}
            onChange={event => select({ withMissing: event.target.checked })}
          />
          {collection.withMissing}
        </CheckLabel>
      )}

      {filtersApply && (
        <Row data-testid="card-list-filters">
          <PlainButton
            type="button"
            $active={filtersOpen}
            aria-expanded={filtersOpen}
            onClick={onToggleFilters}
            title="Звузити список: роль, вік, кров, позначки…"
          >
            Фільтри
            {filterChips.length > 0 && <ToolCount>{filterChips.length}</ToolCount>}
            {filtersOpen ? ' ▴' : ' ▾'}
          </PlainButton>
          {filterChips.map(chip => (
            <FilterChip
              key={chip.filterName}
              type="button"
              $danger={chip.danger}
              onClick={() => onRemoveFilter?.(chip.filterName)}
              aria-label={`Зняти фільтр «${chip.text}»`}
              title="Зняти фільтр"
            >
              {chip.text}
              <ChipCross aria-hidden="true">×</ChipCross>
            </FilterChip>
          ))}
          {filterChips.length > 1 && (
            <LinkButton type="button" onClick={onResetFilters}>
              Скинути всі
            </LinkButton>
          )}
        </Row>
      )}

      {filtersApply && filtersOpen && filtersDrawer}

      {children}

      {listShown && statsText && (
        <StatsNote data-testid="card-list-stats">Остання сторінка: {statsText}</StatsNote>
      )}
    </Panel>
  );
};

export default CardListPanel;
