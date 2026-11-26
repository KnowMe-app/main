import styled, { css } from 'styled-components';

/*
 * Стилі «Комуналки». Каркас (шапка, картки, шторка, кнопки) — спільний із
 * Flow (`FlowManager.styled.js`), тут лише своє: блоки місяця, поля
 * показників, позначки «без змін / змінено», кнопки перенесення, розрахунок
 * і текст для орендаря. Кольори — токени `--km-*` з запасними значеннями.
 */

const tabular = css`
  font-variant-numeric: tabular-nums;
`;

export const Title = styled.h1`
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  white-space: nowrap;
`;

export const AptChips = styled.div`
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 2px 0 4px;
  scrollbar-width: none;
  &::-webkit-scrollbar { display: none; }
`;

export const AptChip = styled.button`
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  padding: 6px 14px;
  border: ${({ $add }) => ($add ? '1px dashed var(--km-border, #ded7cc)' : 'none')};
  border-radius: 999px;
  background: ${({ $selected, $add }) => ($add ? 'transparent' : $selected ? 'var(--km-accent, #c9600f)' : 'var(--km-fill, #efeae3)')};
  color: ${({ $selected, $add }) => ($add ? 'var(--km-muted, #6b6359)' : $selected ? 'var(--km-on-accent, #fff)' : 'var(--km-text, #1c1b1a)')};
  font: inherit;
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
  small {
    font-weight: 500;
    opacity: 0.85;
    ${tabular}
  }
`;

export const SummaryKicker = styled.div`
  font-size: 13px;
  color: var(--km-muted, #6b6359);
`;

export const SummaryBig = styled.div`
  font-size: 30px;
  font-weight: 700;
  letter-spacing: -0.01em;
  ${tabular}
  color: ${({ $negative }) => ($negative ? 'var(--km-danger, #b42318)' : 'var(--km-success, #2e7d4f)')};
`;

