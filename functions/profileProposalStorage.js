'use strict';

const PROFILE_PROPOSAL_CONTROL = 'profileProposalControl';
const PROFILE_PROPOSAL_ARCHIVE = 'multiData/profileProposals';
const PROFILE_PROPOSAL_LIVE = `${PROFILE_PROPOSAL_ARCHIVE}/live`;

const LEGACY_PROFILE_PROPOSAL_PATHS = Object.freeze({
  create: 'multiData/profileMutations',
  update: 'multiData/edits',
  createHistory: 'multiData/profileMutationHistory',
  updateHistory: 'multiData/editsHistory',
  owners: 'multiData/profileMutationOwners',
  identityClaims: 'multiData/profileIdentityClaims',
  byEditor: 'multiData/editsByEditor',
  contributors: 'multiData/editsContributors',
});

const UNIFIED_PROFILE_PROPOSAL_PATHS = Object.freeze({
  create: `${PROFILE_PROPOSAL_LIVE}/heads/create`,
  update: `${PROFILE_PROPOSAL_LIVE}/heads/update`,
  createHistory: `${PROFILE_PROPOSAL_LIVE}/history/create`,
  updateHistory: `${PROFILE_PROPOSAL_LIVE}/history/update`,
  owners: `${PROFILE_PROPOSAL_LIVE}/owners`,
  identityClaims: `${PROFILE_PROPOSAL_LIVE}/identityClaims`,
  byEditor: `${PROFILE_PROPOSAL_LIVE}/targetsByEditor`,
  contributors: `${PROFILE_PROPOSAL_LIVE}/contributors`,
});

const isMap = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const proposalWriter = control => {
  if (control == null || (isMap(control) && control.activeWriter == null)) return 'legacy';
  if (control.activeWriter === 'legacy' || control.activeWriter === 'unified') return control.activeWriter;
  return null;
};

const shouldRecordProposalWrite = (control, writer, eventTime) => {
  if (proposalWriter(control) !== writer) return false;
  if (writer === 'legacy') return true;
  const writtenAt = Date.parse(eventTime);
  return Number.isFinite(writtenAt) && Number.isSafeInteger(control.activatedAt) && writtenAt > control.activatedAt;
};

// Виклик очищення працює щонайбільше 5 хвилин. Запас дає змогу повторити
// виклик після аварійного завершення, зберігаючи мітку для перевірки під час
// міграції. Заморожений режим нових міток не приймає.
const PROPOSAL_CLEANUP_LEASE_MS = 10 * 60 * 1000;

const claimProposalCleanup = (control, token, now) => {
  if (!proposalWriter(control)) return undefined;
  const lease = control?.cleanupLease;
  if (lease && (!Number.isSafeInteger(lease.expiresAt) || lease.expiresAt > now)) return undefined;
  return {
    ...control,
    cleanupLease: { token, startedAt: now, expiresAt: now + PROPOSAL_CLEANUP_LEASE_MS },
  };
};

const releaseProposalCleanup = (control, token) => (
  control?.cleanupLease?.token === token ? { ...control, cleanupLease: null } : undefined
);

module.exports = {
  PROFILE_PROPOSAL_CONTROL,
  PROFILE_PROPOSAL_ARCHIVE,
  PROFILE_PROPOSAL_LIVE,
  LEGACY_PROFILE_PROPOSAL_PATHS,
  UNIFIED_PROFILE_PROPOSAL_PATHS,
  claimProposalCleanup,
  proposalWriter,
  releaseProposalCleanup,
  shouldRecordProposalWrite,
};
