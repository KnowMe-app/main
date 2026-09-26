import styled, { css, keyframes } from 'styled-components';
import {
  NOTE_META_LINE_HEIGHT,
  NOTE_META_SIZE,
  NOTE_TEXT_LINE_HEIGHT,
  NOTE_TEXT_SIZE,
} from './noteTypography';
// Кольори ролей спільні з відкритою карткою — див. `matchingRoleColors`.
import { ROLE_STRIPE_COLORS } from './matchingRoleColors';
// Сама цятка публікації спільна з плиткою галереї — колір і форма мають бути
// тими самими, міняється лише місце, де вона лежить.
import { PublishDot } from './Matching.styled';

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
export { ROLE_STRIPE_COLORS };

export const CARD_PADDING = '11px';

export const Card = styled.div`
  position: relative;
  background: var(--matching-card-bg);
  border: 1px solid var(--matching-card-border);
  border-radius: 20px;
  padding: ${CARD_PADDING};
  cursor: pointer;
  overflow: hidden;
  transition: opacity 200ms ease, transform 200ms ease;

  /* Смужка ролі лежить поверх фото: воно тепер починається від самого краю
     картки, а смужка — це те, як рядок каже «хто це» ще до імені. */
  ${({ $role }) => ROLE_STRIPE_COLORS[$role] && css`
    &::before {
      content: '';
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 3px;
      z-index: 1;
      background: ${ROLE_STRIPE_COLORS[$role]};
    }
  `}
`;

export const Top = styled.div`
  display: flex;
  gap: 10px;
  align-items: center;
`;

/*
 * Фото — перше в картці й на всю її ширину.
 *
 * Плиткою 52 px збоку від імені воно не показувало нічого: на зріст очей і
 * форму обличчя такого квадратика не вистачає, а саме за ними цей список і
 * гортають. Велике фото до того жило в окремій розкладці «одна картка на
 * екран», де під ним стояли три факти й пара кнопок — цілий екран за менше,
 * ніж каже рядок. Тепер воно стоїть тут, а все, що картка розповідає про
 * людину, лишається під ним.
 *
 * Пропорція портретна (4/5), а стеля висоти тримає рядок у межах екрана:
 * імʼя й метрики мусять бути видно разом із фото, без гортання.
 */
export const Photo = styled.div`
  position: relative;
  margin: -${CARD_PADDING} -${CARD_PADDING} 9px;
  /* Ширина — задана, а не auto, і саме через стелю висоти нижче.
   *
   * Блок із пропорцією та автоматичною шириною Chromium перераховує
   * **по обох** боках, щойно стеля висоти спрацювала: висота впиралась у
   * 58vh, і ширина слухняно сідала під пропорцію — на 412-піксельному екрані
   * 390 px перетворювались на 385. Рядок від цього виглядав зсунутим: фото
   * починалося від лівого краю картки, а праворуч лишалась світла смуга
   * завширшки з ту різницю. У відкритій картці те саме правило не спрацьовує
   * випадково — там стеля вища за пропорцію, — тож на око це виглядало як
   * «у списку фото зміщене, а у відкритій картці ні».
   *
   * Із заданою шириною стеля ріже саму лише висоту, а знімок під нею
   * підрізає cover. */
  width: calc(100% + 22px);
  aspect-ratio: 4 / 5;
  max-height: 58vh;
  background: var(--matching-section-bg);
  overflow: hidden;
  /* Горизонтальний жест на фото гортає знімки (\`usePhotoSwipe\`); вертикальний
   * лишається прокруткою сторінки. */
  touch-action: pan-y;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    /* Наступне фото ще їде з бекенду — поточне трохи тьмяніє, щоб свайп не
     * виглядав проігнорованим. */
    opacity: ${({ $loading }) => ($loading ? 0.6 : 1)};
    transition: opacity 0.15s ease;
  }
`;

/*
 * Роль — на фото, як у відкритій картці.
 *
 * Підпис ролі стояв рядком нижче, поруч із локацією, і там він змагався за
 * ширину з містом; а головне — два екрани казали про ту саму річ різними
 * місцями: у відкритій анкеті роль лежить плашкою на знімку
 * (`ModernRoleBadge`), у списку — сірим чіпом під іменем. Тепер там і там це
 * та сама плашка в кольорі своєї ролі, у тому самому куті.
 *
 * Підкладка напівпрозора й темна, а не суцільний колір ролі: під нею живе
 * знімок, і колір мусить читатись поверх будь-якого — світлого й темного
 * однаково. Сам колір ролі несе текст і тонка рамка.
 */
