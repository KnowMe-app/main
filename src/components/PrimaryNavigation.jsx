import React, { useEffect, useState } from 'react';
import { getExtraLocale } from '../utils/locales';
import { NavLink } from 'react-router-dom';
import styled from 'styled-components';
import { FaSearch, FaRegFolderOpen, FaRegUser, FaChevronLeft, FaEllipsisV, FaPen } from 'react-icons/fa';
import { useAppSettings } from '../hooks/useAppSettings';
import { usePrimaryNavigationSlotState } from './PrimaryNavigationSlot';
import { InfoModal } from './InfoModal';

const Header = styled.header`
  background: var(--km-card);
  border-bottom: 1px solid var(--km-border);
  color: var(--km-text);
`;

const Navigation = styled.nav`
  max-width: 1240px;
  margin: 0 auto;
  padding: 12px 24px;
  display: flex;
  align-items: center;
  gap: 20px;
  font-family: var(--km-font);

  strong { margin-right: auto; font-size: 23px; letter-spacing: -0.8px; }
  strong span { color: var(--km-accent); }
  a {
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 0 14px;
    border-radius: 12px;
    color: var(--km-muted);
    font-size: 14px;
    font-weight: 600;
  }
  a[aria-current='page'] { background: var(--km-accent-light); color: var(--km-text); }
  a:hover { background: var(--km-bg); color: var(--km-text); }
  a:focus-visible { outline: 2px solid var(--km-accent); outline-offset: 3px; }
  @media (max-width: 600px) {
    padding: 8px;
    gap: 4px;
    strong { display: none; }
    a { flex: 1; min-width: 0; padding: 6px 2px; flex-direction: column; gap: 5px; font-size: 12px; text-align: center; }
  }
`;

// Місце під стрілку зарезервоване завжди: інакше вкладки стрибали б убік
// щоразу, коли на сторінці зʼявляється чи зникає можливість повернутись.
const SideSlot = styled.span`
  flex: 0 0 36px;
  width: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  @media (max-width: 600px) {
    flex-basis: 32px;
    width: 32px;
  }
`;

const SlotButton = styled.button`
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid var(--km-border);
  border-radius: 50%;
  background: var(--km-card);
  color: var(--km-muted);
  font-size: 14px;
  cursor: pointer;
  &:hover { background: var(--km-accent-light); color: var(--km-accent); border-color: var(--km-accent); }
  &:focus-visible { outline: 2px solid var(--km-accent); outline-offset: 2px; }
  @media (max-width: 600px) {
    width: 30px;
    height: 30px;
  }
`;

const MenuButton = styled(SlotButton)`
  border-radius: 10px;
`;

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
  const texts = resolveNavTexts(language);
  const slot = usePrimaryNavigationSlotState();
  const [menuOpen, setMenuOpen] = useState(false);
  // Пункти меню складає сторінка (`renderMenu` через ref), і в тому самому
  // проході, де змінилась мова, ref ще тримає її попередній рендер: відкрите
  // меню лишалось би мовою, з якої щойно перемкнули. Після коміту ref уже
  // свіжий — один повторний рендер його й підхоплює.
  const [, refreshMenu] = useState(0);
  useEffect(() => {
    if (!menuOpen) return undefined;
    const timer = setTimeout(() => refreshMenu(value => value + 1), 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);
  const workspace = slot?.workspaceLabel ? texts[slot.workspaceLabel] : '';
  const backLabel = texts.back;
  const menuLabel = texts.menu;
  const closeMenu = () => setMenuOpen(false);
  return (
    <Header>
      <Navigation aria-label={texts.nav}>
        <strong>KnowMe<span>.</span></strong>
        <SideSlot>
          {slot?.onBack && (
            <SlotButton type="button" aria-label={backLabel} title={backLabel} onClick={slot.onBack}>
              <FaChevronLeft aria-hidden="true" />
            </SlotButton>
          )}
        </SideSlot>
        <NavLink to="/matching" end><FaSearch aria-hidden="true" />{texts.find}</NavLink>
        <NavLink to="/matching/create-profile">
          {workspace ? <FaPen aria-hidden="true" /> : <FaRegFolderOpen aria-hidden="true" />}
          {workspace || texts.add}
        </NavLink>
        <NavLink to="/my-profile"><FaRegUser aria-hidden="true" />{texts.mine}</NavLink>
        <SideSlot>
          {slot?.renderMenu && (
            <MenuButton type="button" aria-label={menuLabel} title={menuLabel} onClick={() => setMenuOpen(true)}>
              <FaEllipsisV aria-hidden="true" />
            </MenuButton>
          )}
        </SideSlot>
      </Navigation>
      {menuOpen && slot?.renderMenu && (
        <InfoModal onClose={closeMenu} text="dotsMenu" language={language} Context={() => slot.renderMenu({ close: closeMenu })} />
      )}
    </Header>
  );
}
