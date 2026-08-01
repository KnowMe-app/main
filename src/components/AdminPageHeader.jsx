// Shared page-header chrome for the UKRCOM admin pages (Documents / Invoice Builder / Parties /
// Budget). The "⋮" page-switcher (PageNavMenu) stays on the same row as the title and the page's
// other action buttons - never its own row, and never sticky/fixed - but it sits inside
// `HeaderRight` as its own flex item (with a wider gap than HeaderActions' own buttons use), so it
// reads as separate from that button group while staying vertically centered with everything else
// on the row. See styles/knowme.js's KmTopbar, the same pattern My Profile and the User Agreement
// page use.
import styled from 'styled-components';

// Always a single row, at every viewport width - never stacks the title above the actions/menu
// on narrow screens, matching KmTopbar (My Profile / User Agreement never stack either).
export const Header = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
`;

export const HeaderRight = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: nowrap;
  min-width: 0;
  justify-content: flex-end;
`;

export const HeaderActions = styled.div`
  display: flex;
  min-width: 0;
  gap: 6px;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
`;
