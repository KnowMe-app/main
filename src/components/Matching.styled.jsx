import styled, { css, keyframes } from 'styled-components';
import { color } from './styles';
import { NOTE_META_LINE_HEIGHT, NOTE_META_SIZE } from './noteTypography';
import { FEED_WIDE_MIN_WIDTH, FEED_XWIDE_MIN_WIDTH } from '../hooks/useFeedColumns';

const STACK_CARD_RADIUS = '18px';

const matchingThemeVars = css`
  --matching-page-bg: ${({ $themeMode }) => ($themeMode === 'light'
    ? '#FAFAF8'
    : 'radial-gradient(circle at 50% 0%, rgba(232, 121, 26, 0.11), transparent 32%), linear-gradient(180deg, #17120e 0%, #0c0a09 100%)')};
  --matching-shell-bg: ${({ $themeMode }) => ($themeMode === 'light'
    ? '#FAFAF8'
    : 'radial-gradient(circle at 18% 0%, rgba(232, 121, 26, 0.16), transparent 28%), linear-gradient(180deg, #17120e 0%, #0c0a09 100%)')};
  --matching-card-bg: ${({ $themeMode }) => ($themeMode === 'light' ? '#FFFFFF' : '#17120e')};
  --matching-card-border: ${({ $themeMode }) => ($themeMode === 'light' ? '#E8E8E2' : 'rgba(255, 214, 148, 0.14)')};
  --matching-card-shadow: ${({ $themeMode }) => ($themeMode === 'light'
    ? '0 16px 34px rgba(22, 22, 22, 0.08)'
    : '0 18px 40px rgba(0, 0, 0, 0.3), 0 0 22px rgba(232, 121, 26, 0.05)')};
  --matching-header-text: ${({ $themeMode }) => ($themeMode === 'light' ? '#1A1A1A' : '#fff8ec')};
  --matching-muted-text: ${({ $themeMode }) => ($themeMode === 'light' ? '#62665F' : 'rgba(255, 248, 236, 0.88)')};
  --matching-panel-bg: ${({ $themeMode }) => ($themeMode === 'light' ? '#FFFFFF' : '#15120f')};
  --matching-panel-text: ${({ $themeMode }) => ($themeMode === 'light' ? '#1A1A1A' : '#fff8ec')};
  --matching-section-bg: ${({ $themeMode }) => ($themeMode === 'light' ? '#FFFFFF' : 'rgba(26, 23, 20, 0.82)')};
  /* Вкладена плашка всередині картки — сітка «всі дані», нотатки рядка.
   * Змінна --matching-section-bg для цього не годиться: у світлій темі вона
   * дорівнює фону самої картки, тож плашки на ній не видно було взагалі — поле
   * «Додати коментар» читалось як підпис до кнопок під ним, а не як поле. */
  --matching-section-border: ${({ $themeMode }) => ($themeMode === 'light' ? '#E8E8E2' : 'rgba(255, 214, 148, 0.11)')};
  --matching-section-shadow: ${({ $themeMode }) => ($themeMode === 'light' ? '0 10px 24px rgba(22, 22, 22, 0.06)' : '0 12px 28px rgba(0, 0, 0, 0.18)')};
  --matching-section-title: ${({ $themeMode }) => ($themeMode === 'light' ? '#1A1A1A' : '#ffd18a')};
  --matching-chip-bg: ${({ $themeMode }) => ($themeMode === 'light' ? '#FFFFFF' : 'rgba(255, 255, 255, 0.045)')};
  --matching-chip-border: ${({ $themeMode }) => ($themeMode === 'light' ? '#E8E8E2' : 'rgba(255, 214, 148, 0.12)')};
  --matching-chip-text: ${({ $themeMode }) => ($themeMode === 'light' ? '#1A1A1A' : '#fff8ec')};
  --matching-chip-label: ${({ $themeMode }) => ($themeMode === 'light' ? '#7A7A72' : 'rgba(247, 185, 95, 0.76)')};
  --matching-accent: ${({ $themeMode }) => ($themeMode === 'light' ? '#E8791A' : '#F08A2C')};
  --matching-contact-text: ${({ $themeMode }) => ($themeMode === 'light' ? '#2A2A2A' : '#ffd899')};
  --matching-contact-border: ${({ $themeMode }) => ($themeMode === 'light' ? '#E8E8E2' : 'rgba(255, 214, 148, 0.12)')};
  --matching-hero-fallback: ${({ $themeMode }) => ($themeMode === 'light'
    ? 'linear-gradient(145deg, #f4ede4 0%, #e9ded1 100%)'
    : 'radial-gradient(circle at 26% 16%, rgba(232, 121, 26, 0.54), transparent 30%), radial-gradient(circle at 78% 18%, rgba(255, 218, 145, 0.16), transparent 24%), linear-gradient(145deg, #3a281b 0%, #15110f 56%, #070605 100%)')};
  --matching-hero-bottom: ${({ $themeMode }) => ($themeMode === 'light'
    ? 'linear-gradient(180deg, rgba(22, 22, 22, 0) 0%, rgba(22, 22, 22, 0.22) 100%)'
    : 'linear-gradient(180deg, transparent 0%, rgba(9, 7, 5, 0.36) 46%, rgba(9, 7, 5, 0.66) 100%)')};
  /* Панель дій мала прозорий фон, і два кола висіли просто над текстом
   * анкети — на «Показати контакти» й на «Про себе». Тепер вона має власне
   * дно: прозоре зверху, щоб не різати картку лінією, і суцільне під самими
   * кнопками, щоб під ними нічого не читалось. */
  --matching-rail-bg: ${({ $themeMode }) => ($themeMode === 'light' ? '#FFFFFF' : '#17120e')};
  --matching-rail-border: ${({ $themeMode }) => ($themeMode === 'light' ? '#E8E8E2' : 'rgba(255, 214, 148, 0.11)')};
  --matching-action-bg: ${({ $themeMode }) => ($themeMode === 'light' ? '#FFFFFF' : '#211b16')};
  --matching-action-color: ${({ $themeMode }) => ($themeMode === 'light' ? '#E8791A' : '#fff8ec')};
  --matching-action-shadow: ${({ $themeMode }) => ($themeMode === 'light' ? '0 8px 18px rgba(22, 22, 22, 0.10)' : '0 8px 18px rgba(0, 0, 0, 0.22)')};
  color-scheme: ${({ $themeMode }) => ($themeMode === 'light' ? 'light' : 'dark')};
  font-family: var(--km-font);
  transition: background 280ms cubic-bezier(0.4, 0, 0.2, 1), color 280ms cubic-bezier(0.4, 0, 0.2, 1);
`;

