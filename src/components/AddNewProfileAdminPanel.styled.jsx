// Оформлення адмінської консолі на `AddNewProfile`.
//
// Кнопок на цьому екрані два десятки, і вони робили різні речі: одна гортає
// список, друга перебудовує індекс на всю базу, третя переносить коментарі.
// Поки вони лежали одним килимом однакових прямокутників («Info ClearCache ІЛ
// Load ⚙ 🧾 ❤ 👤 Індекси Картки TG💬 ID💬 DPL Save Merg XLSX JSON»), єдиний
// спосіб знайти потрібну був згадати її місце — підпис про дію не казав нічого,
// а сусідство не групувало.
//
// Тому тут не «красивіші кнопки», а розкладка з розділами: кожна група несе
// підпис, що це за робота (список, добірки, індексація, дані, сервіс), а кнопка
// всередині — свою назву словом і, де є, значок. Небезпечне (перебудова
// індексу, перенос коментарів, міграція) стоїть окремо і має свій акцент, тож
// «зібрати картки» більше не сусідить з «очистити кеш» без різниці на вигляд.
//
// Токени — ті самі `--km-*` (src/index.css), що й на сторінці міграції
// (`RtdbMigrationTool`): обидва екрани адмінські й мусять читатись як одна
// панель, а не як дві різні програми.
import styled, { css } from 'styled-components';

export const ConsolePanel = styled.section`
  margin: 8px 0;
  background: var(--km-card);
  border: 1px solid var(--km-border);
  border-radius: var(--km-radius, 14px);
  overflow: hidden;
`;

export const ConsoleHeader = styled.button`
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: transparent;
  border: none;
  border-bottom: 1px solid ${({ $open }) => ($open ? 'var(--km-border)' : 'transparent')};
  color: var(--km-text);
  cursor: pointer;
  text-align: left;
`;

export const ConsoleTitle = styled.span`
  font-family: var(--km-font-display);
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.01em;
`;

export const ConsoleHint = styled.span`
  flex: 1;
  min-width: 0;
  font-size: 11px;
  color: var(--km-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export const ConsoleChevron = styled.span`
  flex-shrink: 0;
  font-size: 11px;
  color: var(--km-muted);
  transform: rotate(${({ $open }) => ($open ? '180deg' : '0deg')});
  transition: transform 0.18s ease;
`;

export const ConsoleBody = styled.div`
  display: flex;
  flex-direction: column;
`;

// Група — це рядок робіт одного роду. Риска зверху замість плашки з підкладкою:
// панель і так картка, а вкладена в неї друга картка читається наліпкою (та
// сама домовленість, що й у рядку стрічки).
export const ToolGroup = styled.div`
  padding: 10px 12px;

  & + & {
    border-top: 1px solid var(--km-border);
  }
`;

export const ToolGroupTitle = styled.div`
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-bottom: 8px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--km-muted);
`;

export const ToolGroupNote = styled.span`
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0;
  text-transform: none;
  color: var(--km-muted);
  opacity: 0.85;
`;

export const ToolRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
`;

const toneStyles = {
  // Дія, що читає або гортає: нічого не міняє ні в базі, ні на диску.
  neutral: css`
    border-color: var(--km-border);
    color: var(--km-text);
  `,
  // Головна дія розділу — та, заради якої розділ відкривають.
  primary: css`
    border-color: var(--km-accent);
    background: var(--km-accent-light);
    color: var(--km-accent);
    font-weight: 700;
  `,
  // Пише в базу на всю колекцію або незворотно міняє файли.
  danger: css`
    border-color: var(--km-danger-border);
    background: var(--km-danger-bg);
    color: var(--km-danger);
  `,
};

