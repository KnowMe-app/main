// Shared page-header chrome for the UKRCOM admin pages (Documents / Invoice Builder / Parties).
// Mirrors my-profile's sticky top bar (MyProfile.jsx's StickyHeader + Topbar) so
// the "⋮" page-switcher (PageNavMenu, always the first item in HeaderActions) stays pinned in the
// same top-right corner on every page and at every viewport width, instead of each page carrying
// its own copy of this CSS that can drift out of sync (batch 29 §1).
import styled from 'styled-components';

export const Header = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
  position: sticky;
  top: 0;
  z-index: 20;
  background: var(--km-bg);
  padding-top: 12px;
  margin-top: -12px;

  @media (max-width: 560px) {
    flex-direction: column;
    align-items: stretch;
  }
`;

export const HeaderActions = styled.div`
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;

  @media (max-width: 560px) {
    width: 100%;
    justify-content: flex-end;
  }
`;
