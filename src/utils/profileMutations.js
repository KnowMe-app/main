import { get, push, ref, runTransaction, update } from 'firebase/database';

import {
  buildSearchIdIndexPayloadFromCollections,
  buildSearchKeyIndexPayloadFromCollections,
  database,
} from 'components/config';

export const PROFILE_MUTATIONS_ROOT = 'profileMutations';
export const PROFILE_MUTATION_HISTORY_ROOT = 'profileMutationHistory';
export const PROFILE_IDENTITY_RESERVATIONS_ROOT = 'profileIdentityReservations';

const SEARCH_KEY_INDEX_TYPES = [
  'blood', 'maritalStatus', 'csection', 'contact', 'role', 'userId', 'age',
  'imtHeightWeight', 'reaction', 'fieldCount', 'lastAction', 'getInTouch',
];
const NON_UNIQUE_SEARCH_ID_PREFIXES = new Set(['name', 'surname']);

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

const flattenPayload = (value, prefix = '', result = {}) => {
  Object.entries(value || {}).forEach(([key, item]) => {
    const path = prefix ? `${prefix}/${key}` : key;
    if (item && typeof item === 'object' && !Array.isArray(item)) flattenPayload(item, path, result);
    else result[path] = item;
  });
  return result;
};

export const buildProfileSearchIndexUpdates = (cardId, profile) => {
  const collections = { newUsers: { [cardId]: { ...profile, userId: cardId } } };
  const searchId = buildSearchIdIndexPayloadFromCollections(collections);
  const searchKey = buildSearchKeyIndexPayloadFromCollections(collections, SEARCH_KEY_INDEX_TYPES);
  return {
    ...Object.fromEntries(Object.entries(flattenPayload(searchId)).map(([path, value]) => [`searchId/${path}`, value])),
    ...Object.fromEntries(Object.entries(flattenPayload(searchKey)).map(([path, value]) => [`searchKey/${path}`, value])),
  };
};

export const getProfileIdentityKeys = (cardId, data) => Object.keys(
  buildSearchIdIndexPayloadFromCollections({ newUsers: { [cardId]: { ...cleanObject(data), userId: cardId } } })
).filter(key => !NON_UNIQUE_SEARCH_ID_PREFIXES.has(key.split('_', 1)[0]));

const releaseIdentityKeys = async (cardId, keys) => Promise.all((keys || []).map(key =>
  runTransaction(ref(database, `${PROFILE_IDENTITY_RESERVATIONS_ROOT}/${key}`), current => (
    current === cardId ? null : current
  ), { applyLocally: false })
));

const reserveIdentityKeys = async (cardId, keys) => {
  const newlyReserved = [];
  try {
    for (const key of keys) {
      // Canonical profiles own their searchId keys and cannot be reserved again.
      // eslint-disable-next-line no-await-in-loop
      const canonical = await get(ref(database, `searchId/${key}`));
      const owners = canonical.exists() ? canonical.val() : null;
      if (owners && owners !== cardId) {
        throw new Error('DUPLICATE_PROFILE');
      }
      // Remember whether this save acquired the reservation, so a later revision
      // conflict never releases a reservation already owned by the same draft.
      // eslint-disable-next-line no-await-in-loop
      const previousReservation = await get(ref(database, `${PROFILE_IDENTITY_RESERVATIONS_ROOT}/${key}`));
      // eslint-disable-next-line no-await-in-loop
      const result = await runTransaction(
        ref(database, `${PROFILE_IDENTITY_RESERVATIONS_ROOT}/${key}`),
        current => (!current || current === cardId ? cardId : undefined),
        { applyLocally: false },
      );
      if (!result.committed) throw new Error('DUPLICATE_PROFILE');
      if (!previousReservation.exists()) newlyReserved.push(key);
    }
  } catch (error) {
    await releaseIdentityKeys(cardId, newlyReserved);
    throw error;
  }
  return newlyReserved;
};

