import React from 'react';
import styled from 'styled-components';
import { useLocation } from 'react-router-dom';
import { FaRegUser, FaUserEdit, FaUsers, FaSignOutAlt, FaTrashAlt, FaEye, FaProjectDiagram } from 'react-icons/fa';
import { MdPersonAddAlt1 } from 'react-icons/md';
import { VerifyEmail } from './VerifyEmail';

const MenuShell = styled.nav`
  width: 100%;
  min-width: 280px;
  text-align: left;
  font-family: 'DM Sans', sans-serif;
`;

const MenuHeader = styled.div`
  padding: 2px 2px 14px;
`;

const MenuTitle = styled.h3`
  margin: 0;
  color: #1a1a1a;
  font-size: 18px;
  font-weight: 800;
  letter-spacing: -0.02em;
`;

const MenuSubtitle = styled.p`
  margin: 5px 0 0;
  color: #7a7a72;
  font-size: 12px;
  line-height: 1.4;
`;

const MenuSection = styled.div`
  padding: 10px 0;
  border-top: 1px solid #e8e8e2;

  &:first-of-type {
    border-top: none;
    padding-top: 0;
  }
`;

const SectionLabel = styled.div`
  margin: 0 4px 8px;
  color: #9a9a92;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
`;

const MenuItem = styled.button`
  width: 100%;
  display: grid;
  grid-template-columns: 34px 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border: 1px solid ${({ $active, $danger }) => ($danger ? '#f2c9c9' : $active ? '#e8791a' : 'transparent')};
  border-radius: 14px;
  background: ${({ $active, $danger }) => ($danger ? '#fff7f7' : $active ? '#fff0e0' : '#fff')};
  color: ${({ $danger }) => ($danger ? '#b42318' : '#1a1a1a')};
  cursor: pointer;
  text-align: left;
  transition: transform 0.18s ease, border-color 0.18s ease, background-color 0.18s ease, box-shadow 0.18s ease;

  & + & {
    margin-top: 6px;
  }

  &:hover {
    transform: translateY(-1px);
    border-color: ${({ $danger }) => ($danger ? '#e8a8a8' : '#f5a24b')};
    background: ${({ $danger }) => ($danger ? '#fff1f1' : '#fff8ef')};
    box-shadow: 0 8px 22px rgba(26, 26, 26, 0.08);
  }

  &:focus-visible {
    outline: none;
    border-color: ${({ $danger }) => ($danger ? '#b42318' : '#e8791a')};
    box-shadow: 0 0 0 3px ${({ $danger }) => ($danger ? 'rgba(180, 35, 24, .14)' : 'rgba(232, 121, 26, .16)')};
  }

  &:active {
    transform: scale(0.99);
  }
`;

const ItemIcon = styled.span`
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: ${({ $danger }) => ($danger ? '#fee9e9' : '#fff0e0')};
  color: ${({ $danger }) => ($danger ? '#b42318' : '#e8791a')};
  font-size: 15px;
`;

const ItemLabel = styled.span`
  display: block;
  font-size: 14px;
  font-weight: 800;
`;

const ItemDescription = styled.span`
  display: block;
  margin-top: 2px;
  color: #7a7a72;
  font-size: 11px;
  line-height: 1.35;
`;

const ActivePill = styled.span`
  padding: 3px 8px;
  border-radius: 999px;
  background: #e8791a;
  color: #fff;
  font-size: 10px;
  font-weight: 800;
`;

const VerifyWrap = styled.div`
  margin-top: 8px;
`;

const normalizeAccess = access => ({
  canAccessAdd: Boolean(access?.canAccessAdd),
  canAccessMatching: Boolean(access?.canAccessMatching),
});

