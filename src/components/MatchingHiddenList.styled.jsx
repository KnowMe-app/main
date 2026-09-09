import styled, { css, keyframes } from 'styled-components';
import {
  NOTE_META_LINE_HEIGHT,
  NOTE_META_SIZE,
  NOTE_TEXT_LINE_HEIGHT,
  NOTE_TEXT_SIZE,
} from './noteTypography';

export const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  width: 100%;
  min-height: 0;
  padding: 0 10px 10px;
  box-sizing: border-box;
`;

export const HiddenHeaderTitle = styled.div`
  font-size: 16.5px;
  font-weight: 700;
  letter-spacing: -0.015em;
  color: var(--matching-header-text);
  white-space: nowrap;
  flex: 1 0 auto;
  overflow: visible;

  span {
    color: var(--matching-muted-text);
    font-weight: 600;
    margin-left: 2px;
  }
`;

export const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: 2px 0 4px;
`;

// Смужка ролі на лівому краї — те, що лишилось від плитки з ініціалами.
// Колір несе те саме «хто це», але не забирає ані ширини, ані уваги; для
// анкети без ролі смужки просто немає.
export const ROLE_STRIPE_COLORS = {
  ed: '#c95b83',
  ag: '#4d86c9',
  ip: '#3f9b8e',
  sm: '#8a5ec2',
  cl: '#4a9bc9',
};

export const Card = styled.div`
  position: relative;
  background: var(--matching-card-bg);
  border: 1px solid var(--matching-card-border);
  border-radius: 20px;
  padding: 11px;
  cursor: pointer;
  overflow: hidden;
  transition: opacity 200ms ease, transform 200ms ease;

  ${({ $role }) => ROLE_STRIPE_COLORS[$role] && css`
    &::before {
      content: '';
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 3px;
      background: ${ROLE_STRIPE_COLORS[$role]};
    }
  `}
`;

export const Top = styled.div`
  display: flex;
  gap: 11px;
  align-items: flex-start;
  min-height: 58px;
`;

// Spec §5 correction 3: one row of a different height breaks the list's rhythm
// harder than any colour does, so the avatar box is pinned - fixed width, fixed
// height, and a min-height on the row's top block so a short body can't shrink it.
export const Photo = styled.div`
  position: relative;
  width: 64px;
  height: 64px;
  min-height: 64px;
  max-height: 64px;
  aspect-ratio: 1 / 1;
  border-radius: 16px;
  flex: 0 0 auto;
  background-size: cover;
  background-position: center;
  color: #fff;
  font-weight: 700;
  font-size: 14px;
  overflow: hidden;
`;

/* Скільки фото в анкеті — видно з рядка, ще до її відкриття. */
export const PhotoCount = styled.span`
  position: absolute;
  right: 3px;
  bottom: 3px;
  padding: 1px 5px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  font-size: 9.5px;
  font-weight: 700;
  line-height: 1.5;
`;

export const Body = styled.div`
  flex: 1;
  min-width: 0;
`;

export const Name = styled.div`
  font-size: 17px;
  font-weight: 650;
  letter-spacing: -0.015em;
  color: var(--matching-header-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

/* Дволітерний код ролі поруч з іменем: у рядку так само немає ширини під
 * «Intended parents», а знати, хто перед тобою, треба до відкриття анкети. */
export const RoleCode = styled.span`
  flex: 0 0 auto;
  padding: 1px 5px;
  border: 1px solid var(--matching-card-border);
  border-radius: 5px;
  color: var(--matching-muted-text);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.06em;
`;

/* Роль словом і в кольорі своєї ролі. Двобуквений код лишився там, де ширини
 * справді немає — на плитці галереї; у рядку її вистачає на «Агенція». */
export const RoleTag = styled.span`
  flex: 0 0 auto;
  padding: 2px 7px;
  border-radius: 7px;
  font-size: 11px;
  font-weight: 700;
  line-height: 1.35;
  white-space: nowrap;
  color: ${({ $role }) => ROLE_STRIPE_COLORS[$role] || 'var(--matching-muted-text)'};
  background: ${({ $role }) => (ROLE_STRIPE_COLORS[$role]
    ? `color-mix(in srgb, ${ROLE_STRIPE_COLORS[$role]} 18%, transparent)`
    : 'var(--matching-chip-bg)')};
  border: 1px solid ${({ $role }) => (ROLE_STRIPE_COLORS[$role]
    ? `color-mix(in srgb, ${ROLE_STRIPE_COLORS[$role]} 42%, transparent)`
    : 'var(--matching-card-border)')};
