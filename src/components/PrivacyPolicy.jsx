import React, { useState } from 'react';
import styled from 'styled-components';
import { useNavigate } from 'react-router-dom';
import { termsAndConditions } from './termsAndConditions';
import { useAppSettings } from 'hooks/useAppSettings';
import { KmPage, KmTopbar, KmIconButton, KnowMeBrand } from './styles/knowme';
import InfoModal from './InfoModal';
import { ProfileDotsMenu } from './ProfileDotsMenu';
import { resolveAccess } from 'utils/accessLevel';

const ContentWrap = styled.main`
  width: min(100%, 760px);
  margin: 0 auto;
  padding: 24px 20px 64px;
  box-sizing: border-box;
`;

const TermsCard = styled.section`
  background: var(--km-card);
  border: 1px solid var(--km-border);
  border-radius: var(--km-radius-lg);
  box-shadow: var(--km-shadow);
  padding: 28px 24px 36px;

  @media (max-width: 480px) {
    padding: 22px 16px 28px;
  }
`;

const Paragraph = styled.p`
  margin: 0;
  white-space: pre-line;
  font-size: 14px;
  line-height: 1.6;
  color: var(--km-text);

  ${({ $variant }) => $variant === 'titleMain' && `
    font-family: var(--km-font-display);
    font-size: 26px;
    line-height: 1.25;
    text-align: center;
    margin: 8px 0 18px;
  `}

  ${({ $variant }) => $variant === 'title' && `
    font-size: 18px;
    font-weight: 700;
    text-align: center;
    margin: 14px 0 18px;
  `}

  ${({ $variant }) => $variant === 'headerItalic' && `
    font-size: 12px;
    font-style: italic;
    text-align: right;
    color: var(--km-muted);
    margin: 6px 0 22px;
  `}

  ${({ $variant }) => $variant === 'header' && `
    font-size: 16px;
    font-weight: 800;
    text-align: center;
    letter-spacing: 0.02em;
    color: var(--km-accent);
    margin: 28px 0 12px;
  `}

  ${({ $variant }) => $variant === 'textMain' && `
    font-weight: 700;
    margin: 10px 0 6px;
  `}

  ${({ $variant }) => $variant === 'text' && `
    margin: 8px 0;
  `}

  ${({ $variant }) => $variant === 'list' && `
    font-style: italic;
    color: var(--km-muted);
    margin: 4px 0 4px 14px;
  `}
`;

export const PrivacyPolicy = () => {
  const navigate = useNavigate();
  const { language } = useAppSettings();
  const [showDotsMenu, setShowDotsMenu] = useState(false);

  const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
  const access = resolveAccess({
    uid: localStorage.getItem('ownerId') || '',
    accessLevel: localStorage.getItem('accessLevel') || '',
    userRole: localStorage.getItem('userRole') || '',
  });

  const dotsMenu = () => (
    <ProfileDotsMenu
      navigate={navigate}
      isAdmin={access.isAdmin}
      access={access}
      isSessionActive={isLoggedIn}
      onSelect={() => setShowDotsMenu(false)}
    />
  );

  return (
    <KmPage>
      <KmTopbar>
        <KnowMeBrand />
        <KmIconButton
          type="button"
          aria-label="Відкрити меню"
          title="Відкрити меню"
          onClick={() => setShowDotsMenu(true)}
        >
          ⋮
        </KmIconButton>
      </KmTopbar>

      <ContentWrap>
        <TermsCard>
          {termsAndConditions.map((paragraph, index) => (
            <Paragraph key={index} $variant={paragraph.style || 'text'}>
              {paragraph[language] || paragraph.en}
            </Paragraph>
          ))}
        </TermsCard>
      </ContentWrap>

      {showDotsMenu && (
        <InfoModal onClose={() => setShowDotsMenu(false)} text="dotsMenu" Context={dotsMenu} />
      )}
    </KmPage>
  );
};
