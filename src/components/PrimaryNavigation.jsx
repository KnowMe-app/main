import React from 'react';
import { NavLink } from 'react-router-dom';
import styled from 'styled-components';
import { FaSearch, FaRegFolderOpen, FaRegUser } from 'react-icons/fa';
import { useAppSettings } from '../hooks/useAppSettings';

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
    a { flex: 1; padding: 6px 4px; flex-direction: column; gap: 5px; font-size: 12px; }
  }
`;

// Keep the main destinations visible; account settings remain in the page menu.
export default function PrimaryNavigation() {
  const { language } = useAppSettings();
  const english = language === 'en';
  return (
    <Header>
      <Navigation aria-label={english ? 'Main navigation' : 'Основна навігація'}>
        <strong>KnowMe<span>.</span></strong>
        <NavLink to="/matching" end><FaSearch aria-hidden="true" />{english ? 'Find profiles' : 'Пошук анкет'}</NavLink>
        <NavLink to="/matching/create-profile"><FaRegFolderOpen aria-hidden="true" />{english ? 'My cards' : 'Мої картки'}</NavLink>
        <NavLink to="/my-profile"><FaRegUser aria-hidden="true" />{english ? 'My profile' : 'Мій профіль'}</NavLink>
      </Navigation>
    </Header>
  );
}