`;

export const NameRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
`;

export const MetaRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  margin-top: 3px;
`;

export const Location = styled.div`
  font-size: 12.5px;
  color: var(--matching-muted-text);
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
  overflow: hidden;

  svg {
    flex: 0 0 auto;
    fill: currentColor;
  }

  span {
    overflow: hidden;
    text-overflow: ellipsis;
  }
`;

// Spec §5 correction 1: tabular numerals turn the metrics into a vertical
// column of digits running down the entire list instead of ragged text.
export const FactsRow = styled.div`
  font-variant-numeric: tabular-nums;
  font-size: 12.5px;
  color: var(--matching-header-text);
  opacity: ${({ $soft }) => ($soft ? 0.62 : 0.82)};
  margin-top: ${({ $soft }) => ($soft ? '2px' : '5px')};
  line-height: 1.5;
`;

export const EmptyNote = styled.div`
  font-size: 12px;
  color: var(--matching-muted-text);
  margin-top: 5px;
  line-height: 1.5;
`;

export const Fact = styled.i`
  font-style: normal;
  white-space: nowrap;
  display: inline-block;

  b {
    font-weight: 650;
  }

  &::after {
    content: '\00A0·';
    color: var(--matching-muted-text);
    opacity: 0.6;
  }

  &:last-child::after {
    content: '';
  }
`;

export const Ctrl = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  gap: 6px;
  flex: 0 0 auto;
`;

/*
 * Кнопки рядка стоять стовпчиком, а не в ряд.
 *
 * У ряд вони займали ~190 px ширини на 360-піксельному екрані — більше за
 * половину рядка, — і платило за це імʼя: «Виктория И., 32» ставало
 * «Виктори…». Стовпчик коштує висоти, але висота в списку дешева: рядок і так
 * тримає фото 64 px і два рядки метрик, а ширина в ньому — єдине, чого бракує.
 */
export const RowActionStack = styled.div`
  display: flex;
  flex-direction: column;
  gap: 5px;
`;

const ctrlButtonBase = css`
  width: 38px;
  height: 30px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  cursor: pointer;
  padding: 0;
  font: inherit;
`;

// Spec §5 correction 2: exactly one accent colour on the screen, spent on the
// "add to favourites" action. $accent opts a row action into it; everything else
// - return-to-feed, edit, counters - renders in the neutral card chrome.
export const RowActionButton = styled.button`
  ${ctrlButtonBase}
  border: 1px solid ${({ $accent, $on }) => ($accent && $on
    ? 'var(--matching-accent)'
    : 'var(--matching-card-border)')};
  background: ${({ $accent, $on }) => ($accent && $on
    ? 'color-mix(in srgb, var(--matching-accent) 14%, transparent)'
    : 'var(--matching-card-bg)')};
  color: ${({ $accent }) => ($accent ? 'var(--matching-accent)' : 'var(--matching-muted-text)')};

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }

  &:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--matching-accent) 42%, transparent);
    outline-offset: 1px;
  }
`;

export const ReturnButton = styled(RowActionButton)``;

export const EditButton = styled.button`
  ${ctrlButtonBase}
  border: 1px solid var(--matching-card-border);
  background: var(--matching-card-bg);
  color: var(--matching-muted-text);

  &:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--matching-accent) 42%, transparent);
    outline-offset: 1px;
  }
`;

export const ChevronButton = styled.button`
  ${ctrlButtonBase}
  border: 1px solid var(--matching-card-border);
  background: var(--matching-card-bg);
  color: var(--matching-muted-text);

  b {
    font-size: 11px;
    font-weight: 600;
    color: var(--matching-muted-text);
  }

  svg {
    transition: transform 180ms ease;
    transform: rotate(${({ $open }) => ($open ? '180deg' : '0deg')});
  }
`;

