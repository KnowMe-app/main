import styled, { css, keyframes } from 'styled-components';

/*
 * Вигляд Flow (17.11, за макетом, схваленим власницею продукту): картки на
 * тлі сторінки, суми табличними цифрами, ввід угорі, чіпи груп, налаштування
 * шторкою. Рух — короткий і з легким пружним відскоком
 * (`cubic-bezier(0.34, 1.56, 0.64, 1)`); з `prefers-reduced-motion` його
 * немає зовсім.
 */

export const BOUNCE = 'cubic-bezier(0.34, 1.56, 0.64, 1)';
const SOFT_BOUNCE = 'cubic-bezier(0.34, 1.3, 0.64, 1)';

const rise = keyframes`
  from { opacity: 0; transform: translateY(8px) scale(0.985); }
  to { opacity: 1; transform: none; }
`;
const pop = keyframes`
  0% { transform: scale(0.96); opacity: 0.4; }
  60% { transform: scale(1.02); opacity: 1; }
  100% { transform: none; }
`;
const sheetIn = keyframes`
  from { transform: translateY(100%); }
  to { transform: none; }
`;
const fadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

const noMotion = css`
  @media (prefers-reduced-motion: reduce) {
    animation: none !important;
    transition: none !important;
  }
`;

// Дотик стискає кнопку й відпускає з відскоком.
const pressable = css`
  transition:
    transform 0.22s ${BOUNCE},
    background-color 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease,
    box-shadow 0.2s ease;
  -webkit-tap-highlight-color: transparent;
  &:active:not(:disabled) { transform: scale(0.94); }
  &:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--km-accent-ring, rgba(201, 96, 15, 0.3));
  }
  ${noMotion}
`;

const tabular = css`
  font-variant-numeric: tabular-nums;
`;

