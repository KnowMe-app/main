// Shared page-header chrome for the UKRCOM admin pages (Documents / Invoice Builder / Parties /
// Budget). `PageMenuBar` holds the "⋮" page-switcher (PageNavMenu) on its own row, right-aligned,
// in normal document flow - it must never be sticky/fixed, and it must never share a row with the
// page's other action buttons (Reload, PDF export, Edit/Read toggle, etc.), so it always lands in
// the same top-right spot as every other "⋮" menu in the app (see styles/knowme.js's KmTopbar /
// KmPageMenuBar, the same pattern My Profile and the User Agreement page use).
import styled from 'styled-components';

export const PageMenuBar = styled.div`
  display: flex;
  justify-content: flex-end;
  margin-bottom: 10px;
`;

export const Header = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;

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
