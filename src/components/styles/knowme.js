import React from 'react';
import styled from 'styled-components';

// Спільні примітиви дизайн-системи KnowMe.
// Кольори й розміри беруться з --km-* токенів (src/index.css),
// тому всі компоненти автоматично підтримують світлу/темну тему.

export const KmPage = styled.div`
  min-height: 100vh;
  background: var(--km-bg);
  color: var(--km-text);
  font-family: var(--km-font);
`;

export const KmTopbar = styled.div`
  position: sticky;
  top: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 20px;
  background: var(--km-card);
  border-bottom: 1px solid var(--km-border);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.04);
`;

const BrandWrap = styled.div`
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
`;

const BrandName = styled.span`
  font-family: var(--km-font-display);
  font-size: 18px;
  color: var(--km-text);
  white-space: nowrap;
`;

const BrandAccent = styled.span`
  color: var(--km-accent);
  font-style: italic;
`;

const BrandTagline = styled.span`
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--km-muted);
  white-space: nowrap;

  @media (max-width: 380px) {
    display: none;
  }
`;

export const KnowMeBrand = ({ tagline = 'Egg donor' }) => (
  <BrandWrap>
    <BrandName>
      Know<BrandAccent>Me</BrandAccent>
    </BrandName>
    {tagline ? <BrandTagline>{tagline}</BrandTagline> : null}
  </BrandWrap>
);

export const KmCard = styled.div`
  background: var(--km-card);
  border: 1px solid var(--km-border);
  border-radius: var(--km-radius);
  box-shadow: var(--km-shadow);
`;

export const KmIconButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  border: 1px solid var(--km-border);
  background: var(--km-card);
  color: var(--km-muted);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  transition: background-color 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease,
    transform 0.18s ease, color 0.18s ease;

  &:hover {
    background: var(--km-accent-light);
    border-color: var(--km-accent);
    color: var(--km-accent);
  }

  &:focus-visible {
    outline: none;
    border-color: var(--km-accent);
    box-shadow: 0 0 0 3px var(--km-accent-ring);
  }

  &:active {
    transform: scale(0.98);
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
`;

export const KmPrimaryButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 44px;
  padding: 10px 20px;
  border: none;
  border-radius: var(--km-radius);
  background: linear-gradient(135deg, var(--km-accent) 0%, var(--km-accent-mid) 100%);
  color: #fff;
  font-family: var(--km-font);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: box-shadow 0.18s ease, transform 0.18s ease, filter 0.18s ease;

  &:hover {
    filter: brightness(1.05);
    box-shadow: 0 8px 22px rgba(232, 121, 26, 0.28);
  }

  &:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--km-accent-ring);
  }

  &:active {
    transform: scale(0.98);
  }

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
    box-shadow: none;
  }
`;

export const KmGhostButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 44px;
  padding: 10px 20px;
  border: 1.5px solid var(--km-border);
  border-radius: var(--km-radius);
  background: var(--km-card);
  color: var(--km-text);
  font-family: var(--km-font);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.18s ease, border-color 0.18s ease, color 0.18s ease,
    transform 0.18s ease;

  &:hover {
    background: var(--km-accent-light);
    border-color: var(--km-accent);
    color: var(--km-accent);
  }

  &:focus-visible {
    outline: none;
    border-color: var(--km-accent);
    box-shadow: 0 0 0 3px var(--km-accent-ring);
  }

  &:active {
    transform: scale(0.98);
  }
`;

export const KmDangerButton = styled(KmPrimaryButton)`
  background: var(--km-danger);

  &:hover {
    box-shadow: 0 8px 22px rgba(180, 35, 24, 0.25);
  }

  &:focus-visible {
    box-shadow: 0 0 0 3px rgba(180, 35, 24, 0.18);
  }
`;

export const KmChip = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  padding: 6px 13px;
  border-radius: 99px;
  border: 1.5px solid ${({ $active }) => ($active ? 'var(--km-accent)' : 'var(--km-border)')};
  background: ${({ $active }) => ($active ? 'var(--km-accent-light)' : 'var(--km-card)')};
  color: ${({ $active }) => ($active ? 'var(--km-accent)' : 'var(--km-muted)')};
  font-family: var(--km-font);
  font-size: 13px;
  font-weight: ${({ $active }) => ($active ? '600' : '400')};
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s, color 0.15s, transform 0.15s;

  &:hover {
    border-color: var(--km-accent);
    color: var(--km-accent);
    transform: translateY(-1px);
  }

  &:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--km-accent-ring);
  }
`;
