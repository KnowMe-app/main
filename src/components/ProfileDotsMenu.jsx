import React from 'react';
import styled from 'styled-components';
import { useLocation } from 'react-router-dom';
import { FaRegUser, FaUserEdit, FaUsers, FaSignOutAlt, FaTrashAlt, FaEye, FaProjectDiagram, FaEuroSign, FaMoon, FaSun, FaGlobe } from 'react-icons/fa';
import { MdPersonAddAlt1 } from 'react-icons/md';
import { VerifyEmail } from './VerifyEmail';
import { useAppSettings } from 'hooks/useAppSettings';

const MenuShell = styled.nav`
  width: 100%;
  min-width: 280px;
  text-align: left;
  font-family: var(--km-font);
  color: var(--km-text);
`;

const MenuHeader = styled.div`
  padding: 2px 2px 14px;
`;

const MenuTitle = styled.h3`
  margin: 0;
  color: var(--km-text);
  font-size: 18px;
  font-weight: 800;
  letter-spacing: -0.02em;
`;

const MenuSubtitle = styled.p`
  margin: 5px 0 0;
  color: var(--km-muted);
  font-size: 12px;
  line-height: 1.4;
`;

const MenuSection = styled.div`
  padding: 10px 0;
  border-top: 1px solid var(--km-border);

  &:first-of-type {
    border-top: none;
    padding-top: 0;
  }
`;

const SectionLabel = styled.div`
  margin: 0 4px 8px;
  color: var(--km-muted);
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
  border: 1px solid ${({ $active, $danger }) => ($danger ? 'var(--km-danger-border)' : $active ? 'var(--km-accent)' : 'transparent')};
  border-radius: var(--km-radius);
  background: ${({ $active, $danger }) => ($danger ? 'var(--km-danger-bg)' : $active ? 'var(--km-accent-light)' : 'var(--km-card)')};
  color: ${({ $danger }) => ($danger ? 'var(--km-danger)' : 'var(--km-text)')};
  cursor: pointer;
  text-align: left;
  transition: transform 0.18s ease, border-color 0.18s ease, background-color 0.18s ease, box-shadow 0.18s ease;

  & + & {
    margin-top: 6px;
  }

  &:hover {
    transform: translateY(-1px);
    border-color: ${({ $danger }) => ($danger ? 'var(--km-danger-border)' : 'var(--km-accent-mid)')};
    background: ${({ $danger }) => ($danger ? 'var(--km-danger-bg)' : 'var(--km-accent-light)')};
    box-shadow: 0 8px 22px rgba(26, 26, 26, 0.08);
  }

  &:focus-visible {
    outline: none;
    border-color: ${({ $danger }) => ($danger ? 'var(--km-danger)' : 'var(--km-accent)')};
    box-shadow: 0 0 0 3px ${({ $danger }) => ($danger ? 'rgba(180, 35, 24, .14)' : 'var(--km-accent-ring)')};
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
  background: ${({ $danger }) => ($danger ? 'var(--km-danger-bg)' : 'var(--km-accent-light)')};
  color: ${({ $danger }) => ($danger ? 'var(--km-danger)' : 'var(--km-accent)')};
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
  color: var(--km-muted);
  font-size: 11px;
  line-height: 1.35;
`;

const ActivePill = styled.span`
  padding: 3px 8px;
  border-radius: 999px;
  background: var(--km-accent);
  color: #fff;
  font-size: 10px;
  font-weight: 800;
`;

const VerifyWrap = styled.div`
  margin-top: 8px;
`;

const SettingRow = styled.div`
  display: grid;
  grid-template-columns: 34px 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border-radius: var(--km-radius);

  & + & {
    margin-top: 6px;
  }
`;

const SegmentedControl = styled.div`
  display: inline-flex;
  padding: 3px;
  gap: 2px;
  border: 1px solid var(--km-border);
  border-radius: 99px;
  background: var(--km-bg);
`;

const SegmentedOption = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border: none;
  border-radius: 99px;
  background: ${({ $active }) => ($active ? 'var(--km-accent)' : 'transparent')};
  color: ${({ $active }) => ($active ? '#fff' : 'var(--km-muted)')};
  font-family: var(--km-font);
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  transition: background-color 0.18s ease, color 0.18s ease;

  &:hover {
    color: ${({ $active }) => ($active ? '#fff' : 'var(--km-accent)')};
  }

  &:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--km-accent-ring);
  }
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
  const { themeMode, setThemeMode, language, setLanguage } = useAppSettings();
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
    ...(isAdmin ? [{ path: '/budget', label: 'Budget', description: 'Program budget and other expenses', icon: <FaEuroSign /> }] : []),
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

      <MenuSection>
        <SectionLabel>Налаштування</SectionLabel>
        <SettingRow>
          <ItemIcon>{themeMode === 'dark' ? <FaMoon /> : <FaSun />}</ItemIcon>
          <span>
            <ItemLabel>Тема</ItemLabel>
            <ItemDescription>Оформлення застосунку</ItemDescription>
          </span>
          <SegmentedControl role="group" aria-label="Перемкнути тему">
            <SegmentedOption
              type="button"
              $active={themeMode === 'light'}
              aria-pressed={themeMode === 'light'}
              onClick={() => setThemeMode('light')}
            >
              <FaSun aria-hidden="true" /> Світла
            </SegmentedOption>
            <SegmentedOption
              type="button"
              $active={themeMode === 'dark'}
              aria-pressed={themeMode === 'dark'}
              onClick={() => setThemeMode('dark')}
            >
              <FaMoon aria-hidden="true" /> Темна
            </SegmentedOption>
          </SegmentedControl>
        </SettingRow>
        <SettingRow>
          <ItemIcon><FaGlobe /></ItemIcon>
          <span>
            <ItemLabel>Мова</ItemLabel>
            <ItemDescription>Мова документів і правил</ItemDescription>
          </span>
          <SegmentedControl role="group" aria-label="Перемкнути мову">
            <SegmentedOption
              type="button"
              $active={language === 'uk'}
              aria-pressed={language === 'uk'}
              onClick={() => setLanguage('uk')}
            >
              UK
            </SegmentedOption>
            <SegmentedOption
              type="button"
              $active={language === 'en'}
              aria-pressed={language === 'en'}
              onClick={() => setLanguage('en')}
            >
              EN
            </SegmentedOption>
          </SegmentedControl>
        </SettingRow>
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