/**
 * Палітра стрічки поза стрічкою — для прев'ю картки в «Моєму профілі»:
 * картка малюється тими самими компонентами, що й у стрічці, і її кольори
 * (`--matching-*`) мусять бути оголошені там, де вона стоїть.
 */
export const MatchingThemeScope = styled.div`
  ${matchingThemeVars}
  color: var(--matching-header-text);
`;

export const ROLE_COLORS = {
  ed: { accent: '#c2185b', light: 'rgba(194,24,91,0.07)', border: 'rgba(194,24,91,0.22)', text: '#9c1057', tag: 'rgba(252,228,236,0.9)' },
  ag: { accent: '#1565c0', light: 'rgba(21,101,192,0.07)', border: 'rgba(21,101,192,0.22)', text: '#0d47a1', tag: 'rgba(227,242,253,0.9)' },
  ip: { accent: '#00695c', light: 'rgba(0,105,92,0.07)', border: 'rgba(0,105,92,0.22)', text: '#004d40', tag: 'rgba(224,242,241,0.9)' },
  sm: { accent: '#6a1b9a', light: 'rgba(106,27,154,0.07)', border: 'rgba(106,27,154,0.22)', text: '#4a148c', tag: 'rgba(243,229,245,0.9)' },
  cl: { accent: '#0277bd', light: 'rgba(2,119,189,0.07)', border: 'rgba(2,119,189,0.22)', text: '#01579b', tag: 'rgba(225,245,254,0.9)' },
};

export const getRoleColors = role => ROLE_COLORS[role] || {
  accent: color.accent5,
  light: 'rgba(232,121,26,0.08)',
  border: 'rgba(232,121,26,0.25)',
  text: color.accent3,
  tag: 'rgba(255,243,224,0.9)',
};

export const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 100dvh;
  padding: 0;
  ${matchingThemeVars}
  background: var(--matching-page-bg);
`;

/* На телефоні стрічка — одна колонка на всю ширину, на комп'ютері — сітка.
 *
 * Тут стояли жорсткі 480 px на будь-якому екрані, і на комп'ютері дві
 * третини ширини були порожні: агенція гортала двісті анкет по одній на
 * висоту вікна. Межі ширини ті самі, що в `hooks/useFeedColumns`. */
export const InnerContainer = styled.div`
  max-width: 480px;
  width: 100%;

  @media (min-width: ${FEED_WIDE_MIN_WIDTH}px) {
    max-width: min(1240px, calc(100vw - 48px));
  }
  min-height: 100dvh;
  background: transparent;
  padding: 0;
  box-shadow: none;
  border-radius: 8px;
  box-sizing: border-box;
  position: relative;

  display: flex;
  flex-direction: column;

  @media (max-width: 768px) {
    box-shadow: none;
    border-radius: 0;
  }
`;

export const Grid = styled.div`
  display: flex;
  flex: 1 1 auto;
  flex-wrap: nowrap;
  gap: 0;
  padding: 0 10px 10px;
  margin-bottom: 0;
  justify-content: center;
  width: 100%;
  min-height: 0;
  box-sizing: border-box;
  overflow: hidden;