export const ToolButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 32px;
  padding: 0 10px;
  border: 1.5px solid var(--km-border);
  border-radius: 9px;
  background: var(--km-card);
  color: var(--km-text);
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s, color 0.15s, transform 0.12s;

  ${({ $tone }) => toneStyles[$tone] || toneStyles.neutral}

  ${({ $active }) => $active && css`
    border-color: var(--km-accent);
    background: var(--km-accent-light);
    color: var(--km-accent);
  `}

  &:hover:not(:disabled) {
    border-color: var(--km-accent);
    color: var(--km-accent);
  }

  &:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--km-accent-ring);
  }

  &:active:not(:disabled) {
    transform: scale(0.97);
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
`;

// Значок без підпису лишається лише там, де підпис нічого не додає (шестерня
// налаштувань, лог). Скрізь інде кнопка називає дію словом.
export const ToolIconButton = styled(ToolButton)`
  width: 32px;
  padding: 0;
  font-size: 14px;
`;

export const ToolCount = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 17px;
  height: 17px;
  padding: 0 4px;
  border-radius: 9px;
  background: var(--km-accent);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
`;

// Розкривна панель під групою (налаштування load, меню індексації) — не модалка:
// її відкривають поруч із кнопкою, яка її стосується, і лишають відкритою.
export const ToolDrawer = styled.div`
  margin-top: 8px;
  padding: 10px;
  border: 1px solid var(--km-border);
  border-radius: 10px;
  background: var(--km-bg);
`;

export const ToolDrawerTitle = styled.div`
  margin-bottom: 8px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--km-muted);
`;

export const ToolDrawerNote = styled.p`
  margin: 0 0 8px;
  font-size: 11px;
  line-height: 1.5;
  color: var(--km-muted);
  overflow-wrap: anywhere;
`;

// --- Меню індексації -------------------------------------------------------
//
// Чекбокси індексації стояли одним стовпчиком у довільному порядку, і читати
// їх доводилось цілком: «Локальна індексація searchId+searchKey (через JSON)»
// сусідила з «Перебудувати searchKeySet набори фільтрів», хоча перша нічого не
// пише в базу, а друга переписує вузол на всю колекцію. Тепер це три групи —
// локальне, бекендне й бакети `searchKey`, — і в кожної сказано, що саме вона
// робить.

export const CheckGroup = styled.div`
  & + & {
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid var(--km-border);
  }
`;

export const CheckGroupTitle = styled.div`
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-bottom: 6px;
  font-size: 11px;
  font-weight: 700;
  color: var(--km-text);
`;

export const CheckGroupNote = styled.span`
  font-size: 10px;
  font-weight: 500;
  color: var(--km-muted);
`;

export const CheckRow = styled.label`
  display: flex;
  align-items: flex-start;
  gap: 7px;
  padding: 4px 0;
  font-size: 12px;
  line-height: 1.4;
  color: var(--km-text);
  cursor: pointer;

  input[type='checkbox'] {
    margin-top: 2px;
    flex-shrink: 0;
    accent-color: var(--km-accent);
  }
`;

export const CheckHint = styled.span`
  display: block;
  font-size: 10px;
  color: var(--km-muted);
`;

// Бакетів `searchKey` півтора десятка, і кожен — одне слово. Стовпчик
// чекбоксів на них давав пів екрана порожнього поля праворуч; чіпи ставлять
// їх у рядок і дають побачити всі одразу.
export const BucketGrid = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
`;

export const BucketChip = styled.button`
  padding: 3px 9px;
  border: 1.5px solid ${({ $active }) => ($active ? 'var(--km-accent)' : 'var(--km-border)')};
  border-radius: 999px;
  background: ${({ $active }) => ($active ? 'var(--km-accent-light)' : 'var(--km-card)')};
  color: ${({ $active }) => ($active ? 'var(--km-accent)' : 'var(--km-muted)')};
  font-family: inherit;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s, color 0.15s;

  &:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--km-accent-ring);
  }
`;

// Крок локальної збірки: номер, дія і, під нею, що саме вона зробить. Раніше це
// були голі `<button>` без жодного оформлення — у темній темі білий текст на
// білому тлі, тобто порожні прямокутники.
export const StepButton = styled.button`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  width: 100%;
  padding: 9px 11px;
  border: 1px solid var(--km-border);
  border-radius: 10px;
  background: var(--km-card);
  color: var(--km-text);
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;

  &:hover:not(:disabled) {
    border-color: var(--km-accent);
    background: var(--km-accent-light);
  }

  &:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--km-accent-ring);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

export const StepHint = styled.span`
  font-size: 11px;
  font-weight: 500;
  line-height: 1.45;
  color: var(--km-muted);
  overflow-wrap: anywhere;
`;

export const ModalTitleRow = styled.h3`
  margin: 0 0 6px;
  font-family: var(--km-font-display);
  font-size: 17px;
  font-weight: 700;
  color: var(--km-text);
`;
