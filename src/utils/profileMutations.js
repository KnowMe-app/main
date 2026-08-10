import { get, push, ref, runTransaction, update } from 'firebase/database';

import { database } from 'components/config';
import { buildSearchIndexCandidates, encodeKey } from './searchIndexCandidates';
import { SEARCH_ID_INDEXED_FIELDS, normalizeSearchIdInput } from './searchKeyUtils';

export const PROFILE_MUTATIONS_ROOT = 'profileMutations';
export const PROFILE_MUTATION_HISTORY_ROOT = 'profileMutationHistory';
export const PROFILE_IDENTITY_RESERVATIONS_ROOT = 'profileIdentityReservations';

const NON_UNIQUE_IDENTITY_FIELDS = new Set(['name', 'surname']);

const cleanObject = value => Object.entries(value || {}).reduce((result, [key, item]) => {
  if (key.startsWith('__') || item === undefined) return result;
  result[key] = item;
  return result;
}, {});

const fieldValues = value => (Array.isArray(value) ? value : [value])
  .filter(item => item !== undefined && item !== null && String(item).trim());

export const buildProfileIdentityKeys = profile => [...SEARCH_ID_INDEXED_FIELDS]
  .filter(field => !NON_UNIQUE_IDENTITY_FIELDS.has(field))
  .flatMap(field => fieldValues(profile?.[field]).flatMap(value => {
    const normalized = normalizeSearchIdInput(field, value);
    return normalized ? buildSearchIndexCandidates(field, normalized)
      .map(candidate => `${field}_${encodeKey(candidate)}`) : [];
  }))
  .filter((key, index, keys) => keys.indexOf(key) === index);

export const buildProfileSearchIndexKeys = profile => [...SEARCH_ID_INDEXED_FIELDS]
  .flatMap(field => fieldValues(profile?.[field]).flatMap(value => {
    const normalized = normalizeSearchIdInput(field, value);
    return normalized ? buildSearchIndexCandidates(field, normalized)
      .map(candidate => ({ field, key: `${field}_${encodeKey(candidate)}` })) : [];
  }))
  .filter((entry, index, entries) => entries.findIndex(item => item.key === entry.key) === index);

const ownersIncludeAnotherCard = (owners, cardId) => owners != null &&
  (Array.isArray(owners) ? owners.some(owner => owner !== cardId) : owners !== cardId);

const addSearchOwner = (owners, cardId, allowMultiple) => {
  if (!owners) return cardId;
  if (!allowMultiple || owners === cardId) return cardId;
  const values = Array.isArray(owners) ? owners : [owners];
  return values.includes(cardId) ? values : [...values, cardId];
};

export const getEffectiveProfile = ({ baseProfile, mutation } = {}) => {
  if (mutation?.status === 'accepted' || mutation?.status === 'archived') return baseProfile || null;
  if (mutation?.operation === 'create' && !baseProfile) return { ...cleanObject(mutation.data), userId: mutation.cardId };
  if (mutation?.operation === 'update' && baseProfile) return { ...baseProfile, ...cleanObject(mutation.data) };
  return baseProfile || null;
};

export const reserveProfileCardId = () => push(ref(database, PROFILE_MUTATIONS_ROOT)).key;

export const saveCreateProfileMutation = async ({ cardId, creatorUid, data, expectedRevision }) => {
  if (!cardId || !creatorUid) throw new Error('cardId and creatorUid are required');
  const now = Date.now();
  const profile = { ...cleanObject(data), userId: cardId };
  const identityKeys = buildProfileIdentityKeys(profile);
  let failure = 'PROFILE_MUTATION_SAVE_FAILED';
  let savedMutation;

  const result = await runTransaction(ref(database), currentRoot => {
    const root = currentRoot || {};
    const mutations = { ...(root[PROFILE_MUTATIONS_ROOT] || {}) };
    const current = mutations[cardId];
    if (current && current.createdBy !== creatorUid) {
      failure = 'Profile mutation belongs to another user';
      return undefined;
    }
    if (current && expectedRevision != null && Number(current.revision) !== Number(expectedRevision)) {
      failure = 'REVISION_CONFLICT';
      return undefined;
    }

    const searchId = root.searchId || {};
    const reservations = { ...(root[PROFILE_IDENTITY_RESERVATIONS_ROOT] || {}) };
    if (identityKeys.some(key => ownersIncludeAnotherCard(searchId[key], cardId) ||
      (reservations[key] && reservations[key] !== cardId))) {
      failure = 'DUPLICATE_PROFILE';
      return undefined;
    }
    (current?.identityKeys || []).filter(key => !identityKeys.includes(key)).forEach(key => {
      if (reservations[key] === cardId) delete reservations[key];
    });
    identityKeys.forEach(key => { reservations[key] = cardId; });

    savedMutation = {
      cardId, operation: 'create', data: profile, createdBy: creatorUid,
      createdAt: current?.createdAt || now, updatedAt: now,
      revision: Number(current?.revision || 0) + 1, status: 'pendingReview', identityKeys,
    };
    mutations[cardId] = savedMutation;
    return {
      ...root,
      [PROFILE_MUTATIONS_ROOT]: mutations,
      [PROFILE_IDENTITY_RESERVATIONS_ROOT]: reservations,
      profileMutationsByCreator: {
        ...(root.profileMutationsByCreator || {}),
        [creatorUid]: { ...(root.profileMutationsByCreator?.[creatorUid] || {}), [cardId]: true },
      },
    };
  }, { applyLocally: false });
  if (!result.committed) throw new Error(failure);
  return savedMutation;
};