`;

export const CardWrapper = styled.div`
  position: relative;
  display: flex;
  width: 100%;
  max-width: 100%;
  min-height: 0;
  border: 1px solid var(--matching-card-border, #E8E2D8);
  border-radius: ${STACK_CARD_RADIUS};
  box-sizing: border-box;
  overflow: hidden;
  background: var(--matching-card-bg, #fffdfa);
  box-shadow: var(--matching-card-shadow, 0 14px 32px rgba(33, 26, 17, 0.12));
  transition: background 280ms cubic-bezier(0.4, 0, 0.2, 1), box-shadow 280ms cubic-bezier(0.4, 0, 0.2, 1), border-color 280ms cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 2;
`;

export const CommentInput = styled.textarea`
  width: 100%;
  margin: 0;
  display: block;
  box-sizing: border-box;
  padding: 0 40px 0 10px;
  resize: none;
  overflow: hidden;
  height: 16px;
  min-height: 16px;
  line-height: 16px;
  /* Розмір нотатки — спільний з публічним коментарем; у рядку стрічки поле
     лишається на своїй висоті, тож розмір задається окремо там, де воно
     стоїть поруч із публічним записом. */
  border: ${props => (props.plain ? 'none' : `1px solid ${color.gray3}`)};
  border-radius: ${props => (props.plain ? '0' : '8px')};
  outline: ${props => (props.plain ? 'none' : 'auto')};
  background: ${props => (props.plain ? 'transparent' : 'var(--matching-chip-bg, #fff)')};
  color: var(--matching-chip-text, #161616);
  caret-color: var(--matching-accent, ${color.accent5});
  transition: background 220ms cubic-bezier(0.4, 0, 0.2, 1), color 220ms cubic-bezier(0.4, 0, 0.2, 1);

  &::placeholder {
    color: var(--matching-muted-text, ${color.gray1});
  }
`;

export const SharedCommentText = styled.div`
  padding: 0 10px 3px;
  font-size: 12px;
  line-height: 1.25;
  color: ${color.gray1};
  font-style: italic;
  white-space: pre-wrap;
  word-break: break-word;
`;

export const Card = styled.div`
  width: 100%;
  height: auto;
  aspect-ratio: ${({ $hasPhoto, $small }) =>
    $hasPhoto ? ($small ? '4 / 5' : '3 / 4') : 'auto'};
  min-height: ${({ $hasPhoto, $small, $compactWithoutPhoto }) =>
    !$hasPhoto && $compactWithoutPhoto ? ($small ? '180px' : '220px') : $small ? '260px' : '320px'};
  padding-bottom: 0;
  background: linear-gradient(180deg, #fffaf2 0%, #f8f5ef 100%);
  background-size: cover;
  background-position: center;
  border-radius: ${STACK_CARD_RADIUS};
  position: relative;
  overflow: hidden;
  box-shadow:
    0 10px 26px rgba(37, 29, 20, 0.14),
    0 0 0 1px rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.72);
  isolation: isolate;
  margin-bottom: 0;

  &::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    width: 100%;
    height: 40%;
    background: linear-gradient(to bottom, rgba(255, 255, 255, 0.02) 0%, rgba(19, 15, 12, 0.58) 100%);
    pointer-events: none;
    z-index: 1;
  }
`;

const loadingWave = keyframes`
  0% {
    background-position: -200px 0;
  }
  100% {
    background-position: calc(200px + 100%) 0;
  }
`;

export const SkeletonCardInner = styled.div`
  position: relative;
  width: 100%;
  height: auto;
  aspect-ratio: ${({ $small }) => ($small ? '4 / 5' : '3 / 4')};
  min-height: ${({ $small }) => ($small ? '280px' : '340px')};
  overflow: hidden;
  &::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    width: 100%;
    height: 20%;
    background: linear-gradient(
      to bottom,
      rgba(0, 0, 0, 0) 0%,
      rgba(0, 0, 0, 0.5) 100%
    );
    pointer-events: none;
    z-index: 0;
  }
`;

export const SkeletonPhoto = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='30' r='20' fill='%23ccc'/%3E%3Crect x='15' y='55' width='70' height='35' fill='%23ccc'/%3E%3C/svg%3E");
  background-size: cover;
  background-position: center;
  filter: blur(20px);
`;

export const SkeletonInfo = styled.div`
  position: absolute;
  bottom: 55px;
  left: 10px;
  right: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  pointer-events: none;
`;

export const SkeletonLine = styled.div`
  height: 12px;
  background: ${color.paleAccent3};
  opacity: 0.7;
  border-radius: 4px;
  width: ${({ $w }) => $w || '80%'};
  animation: ${loadingWave} 1.5s infinite;
  background-size: 200% 100%;
  background-image: linear-gradient(90deg, ${color.paleAccent2} 25%, ${color.paleAccent5} 50%, ${color.paleAccent2} 75%);
`;

/*
 * Ряд кнопок шапки. Він **не прокручується** — і це не спрощення, а виправлення.
 *
 * Прокрутка тут коштувала сірого прямокутника навколо кнопок: вузол із
 * overflow-x: auto обрізає тінь кожного свого нащадка своєю ж рамкою, тож
 * замість мʼякого ореолу під кожним колом виходила суцільна сіра пляма з
 * різкими краями рівно по межах ряду. На екрані це читалось як прозорий
 * квадрат, якого ніхто не малював, — найгірший різновид помилки: у коді її
 * немає, вона є в тому, як код обрізали.
 *
 * Гортати тут однаково не було чого: кнопок тут щонайбільше дві — плашка
 * адмінських дій і «⋮», — а смужка прокрутки прихована
 * (scrollbar-width: none), тобто того, що не влізло, не було б як дістати.
 * Ряд тримає свою ширину (flex: 0 0 auto), а звужується натомість поле
 * пошуку — воно для того й еластичне.
 */
export const TopActions = styled.div`
  position: static;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
  z-index: 10;
  flex: 0 0 auto;
  max-width: 100%;
  padding: 2px;
`;

export const TopActionGroup = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
  padding: 4px;
  border: 1px solid var(--matching-section-border);
  border-radius: 999px;
  background: var(--matching-section-bg);
  box-shadow: var(--matching-section-shadow);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
`;

// Batch 29 §1: --matching-accent/--matching-action-bg/etc. are always set by matchingThemeVars
// (the Container these buttons render inside always carries them), so the hardcoded hex this used
// to fall back to (#E8791A - matching's own light-mode accent, itself already the same value as
// --km-accent) was dead code kept "just in case"; dropped here rather than left drifting from the
// real token. The active-state tint/focus ring used to hardcode that same orange as a raw rgba()
// with no variable at all - color-mix keeps them tied to --matching-accent (and so to the app's
// bronze accent) at every theme mode, light or dark, instead of only the light one.
// Spec §5 correction 2: the screen spends its one accent colour on "add to
// favourites". The top bar's controls - filter trigger, its count, the "⋮" -
// are chrome, so their active state reads as a neutral outline, not as orange.
export const ActionButton = styled.button`
  position: relative;
  width: ${({ $wide }) => ($wide ? 'auto' : '35px')};
  min-width: ${({ $wide }) => ($wide ? '44px' : '35px')};
  height: 35px;
  padding: ${({ $wide }) => ($wide ? '3px 10px' : '3px')};
  border: 1px solid ${({ $active }) => ($active ? 'var(--matching-header-text)' : 'transparent')};
  background: ${({ $active }) => ($active ? 'color-mix(in srgb, var(--matching-header-text) 8%, transparent)' : 'var(--matching-action-bg)')};
  color: ${({ $active }) => ($active ? 'var(--matching-header-text)' : 'var(--matching-muted-text)')};
  box-shadow: var(--matching-action-shadow);
  transition: transform 240ms cubic-bezier(0.4, 0, 0.2, 1), background 240ms cubic-bezier(0.4, 0, 0.2, 1), box-shadow 240ms cubic-bezier(0.4, 0, 0.2, 1), border-color 240ms cubic-bezier(0.4, 0, 0.2, 1), color 240ms cubic-bezier(0.4, 0, 0.2, 1);
  border-radius: 50px;
  cursor: pointer;
  font-size: ${({ $wide }) => ($wide ? '13px' : '18px')};
  font-weight: ${({ $wide }) => ($wide ? '800' : 'inherit')};
  letter-spacing: ${({ $wide }) => ($wide ? '0.01em' : 'normal')};
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;

  &:hover:not(:disabled) {
    transform: translateY(-1px) scale(1.03);
    border-color: var(--matching-header-text);
  }

  &:active:not(:disabled) {
    transform: scale(0.96);
  }

  &:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--matching-accent) 42%, transparent);
    outline-offset: 2px;
  }

  &:disabled {
    background-color: ${color.gray3};
    color: ${color.gray4};
    box-shadow: none;
    cursor: default;
  }
`;

export const BackendTrafficToggleButton = styled(ActionButton)`
  width: auto;
  min-width: 54px;
  padding: 3px 8px;
  gap: 5px;
  color: ${({ $active }) => ($active ? '#fff' : color.accent3)};
  background-color: ${({ $active }) => ($active ? color.accent5 : '#fff')};
  border: 1px solid ${({ $active }) => ($active ? color.accent5 : color.gray)};
  border-radius: 50px;
  font-size: 14px;
  font-weight: 700;

  &:hover {
    background-color: ${({ $active }) => ($active ? color.accent4 || color.accent5 : color.paleAccent2)};
  }
`;

export const BackendTrafficToggleStatus = styled.span`
  font-size: 10px;
  font-weight: 800;
  line-height: 1;
