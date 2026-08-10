import { get, push, ref, runTransaction } from 'firebase/database';

import { database, syncUserSearchKeyIndex } from 'components/config';
import {
  SEARCH_ID_INDEXED_FIELDS,
  buildSearchIdRecordKey,
} from './searchKeyUtils';

export const PROFILE_MUTATIONS_ROOT = 'profileMutations';
export const PROFILE_MUTATION_HISTORY_ROOT = 'profileMutationHistory';
export const PROFILE_IDENTITY_CLAIMS_ROOT = 'profileIdentityClaims';

const cleanObject = value => Object.entries(value || {}).reduce((result, [key, item]) => {
  if (key.startsWith('__') || item === undefined) return result;
  result[key] = item;
  return result;
}, {});

export const getEffectiveProfile = ({ baseProfile, mutation } = {}) => {
  if (mutation?.status === 'accepted' || mutation?.status === 'archived') return baseProfile || null;
  if (mutation?.operation === 'create' && !baseProfile) {
    return { ...cleanObject(mutation.data), userId: mutation.cardId };
  }
  if (mutation?.operation === 'update' && baseProfile) {
    return { ...baseProfile, ...cleanObject(mutation.data) };
  }
  return baseProfile || null;
};

export const reserveProfileCardId = () => push(ref(database, PROFILE_MUTATIONS_ROOT)).key;

const getSearchIdKeys = (data, { contactsOnly = false } = {}) => Object.entries(cleanObject(data))
  .filter(([field]) => SEARCH_ID_INDEXED_FIELDS.has(field) && (!contactsOnly || (field !== 'name' && field !== 'surname')))
  .flatMap(([field, rawValue]) => (Array.isArray(rawValue) ? rawValue : [rawValue])
    .map(value => buildSearchIdRecordKey({ [field]: value }))
    .filter(Boolean))
  .filter((value, index, values) => values.indexOf(value) === index);

const asIds = value => (Array.isArray(value) ? value : [value]).filter(Boolean);

const hasOtherOwner = (value, cardId) => asIds(value).some(id => id !== cardId);

const appendIndexId = (value, cardId) => {
  const ids = asIds(value);
  if (!ids.includes(cardId)) ids.push(cardId);
  return ids.length === 1 ? ids[0] : ids;
};

export const saveCreateProfileMutation = async ({ cardId, creatorUid, data, expectedRevision }) => {
  if (!cardId || !creatorUid) throw new Error('cardId and creatorUid are required');
  const identityKeys = getSearchIdKeys(data, { contactsOnly: true });
  let conflict = '';
  const result = await runTransaction(ref(database), currentRoot => {
    const root = currentRoot || {};
    const current = root[PROFILE_MUTATIONS_ROOT]?.[cardId];
    if (current && current.createdBy !== creatorUid) {
      conflict = 'Profile mutation belongs to another user';
      return undefined;
    }
    if (current && current.status !== 'pendingReview' && current.status !== 'private') {
      conflict = 'REVISION_CONFLICT';
      return undefined;
    }
    if (current && expectedRevision != null && Number(current.revision) !== Number(expectedRevision)) {
      conflict = 'REVISION_CONFLICT';
      return undefined;
    }
    const searchId = root.searchId || {};
    const claims = root[PROFILE_IDENTITY_CLAIMS_ROOT] || {};
    if (identityKeys.some(key => hasOtherOwner(searchId[key], cardId) || (claims[key] && claims[key] !== cardId))) {
      conflict = 'DUPLICATE_PROFILE';
      return undefined;
    }
    const now = Date.now();
    const mutation = {
      cardId,
      operation: 'create',
      data: { ...cleanObject(data), userId: cardId },
      createdBy: creatorUid,
      createdAt: current?.createdAt || now,
      updatedAt: now,
      revision: Number(current?.revision || 0) + 1,
      status: 'pendingReview',
      identityKeys,
    };
    const nextClaims = { ...claims };
    (current?.identityKeys || []).forEach(key => {
      if (!identityKeys.includes(key) && nextClaims[key] === cardId) delete nextClaims[key];
    });
    identityKeys.forEach(key => { nextClaims[key] = cardId; });
    return {
      ...root,
      [PROFILE_MUTATIONS_ROOT]: { ...(root[PROFILE_MUTATIONS_ROOT] || {}), [cardId]: mutation },
      [PROFILE_IDENTITY_CLAIMS_ROOT]: nextClaims,
      profileMutationsByCreator: {
        ...(root.profileMutationsByCreator || {}),
        [creatorUid]: { ...(root.profileMutationsByCreator?.[creatorUid] || {}), [cardId]: true },
      },
    };
  }, { applyLocally: false });
  if (!result.committed) {
    throw new Error(conflict || 'REVISION_CONFLICT');
  }
  return result.snapshot.val()?.[PROFILE_MUTATIONS_ROOT]?.[cardId];
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
  return Object.values(snapshot.val() || {}).filter(item => (
    item?.operation === 'create' && item.status !== 'accepted' && item.status !== 'accepting'
  ));
};

