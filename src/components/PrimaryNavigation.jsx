import React, { useCallback, useEffect, useState } from 'react';
import { getExtraLocale } from '../utils/locales';
import { createPortal } from 'react-dom';
import { NavLink, useLocation } from 'react-router-dom';
import styled, { createGlobalStyle } from 'styled-components';
import { FaSearch, FaRegFolderOpen, FaRegUser, FaChevronLeft, FaEllipsisV, FaPen } from 'react-icons/fa';
import { useAppSettings } from '../hooks/useAppSettings';
import { usePrimaryNavigationHeaderNodeSetter, usePrimaryNavigationMenuSubscription, usePrimaryNavigationSlotState } from './PrimaryNavigationSlot';
import { InfoModal } from './InfoModal';

const BOTTOM_NAV_BREAKPOINT = 600;
// Висота нижньої панелі — числом у самій панелі, а не лише змінною: змінну
// ставить глобальний стиль нижче, і поки його перевставляють (перемонтування
// навігації), `--km-bottom-nav-h` на кадр падав до нуля з `index.css` —
// панель схлопувалась і поверталась, тобто «стрибала».
const BOTTOM_NAV_HEIGHT = 64;
// Панель плаває над сторінкою, як у Telegram: відступ від низу й країв, а
// сторінка лишає під собою місце на всю зайняту смугу плюс повітря — інакше
// останній рядок тексту стояв під панеллю.
const BOTTOM_NAV_GAP = 10;
const BOTTOM_NAV_SPACE = BOTTOM_NAV_HEIGHT + BOTTOM_NAV_GAP * 2;

// На телефоні вкладки стоять унизу екрана (див. `Tabs`), тож сторінка мусить
// лишити під собою місце, а фіксоване знизу — ставати над панеллю. Висоту
// панелі несе `--km-bottom-nav-h`: поза цими трьома екранами її немає, і
// змінна лишається нулем з `index.css`.
// `env(safe-area-inset-bottom)` тут немає навмисно. Без `viewport-fit=cover`
// у meta viewport сторінка під жестову смугу й так не заходить, тож Chrome і
// Safari дають там нуль, а Firefox на Android додає туди висоту власної
// панелі, поки та видима: на верху сторінки панель вкладок росла на висоту
// тулбара (підписи підскакували, під ними — порожня смуга), а з прокруткою
// тулбар ховався, і панель «опускалась».
// Верхній рядок на телефоні липкий (у ньому тепер пошук і статус сторінки), і
// липке під ним стає нижче на його висоту — `--km-top-nav-h`.
const TOP_NAV_HEIGHT = 53;
const BottomNavSpace = createGlobalStyle`
  @media (max-width: ${BOTTOM_NAV_BREAKPOINT}px) {
    :root { --km-bottom-nav-h: ${BOTTOM_NAV_SPACE}px; --km-top-nav-h: ${TOP_NAV_HEIGHT}px; }
    body { padding-bottom: var(--km-bottom-nav-h); }
    /* Під пігулкою вміст гасне в тло сторінки, як у Telegram: поки картки
       визирали довкола напівпрозорої панелі й крізь неї, це читалось як
       «навігація налізла на текст». */
    body::after {
      content: '';
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      height: calc(var(--km-bottom-nav-h) + 24px);
      z-index: 899;
      pointer-events: none;
      background: linear-gradient(to bottom, transparent, var(--km-bg) 34%);
    }
  }
`;

// Нижня панель на телефоні рендериться порталом у `body`, а не всередині
// шапки. Шапка там липка (`position: sticky`), і фіксована панель усередині
// неї жила в шарі липкого предка: Firefox на Android зсуває такі шари
// асинхронно під час прокрутки й лише потім доправляє головним потоком, тож
// панель на прокрутці стрибала й підтискалась. До того ж `z-index` панелі
// діяв лише в межах шапки (30), а не сторінки.
const narrowQuery = `(max-width: ${BOTTOM_NAV_BREAKPOINT}px)`;
const readNarrow = () => typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia(narrowQuery).matches;
const useNarrowScreen = () => {
  const [narrow, setNarrow] = useState(readNarrow);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const media = window.matchMedia(narrowQuery);
    const update = () => setNarrow(media.matches);
    update();
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', update);
      return () => media.removeEventListener('change', update);
    }
    media.addListener(update);
    return () => media.removeListener(update);
  }, []);
  return narrow;
};

const Header = styled.header`
  background: var(--km-card);
  border-bottom: 1px solid var(--km-border);
  color: var(--km-text);
  @media (max-width: ${BOTTOM_NAV_BREAKPOINT}px) {
    position: sticky;
    top: 0;
    z-index: 30;
    box-sizing: border-box;
    min-height: ${TOP_NAV_HEIGHT}px;
  }
`;

// Гніздо під верхній блок сторінки (`usePrimaryNavigationHeaderTarget`). Поки
// сторінка нічого туди не поклала, стоїть назва екрана; поклала — назву
// ховає сусідній селектор у `Navigation`.
const PageHeaderSlot = styled.div`
  display: none;
  @media (max-width: ${BOTTOM_NAV_BREAKPOINT}px) {
    display: flex;
    align-items: center;
    flex: 1 1 auto;
    min-width: 0;
    &:empty { display: none; }
  }
`;