`;

export const SubmitButton = styled.button`
  padding: 11px 14px;
  color: ${color.black};
  border: 1px solid transparent;
  border-radius: 10px;
  cursor: pointer;
  font-size: 15px;
  font-weight: 500;
  align-self: flex-start;
  width: 100%;
  text-align: left;
  background: linear-gradient(180deg, ${color.oppositeAccent} 0%, #fffaf2 100%);
  box-shadow: inset 0 -1px 0 ${color.gray};
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease,
    transform 0.2s ease;
  margin-bottom: 6px;

  &:last-child {
    margin-bottom: 0;
  }

  &:hover {
    background: ${color.paleAccent2};
    border-color: ${color.paleAccent5};
    transform: translateY(-1px);
  }
`;

export const ExitButton = styled(SubmitButton)`
  background: #fff;
  color: ${color.accent3};
  border-color: ${color.gray};

  &:hover {
    background-color: ${color.paleAccent2};
  }
`;

/* ===== Рейка фільтрів =====================================================
 *
 * Фільтри стоять на першому екрані, а не за кнопкою.
 *
 * Доти той самий стан мав три поверхні: лійка з шухлядою на весь
 * екран, ряд активних чіпів (яким можна було лише **знімати** групи) і
 * рядок уточнення, який писав у ті самі групи, але протилежною
 * логікою («лише це значення» проти «усе, крім»).
 *
 * Викласти всі сім груп на екран розгорнутими було б гірше за лійку:
 * це рівно екран телефона, і стрічка — те, заради чого сюди заходять, —
 * щоразу опинялась під згином. Тож рейка коштує один рядок висоти:
 * чіп на групу, а опції саме цієї групи розкриваються під нею.
 */
export const FilterRail = styled.div`
  position: relative;
  width: 100%;
  box-sizing: border-box;
  padding: 0 12px 8px;
  z-index: 12;

  @media (max-width: 768px) {
    padding-left: 8px;
    padding-right: 8px;
  }
`;

/* Чіпи їдуть убік, а не переносяться: груп рівно сім, їхній порядок
 * сталий, і ряд, який то на один рядок, то на три, сунув би сітку карток
 * при кожному виборі. Скрол лишається всередині ряда — сторінка убік
 * не їде. */
export const FilterRailScroller = styled.div`
  /* Ряд лежить **над** ловцем тапів повз поповер. Інакше перехід з
   * групи в групу коштує два тапи: перший забирає ловець, щоб закрити
   * відкрите, і палець потрапляє в чіп, який нічого не робить. */
  position: relative;
  z-index: 14;
  display: flex;
  align-items: center;
  gap: 6px;
  overflow-x: auto;
  scroll-snap-type: x proximity;
  scrollbar-width: thin;
  scrollbar-color: var(--matching-card-border) transparent;
  padding: 2px 0 6px;

  &::-webkit-scrollbar {
    height: 4px;
  }
  &::-webkit-scrollbar-thumb {
    background: var(--matching-card-border);
    border-radius: 4px;
  }

  > * {
    scroll-snap-align: start;
  }
`;

export const FilterRailChip = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex: 0 0 auto;
  max-width: 62vw;
  height: 40px;
  padding: 0 11px;
  box-sizing: border-box;
  /* Зі зняттям поруч чіп віддає йому свій правий край: два окремі
   * заокруглені краї, накладені один на одний, читались як дві кнопки,
   * що наїхали одна на одну, а не як одна річ із двома діями. */
  border-radius: ${({ $clearable }) => ($clearable ? '999px 0 0 999px' : '999px')};
  padding-right: ${({ $clearable }) => ($clearable ? '7px' : '11px')};
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: ${({ $narrowed }) => ($narrowed ? '700' : '500')};
  line-height: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  border: 1px solid ${({ $danger, $narrowed, $open }) => {
    if ($danger) return 'color-mix(in srgb, #d64545 55%, transparent)';
    if ($open) return 'var(--matching-accent)';
    return $narrowed ? 'var(--matching-accent)' : 'var(--matching-chip-border)';
  }};
  /* Після скороченого border, а не перед ним: той переписує всі чотири
   * сторони, і знята права рамка поверталась — між чіпом і хрестиком
   * стояла риска, яка ділила одну плашку навпіл. */
  border-right-width: ${({ $clearable }) => ($clearable ? '0' : '1px')};
  background: ${({ $danger, $narrowed, $open }) => {
    if ($danger) return 'color-mix(in srgb, #d64545 10%, transparent)';
    if ($open) return 'color-mix(in srgb, var(--matching-accent) 22%, transparent)';
    return $narrowed
      ? 'color-mix(in srgb, var(--matching-accent) 12%, transparent)'
      : 'var(--matching-chip-bg)';
  }};
  color: ${({ $danger, $narrowed }) => {
    if ($danger) return '#d64545';
    return $narrowed ? 'var(--matching-accent)' : 'var(--matching-chip-text)';
  }};
  /* Відкриту групу позначає заливка, а не кільце тіні: ряд прокручується
   * (overflow-x: auto), і тінь за межами чіпа він підрізав — чіп виглядав
   * обрізаним, а не підсвіченим. Зворотні лапки в такому коментарі
   * ставити не можна взагалі: це тегований шаблон, і вони його закривають. */

  > span {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--matching-accent) 42%, transparent);
    outline-offset: 1px;
  }
`;

/* Стрілка каже, що чіп розкривається, а не перемикається: без неї ряд
 * читався як сім незалежних перемикачів. */
export const FilterRailChipCaret = styled.span`
  font-size: 9px;
  opacity: 0.7;
  transform: translateY(1px);
`;

/* Хрестик живе всередині чіпа, але є окремою кнопкою: тап по чіпу
 * розкриває групу, тап по хрестику — знімає звуження. Дві дії на одній
 * кнопці розрізнятись не можуть, а вкладена `button` у `button` невалідна, тож
 * це сусід у спільній оболонці. */
export const FilterRailChipShell = styled.div`
  display: inline-flex;
  align-items: stretch;
  flex: 0 0 auto;
  max-width: 100%;
`;

export const FilterRailChipClear = styled.button`
  display: inline-grid;
  place-items: center;
  flex: 0 0 auto;
  /* Висота та сама, що й у чіпа (40 px): хрестик — друга половина тієї
   * самої плашки. Стояло 30 px, і в адміна, у якого звужених груп кілька,
   * кожна плашка з хрестиком мала праворуч менше коло, ніж ліворуч. */
  width: 30px;
  height: 40px;
  box-sizing: border-box;
  padding: 0 4px 0 0;
  border: 1px solid ${({ $danger }) => ($danger ? 'color-mix(in srgb, #d64545 55%, transparent)' : 'var(--matching-accent)')};
  border-left: none;
  border-radius: 0 999px 999px 0;
  background: ${({ $danger, $open }) => {
    if ($danger) return 'color-mix(in srgb, #d64545 10%, transparent)';
    if ($open) return 'color-mix(in srgb, var(--matching-accent) 22%, transparent)';
    return 'color-mix(in srgb, var(--matching-accent) 12%, transparent)';
  }};
  color: ${({ $danger }) => ($danger ? '#d64545' : 'var(--matching-accent)')};
  font: inherit;
  font-size: 11px;
  line-height: 1;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--matching-accent) 42%, transparent);
    outline-offset: 1px;
  }
`;

/* Прозорий ловець тапів повз поповер. Затемнювати екран тут не можна:
 * числа в поповері рахуються по тих самих картках, які лежать під ним,
 * і читач мусить бачити, як стрічка відгукується. */
export const FilterPopoverScrim = styled.div`
  position: fixed;
  inset: 0;
  z-index: 11;
  background: transparent;
`;

export const FilterPopover = styled.div`
  position: absolute;
  z-index: 13;
  top: calc(100% - 4px);
  left: 12px;
  right: 12px;
  max-width: 460px;
  border-radius: 16px;
  border: 1px solid var(--matching-section-border);
  background: var(--matching-panel-bg);
  color: var(--matching-panel-text);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.28);
  overflow: hidden;
  display: ${({ $open }) => ($open ? 'block' : 'none')};

  @media (max-width: 768px) {
    left: 8px;
    right: 8px;
  }
`;

export const FilterPopoverHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 11px 13px 9px;
  border-bottom: 1px solid var(--matching-section-border);
`;

export const FilterPopoverTitle = styled.h2`
  margin: 0;
  font-size: 14px;
  font-weight: 800;
  line-height: 1.2;
  color: var(--matching-header-text);
`;

export const FilterPopoverHeaderActions = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 4px;
`;

export const FilterPopoverGhostButton = styled.button`
  height: 28px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: none;
  color: var(--matching-muted-text);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;

  &:hover {
    border-color: var(--matching-chip-border);
    color: var(--matching-header-text);
  }

  &:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--matching-accent) 42%, transparent);
    outline-offset: 1px;
  }
`;

export const FilterPopoverBody = styled.div`
  padding: 11px 13px;
  max-height: min(46vh, 340px);
  overflow-y: auto;
`;

/* Числа біля опцій — по завантаженому, а не по всій базі, і рядок каже
 * це прямо, а не вдає точності, якої не має. */
export const FilterPopoverNote = styled.p`
  margin: 9px 0 0;
  font-size: 11px;
  line-height: 1.35;
  color: var(--matching-chip-label);
`;

export const FilterPopoverFooter = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 13px max(11px, env(safe-area-inset-bottom));
  border-top: 1px solid var(--matching-section-border);
`;

export const MatchingSearchStatusMessage = styled.p`
  margin: 6px 0 0;
  padding: 8px 10px;
  border-radius: 10px;
  background: rgba(232, 121, 26, 0.1);
  color: var(--matching-text, #2d2d2d);
  font-size: 13px;
  font-weight: 700;
`;

export const Title = styled.span`
  color: ${props => getRoleColors(props.$role).text};
  font-weight: 800;
  margin-bottom: 4px;
  margin-right: 4px;
  display: inline-block;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  font-size: 10px;
  background: ${props => getRoleColors(props.$role).tag};
  border: 1px solid ${props => getRoleColors(props.$role).border};
  border-radius: 8px;
  padding: 3px 8px;
`;

export const Info = styled.div`
  flex: 1;
`;

export const Table = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  row-gap: 5px;
  column-gap: 5px;
  font-size: 13px;
  margin-bottom: 8px;
  background: rgba(255, 255, 255, 0.82);
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: 12px;
  padding: 7px;

  & > div {
    line-height: 1.15;
    display: flex;
    flex-direction: column;
    background: #fbf9f5;
    border: 1px solid rgba(0, 0, 0, 0.05);
    border-radius: 8px;
    padding: 4px 7px;
  }

  & strong {
    font-size: 8px;
    color: ${props => props.$roleColor || color.accent3};
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 2px;
  }

  & > div > span,
  & > div {
    color: #2f2f39;
    font-weight: 700;
  }
`;

export const Contact = styled.div`
  display: flex;
  justify-content: flex-start;
  align-items: center;
  font-size: 14px;
  border-top: ${props => (props.$withBorder ? `1px solid rgba(0, 0, 0, 0.08)` : 'none')};
  padding-top: ${props => (props.$withBorder ? '10px' : '0')};
  margin-top: ${props => (props.$withBorder ? '6px' : '0')};
`;

export const Icons = styled.div`
  display: flex;
  gap: 5px;
  font-size: inherit;
  color: ${color.accent5};
  align-items: center;
  flex-wrap: wrap;

  & a {
    width: 30px !important;
    height: 30px !important;
    border-radius: 8px;
    background: rgba(232, 121, 26, 0.1);
    border: 1px solid rgba(232, 121, 26, 0.22) !important;
    transition: all 0.15s ease;
  }

  & a:hover {
    background: rgba(255, 108, 0, 0.18);
    border-color: rgba(255, 108, 0, 0.38) !important;
    transform: translateY(-1px);
  }

  & svg {
    width: 13px !important;
    height: 13px !important;
  }
`;

/*
 * Цятка публікації — кнопка адміна, і вона повернулась у самі картки.
 *
 * Червона/зелена крапка у кутку картки була єдиним місцем, де видно й
 * перемикається стан «анкета в стрічці». Після переїзду на нову сітку вона
 * лишилась тільки у відкритій картці, тобто відповісти «а чи опублікована ця»
 * можна було, лише відкривши анкету — по одній.
 *
 * Стан читається з `feedDate` самої картки (`isMatchingCardPublished`), а не з
 * `publish`: у проєкції такого ключа немає, і на ньому цятка була б червоною
 * для всієї стрічки.
 *
 * Обвідка кольору картки — щоб крапка лишалась видимою і на світлому фото, і
 * на темному.
 */
export const PublishDot = styled.button`
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;

  &::before {
    content: '';
    width: 11px;
    height: 11px;
    border-radius: 50%;
    box-shadow: 0 0 0 2px var(--matching-card-bg);
    background: ${({ $published }) => ($published ? '#2f9e44' : '#e03131')};
  }

  &:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--matching-accent) 60%, transparent);
    outline-offset: 2px;
  }
`;

export const Id = styled.div`
  position: absolute;
  right: 10px;
  top: 0;
  z-index: 2;
  font-size: 12px;
  color: ${color.gray3};
  text-align: right;
  display: inline-block;
  padding-right: 4px;
`;

export const OwnerStatusMessage = styled.p`
  text-align: center;
  padding: 0 10px;
`;

export const ContactIconRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
  padding: ${({ $standalone }) => ($standalone ? '8px 0 2px' : '0')};
  border-top: ${({ $standalone }) => ($standalone ? '1px solid var(--matching-contact-border)' : 'none')};
`;

export const ContactIconLink = styled.a`
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  border-radius: 11px;
  border: 1px solid var(--matching-contact-border);
  background: transparent;
  color: var(--matching-accent);
  text-decoration: none;

  svg {
    width: 17px;
    height: 17px;
  }

  &:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--matching-accent) 60%, transparent);
    outline-offset: 2px;
  }
