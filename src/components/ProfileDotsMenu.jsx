import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { useLocation } from 'react-router-dom';
import { FaRegUser, FaUserEdit, FaUsers, FaSignOutAlt, FaTrashAlt, FaEye, FaProjectDiagram, FaEuroSign, FaFileInvoiceDollar, FaFileAlt, FaAddressBook, FaDatabase, FaMoon, FaSun, FaGlobe } from 'react-icons/fa';
import { MdPersonAddAlt1 } from 'react-icons/md';
import { VerifyEmail } from './VerifyEmail';
import { useAppSettings } from 'hooks/useAppSettings';
import { uiText } from 'utils/uiTranslations';
import {
  ModalActionRow,
  ModalDangerButton,
  ModalGhostButton,
  ModalText,
  ModalTitle,
} from './InfoModal';

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

const LogoutConfirmation = styled.div`
  padding: 10px 6px 6px;
  text-align: center;
`;

const LogoutIcon = styled.div`
  width: 48px;
  height: 48px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 14px;
  border-radius: 16px;
  background: var(--km-danger-bg);
  color: var(--km-danger);
  font-size: 20px;
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
  canCreateProfiles: Boolean(access?.canCreateProfiles),
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
  extraActions,
  extraActionsLabel,
}) => {
  const location = useLocation();
  const { themeMode, setThemeMode, language, setLanguage } = useAppSettings();
  const [isLogoutConfirmationOpen, setIsLogoutConfirmationOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const cancelLogoutRef = useRef(null);
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

  useEffect(() => {
    if (!isLogoutConfirmationOpen) return undefined;

    cancelLogoutRef.current?.focus();
    const handleKeyDown = event => {
      if (event.key === 'Escape' && !isLoggingOut) {
        setIsLogoutConfirmationOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isLogoutConfirmationOpen, isLoggingOut]);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await onExit?.();
      onSelect?.();
    } finally {
      setIsLoggingOut(false);
    }
  };

  if (isLogoutConfirmationOpen) {
    return (
      <LogoutConfirmation
        role="dialog"
        aria-modal="true"
        aria-labelledby="logout-confirmation-title"
        aria-describedby="logout-confirmation-description"
      >
        <LogoutIcon aria-hidden="true"><FaSignOutAlt /></LogoutIcon>
        <ModalTitle id="logout-confirmation-title">{uiText('Вийти з акаунта?', language)}</ModalTitle>
        <ModalText id="logout-confirmation-description">
          {uiText('Ви точно хочете завершити поточну сесію?', language)}
        </ModalText>
        <ModalActionRow>
          <ModalGhostButton
            ref={cancelLogoutRef}
            type="button"
            disabled={isLoggingOut}
            onClick={() => setIsLogoutConfirmationOpen(false)}
          >
            {uiText('Ні, залишитися', language)}
          </ModalGhostButton>
          <ModalDangerButton type="button" disabled={isLoggingOut} onClick={handleLogout}>
            {uiText(isLoggingOut ? 'Виходимо…' : 'Так, вийти', language)}
          </ModalDangerButton>
        </ModalActionRow>
      </LogoutConfirmation>
    );
  }

  const navItems = [
    { path: '/my-profile', label: uiText('Мій профіль', language), icon: <FaRegUser /> },
    ...(isAdmin ? [{ path: '/my-profile-old', label: uiText('Старий профіль', language), icon: <FaUserEdit /> }] : []),
    ...(canSeePrivilegedNav && (isAdmin || resolvedAccess.canAccessAdd)
      ? [{ path: '/add', label: uiText('Додати анкету', language), description: uiText('Адмін-додавання профілів', language), icon: <MdPersonAddAlt1 /> }]
      : []),
    // Matching is open to every signed-in user: search is available to all, and a
    // viewer without matching access gets the limited projection of what it finds.
    { path: '/matching', label: 'Matching', description: uiText('Пошук і порівняння анкет', language), icon: <FaUsers /> },
    // Пункт названий місцем, а не дією: за ним лежать картки, які завів цей
    // читач, і лише потім — рядок, яким заводять наступну. «Додати профіль»
    // обіцяло форму, тож вертатись туди по вже заведену картку не було підстав.
    ...((isAdmin || resolvedAccess.canCreateProfiles)
      ? [{
        path: '/matching/create-profile',
        label: uiText(isAdmin ? 'Нові профілі' : 'Створені мною', language),
        description: uiText(isAdmin ? 'Перевірка нових карток' : 'Ваші картки та створення нових', language),
        icon: <MdPersonAddAlt1 />,
      }]
      : []),
    ...(isAdmin ? [{ path: '/flow', label: 'Flow', icon: <FaProjectDiagram /> }] : []),
    ...(isAdmin ? [{ path: '/budget', label: 'Budget', description: 'Program budget and other expenses', icon: <FaEuroSign /> }] : []),
    ...(isAdmin ? [{ path: '/invoices', label: 'Invoices', description: 'Create and export client invoices', icon: <FaFileInvoiceDollar /> }] : []),
    ...(isAdmin ? [{ path: '/documents', label: 'Documents', description: 'Generate case documents from templates', icon: <FaFileAlt /> }] : []),
    ...(isAdmin ? [{ path: '/parties', label: 'Parties', description: 'Manage clinics, couples and other case parties', icon: <FaAddressBook /> }] : []),
    // Маршрут інструменту міграції існує тільки для адмінів (App.jsx), і досі туди
    // можна було потрапити лише вбивши адресу руками.
    ...(isAdmin ? [{ path: '/rtdb-migration', label: uiText('Міграція RTDB', language), description: uiText('Розкласти анкети по нових вузлах', language), icon: <FaDatabase /> }] : []),
  ];

  return (
    <MenuShell role="menu" aria-label={uiText('Навігаційне меню профілю', language)}>
      <MenuHeader>
        <MenuTitle>{uiText('Меню профілю', language)}</MenuTitle>
        <MenuSubtitle>{uiText('Швидка навігація, дії з анкетою та налаштування акаунта.', language)}</MenuSubtitle>
      </MenuHeader>

      <MenuSection>
        <SectionLabel>{uiText('Навігація', language)}</SectionLabel>
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
              {active ? <ActivePill>{uiText('зараз', language)}</ActivePill> : null}
            </MenuItem>
          );
        })}
      </MenuSection>

      {extraActions?.length ? (
        <MenuSection>
          <SectionLabel>{extraActionsLabel || uiText('Ще', language)}</SectionLabel>
          {extraActions.map(item => (
            <MenuItem
              key={item.key}
              type="button"
              role="menuitem"
              $active={item.active}
              onClick={() => handleAction(item.onClick)}
            >
              <ItemIcon>{item.icon}</ItemIcon>
              <span>
                <ItemLabel>{item.label}</ItemLabel>
                {item.description ? <ItemDescription>{item.description}</ItemDescription> : null}
              </span>
              {item.active ? <ActivePill>{uiText('увімкнено', language)}</ActivePill> : null}
            </MenuItem>
          ))}
        </MenuSection>
      ) : null}

      <MenuSection>
        <SectionLabel>{uiText('Налаштування', language)}</SectionLabel>
        <SettingRow>
          <ItemIcon>{themeMode === 'dark' ? <FaMoon /> : <FaSun />}</ItemIcon>
          <span>
            <ItemLabel>{uiText('Тема', language)}</ItemLabel>
            <ItemDescription>{uiText('Оформлення застосунку', language)}</ItemDescription>
          </span>
          <SegmentedControl role="group" aria-label={uiText('Перемкнути тему', language)}>
            <SegmentedOption
              type="button"
              $active={themeMode === 'light'}
              aria-pressed={themeMode === 'light'}
              onClick={() => setThemeMode('light')}
            >
              <FaSun aria-hidden="true" /> {uiText('Світла', language)}
            </SegmentedOption>
            <SegmentedOption
              type="button"
              $active={themeMode === 'dark'}
              aria-pressed={themeMode === 'dark'}
              onClick={() => setThemeMode('dark')}
            >
              <FaMoon aria-hidden="true" /> {uiText('Темна', language)}
            </SegmentedOption>
          </SegmentedControl>
        </SettingRow>
        <SettingRow>
          <ItemIcon><FaGlobe /></ItemIcon>
          <span>
            <ItemLabel>{uiText('Мова', language)}</ItemLabel>
            <ItemDescription>{uiText('Мова документів, правил і карток анкет', language)}</ItemDescription>
          </span>
          <SegmentedControl role="group" aria-label={uiText('Перемкнути мову', language)}>
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
          <SectionLabel>{uiText('Анкета', language)}</SectionLabel>
          {onViewProfile && (
            <MenuItem type="button" role="menuitem" onClick={() => handleAction(onViewProfile)}>
              <ItemIcon><FaEye /></ItemIcon>
              <span>
                <ItemLabel>{uiText('Переглянути анкету', language)}</ItemLabel>
                <ItemDescription>{uiText('Відкрити інструкцію перегляду у застосунку', language)}</ItemDescription>
              </span>
            </MenuItem>
          )}
          {onDeleteProfile && (
            <MenuItem type="button" role="menuitem" $danger onClick={() => handleAction(onDeleteProfile)}>
              <ItemIcon $danger><FaTrashAlt /></ItemIcon>
              <span>
                <ItemLabel>{uiText('Видалити анкету', language)}</ItemLabel>
                <ItemDescription>{uiText('Надіслати запит на видалення профілю', language)}</ItemDescription>
              </span>
            </MenuItem>
          )}
        </MenuSection>
      )}

      {(showVerifyEmail || isSessionActive) && (
        <MenuSection>
          <SectionLabel>{uiText('Акаунт', language)}</SectionLabel>
          {showVerifyEmail && !isEmailVerified && (
            <VerifyWrap>
              <VerifyEmail />
            </VerifyWrap>
          )}
          {isSessionActive && onExit && (
            <MenuItem type="button" role="menuitem" $danger onClick={() => setIsLogoutConfirmationOpen(true)}>
              <ItemIcon $danger><FaSignOutAlt /></ItemIcon>
              <span>
                <ItemLabel>{uiText('Вийти', language)}</ItemLabel>
                <ItemDescription>{uiText('Завершити поточну сесію', language)}</ItemDescription>
              </span>
            </MenuItem>
          )}
        </MenuSection>
      )}
    </MenuShell>
  );
};
