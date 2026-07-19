// Shared "⋮" page switcher for the three UKRCOM admin pages (Documents / Invoice / Budget),
// per the Documents-page spec §8. Rendered inside each page's header actions; relies on the
// page-scoped --km-* palette variables every one of those pages defines.
import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import styled from 'styled-components';

const NAV_LINKS = [
  { path: '/documents', label: 'Documents' },
  { path: '/invoices', label: 'Invoice' },
  { path: '/budget', label: 'Budget' },
  { path: '/parties', label: 'Parties' },
];

const Wrap = styled.div`
  position: relative;
  display: inline-flex;
`;

const DotsButton = styled.button`
  border: 1px solid var(--km-border, #d9d2c2);
  background: var(--km-card, #fff);
  color: var(--km-text, #2b2620);
  border-radius: 6px;
  min-height: 30px;
  min-width: 30px;
  padding: 4px 8px;
  font-size: 16px;
  line-height: 1;
  font-weight: 700;
  cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease;

  &:hover {
    border-color: var(--km-accent, #a2793f);
    color: var(--km-accent, #a2793f);
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
    left: 0;
    right: auto;
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
  const wrapRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();

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
      <DotsButton type="button" aria-label="Switch page" title="Switch page" onClick={() => setOpen(prev => !prev)}>
        ⋮
      </DotsButton>
      {open ? (
        <Dropdown>
          {NAV_LINKS.map(link => (
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