`;

export const MatchingTopBar = styled.div`
  position: sticky;
  top: 0;
  z-index: 14;
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  box-sizing: border-box;
  padding: max(8px, env(safe-area-inset-top)) 12px 8px;
  background: var(--matching-page-bg);

  @media (max-width: 768px) {
    padding-left: 8px;
    padding-right: 8px;
  }
`;

export const SearchField = styled.div`
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  height: 38px;
  padding: 0 8px 0 10px;
  gap: 6px;
  box-sizing: border-box;
  border: 1px solid var(--matching-card-border);
  border-radius: 50px;
  background: var(--matching-card-bg);
  color: var(--matching-header-text);

  &:focus-within {
    border-color: color-mix(in srgb, var(--matching-accent) 55%, transparent);
  }

  > svg {
    flex: 0 0 auto;
    color: var(--matching-muted-text);
    font-size: 13px;
  }
`;

export const SearchInput = styled.input`
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
  border: none;
  outline: none;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 14px;

  &::placeholder {
    color: var(--matching-muted-text);
    opacity: 0.8;
  }
`;

export const ChipsRow = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 6px;
  width: 100%;
  box-sizing: border-box;
  padding: 0 12px 8px;

  @media (max-width: 768px) {
    padding-left: 8px;
    padding-right: 8px;
  }
`;