export const loadProfileMutation = async cardId => {
  const snapshot = await get(ref(database, `${PROFILE_MUTATIONS_ROOT}/${cardId}`));
  return snapshot.exists() ? snapshot.val() : null;
};

export const loadOwnProfileMutations = async creatorUid => {
  if (!creatorUid) return [];
  const idsSnapshot = await get(ref(database, `profileMutationsByCreator/${creatorUid}`));
  const ids = idsSnapshot.exists() ? Object.keys(idsSnapshot.val() || {}) : [];
  const mutations = await Promise.all(ids.map(loadProfileMutation));
  return mutations.filter(item => item && item.createdBy === creatorUid && item.status !== 'accepted');
};

export const loadGrantedCreatedProfiles = async creatorUid => {
  if (!creatorUid) return [];
  const snapshot = await get(ref(database, `users/${creatorUid}/createdProfileCardIds`));
  const ids = snapshot.exists() ? Object.keys(snapshot.val() || {}) : [];
  const profiles = await Promise.all(ids.map(async cardId => {
    const profileSnapshot = await get(ref(database, `newUsers/${cardId}`));
    return profileSnapshot.exists() ? { userId: cardId, ...profileSnapshot.val() } : null;
  }));
  return profiles.filter(Boolean);
};

export const loadAllCreateProfileMutations = async () => {
  const snapshot = await get(ref(database, PROFILE_MUTATIONS_ROOT));
  if (!snapshot.exists()) return [];
  return Object.values(snapshot.val() || {}).filter(item => item?.operation === 'create');
};

export const acceptCreateProfileMutation = async ({ cardId, expectedRevision, finalData }) => {
  const acceptedAt = Date.now();
  let failure = 'Profile mutation not found';
  let acceptedProfile;
  const result = await runTransaction(ref(database), currentRoot => {
    const root = currentRoot || {};
    const mutation = root[PROFILE_MUTATIONS_ROOT]?.[cardId];
    if (!mutation || mutation.operation !== 'create') return undefined;
    if (mutation.status !== 'pendingReview' || Number(mutation.revision) !== Number(expectedRevision)) {
      failure = 'REVISION_CONFLICT';
      return undefined;
    }
    const profile = { ...cleanObject(finalData || mutation.data), userId: cardId };
    const identityKeys = buildProfileIdentityKeys(profile);
    const searchEntries = buildProfileSearchIndexKeys(profile);
    const searchId = { ...(root.searchId || {}) };
    const reservations = { ...(root[PROFILE_IDENTITY_RESERVATIONS_ROOT] || {}) };
    if (identityKeys.some(key => ownersIncludeAnotherCard(searchId[key], cardId) ||
      (reservations[key] && reservations[key] !== cardId))) {
      failure = 'DUPLICATE_PROFILE';
      return undefined;
    }
    searchEntries.forEach(({ field, key }) => {
      searchId[key] = addSearchOwner(searchId[key], cardId, NON_UNIQUE_IDENTITY_FIELDS.has(field));
    });
    (mutation.identityKeys || []).forEach(key => { if (reservations[key] === cardId) delete reservations[key]; });
    identityKeys.forEach(key => { if (reservations[key] === cardId) delete reservations[key]; });

    const mutations = { ...(root[PROFILE_MUTATIONS_ROOT] || {}) };
    delete mutations[cardId];
    const creatorIndex = { ...(root.profileMutationsByCreator?.[mutation.createdBy] || {}) };
    delete creatorIndex[cardId];
    acceptedProfile = profile;
    return {
      ...root, searchId, newUsers: { ...(root.newUsers || {}), [cardId]: profile },
      users: { ...(root.users || {}), [mutation.createdBy]: {
        ...(root.users?.[mutation.createdBy] || {}), createdProfileCardIds: {
          ...(root.users?.[mutation.createdBy]?.createdProfileCardIds || {}), [cardId]: true,
        },
      } },
      [PROFILE_MUTATION_HISTORY_ROOT]: { ...(root[PROFILE_MUTATION_HISTORY_ROOT] || {}),
        [cardId]: { ...mutation, data: profile, status: 'accepted', acceptedAt } },
      [PROFILE_MUTATIONS_ROOT]: mutations,
      [PROFILE_IDENTITY_RESERVATIONS_ROOT]: reservations,
      profileMutationsByCreator: { ...(root.profileMutationsByCreator || {}), [mutation.createdBy]: creatorIndex },
    };
  }, { applyLocally: false });
  if (!result.committed) throw new Error(failure);
  return acceptedProfile;
};

export const rejectCreateProfileMutation = async ({ cardId, expectedRevision }) => {
  const mutation = await loadProfileMutation(cardId);
  if (!mutation) throw new Error('Profile mutation not found');
  if (Number(mutation.revision) !== Number(expectedRevision)) throw new Error('REVISION_CONFLICT');
  const rejected = { ...mutation, status: 'private', updatedAt: Date.now() };
  await update(ref(database, `${PROFILE_MUTATIONS_ROOT}/${cardId}`), rejected);
  return rejected;
};