export const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 12px 24px;
  box-sizing: border-box;
  width: 100%;
  max-width: 720px;
  margin: 0 auto;
  overflow-x: hidden;
  color: var(--km-text, #1c1b1a);
  font-family: var(--km-font, inherit);
`;

export const TopBar = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
`;

export const TopSpacer = styled.div`
  flex: 1;
`;

export const IconBtn = styled.button`
  min-width: 44px;
  height: 38px;
  padding: 0 10px;
  border: 1px solid var(--km-border, #ded7cc);
  border-radius: 12px;
  background: var(--km-card, #fff);
  color: var(--km-muted, #5e574e);
  font-weight: 600;
  font-size: 15px;
  font-family: inherit;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  ${pressable}
  &:hover:not(:disabled) { border-color: var(--km-accent, #c9600f); color: var(--km-accent, #c9600f); }
  &:disabled { opacity: 0.4; cursor: default; }
  svg { width: 18px; height: 18px; }
`;

export const ScaledContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
`;

export const Card = styled.section`
  background: var(--km-card, #fff);
  border: 1px solid var(--km-border, #ece7df);
  border-radius: 16px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  animation: ${rise} 0.36s ${SOFT_BOUNCE} both;
  ${noMotion}
`;

// Підсумок — заголовок екрана, а не ще одна картка (20.11, на прохання
// власниці продукту): у білій рамці він виглядав полем вводу, і справжнє поле
// запису під ним губилось. Біла картка з рамкою на екрані тепер одна — поле
// запису.
export const SummaryBlock = styled(Card)`
  background: transparent;
  border: none;
  border-radius: 0;
  padding: 4px 2px 2px;
`;

export const SummaryLine = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  font-size: 14px;
  color: var(--km-muted, #6b6359);
  > b {
    color: ${({ $tone }) => ($tone === 'danger' ? 'var(--km-danger, #b42318)' : 'var(--km-text, #1c1b1a)')};
    font-weight: 600;
    white-space: nowrap;
    ${tabular}
  }
`;

// Сума при збільшеному тексті не влазить поруч із підписом — тоді вона стає
// рядком нижче, праворуч, а не виходить за край картки.
export const SummaryTotal = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  ${({ $divided }) => $divided && css`
    border-top: 1px solid var(--km-border, #f1ece5);
    padding-top: 8px;
    margin-top: 2px;
  `}
  > span { font-size: 14px; font-weight: 600; }
  > b {
    margin-left: auto;
    font-size: 22px;
    font-weight: 700;
    white-space: nowrap;
    color: ${({ $tone }) =>
      $tone === 'success' ? 'var(--km-success, #2e7d4f)' : $tone === 'danger' ? 'var(--km-danger, #b42318)' : 'inherit'};
    animation: ${pop} 0.42s ${BOUNCE};
    ${tabular}
    ${noMotion}
  }
`;

export const SummaryNote = styled.span`
  font-size: 12px;
  color: var(--km-muted, #8a8177);
  text-align: right;
  ${tabular}
`;

export const ChipRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  ${({ $scroll }) => $scroll && css`
    flex-wrap: nowrap;
    overflow-x: auto;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
    margin: 0 -2px;
    padding: 0 2px;
    &::-webkit-scrollbar { display: none; }
    > button { flex: 0 0 auto; white-space: nowrap; max-width: none; }
  `}
`;

export const Chip = styled.button`
  min-height: 34px;
  max-width: 100%;
  padding: 6px 12px;
  border: none;
  border-radius: 999px;
  text-align: left;
  font-weight: 600;
  font-size: 13px;
  font-family: inherit;
  line-height: 1.25;
  overflow-wrap: anywhere;
  cursor: pointer;
  background: ${({ $selected, $income }) =>
    $selected
      ? $income ? 'var(--km-success, #2e7d4f)' : 'var(--km-accent, #c9600f)'
      : $income ? 'var(--km-success-bg, #e6f2ea)' : 'var(--km-fill, #efeae3)'};
  color: ${({ $selected, $income }) =>
    $selected ? 'var(--km-on-accent, #fff)' : $income ? 'var(--km-success, #2e7d4f)' : 'var(--km-text, #3d3830)'};
  ${pressable}
`;

export const SearchBox = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  min-height: 42px;
  border-radius: 12px;
  background: var(--km-fill, #f4f0ea);
  border: 1px solid transparent;
  transition: border-color 0.2s ease, background-color 0.2s ease;
  &:focus-within {
    border-color: var(--km-accent, #c9600f);
    background: var(--km-card, #fff);
  }
  svg { flex: 0 0 auto; color: var(--km-muted, #8a8177); }
  input {
    flex: 1;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    font-weight: 400;
  font-size: 15px;
  font-family: inherit;
    color: inherit;
    padding: 10px 0;
  }
`;

export const SmallTextBtn = styled.button`
  border: none;
  background: transparent;
  color: var(--km-muted, #7a7266);
  font-weight: 600;
  font-size: 13px;
  font-family: inherit;
  padding: 6px 4px;
  cursor: pointer;
  ${pressable}
`;

// Згорнута — один рядок: чіп групи й поле поруч; дата й підказка
// з'являються на фокусі, коли картка стає колонкою.
export const EntryCard = styled(Card)`
  gap: 8px;
  ${({ $compact }) => $compact && css`
    flex-direction: row;
    align-items: center;
    padding: 6px 10px;
    > :first-child { flex: 0 1 auto; max-width: 52%; min-width: 0; }
    > :first-child > button {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      overflow-wrap: normal;
    }
    > :nth-child(2) { flex: 1 1 auto; min-width: 0; }
    /* Поле порожнє — підказка в один рядок, без місця під хрестик. */
    textarea { padding-right: 0; white-space: nowrap; }
    textarea::placeholder { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  `}
  border-color: ${({ $focused }) => ($focused ? 'var(--km-accent, #c9600f)' : 'var(--km-border, #ded7cc)')};
  box-shadow: ${({ $focused }) => ($focused ? '0 6px 20px rgba(0, 0, 0, 0.08)' : 'none')};
  transition: border-color 0.2s ease, box-shadow 0.25s ease;
`;

export const EntryMeta = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 13px;
  color: var(--km-muted, #8a8177);
`;

export const GroupPickerChip = styled.button`
  min-height: 32px;
  max-width: 100%;
  padding: 5px 12px;
  border: none;
  border-radius: 999px;
  background: ${({ $income }) => ($income ? 'var(--km-success-bg, #e6f2ea)' : 'var(--km-accent-light, #f6e6d6)')};
  color: ${({ $income }) => ($income ? 'var(--km-success, #2e7d4f)' : 'var(--km-accent-text, #8a420b)')};
  font-weight: 600;
  font-size: 13px;
  font-family: inherit;
  line-height: 1.25;
  text-align: left;
  overflow-wrap: anywhere;
  cursor: pointer;
  ${pressable}
`;

export const EntryField = styled.div`
  position: relative;
`;

// Поле запису розгортається на фокусі й згортається на blur: згорнуте — один
// рядок і не забирає екран у списку, розгорнуте — місце на кілька рядків.
export const EntryTextarea = styled.textarea`
  display: block;
  width: 100%;
  min-height: ${({ $expanded }) => ($expanded ? '104px' : '44px')};
  /* Згорнуте — рівно рядок: висоту, яку поставив useAutoResize під
     розгорнуте поле, перебиває !important, і поле їде вниз анімацією. */
  ${({ $expanded }) => !$expanded && css`
    height: 44px !important;
  `}
  border: none;
  outline: none;
  resize: none;
  overflow: hidden;
  padding: 10px 34px 10px 0;
  box-sizing: border-box;
  background: transparent;
  color: inherit;
  font-weight: 400;
  font-size: 16px;
  font-family: inherit;
  line-height: 1.45;
  transition: min-height 0.34s ${BOUNCE}, height 0.3s ${SOFT_BOUNCE};
  ${noMotion}
`;

export const ClearBtn = styled.button`
  position: absolute;
  top: 10px;
  right: 0;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 999px;
  background: var(--km-fill, #efeae3);
  color: var(--km-muted, #6b6359);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  animation: ${pop} 0.3s ${BOUNCE};
  ${pressable}
`;

export const EntryHint = styled.span`
  font-size: 12px;
  color: var(--km-muted, #8a8177);
`;

export const PrimaryBtn = styled.button`
  min-height: 40px;
  padding: 0 16px;
  border: none;
  border-radius: 12px;
  background: var(--km-accent, #c9600f);
  color: var(--km-on-accent, #fff);
  font-weight: 600;
  font-size: 14px;
  font-family: inherit;
  cursor: pointer;
  ${pressable}
  &:disabled { opacity: 0.45; cursor: default; }
`;

export const GhostBtn = styled.button`
  min-height: 40px;
  padding: 0 14px;
  border: 1px solid var(--km-border, #ded7cc);
  border-radius: 12px;
  background: var(--km-card, #fff);
  color: ${({ $danger }) => ($danger ? 'var(--km-danger, #b42318)' : 'var(--km-text, #3d3830)')};
  font-weight: 600;
  font-size: 14px;
  font-family: inherit;
  cursor: pointer;
  ${pressable}
`;

export const DangerBtn = styled(PrimaryBtn)`
  background: var(--km-danger, #b42318);
`;

export const GroupList = styled.ul`
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

export const GroupItem = styled.li`
  list-style: none;
  border-radius: 16px;
  border: 1px solid ${({ $open }) => ($open ? 'var(--km-border, #ece7df)' : 'transparent')};
  background: ${({ $open }) => ($open ? 'var(--km-card, #fff)' : 'transparent')};
  padding: ${({ $open }) => ($open ? '6px 12px 10px' : '0 2px')};
  transition:
    background-color 0.25s ease,
    border-color 0.25s ease,
    padding 0.3s ${SOFT_BOUNCE};
  animation: ${rise} 0.34s ${SOFT_BOUNCE} both;
  animation-delay: ${({ $index }) => `${Math.min($index || 0, 8) * 30}ms`};
  ${noMotion}
`;

// Назва верхньої групи над її підгрупами: один раз, а не в кожному рядку.
// Розділ — верхня група з підгрупами, згорнутий у рядок «назва · сума».
export const GroupSectionItem = styled.li`
  list-style: none;
  border-radius: 16px;
  background: ${({ $open }) => ($open ? 'var(--km-fill, #f3eee7)' : 'transparent')};
  padding: ${({ $open }) => ($open ? '0 6px 6px' : '0')};
  transition: background-color 0.25s ease, padding 0.3s ${SOFT_BOUNCE};
  ${noMotion}
`;

export const GroupSectionHead = styled.button`
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 2px 12px;
  padding: 7px 2px;
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  border-radius: 12px;
  ${pressable}
  > span:first-child {
    flex: 1 1 140px;
    min-width: 0;
    font-size: 16px;
    font-weight: 700;
    overflow-wrap: break-word;
  }
`;

export const GroupHead = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

export const GroupTitle = styled.button`
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 2px 12px;
  padding: 6px 0;
  border: none;
  background: transparent;
  color: inherit;
  text-align: left;
  font: inherit;
  cursor: pointer;
  border-radius: 8px;
  ${pressable}
  &:active:not(:disabled) { transform: scale(0.985); }
`;

// Назва переноситься словами, а сума стоїть праворуч і, коли назва довга,
// стає під неї (`flex-wrap`), а не стискає назву до колонки з двох літер.
export const GroupName = styled.span`
  flex: 1 1 140px;
  min-width: 0;
  font-size: 15px;
  font-weight: ${({ $nested }) => ($nested ? 500 : 700)};
  overflow-wrap: break-word;
`;

export const GroupNamePrefix = styled.span`
  font-weight: 500;
  color: var(--km-muted, #8a8177);
`;

export const GroupSum = styled.span`
  margin-left: auto;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  font-size: 15px;
  font-weight: 600;
  white-space: nowrap;
  ${tabular}
  small {
    font-size: 11px;
    font-weight: 500;
    color: var(--km-muted, #8a8177);
  }
`;

// Поле запису в розгорнутій групі: пише просто в неї, без шторки груп.
export const InlineAddBtn = styled.button`
  align-self: flex-start;
  margin: 2px 0 6px;
  padding: 6px 2px;
  border: none;
  background: transparent;
  color: var(--km-accent, #c9600f);
  font-weight: 600;
  font-size: 14px;
  font-family: inherit;
  cursor: pointer;
  ${pressable}
`;

export const InlineEntryRow = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 4px 0 8px;
`;

export const InlineEntryInput = styled.input`
  flex: 1 1 auto;
  min-width: 0;
  min-height: 40px;
  padding: 0 12px;
  border: 1px solid transparent;
  border-radius: 12px;
  background: var(--km-fill, #efeae3);
  color: inherit;
  font-size: 16px;
  font-family: inherit;
  outline: none;
  &:focus { border-color: var(--km-accent, #c9600f); }
`;

export const InlineEntryBtn = styled(PrimaryBtn)`
  flex: 0 0 auto;
  min-height: 40px;
`;

export const MonthHead = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 0 2px;
  border-top: 1px solid var(--km-border, #f1ece5);
  font-size: 12px;
  color: var(--km-muted, #8a8177);
  ${tabular}
`;

export const RowList = styled.ul`
  margin: 0;
  padding: 0;
  list-style: none;
`;

// Рядок запису. Звичайно — колонки «дата | опис | сума»; на збільшеному
// тексті (`$stacked`) колонки лишали опису смужку, і «−112 орен+комун Сер»
// ламалось на три рядки (скрин 17.11), тож там угорі дата й сума, а опис —
// під ними на всю ширину. Дії рядка — одна кнопка «⋯» (`$withMore`), а не дві
// кнопки, що на великому тексті ставали одна під одну й робили рядок на пів
// екрана. Між записами — волосяна лінія: без неї на довгому списку не видно,
// де кінчається один запис.
export const EntryRow = styled.li`
  display: grid;
  grid-template-columns: ${({ $stacked, $withMore }) =>
    $stacked
      ? `minmax(0, 1fr) auto${$withMore ? ' auto' : ''}`
      : `44px minmax(0, 1fr) auto${$withMore ? ' auto' : ''}`};
  grid-template-areas: ${({ $stacked, $withMore }) =>
    $stacked
      ? `"date amount${$withMore ? ' more' : ''}" "text text${$withMore ? ' text' : ''}"`
      : `"date text amount${$withMore ? ' more' : ''}"`};
  column-gap: 10px;
  row-gap: 2px;
  align-items: start;
  padding: 7px 4px;
  margin: 0 -4px;
  border-radius: 10px;
  cursor: ${({ $clickable }) => ($clickable ? 'pointer' : 'default')};
  background: ${({ $highlighted, $editing }) =>
    $highlighted ? 'var(--km-danger-bg, #fbe9e7)' : $editing ? 'var(--km-fill, #f4f0ea)' : 'transparent'};
  transition: background-color 0.2s ease, transform 0.22s ${BOUNCE};
  &:active { transform: ${({ $clickable }) => ($clickable ? 'scale(0.99)' : 'none')}; }
  & + & {
    border-top: 1px solid var(--km-border, #f1ece5);
    border-top-left-radius: 0;
    border-top-right-radius: 0;
  }
  ${({ $editing }) => $editing && css`
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas: "text";
  `}
  ${noMotion}
`;

export const RowDate = styled.span`
  grid-area: date;
  font-size: 12px;
  color: var(--km-muted, #8a8177);
  padding-top: 2px;
  ${tabular}
`;

export const RowBody = styled.span`
  grid-area: text;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
`;

export const RowText = styled.span`
  font-size: 14px;
  line-height: 1.35;
  overflow-wrap: anywhere;
`;

export const RowGroupTag = styled.span`
  align-self: flex-start;
  font-size: 11px;
  font-weight: 600;
  color: ${({ $income }) => ($income ? 'var(--km-success, #2e7d4f)' : 'var(--km-muted, #5e574e)')};
  background: ${({ $income }) => ($income ? 'var(--km-success-bg, #e6f2ea)' : 'var(--km-fill, #efeae3)')};
  border-radius: 6px;
  padding: 1px 6px;
  overflow-wrap: anywhere;
`;

export const RowAmount = styled.span`
  grid-area: amount;
  display: flex;
  flex-direction: ${({ $stacked }) => ($stacked ? 'row' : 'column')};
  align-items: ${({ $stacked }) => ($stacked ? 'baseline' : 'flex-end')};
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 0 6px;
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  color: ${({ $negative }) => ($negative ? 'var(--km-danger, #b42318)' : 'inherit')};
  ${tabular}
  small {
    font-size: 11px;
    font-weight: 500;
    color: var(--km-muted, #8a8177);
  }
`;

export const EditBox = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  animation: ${rise} 0.26s ${BOUNCE} both;
  ${noMotion}
  textarea {
    width: 100%;
    min-height: 84px;
    border: 1px solid var(--km-accent, #c9600f);
    border-radius: 10px;
    padding: 8px 10px;
    box-sizing: border-box;
    background: var(--km-card, #fff);
    color: inherit;
    font-weight: 400;
  font-size: 15px;
  font-family: inherit;
  line-height: 1.45;
    resize: none;
    overflow: hidden;
    outline: none;
  }
`;

// Дії правки запису — один ряд: «Видалити» й «Зберегти» значками по краях,
// «Перенести» й «Скасувати» словами посередині. Двома парами слів вони
// ставали на телефоні у два ряди.
export const EditActions = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  justify-content: space-between;
`;

export const EditSideActions = styled.div`
  display: flex;
  gap: 6px;
  min-width: 0;
  > button { padding: 0 12px; }
`;

export const EditIconBtn = styled.button`
  flex: 0 0 auto;
  width: 44px;
  height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  border: 1px solid ${({ $primary }) => ($primary ? 'transparent' : 'var(--km-border, #ded7cc)')};
  background: ${({ $primary }) => ($primary ? 'var(--km-accent, #c9600f)' : 'var(--km-card, #fff)')};
  color: ${({ $primary, $danger }) => ($primary ? 'var(--km-on-accent, #fff)' : $danger ? 'var(--km-danger, #b42318)' : 'var(--km-text, #3d3830)')};
  font-size: 19px;
  cursor: pointer;
  ${pressable}
`;

export const EmptyNote = styled.p`
  margin: 4px 0;
  font-size: 13px;
  color: var(--km-muted, #8a8177);
  animation: ${rise} 0.3s ease both;
  ${noMotion}
`;

export const ResultsHead = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--km-muted, #6b6359);
  ${tabular}
`;

export const StatusNote = styled.small`
  font-size: 12px;
  color: var(--km-muted, #8a8177);
`;

/* Шторка (налаштування, вибір групи) і модалки підтвердження. */

export const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 1200;
  background: rgba(28, 27, 26, 0.36);
  display: flex;
  align-items: ${({ $center }) => ($center ? 'center' : 'flex-end')};
  justify-content: center;
  padding: ${({ $center }) => ($center ? '16px' : '0')};
  animation: ${fadeIn} 0.2s ease both;
  ${noMotion}
`;

export const Sheet = styled.div`
  width: 100%;
  max-width: 560px;
  max-height: 88vh;
  overflow-y: auto;
  box-sizing: border-box;
  background: var(--km-card, #fff);
  color: var(--km-text, #1c1b1a);
  border-radius: 20px 20px 0 0;
  padding: 10px 16px calc(20px + env(safe-area-inset-bottom, 0px));
  display: flex;
  flex-direction: column;
  gap: 14px;
  animation: ${sheetIn} 0.42s ${SOFT_BOUNCE} both;
  ${noMotion}
`;

export const SheetGrip = styled.div`
  width: 40px;
  height: 4px;
  border-radius: 2px;
  background: var(--km-border, #ded7cc);
  align-self: center;
`;

export const SheetHead = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  h2 {
    margin: 0;
    font-size: 17px;
    font-weight: 700;
  }
`;

export const SheetSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  > span {
    font-size: 13px;
    color: var(--km-muted, #6b6359);
  }
`;

export const Segmented = styled.div`
  display: grid;
  grid-template-columns: repeat(${({ $count }) => $count || 2}, minmax(0, 1fr));
  gap: 2px;
  padding: 3px;
  border-radius: 12px;
  background: var(--km-fill, #efeae3);
`;

export const SegmentBtn = styled.button`
  min-height: 36px;
  padding: 0 6px;
  border: none;
  border-radius: 10px;
  font-weight: 600;
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  color: ${({ $selected }) => ($selected ? 'var(--km-text, #1c1b1a)' : 'var(--km-muted, #7a7266)')};
  background: ${({ $selected }) => ($selected ? 'var(--km-card, #fff)' : 'transparent')};
  box-shadow: ${({ $selected }) => ($selected ? '0 1px 3px rgba(0, 0, 0, 0.12)' : 'none')};
  ${pressable}
`;

export const SheetRow = styled.button`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  min-height: 50px;
  padding: 0 2px;
  border: none;
  border-bottom: 1px solid var(--km-border, #f1ece5);
  background: transparent;
  color: ${({ $danger }) => ($danger ? 'var(--km-danger, #b42318)' : 'inherit')};
  font-weight: ${({ $danger }) => ($danger ? 600 : 500)};
  font-size: 15px;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  ${pressable}
  &:active:not(:disabled) { transform: scale(0.98); }
  &:last-child { border-bottom: none; }
  small {
    font-size: 13px;
    font-weight: 500;
    color: var(--km-muted, #8a8177);
    text-align: right;
  }
`;

export const Select = styled.select`
  min-height: 42px;
  width: 100%;
  border: 1px solid var(--km-border, #ded7cc);
  border-radius: 12px;
  padding: 0 10px;
  background: var(--km-card, #fff);
  color: inherit;
  font-weight: 500;
  font-size: 15px;
  font-family: inherit;
`;

export const TextInput = styled.input`
  min-height: 42px;
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--km-border, #ded7cc);
  border-radius: 12px;
  padding: 0 12px;
  background: var(--km-card, #fff);
  color: inherit;
  font-weight: 400;
  font-size: 15px;
  font-family: inherit;
  outline: none;
  transition: border-color 0.2s ease;
  &:focus { border-color: var(--km-accent, #c9600f); }
`;

export const InlineRow = styled.div`
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
`;

export const ChipTools = styled.span`
  display: inline-flex;
  gap: 4px;
  margin-left: 2px;
`;

export const MiniBtn = styled.button`
  width: 30px;
  height: 30px;
  border: 1px solid var(--km-border, #ded7cc);
  border-radius: 999px;
  background: var(--km-card, #fff);
  color: ${({ $danger }) => ($danger ? 'var(--km-danger, #b42318)' : 'var(--km-muted, #5e574e)')};
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  animation: ${pop} 0.3s ${BOUNCE};
  ${pressable}
`;

export const Dialog = styled.div`
  width: 100%;
  max-width: 420px;
  max-height: 86vh;
  overflow-y: auto;
  box-sizing: border-box;
  background: var(--km-card, #fff);
  color: var(--km-text, #1c1b1a);
  border-radius: 18px;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.2);
  animation: ${pop} 0.36s ${BOUNCE} both;
  ${noMotion}
  h2 {
    margin: 0;
    font-size: 17px;
    font-weight: 700;
  }
`;

export const DialogText = styled.div`
  font-size: 14px;
  line-height: 1.45;
  color: var(--km-muted, #5e574e);
  overflow-wrap: anywhere;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

export const DialogActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
`;

export const RateOption = styled.label`
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid ${({ $selected }) => ($selected ? 'var(--km-accent, #c9600f)' : 'var(--km-border, #ece7df)')};
  background: ${({ $selected }) => ($selected ? 'var(--km-accent-light, #f6e6d6)' : 'transparent')};
  cursor: pointer;
  transition: border-color 0.2s ease, background-color 0.2s ease;
  input { margin-top: 3px; accent-color: var(--km-accent, #c9600f); }
  span { display: flex; flex-direction: column; gap: 2px; }
  b { font-size: 14px; font-weight: 600; }
  small { font-size: 12px; color: var(--km-muted, #6b6359); }
`;

export const OfflineNote = styled.small`
  font-size: 12px;
  color: var(--km-muted, #6b6359);
  background: var(--km-fill, #efeae3);
  border-radius: 10px;
  padding: 8px 10px;
`;