/* Чіпи переносяться на новий рядок, а не тиснуться в один.
 *
 * Раніше ряд був `overflow: hidden` з `flex: 0 1 auto` на чіпах, тож кожен
 * зайвий чіп забирав ширину в усіх інших: при кількох активних фільтрах ряд
 * перетворювався на «З… 0 · Ство… · С. 2» — підписи, за якими не видно, який це
 * фільтр і як його зняти. Перенос коштує рядок висоти й лишає підпис цілим. */
export const ChipsGroup = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  flex: 1 1 auto;
  min-width: 0;
`;

export const Chip = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: 0 0 auto;
  max-width: 100%;
  min-width: 0;
  height: 26px;
  padding: 0 9px;
  box-sizing: border-box;
  border-radius: 999px;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  border: 1px solid ${({ $danger, $active }) => {
    if ($danger) return 'color-mix(in srgb, #d64545 55%, transparent)';
    return $active ? 'var(--matching-chip-text)' : 'var(--matching-chip-border)';
  }};
  background: ${({ $active }) => ($active
    ? 'color-mix(in srgb, var(--matching-chip-text) 10%, transparent)'
    : 'var(--matching-chip-bg)')};
  color: ${({ $danger }) => ($danger ? '#d64545' : 'var(--matching-chip-text)')};

  > span {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--matching-accent) 42%, transparent);
    outline-offset: 1px;
  }
`;

export const ChipCount = styled.b`
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--matching-chip-label);
`;

/*
 * Кнопки колекцій — ті самі кнопки, що й реакції в ряду рішень картки.
 *
 * Колекцій три: уся дека, приховані й вподобані. Чіпами з написами
 * («Приховані», «♥») вони не казали, що це ті самі картки, яким читач щойно
 * ставив хрестик чи серце: слово «Приховані» ніде на картці не стоїть. Тепер
 * кнопка колекції несе той самий значок у тій самій рамці, що й кнопка на
 * картці (`RowActionButton` у ряду рішень), — і стоять вони в тому самому
 * порядку: хрестик, потім серце. «Усі» зроблено в тому ж стилі, щоб ряд
 * читався трьома рівними кнопками, а не кнопкою й двома значками.
 */
export const CollectionButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  flex: 0 0 auto;
  min-width: 0;
  height: 44px;
  padding: 0 8px;
  box-sizing: border-box;
  border-radius: 10px;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
  border: 1px solid ${({ $active, $accent }) => {
    if (!$active) return 'var(--matching-card-border)';
    return $accent ? 'var(--matching-accent)' : 'var(--matching-chip-text)';
  }};
  background: ${({ $active, $accent }) => {
    if (!$active) return 'var(--matching-card-bg)';
    return $accent
      ? 'color-mix(in srgb, var(--matching-accent) 14%, transparent)'
      : 'color-mix(in srgb, var(--matching-chip-text) 10%, transparent)';
  }};
  color: ${({ $accent, $active }) => {
    if ($accent) return 'var(--matching-accent)';
    return $active ? 'var(--matching-chip-text)' : 'var(--matching-muted-text)';
  }};

  svg {
    flex: 0 0 auto;
  }

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }

  &:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--matching-accent) 42%, transparent);
    outline-offset: 1px;
  }
`;

export const CollectionButtonCount = styled.b`
  font-size: 12px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--matching-chip-label);
`;

/* Сортування деки — першим у ряду фільтрів і тієї самої висоти, що й чіп.
 * Рідний select, а не свій поповер: три варіанти, і на телефоні система
 * сама покаже зручний список. */
export const SortSelect = styled.select`
  flex: 0 0 auto;
  height: 40px;
  padding: 0 10px;
  border: 1px solid var(--matching-chip-border);
  border-radius: 999px;
  background: var(--matching-chip-bg);
  color: var(--matching-chip-text);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--matching-accent) 42%, transparent);
    outline-offset: 1px;
  }
`;

/* ------------------------------------------------------------------ *
 * Matching feed (spec §5-§6)
 * ------------------------------------------------------------------ */

export const FeedWrap = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  width: 100%;
  min-height: 0;
  padding: 0 10px 10px;
  box-sizing: border-box;
`;

/*
 * Поки позиція ще не відновлена, списку на екрані немає.
 *
 * Повернення до стрічки ставить її на той самий рядок, з якого читач пішов, —
 * але не в тому ж кадрі: дека приїжджає порціями, і потрібний рядок з'являється
 * в DOM пізніше за перші картки (`SCROLL_ANCHOR_MAX_ATTEMPTS`). Усі ці кадри
 * список малювався з самого початку, і читач бачив стрибок: вершина списку, а
 * за мить — правильне місце. Тепер він не бачить ані вершини, ані стрибка:
 * список проявляється вже на своєму місці. Місце він при цьому займає (саме
 * `visibility`, а не `display`) — інакше відновлювати позицію не було б по чому.
 */
const restoringScroll = css`
  visibility: hidden;
`;