const Navigation = styled.nav`
  max-width: 1240px;
  margin: 0 auto;
  padding: 8px 24px;
  display: flex;
  align-items: center;
  gap: 12px;
  font-family: var(--km-font);

  strong { margin-right: auto; font-size: 22px; font-weight: 600; letter-spacing: -0.6px; }
  [data-page-header]:not(:empty) + [data-screen-title] { display: none; }
  strong span { color: var(--km-accent); }
  @media (max-width: ${BOTTOM_NAV_BREAKPOINT}px) {
    padding: 4px 6px;
    gap: 4px;
    min-height: 52px;
    box-sizing: border-box;
    strong { display: none; }
  }
`;

// Назва поточного екрана — лише на телефоні: вкладки там унизу, і без неї
// верхній рядок складався б з самих стрілки й «⋮».
const ScreenTitle = styled.span`
  display: none;
  @media (max-width: ${BOTTOM_NAV_BREAKPOINT}px) {
    display: block;
    flex: 1 1 auto;
    min-width: 0;
    padding: 0 6px;
    font-size: 17px;
    font-weight: 600;
    letter-spacing: -0.01em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`;

/* Вкладки. На широкому екрані — у рядку шапки, активна позначена кольором і
 * рискою знизу. На телефоні — нижня панель: верхній рядок із трьома
 * вкладками займав ~80 px над кожним екраном, до нього треба було
 * тягнутись пальцем через увесь екран, а активна вкладка відрізнялась
 * від сусідніх ледь помітною підкладкою. */
const Tabs = styled.div`
  display: flex;
  align-items: stretch;
  gap: 4px;

  a {
    position: relative;
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 0 14px;
    border-radius: 10px;
    color: var(--km-muted);
    font-size: 14px;
    font-weight: 500;
  }
  a[aria-current='page'] { color: var(--km-accent); font-weight: 600; }
  a[aria-current='page']::after {
    content: '';
    position: absolute;
    left: 14px;
    right: 14px;
    bottom: -9px;
    height: 2px;
    border-radius: 2px;
    background: var(--km-accent);
  }
  a:hover { background: var(--km-bg); color: var(--km-text); }
  a[aria-current='page']:hover { color: var(--km-accent); }
  a:focus-visible { outline: 2px solid var(--km-accent); outline-offset: 2px; }

  @media (max-width: ${BOTTOM_NAV_BREAKPOINT}px) {
    /* Плаваюча «пігулка» за зразком Telegram: суцільне тло над смугою згасання,
       тінь замість риски згори, активна вкладка — заливка під значком і
       підписом разом. Кольори — свої (акцент і його світла підкладка). */
    position: fixed;
    left: ${BOTTOM_NAV_GAP + 2}px;
    right: ${BOTTOM_NAV_GAP + 2}px;
    bottom: ${BOTTOM_NAV_GAP}px;
    z-index: 900;
    gap: 2px;
    padding: 5px;
    height: ${BOTTOM_NAV_HEIGHT}px;
    box-sizing: border-box;
    border-radius: ${BOTTOM_NAV_HEIGHT / 2}px;
    background: var(--km-card);
    border: 1px solid var(--km-border);
    box-shadow: 0 8px 28px rgba(0, 0, 0, .14), 0 1px 3px rgba(0, 0, 0, .08);

    a {
      flex: 1 1 0;
      min-width: 0;
      min-height: 0;
      padding: 4px 2px;
      flex-direction: column;
      gap: 2px;
      font-size: 11px;
      font-weight: 600;
      line-height: 1.15;
      text-align: center;
      border-radius: ${BOTTOM_NAV_HEIGHT / 2 - 5}px;
      color: var(--km-text);
      transition: background-color .2s ease, color .2s ease;
    }
    a:hover { background: transparent; color: var(--km-text); }
    a[aria-current='page'],
    a[aria-current='page']:hover { background: var(--km-accent-light); color: var(--km-accent); }
    a[aria-current='page']::after { display: none; }
    a svg { width: 22px; height: 22px; flex: 0 0 auto; }
  }
`;

// Місце під стрілку зарезервоване завжди: інакше вкладки стрибали б убік
// щоразу, коли на сторінці зʼявляється чи зникає можливість повернутись.
const SideSlot = styled.span`
  flex: 0 0 44px;
  width: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  /* На телефоні вкладок у цьому рядку немає, і стрибати нічому — порожнє
     місце під стрілку лише відсувало назву екрана від краю. */
  @media (max-width: ${BOTTOM_NAV_BREAKPOINT}px) {
    &:empty { display: none; }
  }
`;

// Без рамки: стрілка й «⋮» — хром, а не дії, і обведені кола змагались з
// вкладками за увагу. Мішень 44 px.
const SlotButton = styled.button`
  width: 44px;
  height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: var(--km-text);
  font-size: 16px;
  cursor: pointer;
  &:hover { background: var(--km-fill); }
  &:focus-visible { outline: 2px solid var(--km-accent); outline-offset: 2px; }
`;