export const Note = styled.p`
  font-size: 12.3px;
  color: var(--matching-header-text);
  background: var(--matching-section-bg);
  border-radius: 14px;
  padding: 8px 10px;
  margin: 9px 0 0;
  line-height: 1.5;

  ${({ $clip }) => $clip && css`
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  `}

  ${({ $hidden }) => $hidden && css`
    position: absolute;
    top: 0;
    left: 11px;
    right: 11px;
    margin: 0;
    visibility: hidden;
    pointer-events: none;
    z-index: -1;
  `}
`;

// The client comment textarea is styled to read as plain text - no border,
// no control chrome - so it's indistinguishable from the read-only bio block
// next to it until the user taps into it.
export const CommentInput = styled.textarea`
  display: block;
  width: 100%;
  box-sizing: border-box;
  border: 0;
  resize: none;
  overflow: hidden;
  background: transparent;
  font: inherit;
  font-size: 12.3px;
  color: var(--matching-header-text);
  padding: 8px 10px;
  margin: 9px 0 0;
  line-height: 1.5;
  border-radius: 14px;

  &::placeholder {
    color: var(--matching-muted-text);
    opacity: 0.7;
  }

  &:focus {
    outline: 0;
    background: var(--matching-section-bg);
  }
`;

export const SelfDescription = styled.p`
  font-size: 12.3px;
  font-style: italic;
  color: var(--matching-muted-text);
  padding: 0 10px;
  margin: 9px 0 0;
  line-height: 1.5;
  max-height: none;

  ${({ $clip }) => $clip && css`
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  `}
`;

export const NoteMore = styled.span`
  display: block;
  font-size: 15px;
  font-weight: 700;
  line-height: 0.8;
  color: var(--matching-muted-text);
  margin: 4px 0 0 10px;
  cursor: pointer;
  letter-spacing: 1px;
`;

export const More = styled.div`
  margin-top: 9px;
`;

export const Grid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 14px;
  background: var(--matching-section-bg);
  border-radius: 14px;
  padding: 9px 11px;
`;

export const GridRow = styled.p`
  margin: 0;
  font-size: 12.3px;
  line-height: 1.75;
  color: var(--matching-muted-text);
  word-break: break-word;

  b {
    color: var(--matching-header-text);
    font-weight: 600;
  }

  ${({ $wide }) => $wide && css`grid-column: 1 / -1;`}
`;

export const ContactsBlock = styled.div`
  margin-top: 8px;
  border: 1px solid var(--matching-card-border);
  border-radius: 14px;
  overflow: hidden;
`;

export const ContactsHeader = styled.button`
  font: inherit;
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 34px;
  padding: 8px 11px;
  box-sizing: border-box;
  font-size: 12.3px;
  font-weight: 600;
  color: var(--matching-muted-text);
  background: var(--matching-card-bg);
  border: 0;
  cursor: pointer;
  text-align: left;
`;

export const ContactsStatus = styled.span`
  margin-left: auto;
  font-size: 11px;
  font-weight: 500;
  color: var(--matching-muted-text);
`;

/* Контакти, розгорнуті просто в рядку стрічки. Ціль дотику на всю ширину —
 * `ContactRow` уже така, — тож блок лише відділяє їх від фактів картки. */
export const RowContacts = styled.div`
  margin-top: 9px;
  padding-top: 7px;
  border-top: 1px solid var(--matching-card-border);
`;

export const RowContactsNote = styled.div`
  min-height: 34px;
  display: flex;
  align-items: center;
  font-size: 12.3px;
  color: var(--matching-muted-text);
`;

export const ContactsBody = styled.div`
  padding: 0 11px;
  background: var(--matching-card-bg);
  border-top: 1px solid var(--matching-section-bg);
`;

export const ContactRow = styled.a`
  display: flex;
  align-items: center;
  height: 34px;
  box-sizing: border-box;
  font-size: 12.5px;
  color: var(--matching-accent);
  font-weight: 500;
  text-decoration: none;
  padding: 8px 0;
  border-bottom: 1px solid var(--matching-section-bg);

  &:last-child {
    border-bottom: 0;
  }

  &:active {
    opacity: 0.6;
  }

  span {
    color: var(--matching-muted-text);
    font-size: 11px;
    font-weight: 400;
    margin-right: 7px;
    display: inline-block;
    min-width: 64px;
  }