export const ProfileDotsMenu = ({
  navigate,
  isAdmin = false,
  access,
  isEmailVerified = true,
  showVerifyEmail = false,
  isSessionActive = true,
  onExit,
  onDeleteProfile,
  onViewProfile,
  onSelect,
  beforeNavigate,
}) => {
  const location = useLocation();
  const resolvedAccess = normalizeAccess(access);
  const canSeePrivilegedNav = isAdmin || resolvedAccess.canAccessAdd || resolvedAccess.canAccessMatching;

  const handleNavigate = path => {
    beforeNavigate?.();
    onSelect?.();
    navigate(path);
  };

  const handleAction = action => {
    onSelect?.();
    action?.();
  };

  const navItems = [
    { path: '/my-profile', label: 'Мій профіль', icon: <FaRegUser /> },
    ...(isAdmin ? [{ path: '/my-profile-old', label: 'Старий профіль', icon: <FaUserEdit /> }] : []),
    ...(canSeePrivilegedNav && (isAdmin || resolvedAccess.canAccessAdd)
      ? [{ path: '/add', label: 'Додати анкету', description: 'Адмін-додавання профілів', icon: <MdPersonAddAlt1 /> }]
      : []),
    ...(canSeePrivilegedNav && (isAdmin || resolvedAccess.canAccessMatching)
      ? [{ path: '/matching', label: 'Matching', description: 'Пошук і порівняння анкет', icon: <FaUsers /> }]
      : []),
    ...(isAdmin ? [{ path: '/flow', label: 'Flow', icon: <FaProjectDiagram /> }] : []),
  ];

  return (
    <MenuShell role="menu" aria-label="Навігаційне меню профілю">
      <MenuHeader>
        <MenuTitle>Меню профілю</MenuTitle>
        <MenuSubtitle>Швидка навігація, дії з анкетою та налаштування акаунта.</MenuSubtitle>
      </MenuHeader>

      <MenuSection>
        <SectionLabel>Навігація</SectionLabel>
        {navItems.map(item => {
          const active = location.pathname === item.path;
          return (
            <MenuItem
              key={item.path}
              type="button"
              role="menuitem"
              $active={active}
              onClick={() => handleNavigate(item.path)}
            >
              <ItemIcon>{item.icon}</ItemIcon>
              <span>
                <ItemLabel>{item.label}</ItemLabel>
                {item.description ? <ItemDescription>{item.description}</ItemDescription> : null}
              </span>
              {active ? <ActivePill>зараз</ActivePill> : null}
            </MenuItem>
          );
        })}
      </MenuSection>

      {(onDeleteProfile || onViewProfile) && (
        <MenuSection>
          <SectionLabel>Анкета</SectionLabel>
          {onViewProfile && (
            <MenuItem type="button" role="menuitem" onClick={() => handleAction(onViewProfile)}>
              <ItemIcon><FaEye /></ItemIcon>
              <span>
                <ItemLabel>Переглянути анкету</ItemLabel>
                <ItemDescription>Відкрити інструкцію перегляду у застосунку</ItemDescription>
              </span>
            </MenuItem>
          )}
          {onDeleteProfile && (
            <MenuItem type="button" role="menuitem" $danger onClick={() => handleAction(onDeleteProfile)}>
              <ItemIcon $danger><FaTrashAlt /></ItemIcon>
              <span>
                <ItemLabel>Видалити анкету</ItemLabel>
                <ItemDescription>Надіслати запит на видалення профілю</ItemDescription>
              </span>
            </MenuItem>
          )}
        </MenuSection>
      )}

      {(showVerifyEmail || isSessionActive) && (
        <MenuSection>
          <SectionLabel>Акаунт</SectionLabel>
          {showVerifyEmail && !isEmailVerified && (
            <VerifyWrap>
              <VerifyEmail />
            </VerifyWrap>
          )}
          {isSessionActive && onExit && (
            <MenuItem type="button" role="menuitem" $danger onClick={() => handleAction(onExit)}>
              <ItemIcon $danger><FaSignOutAlt /></ItemIcon>
              <span>
                <ItemLabel>Вийти</ItemLabel>
                <ItemDescription>Завершити поточну сесію</ItemDescription>
              </span>
            </MenuItem>
          )}
        </MenuSection>
      )}
    </MenuShell>
  );
};