const MenuButton = SlotButton;

// Підпис вкладки карток каже, що на ній відкрито зараз: над формою
// доповнення «Мої картки» обіцяли список власних карток, а лежала там чужа.
// Написи рядка навігації: українська й англійська тут, решта мов — у своїх
// модулях (`utils/locales`, поле `nav`); невідома мова бере українські.
const NAV_TEXTS = {
  uk: { back: 'Назад', menu: 'Відкрити меню', nav: 'Основна навігація', find: 'Пошук анкет', add: 'Додати картку', mine: 'Мій профіль', overlay: 'Доповнення', draft: 'Чернетка' },
  en: { back: 'Back', menu: 'Open menu', nav: 'Main navigation', find: 'Find profiles', add: 'Add card', mine: 'My profile', overlay: 'Enrich card', draft: 'Draft' },
};
const resolveNavTexts = language => NAV_TEXTS[language] || getExtraLocale(language)?.nav || NAV_TEXTS.uk;

// Keep the main destinations visible; account settings live in the "⋮" menu
// at the end of the same row, and "back" — at its start.
export default function PrimaryNavigation() {
  const { language } = useAppSettings();
  const narrow = useNarrowScreen();
  const texts = resolveNavTexts(language);
  const slot = usePrimaryNavigationSlotState();
  const setHeaderNode = usePrimaryNavigationHeaderNodeSetter();
  const [menuOpen, setMenuOpen] = useState(false);
  // Пункти меню складає сторінка, і відкрите меню мусить іти за її станом:
  // поки воно відкрите, кожен рендер сторінки перемальовує і його
  // (`usePrimaryNavigationMenuSubscription`).
  const subscribeMenu = usePrimaryNavigationMenuSubscription();
  const [, refreshMenu] = useState(0);
  useEffect(() => {
    if (!menuOpen || !subscribeMenu) return undefined;
    return subscribeMenu(() => refreshMenu(value => value + 1));
  }, [menuOpen, subscribeMenu]);
  const workspace = slot?.workspaceLabel ? texts[slot.workspaceLabel] : '';
  const { pathname } = useLocation();
  const screenTitle = pathname.startsWith('/matching/create-profile')
    ? (workspace || texts.add)
    : pathname.startsWith('/my-profile') ? texts.mine : texts.find;
  const backLabel = texts.back;
  const menuLabel = texts.menu;
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  // Тип компонента меню мусить бути сталим. Тут стояло
  // `Context={() => slot.renderMenu(...)}` — новий тип на кожен рендер рядка,
  // і React щоразу перемонтовував меню цілком: розгорнута сітка мов
  // згорталась на першій же стрілці, прокрутка меню скидалась. Сталий тип
  // React просто перемальовує, і вміст при цьому свіжий (ref сторінки).
  const renderSlotMenu = slot?.renderMenu;
  const SlotMenu = useCallback(
    () => (renderSlotMenu ? renderSlotMenu({ close: closeMenu }) : null),
    [closeMenu, renderSlotMenu],
  );
  // Поза `nav` шапки панель несе власний орієнтир для екранного читача.
  const tabs = (
    <Tabs {...(narrow ? { as: 'nav', 'aria-label': texts.nav } : {})}>
      <NavLink to="/matching" end><FaSearch aria-hidden="true" />{texts.find}</NavLink>
      <NavLink to="/matching/create-profile">
        {workspace ? <FaPen aria-hidden="true" /> : <FaRegFolderOpen aria-hidden="true" />}
        {workspace || texts.add}
      </NavLink>
      <NavLink to="/my-profile"><FaRegUser aria-hidden="true" />{texts.mine}</NavLink>
    </Tabs>
  );
  return (
    <Header>
      <BottomNavSpace />
      <Navigation aria-label={texts.nav}>
        <strong>KnowMe<span>.</span></strong>
        <SideSlot>
          {slot?.onBack && (
            <SlotButton type="button" aria-label={backLabel} title={backLabel} onClick={slot.onBack}>
              <FaChevronLeft aria-hidden="true" />
            </SlotButton>
          )}
        </SideSlot>
        <PageHeaderSlot data-page-header ref={setHeaderNode} />
        <ScreenTitle data-screen-title aria-hidden="true">{screenTitle}</ScreenTitle>
        {!narrow && tabs}
        <SideSlot>
          {slot?.renderMenu && (
            <MenuButton type="button" aria-label={menuLabel} title={menuLabel} onClick={() => setMenuOpen(true)}>
              <FaEllipsisV aria-hidden="true" />
            </MenuButton>
          )}
        </SideSlot>
      </Navigation>
      {/* Меню — теж порталом: усередині липкої шапки його `z-index` діяв би
          лише в її межах (30), і нижня панель у `body` лягала б поверх
          шторки. */}
      {menuOpen && slot?.renderMenu && typeof document !== 'undefined' && createPortal(
        <InfoModal onClose={closeMenu} text="dotsMenu" language={language} Context={SlotMenu} />,
        document.body,
      )}
      {narrow && typeof document !== 'undefined' && createPortal(tabs, document.body)}
    </Header>
  );
}
