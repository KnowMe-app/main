// Shared page-header chrome for the UKRCOM admin pages (Documents / Invoice Builder / Parties /
// Budget). The "⋮" page-switcher (PageNavMenu) stays on the title's own row - never its own line,
// and never sticky/fixed - but the page's other action buttons (Export/Upload/Edit/...) render
// separately, on their own row right below the header, right-aligned via HeaderActionsRow. This
// keeps the title row uncluttered (title + menu only) instead of crowding a variable number of
// buttons in next to it. See styles/knowme.js's KmTopbar, the same pattern My Profile and the User
// Agreement page use for the title row itself.
import styled from 'styled-components';

// Always a single row, at every viewport width - never stacks the title above the menu on narrow
// screens, matching KmTopbar (My Profile / User Agreement never stack either). Only ever holds the
// title block and PageNavMenu now - action buttons live in HeaderActionsRow below.
export const Header = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
`;

// The page's own action buttons row, directly under the title/menu header - right-aligned, wraps
// on narrow screens instead of crowding the title row.
export const HeaderActionsRow = styled.div`
  display: flex;
  justify-content: flex-end;
  margin-bottom: 14px;
`;

export const HeaderActions = styled.div`
  display: flex;
  min-width: 0;
  gap: 6px;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
`;
