// Shared "⋮" page switcher for the UKRCOM admin pages (Documents / Invoice / Budget / Parties),
// per the Documents-page spec §8. Rendered inside each page's header actions, as the first action
// button (batch 26 §11 - standardized placement, every page); relies on the page-scoped --km-*
// palette variables every one of those pages defines.
//
// Batch 26 §10: lists every existing top-level screen, not just the four UKRCOM admin pages, so
// this menu offers the same set of destinations everywhere it appears - addNewProfile/matching/
// my-profile/flow used to be reachable only from ProfileDotsMenu (the profile pages' own "⋮"),
// leaving an admin on Documents/Invoice/Budget/Parties with no way back to them short of typing a
// URL. (batch 29 §2: the Style Editor destination that used to sit at the end of this list was
// removed along with the page itself.)
import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { isAdminUid } from 'utils/accessLevel';

const NAV_LINKS = [
  { path: '/add', label: 'Add profile' },
  { path: '/matching', label: 'Matching' },
  { path: '/my-profile', label: 'My profile' },
  { path: '/flow', label: 'Flow' },
  { path: '/budget', label: 'Budget' },
  { path: '/invoices', label: 'Invoice' },
  { path: '/documents', label: 'Documents' },
  { path: '/parties', label: 'Parties' },
  // Інструмент міграції RTDB читає локальні копії обох колекцій цілком, тобто показує
  // контакти всіх анкет. Маршрут адмінський (App.jsx), тож і пункт меню показуємо лише
  // адміну - решта пунктів тут без гейта, бо ведуть на звичайні робочі сторінки.
  { path: '/rtdb-migration', label: 'RTDB migration', adminOnly: true },
];

// Права тут беруться з того ж localStorage, куди їх кладе App при вході: меню рендериться
// всередині чужих сторінок і власного доступу до профілю не має.
const visibleLinks = () => {
  const ownerId = typeof localStorage !== 'undefined' ? localStorage.getItem('ownerId') : null;
  const isAdmin = isAdminUid(ownerId);
  return NAV_LINKS.filter(link => !link.adminOnly || isAdmin);
};

const Wrap = styled.div`
  position: relative;
  display: inline-flex;
`;

// Matches the shared KmIconButton look (styles/knowme.js) so this trigger is visually identical
// to every other "⋮" menu button in the app - same size, border, radius, and hover/focus states.
const DotsButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  border: 1px solid var(--km-border, #d9d2c2);
  background: var(--km-card, #fff);
  color: var(--km-muted, #7a7266);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  transition: background-color 0.18s ease, border-color 0.18s ease, color 0.18s ease;

  &:hover {
    background: var(--km-accent-light, rgba(162, 121, 63, 0.12));
    border-color: var(--km-accent, #a2793f);
    color: var(--km-accent, #a2793f);
  }

  &:focus-visible {
    outline: none;
    border-color: var(--km-accent, #a2793f);
    box-shadow: 0 0 0 3px var(--km-accent-ring, rgba(162, 121, 63, 0.2));
  }
`;

const Dropdown = styled.div`
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  min-width: 150px;
  max-width: calc(100vw - 24px);
  overflow: visible;
  background: var(--km-card, #fff);
  border: 1px solid var(--km-border, #d9d2c2);
  border-radius: 8px;
  box-shadow: 0 8px 22px rgba(43, 38, 32, 0.14);
  padding: 4px;
  z-index: 1000;

  @media (max-width: 560px) {
    ${({ $mobileAnchor }) => ($mobileAnchor === 'left' ? 'left: 0; right: auto;' : 'left: auto; right: 0;')}
  }
`;

const MenuItem = styled.button`
  display: block;
  width: 100%;
  text-align: left;
  border: none;
  background: ${({ $active }) => ($active ? 'var(--km-accent-light, rgba(162, 121, 63, 0.12))' : 'transparent')};
  color: ${({ $active }) => ($active ? 'var(--km-accent, #a2793f)' : 'var(--km-text, #2b2620)')};
  border-radius: 6px;
  padding: 7px 10px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;

  &:hover {
    background: var(--km-accent-light, rgba(162, 121, 63, 0.12));
    color: var(--km-accent, #a2793f);
  }
`;

const PageNavMenu = () => {
  const [open, setOpen] = useState(false);
  const [mobileAnchor, setMobileAnchor] = useState('right');
  const wrapRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
  const toggleMenu = () => {
    if (!open && typeof window !== 'undefined' && wrapRef.current) {
      const trigger = wrapRef.current.getBoundingClientRect();
      // Anchor toward whichever side has room for the 150px menu. This keeps both the Budget
      // page's left-aligned mobile trigger and the shared right-aligned headers in the viewport.
      setMobileAnchor(trigger.left + 150 <= window.innerWidth - 12 ? 'left' : 'right');
    }
    setOpen(previous => !previous);
  };

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = event => {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) setOpen(false);
    };
    const handleKeyDown = event => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <Wrap ref={wrapRef}>
      <DotsButton type="button" aria-label="Switch page" title="Switch page" onClick={toggleMenu}>
        ⋮
      </DotsButton>
      {open ? (
        <Dropdown $mobileAnchor={mobileAnchor}>
          {visibleLinks().map(link => (
            <MenuItem
              key={link.path}
              type="button"
              $active={location.pathname === link.path}
              onClick={() => {
                setOpen(false);
                if (location.pathname !== link.path) navigate(link.path);
              }}
            >
              {link.label}
            </MenuItem>
          ))}
        </Dropdown>
      ) : null}
    </Wrap>
  );
};

export default PageNavMenu;