`;

export const SkeletonRow = styled.div`
  background: var(--matching-card-bg);
  border: 1px solid var(--matching-card-border);
  border-radius: 20px;
  padding: 11px;
  display: flex;
  gap: 11px;
`;

const shimmer = keyframes`
  0% { background-position: -120px 0; }
  100% { background-position: 120px 0; }
`;

const shimmerBg = css`
  background: var(--matching-section-bg);
  background-image: linear-gradient(
    90deg,
    var(--matching-section-bg) 0px,
    color-mix(in srgb, var(--matching-accent) 10%, var(--matching-section-bg)) 40px,
    var(--matching-section-bg) 80px
  );
  background-size: 240px 100%;
  animation: ${shimmer} 1.3s ease-in-out infinite;
`;

export const SkeletonPhoto = styled.div`
  width: 58px;
  height: 58px;
  border-radius: 16px;
  flex: 0 0 auto;
  ${shimmerBg}
`;

export const SkeletonLines = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  justify-content: center;
`;

export const SkeletonLine = styled.div`
  height: ${({ $h }) => $h || '10px'};
  width: ${({ $w }) => $w || '100%'};
  border-radius: 6px;
  ${shimmerBg}
`;

export const FooterNote = styled.div`
  text-align: center;
  padding: 14px 10px 4px;
  font-size: 11.5px;
  color: var(--matching-muted-text);
`;

export const ErrorRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 14px;
  font-size: 13px;
  color: var(--matching-muted-text);
  flex-wrap: wrap;
`;

export const RetryButton = styled.button`
  border: 1px solid var(--matching-accent);
  color: var(--matching-accent);
  background: transparent;
  border-radius: 9px;
  padding: 6px 14px;
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
`;

export const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 12px;
  padding: 48px 20px;
  color: var(--matching-muted-text);
`;

export const EmptyStateTitle = styled.div`
  font-size: 14px;
  font-weight: 600;
  color: var(--matching-header-text);
`;

export const EmptyStateText = styled.p`
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  max-width: 320px;
`;

export const EmptyStateButton = styled.button`
  border: 0;
  background: var(--matching-accent);
  color: #fff;
  border-radius: 10px;
  padding: 9px 18px;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
`;

export const Sentinel = styled.div`
  height: 1px;
`;

export const ToastWrap = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--matching-card-bg);
  color: var(--matching-header-text);
  border: 1px solid var(--matching-card-border);
  border-radius: 14px;
  padding: 10px 14px;
  box-shadow: var(--matching-card-shadow);
  font-size: 13px;
`;

export const ToastUndo = styled.button`
  border: 0;
  background: transparent;
  color: var(--matching-accent);
  font: inherit;
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
`;

/* ------------------------------------------------------------------ *
 * Public profile comment (spec §8)
 *
 * The trigger has to read as text, not as a control: no border, no fill, no
 * button chrome. Only once it is focused does it become a field, and the field
 * itself stays borderless apart from a hairline rule under it.
 * ------------------------------------------------------------------ */

/**
 * `$flush` — блок стоїть у доріжці нотаток на картці, де відступ ліворуч уже
 * дає смужка доріжки. У рядку стрічки відступу немає кому дати: там публічні
 * записи стоять під нотаткою в заокругленій плашці й тримають її внутрішній
 * край, інакше два сусідні тексти зсунуті один відносно одного.
 */
export const PublicComments = styled.div`
  margin-top: ${({ $flush }) => ($flush ? '0' : '8px')};
  padding-left: ${({ $flush }) => ($flush ? '0' : '10px')};
`;

export const ReviewsGateButton = styled.button`
  display: inline-flex;
  align-self: flex-start;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  min-height: 30px;
  margin-top: 8px;
  padding: 0 11px;
  box-sizing: border-box;
  border: 1px solid var(--matching-card-border);
  border-radius: 999px;
  background: transparent;
  color: var(--matching-muted-text);
  font: inherit;
  font-size: 12.3px;
  cursor: pointer;
  text-align: left;

  svg {
    flex: 0 0 auto;
    opacity: 0.8;
  }

  &:disabled {
    cursor: default;
    opacity: 0.6;
  }

  &:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--matching-accent) 42%, transparent);
    outline-offset: 1px;
  }