export const Trio = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-top: 8px;
  padding-top: 10px;
  border-top: 1px solid var(--km-border, #ece7df);
  ${tabular}
  span {
    display: block;
    font-size: 12px;
    color: var(--km-muted, #6b6359);
  }
  b { font-weight: 600; }
`;

export const EditorCard = styled.section`
  background: var(--km-card, #fff);
  border: 1px solid var(--km-border, #ece7df);
  border-radius: 16px;
  overflow: hidden;
  min-width: 0;
`;

export const EditorHead = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 14px 4px;
  h2 {
    margin: 0;
    font-size: 17px;
    font-weight: 700;
  }
  span {
    font-size: 13px;
    color: var(--km-muted, #6b6359);
  }
`;

export const DateLine = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 14px 10px;
  font-size: 13px;
  color: var(--km-muted, #6b6359);
  input {
    width: 118px;
    border: 0;
    border-radius: 8px;
    background: var(--km-fill, #efeae3);
    padding: 6px 8px;
    font: inherit;
    font-size: 13px;
    color: var(--km-text, #1c1b1a);
  }
`;

export const CarryAll = styled.button`
  display: flex;
  justify-content: space-between;
  gap: 8px;
  width: calc(100% - 28px);
  margin: 0 14px 12px;
  padding: 10px 12px;
  border: 1px dashed var(--km-accent, #c9600f);
  border-radius: 12px;
  background: var(--km-accent-light, #fcebdc);
  color: var(--km-accent-text, #9a470a);
  font: inherit;
  font-weight: 600;
  font-size: 14px;
  text-align: left;
  cursor: pointer;
`;

export const Block = styled.div`
  border-top: 1px solid var(--km-border, #ece7df);
  padding: 12px 14px;
`;

export const BlockHead = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  b {
    flex: 1;
    font-size: 15px;
  }
  span {
    font-weight: 700;
    ${tabular}
  }
`;

export const Dot = styled.i`
  width: 9px;
  height: 9px;
  border-radius: 999px;
  flex: 0 0 auto;
  background: ${({ $tone }) => ($tone === 'light' ? '#c7921f' : $tone === 'water' ? '#3b78c2' : 'var(--km-muted, #8a8177)')};
`;

export const FieldRow = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 2px 10px;
  align-items: center;
  padding: 6px 0;
`;

export const FieldLabel = styled.div`
  font-size: 14px;
  min-width: 0;
  small {
    display: block;
    font-size: 12.5px;
    color: var(--km-muted, #6b6359);
  }
`;

export const NumInput = styled.input`
  width: 120px;
  box-sizing: border-box;
  border: 0;
  border-radius: 10px;
  background: ${({ $empty }) => ($empty ? 'transparent' : 'var(--km-fill, #efeae3)')};
  outline: ${({ $empty, $bad }) => ($bad ? '2px solid var(--km-danger, #b42318)' : $empty ? '1.5px dashed var(--km-border, #ded7cc)' : 'none')};
  padding: 9px 11px;
  text-align: right;
  font: inherit;
  font-size: 16px;
  font-weight: 600;
  color: var(--km-text, #1c1b1a);
  ${tabular}
  &:focus {
    outline: 2px solid var(--km-accent, #c9600f);
    background: var(--km-card, #fff);
  }
  &[readonly] {
    background: transparent;
    outline: none;
  }
`;

export const Calc = styled.div`
  grid-column: 1 / -1;
  min-height: 16px;
  font-size: 12.5px;
  color: var(--km-muted, #6b6359);
  ${tabular}
  b {
    color: var(--km-text, #1c1b1a);
    font-weight: 600;
  }
`;

export const Status = styled.div`
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  min-height: 18px;
  font-size: 12.5px;
`;

export const Tag = styled.span`
  font-size: 11.5px;
  font-weight: 600;
  border-radius: 6px;
  padding: 2px 7px;
  background: ${({ $changed }) => ($changed ? 'var(--km-accent-light, #fcebdc)' : 'var(--km-fill, #efeae3)')};
  color: ${({ $changed }) => ($changed ? 'var(--km-accent-text, #9a470a)' : 'var(--km-muted, #6b6359)')};
`;

export const ErrorText = styled.span`
  color: var(--km-danger, #b42318);
`;

export const CarryBtn = styled.button`
  border: 1px ${({ $other }) => ($other ? 'dashed' : 'solid')} var(--km-accent, #c9600f);
  border-radius: 999px;
  background: var(--km-card, #fff);
  color: var(--km-accent-text, #9a470a);
  padding: 4px 11px;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  ${tabular}
`;

// Назва — першим рядком на всю ширину, знак, сума й «×» — другим: формула
// коригування («24000-23730.87») у вузькій колонці обрізалась.
export const ExtraRow = styled.div`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  > input:first-of-type { grid-column: 1 / -1; grid-row: 1; }
  gap: 6px;
  align-items: center;
  padding: 4px 0;
  input {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    border: 0;
    border-radius: 8px;
    background: var(--km-fill, #efeae3);
    padding: 8px;
    font: inherit;
    font-size: 14px;
    color: var(--km-text, #1c1b1a);
  }
  input[data-amount] {
    text-align: right;
    ${tabular}
  }
`;

export const SignBtn = styled.button`
  width: 34px;
  height: 34px;
  border: 0;
  border-radius: 8px;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  background: ${({ $charge }) => ($charge ? 'var(--km-danger-bg, #fff2f1)' : 'var(--km-success-bg, #ebf8ef)')};
  color: ${({ $charge }) => ($charge ? 'var(--km-danger, #b42318)' : 'var(--km-success, #2e7d4f)')};
`;

export const LinkBtn = styled.button`
  border: 0;
  background: none;
  padding: 6px 0;
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  color: var(--km-accent-text, #9a470a);
  cursor: pointer;
`;

export const CalcBlock = styled.div`
  border-top: 1px solid var(--km-border, #ece7df);
  padding: 12px 14px;
  background: var(--km-fill, #efeae3);
  ${tabular}
`;

export const CalcLine = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 3px 0;
  font-size: ${({ $total }) => ($total ? '17px' : '14px')};
  font-weight: ${({ $total, $bold }) => ($total || $bold ? 700 : 400)};
  ${({ $total }) => $total && css`
    margin-top: 4px;
    padding-top: 8px;
    border-top: 1px solid var(--km-border, #ded7cc);
  `}
  span:first-child {
    color: ${({ $total, $bold }) => ($total || $bold ? 'var(--km-text, #1c1b1a)' : 'var(--km-muted, #6b6359)')};
  }
`;

export const Amount = styled.span`
  color: ${({ $tone }) => ($tone === 'pos' ? 'var(--km-success, #2e7d4f)' : $tone === 'neg' ? 'var(--km-danger, #b42318)' : 'inherit')};
`;

export const Missing = styled.div`
  margin-top: 8px;
  font-size: 13px;
  color: var(--km-muted, #6b6359);
`;

export const PasteBlock = styled.div`
  border-top: 1px solid var(--km-border, #ece7df);
  padding: 12px 14px 14px;
`;

export const PasteHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
  b { font-size: 14px; }
`;

export const PasteText = styled.pre`
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12.5px;
  line-height: 1.5;
  background: var(--km-fill, #efeae3);
  color: var(--km-text, #1c1b1a);
  border-radius: 10px;
  padding: 10px 12px;
  user-select: all;
`;

export const PaymentTemplateArea = styled.textarea`
  width: 100%;
  box-sizing: border-box;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 13px;
  line-height: 1.5;
  background: var(--km-card, #fff);
  color: var(--km-text, #1c1b1a);
  border: 1px solid var(--km-accent, #c9600f);
  border-radius: 10px;
  padding: 10px 12px;
  resize: vertical;
`;

export const TokenRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
`;

export const TokenChip = styled.button`
  border: 0;
  border-radius: 999px;
  background: var(--km-fill, #efeae3);
  color: var(--km-text, #1c1b1a);
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12.5px;
  padding: 6px 10px;
  min-height: 32px;
  cursor: pointer;
`;

export const Foot = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px 14px;
  border-top: 1px solid var(--km-border, #ece7df);
`;

export const HistoryTitle = styled.h2`
  margin: 10px 4px 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--km-muted, #6b6359);
`;

export const MonthCard = styled.article`
  background: var(--km-card, #fff);
  border: 1px solid var(--km-border, #ece7df);
  border-radius: 16px;
  overflow: hidden;
`;

export const MonthHead = styled.button`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 2px 10px;
  width: 100%;
  border: 0;
  background: transparent;
  padding: 12px 14px;
  text-align: left;
  font: inherit;
  color: var(--km-text, #1c1b1a);
  cursor: pointer;
  strong { font-size: 16px; }
  small {
    font-size: 12px;
    color: var(--km-muted, #6b6359);
  }
`;

export const MonthResult = styled.span`
  grid-row: 1 / 3;
  grid-column: 2;
  align-self: center;
  text-align: right;
  font-weight: 700;
  ${tabular}
  color: ${({ $negative }) => ($negative ? 'var(--km-danger, #b42318)' : 'var(--km-success, #2e7d4f)')};
  small {
    display: block;
    font-size: 11px;
    font-weight: 500;
    color: var(--km-muted, #6b6359);
  }
`;

export const SettingRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--km-border, #ece7df);
  border-radius: 12px;
  > div { flex: 1; min-width: 0; }
  small {
    display: block;
    font-size: 12.5px;
    color: var(--km-muted, #6b6359);
  }
`;

export const InitGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: 8px;
  label {
    display: grid;
    gap: 3px;
    font-size: 12px;
    color: var(--km-muted, #6b6359);
  }
`;

export const Hint = styled.p`
  margin: 0;
  font-size: 13px;
  color: var(--km-muted, #6b6359);
`;