export const PhotoRoleBadge = styled.span`
  position: absolute;
  top: 9px;
  left: 9px;
  z-index: 2;
  max-width: calc(100% - 18px);
  padding: 3px 9px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.52);
  backdrop-filter: blur(6px);
  border: 1px solid ${({ $role }) => (ROLE_STRIPE_COLORS[$role]
    ? `color-mix(in srgb, ${ROLE_STRIPE_COLORS[$role]} 70%, transparent)`
    : 'rgba(255, 255, 255, 0.3)')};
  color: ${({ $role }) => (ROLE_STRIPE_COLORS[$role]
    ? `color-mix(in srgb, ${ROLE_STRIPE_COLORS[$role]} 55%, #ffffff)`
    : '#fff')};
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  line-height: 1.5;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

/*
 * Цятка публікації лежить на фото, у правому верхньому куті — так само, як
 * плашка ролі лежить у лівому. Досі вона стояла в стовпчику кнопок під
 * фото, поруч із трубкою контактів: адмін читає стан публікації одним
 * поглядом по стрічці, а очі в цей момент дивляться на фото, не під нього.
 */
export const PhotoPublishDot = styled(PublishDot)`
  position: absolute;
  top: 9px;
  right: 9px;
  z-index: 2;
  width: 26px;
  height: 26px;
`;

/* Скільки фото в анкеті — видно з рядка, ще до її відкриття. */
export const PhotoCount = styled.span`
  position: absolute;
  right: 7px;
  bottom: 7px;
  padding: 2px 7px;
  border-radius: 7px;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  font-size: 10.5px;
  font-weight: 700;
  line-height: 1.4;
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
  border: 1px solid ${({ $role }) => (ROLE_STRIPE_COLORS[$role]
    ? `color-mix(in srgb, ${ROLE_STRIPE_COLORS[$role]} 45%, transparent)`
    : 'var(--matching-card-border)')};
  border-radius: 5px;
  color: ${({ $role }) => ROLE_STRIPE_COLORS[$role] || 'var(--matching-muted-text)'};
  background: ${({ $role }) => (ROLE_STRIPE_COLORS[$role]
    ? `color-mix(in srgb, ${ROLE_STRIPE_COLORS[$role]} 14%, transparent)`
    : 'transparent')};
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
  margin-top: ${({ $soft }) => ($soft ? '1px' : '8px')};
  line-height: 1.5;
`;

export const EmptyNote = styled.div`
  font-size: 12px;
  color: var(--matching-muted-text);
  margin-top: 5px;
  line-height: 1.5;
`;

/*
 * Факт рядка метрик — і риска, що відділяє його від сусіднього.
 *
 * Розділювача тут довго не було видно, і причина була не в дизайні: у
 * `content` стояв `'\\00A0·'`, тобто нелегальна вісімкова послідовність усередині
 * тегованого шаблона. JS віддає на такий шматок `undefined`, styled-components
 * відкидає порожній шматок — і **весь** набір правил `Fact` не доїжджав до
 * сторінки взагалі. Тож ні крапки між фактами, ні `font-style` з цього блока
 * ніколи не діяли. Escape-послідовності в цьому файлі більше немає взагалі, а
 * що правила доїжджають — тримає тест (`ProfileRow.factSeparator.test.js`):
 * помилка ця мовчазна, жодного попередження ні в збірці, ні в консолі.
 *
 * Сам розділювач — вертикальна риска, а не крапка: «не заміжня пологи 2» без
 * неї читалось одним фактом, а риска ділить рядок на стовпці, які око бере
 * одним поглядом. Курсив лишається: рядок метрик так відрізняється від підписів
 * навколо, і саме таким його бачить читач сьогодні.
 */