export const saveCreateProfileMutation = async ({ cardId, creatorUid, data, expectedRevision }) => {
  if (!cardId || !creatorUid) throw new Error('cardId and creatorUid are required');
  const mutationRef = ref(database, `${PROFILE_MUTATIONS_ROOT}/${cardId}`);
  const identityKeys = getProfileIdentityKeys(cardId, data);
  const newlyReservedIdentityKeys = await reserveIdentityKeys(cardId, identityKeys);
  const now = Date.now();
  let conflict = false;
  let ownerConflict = false;
  let previousIdentityKeys = [];
  const result = await runTransaction(mutationRef, current => {
    if (!current && Number(expectedRevision || 0) > 0) {
      conflict = true;
      return undefined;
    }
    if (current && current.createdBy !== creatorUid) {
      ownerConflict = true;
      return undefined;
    }
    if (current && (!['pendingReview', 'private'].includes(current.status) ||
      (expectedRevision != null && Number(current.revision) !== Number(expectedRevision)))) {
      conflict = true;
      return undefined;
    }
    previousIdentityKeys = current?.identityKeys || [];
    return {
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
  }, { applyLocally: false });
  if (!result.committed) {
    await releaseIdentityKeys(cardId, newlyReservedIdentityKeys);
    if (ownerConflict) throw new Error('Profile mutation belongs to another user');
    if (conflict) throw new Error('REVISION_CONFLICT');
    throw new Error('PROFILE_MUTATION_SAVE_FAILED');
  }
  await update(ref(database), { [`profileMutationsByCreator/${creatorUid}/${cardId}`]: true });
  await releaseIdentityKeys(cardId, previousIdentityKeys.filter(key => !identityKeys.includes(key)));
  return result.snapshot.val();
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
  let conflict = false;
  let invalid = false;
  const transition = await runTransaction(ref(database, `${PROFILE_MUTATIONS_ROOT}/${cardId}`), current => {
    if (!current || current.operation !== 'create') {
      invalid = true;
      return undefined;
    }
    if (current.status !== 'pendingReview' || Number(current.revision) !== Number(expectedRevision)) {
      conflict = true;
      return undefined;
    }
    return { ...current, status: 'accepting', updatedAt: Date.now() };
  }, { applyLocally: false });
  if (!transition.committed) {
    if (conflict) throw new Error('REVISION_CONFLICT');
    if (invalid) throw new Error('Profile mutation not found');
    throw new Error('PROFILE_MUTATION_ACCEPT_FAILED');
  }
  const mutation = transition.snapshot.val();

  const acceptedAt = Date.now();
  const profile = { ...cleanObject(finalData || mutation.data), userId: cardId };
  await update(ref(database), {
    [`newUsers/${cardId}`]: profile,
    ...buildProfileSearchIndexUpdates(cardId, profile),
    [`users/${mutation.createdBy}/createdProfileCardIds/${cardId}`]: true,
    [`${PROFILE_MUTATION_HISTORY_ROOT}/${cardId}`]: { ...mutation, data: profile, status: 'accepted', acceptedAt },
    [`${PROFILE_MUTATIONS_ROOT}/${cardId}`]: null,
    [`profileMutationsByCreator/${mutation.createdBy}/${cardId}`]: null,
    ...Object.fromEntries((mutation.identityKeys || []).map(key => [`${PROFILE_IDENTITY_RESERVATIONS_ROOT}/${key}`, null])),
  });
  return profile;
};

export const rejectCreateProfileMutation = async ({ cardId, expectedRevision }) => {
  let conflict = false;
  let missing = false;
  const result = await runTransaction(ref(database, `${PROFILE_MUTATIONS_ROOT}/${cardId}`), current => {
    if (!current) {
      missing = true;
      return undefined;
    }
    if (current.status !== 'pendingReview' || Number(current.revision) !== Number(expectedRevision)) {
      conflict = true;
      return undefined;
    }
    return { ...current, status: 'private', updatedAt: Date.now() };
  }, { applyLocally: false });
  if (!result.committed) {
    if (conflict) throw new Error('REVISION_CONFLICT');
    if (missing) throw new Error('Profile mutation not found');
    throw new Error('PROFILE_MUTATION_REJECT_FAILED');
  }
  return result.snapshot.val();
};