`;

export const CommentEntry = styled.div`
  padding: 3px 0;
  border-left: ${({ $failed }) => ($failed
    ? '1px solid color-mix(in srgb, #d64545 70%, transparent)'
    : '1px solid transparent')};
  cursor: ${({ $editable }) => ($editable ? 'text' : 'pointer')};
`;

/* Підпис стоїть під написаним, а не над ним: три відгуки поспіль інакше
 * читаються як стовпчик імен, під кожним з яких десь лежить текст. */
export const CommentMeta = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
  font-size: ${NOTE_META_SIZE};
  line-height: ${NOTE_META_LINE_HEIGHT};
  color: var(--matching-muted-text);

  b {
    font-weight: 700;
    color: var(--matching-header-text);
    opacity: 0.75;
  }
`;

export const CommentText = styled.p`
  margin: 0;
  font-size: ${NOTE_TEXT_SIZE};
  line-height: ${NOTE_TEXT_LINE_HEIGHT};
  color: var(--matching-header-text);
  white-space: pre-wrap;
  word-break: break-word;

  ${({ $clip }) => $clip && css`
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  `}
`;

export const CommentRetry = styled.button`
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  padding: 0;
  border: 0;
  background: none;
  color: #d64545;
  cursor: pointer;
  text-decoration: underline;
`;

// Публічний запис про третю особу мусить мати кому зняти: хрестик бачить автор
// запису і адмін. Він тримається в рядку підпису, щоб не важити більше за сам
// коментар, і питає підтвердження перш ніж видалити.
export const CommentDelete = styled.button`
  font: inherit;
  font-size: 11px;
  font-weight: ${({ $confirming }) => ($confirming ? 700 : 600)};
  margin-left: auto;
  padding: 0;
  border: 0;
  background: none;
  color: ${({ $confirming }) => ($confirming ? '#d64545' : 'var(--matching-muted-text)')};
  cursor: pointer;
  opacity: ${({ $confirming }) => ($confirming ? 1 : 0.7)};

  &:hover {
    opacity: 1;
  }
`;

export const CommentsMoreButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin: 4px 0 0;
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  color: var(--matching-muted-text);
  cursor: pointer;

  svg {
    transition: transform 180ms ease;
    transform: rotate(${({ $open }) => ($open ? '180deg' : '0deg')});
  }
`;

// Запрошення написати — це той самий текст нотатки, лише ще не написаний. Тож
// і виглядає воно як плейсхолдер приватного поля поруч, а не як окрема кнопка:
// різні розміри в двох сусідніх порожніх полях і читались як недоробка.
export const AddCommentTrigger = styled.div`
  margin-top: 4px;
  padding: 2px 0;
  border: 0;
  background: none;
  font-size: ${NOTE_TEXT_SIZE};
  line-height: ${NOTE_TEXT_LINE_HEIGHT};
  color: var(--matching-muted-text);
  opacity: 0.75;
  cursor: text;
`;

export const CommentEditor = styled.div`
  margin-top: 4px;
  padding: 0;
`;

export const CommentEditorHead = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  font-size: ${NOTE_META_SIZE};
  line-height: ${NOTE_META_LINE_HEIGHT};
  color: var(--matching-muted-text);
`;

// Spec §8: the reader has to see that the record is public and signed by them
// *before* they start typing, not after. This label is not optional chrome.
export const CommentVisibilityNote = styled.span`
  font-size: 11px;
  color: var(--matching-muted-text);
  opacity: 0.85;
  white-space: nowrap;
`;

export const CommentStatus = styled.span`
  display: block;
  margin: 3px 0 0;
  text-align: right;
  font-size: 11px;
  color: var(--matching-muted-text);
  white-space: nowrap;
`;

export const PublicCommentInput = styled.textarea`
  display: block;
  width: 100%;
  box-sizing: border-box;
  margin-top: 2px;
  padding: 2px 0 4px;
  border: 0;
  border-bottom: 1px solid var(--matching-card-border);
  border-radius: 0;
  resize: none;
  overflow-y: auto;
  background: transparent;
  font: inherit;
  font-size: ${NOTE_TEXT_SIZE};
  line-height: ${NOTE_TEXT_LINE_HEIGHT};
  color: var(--matching-header-text);

  &:focus {
    outline: 0;
    border-bottom-color: color-mix(in srgb, var(--matching-accent) 45%, transparent);
  }
`;