export const acceptCreateProfileMutation = async ({ cardId, expectedRevision, finalData }) => {
  const acceptedAt = Date.now();
  let conflict = 'Profile mutation not found';
  let acceptedProfile = null;
  const result = await runTransaction(ref(database), currentRoot => {
    const root = currentRoot || {};
    const mutation = root[PROFILE_MUTATIONS_ROOT]?.[cardId];
    if (!mutation || mutation.operation !== 'create') return undefined;
    if (mutation.status !== 'pendingReview' && mutation.status !== 'private') return undefined;
    if (Number(mutation.revision) !== Number(expectedRevision)) {
      conflict = 'REVISION_CONFLICT';
      return undefined;
    }
    const profile = { ...cleanObject(finalData || mutation.data), userId: cardId };
    const identityKeys = getSearchIdKeys(profile, { contactsOnly: true });
    const searchKeys = getSearchIdKeys(profile);
    const searchId = root.searchId || {};
    const claims = root[PROFILE_IDENTITY_CLAIMS_ROOT] || {};
    if (identityKeys.some(key => hasOtherOwner(searchId[key], cardId) || (claims[key] && claims[key] !== cardId))) {
      conflict = 'DUPLICATE_PROFILE';
      return undefined;
    }

    const nextClaims = { ...claims };
    (mutation.identityKeys || []).forEach(key => {
      if (!identityKeys.includes(key) && nextClaims[key] === cardId) delete nextClaims[key];
    });
    identityKeys.forEach(key => { nextClaims[key] = cardId; });
    const nextSearchId = { ...searchId };
    searchKeys.forEach(key => { nextSearchId[key] = appendIndexId(nextSearchId[key], cardId); });
    const acceptedMutation = { ...mutation, data: profile, identityKeys, status: 'accepted', acceptedAt };
    const creatorIndex = { ...(root.profileMutationsByCreator?.[mutation.createdBy] || {}) };
    delete creatorIndex[cardId];
    acceptedProfile = profile;
    return {
      ...root,
      newUsers: { ...(root.newUsers || {}), [cardId]: profile },
      users: {
        ...(root.users || {}),
        [mutation.createdBy]: {
          ...(root.users?.[mutation.createdBy] || {}),
          createdProfileCardIds: {
            ...(root.users?.[mutation.createdBy]?.createdProfileCardIds || {}),
            [cardId]: true,
          },
        },
      },
      [PROFILE_MUTATION_HISTORY_ROOT]: { ...(root[PROFILE_MUTATION_HISTORY_ROOT] || {}), [cardId]: acceptedMutation },
      [PROFILE_MUTATIONS_ROOT]: { ...(root[PROFILE_MUTATIONS_ROOT] || {}), [cardId]: acceptedMutation },
      [PROFILE_IDENTITY_CLAIMS_ROOT]: nextClaims,
      searchId: nextSearchId,
      profileMutationsByCreator: {
        ...(root.profileMutationsByCreator || {}),
        [mutation.createdBy]: creatorIndex,
      },
    };
  }, { applyLocally: false });
  if (!result.committed) throw new Error(conflict);
  await syncUserSearchKeyIndex(cardId, {}, acceptedProfile);
  return acceptedProfile;
};

export const rejectCreateProfileMutation = async ({ cardId, expectedRevision }) => {
  let conflict = 'Profile mutation not found';
  const result = await runTransaction(ref(database, `${PROFILE_MUTATIONS_ROOT}/${cardId}`), mutation => {
    if (!mutation) return undefined;
    if (mutation.status !== 'pendingReview') return undefined;
    if (Number(mutation.revision) !== Number(expectedRevision)) {
      conflict = 'REVISION_CONFLICT';
      return undefined;
    }
    return { ...mutation, status: 'private', updatedAt: Date.now() };
  }, { applyLocally: false });
  if (!result.committed) throw new Error(conflict);
  return result.snapshot.val();
};