export const FeedList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: 2px 0 4px;

  /* Сітка йде рядками, а не колонками: порядок стрічки задає дата публікації, і
     друга за свіжістю картка мусить стояти поруч із першою, а не посеред
     екрана внизу лівої колонки. Картки в ряду стають угорі, а не тягнуться
     до найвищої. */
  @media (min-width: ${FEED_WIDE_MIN_WIDTH}px) {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: start;
    gap: 14px;
  }

  @media (min-width: ${FEED_XWIDE_MIN_WIDTH}px) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  ${({ $restoringScroll }) => $restoringScroll && restoringScroll};
`;

export const FeedSentinel = styled.div`
  height: 1px;
`;

/* Рядок у кінці списку: «завантажую», «це всі анкети» або кнопка повтору.
 *
 * Тут жив відлік паузи між сторінками стрічки; паузи більше немає, а місце
 * лишилось — кінець списку без жодного слова читався б як «зламалось». */
export const FeedEndNotice = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 18px 12px 22px;
  text-align: center;
  color: var(--matching-muted-text);
  font-size: 12px;
  line-height: 1.4;
`;

export const FeedEndHint = styled.div`
  max-width: 280px;
`;

/* Повтор після порожньої порції — там, де стрічка коротша за екран і
 * прокрутити, щоб попросити ще, нема чого. */
export const FeedLoadPromptButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 9px 18px;
  border: 1px solid var(--matching-chip-border);
  border-radius: 999px;
  background: var(--matching-chip-bg);
  color: var(--matching-chip-text);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  line-height: 1;

  &:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--matching-accent) 42%, transparent);
    outline-offset: 1px;
  }
`;

/* ------------------------------------------------------------------ *
 * Міні-картка набраного: перший рядок видачі
 *
 * Пошук відповідає на питання «де ця людина», і відповідей у нього дві: ось
 * знайдені картки — або такої ще немає, заведіть. Друга відповідь стояла чіпом
 * над видачею, тобто там, де її читають як фільтр; а набране, яке вона мала б
 * нести в нову картку, читач бачив аж у формі. Тепер це рядок видачі: у ньому
 * видно, чим саме розпізнано набране і в яке поле воно ляже.
 * ------------------------------------------------------------------ */

export const QueryDraftCard = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 2px 0 9px;
  padding: 10px 12px;
  border: 1px dashed color-mix(in srgb, var(--matching-accent) 55%, transparent);
  border-radius: 16px;
  background: var(--matching-card-bg, #fff);
  box-sizing: border-box;
`;

export const QueryDraftBody = styled.div`
  flex: 1 1 auto;
  min-width: 0;
  display: grid;
  gap: 2px;
`;

export const QueryDraftLabel = styled.span`
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .06em;
  text-transform: uppercase;
  color: var(--matching-muted-text);
`;

export const QueryDraftValue = styled.span`
  font-size: 15px;
  font-weight: 700;
  line-height: 1.3;
  color: var(--matching-header-text);
  overflow-wrap: anywhere;
`;

export const QueryDraftNote = styled.span`
  font-size: 12px;
  line-height: 1.4;
  color: var(--matching-muted-text);
`;

// Кнопка стоїть поруч із набраним, а не смугою під ним: це одна з відповідей
// видачі, а не заклик до дії на весь екран.
export const QueryDraftButton = styled.button`
  flex: 0 0 auto;
  min-height: 34px;
  padding: 7px 14px;
  border: 1px solid var(--matching-accent);
  border-radius: 11px;
  background: transparent;
  color: var(--matching-accent);
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
  cursor: pointer;

  &:hover { background: color-mix(in srgb, var(--matching-accent) 12%, transparent); }
  &:focus-visible { outline: 2px solid var(--matching-accent); outline-offset: 2px; }
`;

// Плашка про відсутній звʼязок з базою: липка, бо читач гортає далі й мусить
// розуміти, чому розгорнутий рядок не дотягується.
export const ConnectionNotice = styled.div`
  position: sticky;
  top: 8px;
  z-index: 5;
  margin: 0 0 10px;
  padding: 10px 12px;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.4;
  color: #7A3E00;
  background: #FFF1DC;
  border: 1px solid #F3C98B;
`;

export const FeedNotice = styled.div`
  padding: 24px 12px;
  text-align: center;
  font-size: 13px;
  line-height: 1.5;
  color: var(--matching-muted-text);
`;

/* ------------------------------------------------------------------ *
 * Detail layer (spec §7)
 *
 * A layer over the feed, not a route: the feed keeps its DOM and its scroll
 * position underneath, and history.pushState gives Android's hardware Back
 * something to pop so it closes the layer instead of leaving the page.
 * ------------------------------------------------------------------ */

export const DetailCloseButton = styled.button`
  width: 35px;
  height: 35px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 1px solid var(--matching-card-border);
  border-radius: 50%;
  background: var(--matching-card-bg);
  color: var(--matching-muted-text);
  cursor: pointer;
  font-size: 15px;

  &:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--matching-accent) 42%, transparent);
    outline-offset: 2px;
  }
`;

// Spec §10: the drawer's filters are a draft until this is pressed - the count
// on it is computed locally from the loaded cache, so it tracks every toggle
// instantly while the expensive re-query happens once, on the press.
export const FilterApplyButton = styled.button`
  flex: 1 1 auto;
  min-height: 40px;
  padding: 10px 16px;
  border: none;
  border-radius: 12px;
  background: var(--matching-accent);
  color: #fff;
  font: inherit;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;

  &:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--matching-accent) 42%, transparent);
    outline-offset: 2px;
  }
`;

/* Рядок дофільтрації видачі.
 *
 * Стоїть під рядом чіпів і навмисно не липне до верху: дофільтр потрібен один
 * раз на початку перегляду, а липкий рядок на мобільному зʼїдає висоту весь час.
 *
 * На відміну від `ChipsGroup`, значення не переносяться, а їдуть убік: перенос
 * тут означав би, що ряд то на один рядок, то на три, і сітка карток стрибала б
 * при кожному виборі. Скрол лишається всередині самого ряду — сторінка вбік
 * не їде. */
export const RefineBar = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  box-sizing: border-box;
  padding: 2px 12px 10px;

  @media (max-width: 768px) {
    padding-left: 8px;
    padding-right: 8px;
  }
`;

export const RefineScroller = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1 1 auto;
  min-width: 0;
  overflow-x: auto;
  scroll-snap-type: x proximity;
  scrollbar-width: none;
  -ms-overflow-style: none;

  &::-webkit-scrollbar {
    display: none;
  }

  > * {
    scroll-snap-align: start;
  }
`;