export const Fact = styled.i`
  white-space: nowrap;
  display: inline-block;

  b {
    font-weight: 650;
  }

  /* Риска належить факту, а не проміжку між фактами: усередині самого факту
     стоїть nowrap, тож від свого значення вона не відірветься, а перенестись
     рядок може по пробілу перед наступним фактом. */
  &::after {
    content: '';
    display: inline-block;
    width: 1px;
    height: 0.92em;
    margin: 0 1px 0 6px;
    vertical-align: -0.14em;
    background: currentColor;
    opacity: 0.3;
  }

  &:last-child::after {
    display: none;
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

/* Підкладку й заокруглення тримає плашка RowNotes, у якій нотатка лежить, а не
   сама нотатка: доріжок у плашці дві, і два фони поспіль малювали б сходинку
   на межі між ними. */
export const Note = styled.p`
  font-size: ${NOTE_TEXT_SIZE};
  color: var(--matching-header-text);
  padding: 6px 0;
  margin: 0;
  line-height: ${NOTE_TEXT_LINE_HEIGHT};

  /* Нижній відступ обрізаному тексту знімається навмисно: line-clamp ріже
     по рядках, а overflow ховає все за межами padding-box — тож у ті 8 px
     знизу встигав пролізти верх наступного рядка, і під нотаткою стояла
     смужка півлітер. Повітря під текстом дає сам значок «…». */
  ${({ $clip, $lines = 2 }) => $clip && css`
    display: -webkit-box;
    -webkit-line-clamp: ${$lines};
    -webkit-box-orient: vertical;
    overflow: hidden;
    padding-bottom: 0;
  `}

  /* Невидимий близнюк поля, яким міряється, чи текст обрізався. Міряти він
     мусить рівно ту ширину, що й саме поле, тож і лежить він у тій самій
     доріжці (CommentLane нижче), а не відлічує піксели від краю картки:
     відступ доріжки вже змінювався раз, і разом із ним мовчки роз'їжджалась
     міра. */
  ${({ $hidden }) => $hidden && css`
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
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
  /* Та сама типографіка, що й у публічного запису поруч: дві доріжки однієї
     плашки роблять те саме — це запис про людину, — і різний кегль у них
     читався як недоробка, а не як різниця сенсу. Різницю несуть підпис над
     доріжкою і колір її смужки. */
  font-size: ${NOTE_TEXT_SIZE};
  color: var(--matching-header-text);
  padding: 6px 0;
  margin: 0;
  line-height: ${NOTE_TEXT_LINE_HEIGHT};

  &::placeholder {
    color: var(--matching-muted-text);
    opacity: 0.7;
  }

  /* Порожнє поле теж має бути видно як поле: під ним стоять реакції, і без
     підкладки рядок «Додати коментар» читався як підпис до них. Підкладку
     дає плашка RowNotes — одну на обидві доріжки, а не по одній на кожну. */
  &:focus {
    outline: 0;
  }
`;

/* Доріжка власної нотатки: саме поле, «…» і невидима міра до нього. Потрібна
   вона рівно заради міри — та лежить абсолютом і мусить мати за що зачепитись
   саме тут, а не за картку цілком. */
export const CommentLane = styled.div`
  position: relative;
`;

export const SelfDescription = styled.p`
  font-size: 12.3px;
  font-style: italic;
  color: var(--matching-muted-text);
  padding: 0;
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
  margin: 0 0 4px;
  cursor: pointer;
  letter-spacing: 1px;
`;

export const More = styled.div`
  margin-top: 9px;
  padding-top: 7px;
  border-top: 1px solid var(--matching-card-border);
`;

/* Пласка секція на спільній лівій межі — так само, як нотатки (`RowNotes`) і
   контакти: заокруглених плашок усередині рядка більше немає взагалі, тож і
   тут лишились самі дані. */
export const Grid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 14px;
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

/*
 * Контакти рядка: номер повністю, решта — значками.
 *
 * Повністю читається лише телефон: його переписують, диктують і звіряють.
 * Пошта й ніки читання не потребують — у них тапають, — а текстом вони
 * забирали по рядку кожен і розтягували рядок стрічки на пів екрана. Що саме
 * за значком, каже `title`, тож значення не зникає, а лише перестає займати
 * рядок. Та сама розкладка, що й у відкритій картці.
 */
/*
 * Контакти стоять на одній вертикалі — і між собою, і з усім, що вище.
 *
 * Значок кожного каналу лежить у рамці 28 px, і саме ця рамка тримає ліву межу
 * блока: номер телефону починається з такої самої рамки, тож його значок, рядок
 * значків месенджерів під ним і рамки решти каналів стоять один під одним. Поки
 * значок телефону малювався голими 13 px, він починався там, де в рамок
 * починається сама рамка, а не малюнок усередині, — і кожен наступний рядок
 * контактів виглядав зсунутим праворуч на півсантиметра.
 *
 * Відступи між рядками — 4 px: контактів у картці буває п'ять-шість, і на
 * колишніх 6 px згори й знизу блок розтягувався на пів екрана там, де читають
 * його одним поглядом.
 */
export const ContactPhoneRow = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 8px;
  padding: 2px 0;
`;

/*
 * Рамка навколо значка каналу — спільна межа для всіх рядків контактів.
 *
 * Кожна змінна тут має запасну: цей самий блок контактів малює й форма
 * доповнення картки, а вона поза матчингом, і `--matching-*` там не оголошені.
 * Невідома змінна в скороченому записі `border` робить нечинним увесь запис —
 * тож рамки там не було взагалі, і рядок значків виглядав зсунутим праворуч
 * рівно на те, на скільки малюнок відступає від краю своєї (невидимої) рамки.
 */
const contactIconBox = css`
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
  border-radius: 9px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--matching-card-border, var(--km-border, #E8E8E2));
  background: var(--matching-card-bg, var(--km-card, #FFFFFF));
  box-sizing: border-box;

  svg {
    width: 13px;
    height: 13px;
  }
`;

export const ContactIconBadge = styled.span`
  ${contactIconBox};
  color: var(--matching-muted-text, var(--km-muted, #7A7A72));
`;

export const ContactPhoneLink = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--matching-accent, var(--km-accent, #E8791A));
  text-decoration: none;

  &:active {
    opacity: 0.6;
  }
`;

export const ContactIconRow = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  ${({ $standalone }) => $standalone && css`
    padding: 2px 0 0;
  `}
`;

export const ContactIconLink = styled.a`
  ${contactIconBox};
  color: var(--matching-muted-text, var(--km-muted, #7A7A72));
  text-decoration: none;

  &:active {
    opacity: 0.6;
  }
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
 * Власного відступу ліворуч у блока немає — ні тут, ні там.
 *
 * Обидва його місця вже дають край: у картці — смужка доріжки нотаток, у
 * рядку стрічки — плашка `RowNotes`, спільна з власною нотаткою. Поки він
 * додавав свої 10 px поверх чужого краю, публічний запис стояв зсунутим
 * відносно нотатки просто під ним — на тій самій картці, у тій самій плашці.
 */
export const PublicComments = styled.div`
  margin-top: 0;
  padding-left: 0;
`;

// Стрілка «відкрити comments/{id} у Firebase» — та сама службова навігація, що в
// блоках форми анкети, і виглядає вона так само: сам лише значок біля правого
// краю. Стоїть у власному рядку над записами, а не поверх них: текст нотатки йде
// на всю ширину, і накладена стрілка перекривала б перший рядок на вузькому
// екрані. Показує її лише адмін з увімкненим EXT — див. `utils/backendLinksMode`.
export const CommentBackendRow = styled.div`
  display: flex;
  justify-content: flex-end;
`;

export const CommentBackendLink = styled.a`
  display: inline-flex;
  align-items: center;
  padding: 2px;
  color: var(--matching-muted-text);
  opacity: 0.7;

  &:hover {
    opacity: 1;
  }
`;

/* Доки відгуки їдуть, якщо не доїхали — і якщо доїхали порожніми.
 *
 * Мовчати тут не можна: порожня доріжка виглядала б відповіддю «відгуків
 * немає», якою вона ще не є, а «Шукаємо відгуки…», що блимнуло й зникло, не
 * відповідає взагалі.
 *
 * Типографіка — та сама, що в підпису над доріжкою (NOTE_META_SIZE), а не та,
 * що в самому полі: рядок стоїть просто під плейсхолдером, і однаковий кегль
 * робив із двох сірих рядків поспіль два запрошення написати. Менший кегль
 * ставить його туди, де він і є, — приміткою про стан читання. */
export const ReviewsGateNote = styled.div`
  padding: 4px 0 2px;
  font-size: ${NOTE_META_SIZE};
  line-height: ${NOTE_META_LINE_HEIGHT};
  color: var(--matching-muted-text);
  opacity: 0.75;
`;

export const CommentEntry = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 4px;
  padding: 3px 0;
  border-left: ${({ $failed }) => ($failed
    ? '1px solid color-mix(in srgb, #d64545 70%, transparent)'
    : '1px solid transparent')};
  cursor: ${({ $editable }) => ($editable ? 'text' : 'pointer')};
`;

export const CommentBody = styled.div`
  flex: 1 1 auto;
  min-width: 0;
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
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 4px;
  padding: 2px 0;
  border: 0;
  background: none;
  font-size: ${NOTE_TEXT_SIZE};
  line-height: ${NOTE_TEXT_LINE_HEIGHT};
  /* Запасні значення — для форми доповнення, де --matching-* не оголошені:
     без них плейсхолдер відгуку виходив темнішим за плейсхолдер памʼятки. */
  color: var(--matching-muted-text, var(--km-muted, #8a8178));
  opacity: 0.75;
  cursor: text;

  /* Стрілка після напису веде погляд до значка відгуків — саме цей значок
     стоїть у ряду рішень, де перевірка й починається. Обидва SVG не стискаються
     разом із текстом: у вузькій картці не має зникати підказка, що саме шукати. */
  svg {
    flex: none;
    opacity: 0.9;
  }
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
  /* Без рамки й без риски під полем: відгук набирається просто текстом, як
     і памʼятка поруч. Будь-яка обводка робила з двох однакових доріжок
     «поле» й «текст». */
  border: 0;
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
  }

  &::placeholder {
    color: var(--matching-muted-text, var(--km-muted, #8a8178));
    opacity: 0.75;
  }
`;

/*
 * Один ряд рішень унизу картки: олівець, пара «лайк/дизлайк», відгуки.
 *
 * Досі рішень було три місця: дві широкі кнопки з написами під фактами
 * («Доповнити дані», «Перевірити наявність відгуків»), стовпчик службових
 * значків праворуч і сам ряд реакцій. Кожна з них важила рядок, і картка з
 * трьох фактів займала пів екрана. Тепер це один ряд значків: підпис у них
 * несе `title`/`aria-label`, а зрозумілість — форма й порядок.
 *
 * Порядок сталий: спершу «дописати те, що знаю» (олівець), потім рішення про
 * людину (серце й хрестик), і аж тоді питання про неї («що написали інші»).
 * Ліворуч — те, що робить із карткою читач, праворуч — те, що йому показують.
 */
export const RowFooterActions = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
`;

export const RowFooterButton = styled(RowActionButton)`
  flex: 1 1 0;
  width: auto;
  height: 34px;

  b {
    font-size: 11px;
    font-weight: 700;
  }

  /* Числа біля стрілки немає — див. \`canExpandDetails\` у \`ProfileRow\`. */
  svg {
    transition: transform 180ms ease;
    transform: rotate(${({ $turn }) => ($turn ? '180deg' : '0deg')});
  }
`;

/*
 * Серце й хрестик — одна пара, і виглядати вона мусить парою.
 *
 * Порізно вони читались як два незалежні значки серед інших значків ряду, і
 * «протилежність» рішення доводилось згадувати. Спільна рамка з волосяною
 * рискою всередині каже це формою: два стани одного вибору. Рамку тримає
 * обгортка, а кнопки всередині лишаються без власної — інакше на межі
 * малювалось би дві лінії поруч.
 */
export const RowReactionPair = styled.div`
  display: flex;
  align-items: center;
  flex: 2 1 0;
  height: 34px;
  border: 1px solid var(--matching-card-border);
  border-radius: 10px;
  overflow: hidden;

  > button {
    flex: 1 1 0;
    height: 100%;
    border: 0;
    border-radius: 0;
    background: transparent;
  }

  > button + button {
    border-left: 1px solid var(--matching-card-border);
  }
`;

/*
 * Нотатки рядка — одна плашка на дві доріжки.
 *
 * Публічні відгуки й власна нотатка — це два записи про ту саму людину, і
 * читають їх разом. Двома окремими блоками вони стояли з різними відступами
 * ліворуч (10 px у відгуків, 10 px усередині поля нотатки, 11 px у кнопок
 * поруч) — і ліва межа картки ламалась тричі на трьох сусідніх рядках. Тепер
 * обидві доріжки лежать в одній плашці, з одним внутрішнім краєм.
 *
 * Публічне — зверху, власне — під ним: спершу те, що про людину знають інші,
 * і аж тоді те, що читач дописує сам. Той самий порядок, що й у відкритій
 * картці.
 */
/*
 * Нотатки в рядку — пласка секція, а не плашка.
 *
 * Заокруглена підкладка тут була, і у відкритій картці вона читалась добре: та
 * картка стоїть на екрані одна, і плашка ділить її на блоки. У списку все
 * навпаки — рядок сам по собі вже заокруглена картка з фото на всю ширину, і
 * вкладена в неї друга заокруглена коробка з іншим фоном виглядала наліпкою:
 * єдине закруглення в картці, де всі інші секції (контакти, «всі дані») —
 * пласкі й розділені волосяною рискою. Тепер нотатки розділені так само, а
 * «хто побачить запис» каже смужка доріжки (`NoteLane`) і підпис над нею —
 * так само, як у відкритій картці й у формі чернетки.
 */
export const RowNotes = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 10px;
  padding-top: 9px;
  border-top: 1px solid var(--matching-card-border);
`;

/* Опис «про себе» стоїть під сіткою «всі дані» і тримає ту саму ліву межу, що
   й вона, — тобто межу самої картки. */
export const MoreNote = styled.div`
  padding: 0;
`;

/* Межу між доріжками тримає сама доріжка (`NoteLane` у `Matching.styled`):
   у рядку стрічки й у відкритій картці стоять ті самі дві доріжки, тож і
   риска між ними мусить бути одна на два екрани, а не своя тут. */
