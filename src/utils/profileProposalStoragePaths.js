export const PROFILE_PROPOSAL_CONTROL = 'profileProposalControl';
export const PROFILE_PROPOSAL_LIVE = 'multiData/profileProposals/live';

export const LEGACY_PROFILE_PROPOSAL_PATHS = Object.freeze({
  create: 'multiData/profileMutations',
  update: 'multiData/edits',
  createHistory: 'multiData/profileMutationHistory',
  updateHistory: 'multiData/editsHistory',
  owners: 'multiData/profileMutationOwners',
  identityClaims: 'multiData/profileIdentityClaims',
  byEditor: 'multiData/editsByEditor',
  contributors: 'multiData/editsContributors',
});

export const UNIFIED_PROFILE_PROPOSAL_PATHS = Object.freeze({
  create: `${PROFILE_PROPOSAL_LIVE}/heads/create`,
  update: `${PROFILE_PROPOSAL_LIVE}/heads/update`,
  createHistory: `${PROFILE_PROPOSAL_LIVE}/history/create`,
  updateHistory: `${PROFILE_PROPOSAL_LIVE}/history/update`,
  owners: `${PROFILE_PROPOSAL_LIVE}/owners`,
  identityClaims: `${PROFILE_PROPOSAL_LIVE}/identityClaims`,
  byEditor: `${PROFILE_PROPOSAL_LIVE}/targetsByEditor`,
  contributors: `${PROFILE_PROPOSAL_LIVE}/contributors`,
});

// Один клієнт працює з одним набором адрес протягом усієї сесії, включно
// з офлайн-чергою. Правила окремо перевіряють чинного писача на кожен запис.
export const usesUnifiedProposalStorage = process.env.REACT_APP_PROFILE_PROPOSAL_STORAGE === 'unified';
export const profileProposalPaths = usesUnifiedProposalStorage
  ? UNIFIED_PROFILE_PROPOSAL_PATHS : LEGACY_PROFILE_PROPOSAL_PATHS;