/* Чіп ключа обведений пунктиром, а не суцільним: він не є вибором значення, він
 * називає, серед чого зараз обирають. */
export const RefineKeyChip = styled(Chip)`
  border-style: dashed;
  font-weight: 500;
`;

/* Обране значення. Заливається акцентом, бо це єдине увімкнене в рядку. */
export const RefineValueChip = styled(Chip)`
  ${({ $active }) => ($active ? `
    background: var(--matching-accent);
    border-color: var(--matching-accent);
    color: #fff;
  ` : '')}

  &:disabled {
    opacity: 0.34;
    cursor: default;
  }
`;

export const RefineValueCount = styled.b`
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  opacity: 0.7;
`;

/* Після вибору ряд перестає бути меню й стає твердженням: що увімкнено,
 * скільки під це підпадає і як зняти. Тому тут окремий підпис, а не ще один
 * чіп — інакше «показано 2 з 74» читалось би як ще одна кнопка. */
export const RefineSummary = styled.span`
  flex: 0 1 auto;
  min-width: 0;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--matching-chip-label);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const RefineKeyMenu = styled.div`
  position: absolute;
  z-index: 6;
  top: calc(100% - 4px);
  left: 12px;
  min-width: 168px;
  border-radius: 12px;
  overflow: hidden;
  background: var(--matching-section-bg);
  border: 1px solid var(--matching-chip-border);
  box-shadow: 0 16px 44px rgba(0, 0, 0, 0.32);

  @media (max-width: 768px) {
    left: 8px;
  }
`;

export const RefineKeyMenuItem = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 13px;
  border: none;
  background: none;
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  color: var(--matching-panel-text);

  & + & {
    border-top: 1px solid var(--matching-chip-border);
  }

  &[aria-checked='true'] {
    color: var(--matching-accent);
    font-weight: 700;
  }

  &:disabled {
    opacity: 0.45;
    cursor: default;
  }

  small {
    margin-left: auto;
    font-size: 10px;
    opacity: 0.7;
  }
`;

/* ------------------------------------------------------------------
 * Нотатки на картці: приватна й публічна в одному блоці
 *
 * Досі це були дві повноцінні секції — з власними рамками, фоном і
 * заголовком на 20–22px кожна. Тобто нотатка важила стільки ж, скільки
 * «Основне» чи «Зовнішність», хоч вона не дані анкети, а помітка на полях.
 * Два таких блоки поспіль і давали те «занадто здорове», з якого почалась
 * ця правка.
 *
 * Тепер блок один, а хто бачить запис — каже не окрема секція, а смужка
 * ліворуч і підпис над текстом: приглушена й «Бачите тільки ви» в
 * приватного, акцентна й «Бачать усі» в публічного. Кольору тут рівно
 * стільки, скільки треба, щоб відрізнити ці два стани, — другого акценту
 * картка не отримує.
 * ------------------------------------------------------------------ */

export const NoteLanes = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

/*
 * Доріжка нотатки — однакова на кожному екрані: смужка ліворуч, підпис над
 * текстом, сам текст без рамки поля.
 *
 * Колір смужки каже, хто запис побачить: акцентна в публічного відгуку,
 * зелена в памʼятки для себе. Доти рядок стрічки смужки не мав зовсім
 * (`$flush`), відкрита картка малювала приватну сірою, а форма чернетки
 * клала приватну в рамку інпута — і та сама пара записів виглядала на трьох
 * екранах трьома різними механізмами. Різний лишається хіба масштаб.
 *
 * Ліва межа рядка стрічки зайнята смужкою ролі на самому краї картки, а
 * доріжка стоїть на відступі картки (11 px) — тож дві риски не зливаються.
 */
export const NOTE_LANE_PUBLIC_COLOR = 'color-mix(in srgb, var(--matching-accent, var(--km-accent, #e8791a)) 55%, transparent)';
export const NOTE_LANE_PRIVATE_COLOR = 'color-mix(in srgb, #2e9b55 60%, transparent)';
/* Прочитаний відгук під карткою фарбує смужку червоним і робить її ширшою.
   Акцентна смужка стоїть у кожній картці незалежно від того, чи є під нею
   хоч один відгук, — і картка з відгуком зливалась у списку з рештою: помітити
   її можна було, лише вчитавшись у саму доріжку. А відгук — це саме те, повз що
   гортати не можна. */
export const NOTE_LANE_REVIEWED_COLOR = '#d93a2b';

export const NoteLane = styled.div`
  padding-left: 10px;
  /* Кожна змінна тут із запасною: ту саму пару доріжок малює й форма
     доповнення картки, а вона поза матчингом, де --matching-* не оголошені, —
     і невідома змінна в скороченому записі border робить нечинним увесь
     запис, тобто смужки на екрані просто не було б. */
  border-left: 2px solid ${({ $public }) => ($public ? NOTE_LANE_PUBLIC_COLOR : NOTE_LANE_PRIVATE_COLOR)};

  ${({ $public, $reviewed }) => $public && $reviewed && css`
    border-left: 3px solid ${NOTE_LANE_REVIEWED_COLOR};
    padding-left: 9px;
  `}
`;

export const NoteLaneHead = styled.div`
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-bottom: 3px;
  font-size: ${NOTE_META_SIZE};
  line-height: ${NOTE_META_LINE_HEIGHT};
  color: var(--matching-muted-text, var(--km-muted, #8a8178));

  b {
    font-weight: 600;
    color: var(--matching-header-text, var(--km-text, #2c261f));
  }
`;

/*
 * Хрестик, яким знімають уже записане — і публічний відгук, і памʼятку.
 *
 * Один на всі доріжки й усі екрани: маленький знак, але з мішенню 28 px —
 * пальцем у 11-піксельний «×» у рядку підпису влучити було неможливо, а
 * велика кнопка важила б більше за сам запис.
 */
export const NoteClearButton = styled.button`
  flex: none;
  display: inline-grid;
  place-items: center;
  width: 28px;
  height: 28px;
  margin: -4px -7px -4px 0;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--matching-muted-text, var(--km-muted, #8a8178));
  font: inherit;
  font-size: 17px;
  line-height: 1;
  cursor: pointer;
  opacity: 0.7;

  &:hover,
  &:focus-visible {
    opacity: 1;
    outline: 0;
    background: color-mix(in srgb, var(--matching-muted-text, var(--km-muted, #8a8178)) 14%, transparent);
  }
`;

/* Поле памʼятки й хрестик біля нього — один рядок: текст забирає всю
   ширину, хрестик стоїть праворуч на висоті першого рядка. */
export const NoteFieldRow = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 4px;

  > :first-child {
    flex: 1 1 auto;
    min-width: 0;
  }
`;
