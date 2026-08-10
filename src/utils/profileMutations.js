import { get, push, ref, runTransaction, update } from 'firebase/database';

import { database } from 'components/config';
import { buildSearchIndexCandidates, encodeKey } from './searchIndexCandidates';
import { getSearchIdIndexedFields, normalizeSearchIdInput } from './searchKeyUtils';

export const PROFILE_MUTATIONS_ROOT = 'profileMutations';
export const PROFILE_MUTATION_HISTORY_ROOT = 'profileMutationHistory';
export const PROFILE_IDENTITY_RESERVATIONS_ROOT = 'profileIdentityReservations';

const NON_UNIQUE_INDEX_FIELDS = new Set(['name', 'surname']);

const cleanObject = value => Object.entries(value || {}).reduce((result, [key, item]) => {
  if (key.startsWith('__') || item === undefined) return result;
  result[key] = item;
  return result;
}, {});

const extractValues = value => {
  if (value === undefined || value === null) return [];
  if (typeof value === 'string' || typeof value === 'number') return [value];
  if (Array.isArray(value)) return value.flatMap(extractValues);
  if (typeof value === 'object') return Object.values(value).flatMap(extractValues);
  return [];
};

export const buildProfileSearchIndexKeys = profile => getSearchIdIndexedFields().reduce((result, field) => {
  extractValues(profile?.[field]).forEach(value => {
    buildSearchIndexCandidates(field, normalizeSearchIdInput(field, value)).forEach(candidate => {
      if (candidate) result.add(`${field}_${encodeKey(String(candidate).toLowerCase())}`);
    });
  });
  return result;
}, new Set());

const getUniqueIdentityKeys = profile => [...buildProfileSearchIndexKeys(profile)]
  .filter(key => !NON_UNIQUE_INDEX_FIELDS.has(key.split('_', 1)[0]));

const reservationCardId = reservation => (
  reservation && typeof reservation === 'object' ? reservation.cardId : reservation
);

const canonicalContainsOtherCard = (owners, cardId) => {
  if (!owners) return false;
  if (Array.isArray(owners)) return owners.some(owner => owner !== cardId);
  return owners !== cardId;
};

const reserveIdentityKeys = async (cardId, keys) => {
  const token = push(ref(database, PROFILE_IDENTITY_RESERVATIONS_ROOT)).key;
  const acquired = [];
  try {
    for (const key of keys) {
      // Legacy profiles predate reservations, so validate their canonical entry before claiming.
      // New drafts retain their claim through acceptance, closing the accept/reserve race.
      // eslint-disable-next-line no-await-in-loop
      const canonical = await get(ref(database, `searchId/${key}`));
      if (canonical.exists() && canonicalContainsOtherCard(canonical.val(), cardId)) {
        throw new Error('DUPLICATE_PROFILE');
      }
      // A token makes concurrent saves of the same card independently releasable.
      // eslint-disable-next-line no-await-in-loop
      const result = await runTransaction(
        ref(database, `${PROFILE_IDENTITY_RESERVATIONS_ROOT}/${key}`),
        current => {
          const owner = reservationCardId(current);
          if (owner && owner !== cardId) return undefined;
          const tokens = current && typeof current === 'object' ? current.tokens || {} : {};
          return { cardId, tokens: { ...tokens, [token]: true } };
        },
        { applyLocally: false },
      );
      if (!result.committed) throw new Error('DUPLICATE_PROFILE');
      acquired.push(key);
    }
    return { keys: acquired, token };
  } catch (error) {
    await releaseIdentityKeys(cardId, acquired, token);
    throw error;
  }
};

const releaseIdentityKeys = async (cardId, keys, token) => {
  await Promise.all((keys || []).map(key => runTransaction(
    ref(database, `${PROFILE_IDENTITY_RESERVATIONS_ROOT}/${key}`),
    current => {
      if (reservationCardId(current) !== cardId) return current;
      if (!current || typeof current !== 'object' || !token) return null;
      const tokens = { ...(current.tokens || {}) };
      delete tokens[token];
      if (Object.keys(tokens).length) return { ...current, tokens };
      return current.durable || current.accepted ? { ...current, tokens: null } : null;
    },
    { applyLocally: false },
  )));
};

const retainAcceptedIdentityKeys = async (cardId, keys) => Promise.all(keys.map(key => runTransaction(
  ref(database, `${PROFILE_IDENTITY_RESERVATIONS_ROOT}/${key}`),
  current => reservationCardId(current) === cardId ? { cardId, accepted: true } : undefined,
  { applyLocally: false },
)));

const retainSavedIdentityKeys = async (cardId, keys) => Promise.all(keys.map(key => runTransaction(
  ref(database, `${PROFILE_IDENTITY_RESERVATIONS_ROOT}/${key}`),
  current => reservationCardId(current) === cardId ? { ...current, cardId, durable: true } : undefined,
  { applyLocally: false },
)));

const mergeNonUniqueSearchIndexes = async (cardId, keys) => Promise.all(keys.map(key => runTransaction(
  ref(database, `searchId/${key}`),
  current => {
    const owners = Array.isArray(current) ? current : current ? [current] : [];
    if (!owners.includes(cardId)) owners.push(cardId);
    return owners.length === 1 ? owners[0] : owners;
  },
  { applyLocally: false },
)));

export const getEffectiveProfile = ({ baseProfile, mutation } = {}) => {
  if (mutation?.status === 'accepted' || mutation?.status === 'archived') return baseProfile || null;
  if (mutation?.operation === 'create' && !baseProfile) return { ...cleanObject(mutation.data), userId: mutation.cardId };
  if (mutation?.operation === 'update' && baseProfile) return { ...baseProfile, ...cleanObject(mutation.data) };
  return baseProfile || null;
};

export const reserveProfileCardId = () => push(ref(database, PROFILE_MUTATIONS_ROOT)).key;

export const saveCreateProfileMutation = async ({ cardId, creatorUid, data, expectedRevision }) => {
  if (!cardId || !creatorUid) throw new Error('cardId and creatorUid are required');
  const identityKeys = getUniqueIdentityKeys(data);
  const reservation = await reserveIdentityKeys(cardId, identityKeys);
  const mutationRef = ref(database, `${PROFILE_MUTATIONS_ROOT}/${cardId}`);
  let creatorIndexWritten = false;
  let conflict = false;
  let ownerConflict = false;
  let previousIdentityKeys = [];

  try {
    // Write the discoverability pointer first. A dangling pointer is harmless (the loader
    // filters it), and can always be retried; the inverse ordering could orphan a draft.
    await update(ref(database), { [`profileMutationsByCreator/${creatorUid}/${cardId}`]: true });
    creatorIndexWritten = true;
    const now = Date.now();
    const result = await runTransaction(mutationRef, current => {
      if (current && current.createdBy !== creatorUid) { ownerConflict = true; return undefined; }
      if (current && expectedRevision != null && Number(current.revision) !== Number(expectedRevision)) {
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
      if (ownerConflict) throw new Error('Profile mutation belongs to another user');
      if (conflict) throw new Error('REVISION_CONFLICT');
      throw new Error('PROFILE_MUTATION_SAVE_FAILED');
    }
    const saved = result.snapshot.val();
    await retainSavedIdentityKeys(cardId, identityKeys);
    await releaseIdentityKeys(cardId, reservation.keys, reservation.token);
    const removedKeys = previousIdentityKeys.filter(key => !identityKeys.includes(key));
    await releaseIdentityKeys(cardId, removedKeys);
    return saved;
  } catch (error) {
    await releaseIdentityKeys(cardId, reservation.keys, reservation.token);
    if (creatorIndexWritten && (ownerConflict || conflict)) {
      await update(ref(database), { [`profileMutationsByCreator/${creatorUid}/${cardId}`]: null });
    }
    throw error;
  }
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
  let invalid = false;
  let conflict = false;
  const transition = await runTransaction(ref(database, `${PROFILE_MUTATIONS_ROOT}/${cardId}`), current => {
    if (!current || current.operation !== 'create') { invalid = true; return undefined; }
    if (current.status !== 'pendingReview' || Number(current.revision) !== Number(expectedRevision)) {
      conflict = true;
      return undefined;
    }
    return { ...current, status: 'accepting', updatedAt: Date.now() };
  }, { applyLocally: false });
  if (!transition.committed) {
    if (invalid) throw new Error('Profile mutation not found');
    if (conflict) throw new Error('REVISION_CONFLICT');
    throw new Error('PROFILE_MUTATION_ACCEPT_FAILED');
  }
  const mutation = transition.snapshot.val();

  const profile = { ...cleanObject(finalData || mutation.data), userId: cardId };
  const identityKeys = getUniqueIdentityKeys(profile);
  let reservation;
  const acceptedAt = Date.now();
  const allIndexKeys = [...buildProfileSearchIndexKeys(profile)];
  const nonUniqueKeys = allIndexKeys.filter(key => NON_UNIQUE_INDEX_FIELDS.has(key.split('_', 1)[0]));
  const uniqueUpdates = identityKeys.reduce((updates, key) => ({ ...updates, [`searchId/${key}`]: cardId }), {});

  try {
    reservation = await reserveIdentityKeys(cardId, identityKeys);
    await update(ref(database), {
      [`newUsers/${cardId}`]: profile,
      ...uniqueUpdates,
      [`users/${mutation.createdBy}/createdProfileCardIds/${cardId}`]: true,
      [`${PROFILE_MUTATION_HISTORY_ROOT}/${cardId}`]: { ...mutation, data: profile, identityKeys, status: 'accepted', acceptedAt },
      [`${PROFILE_MUTATIONS_ROOT}/${cardId}`]: null,
      [`profileMutationsByCreator/${mutation.createdBy}/${cardId}`]: null,
    });
    await mergeNonUniqueSearchIndexes(cardId, nonUniqueKeys);
    await retainAcceptedIdentityKeys(cardId, identityKeys);
    return profile;
  } catch (error) {
    if (reservation) await releaseIdentityKeys(cardId, reservation.keys, reservation.token);
    await runTransaction(ref(database, `${PROFILE_MUTATIONS_ROOT}/${cardId}`), current => (
      current?.status === 'accepting' && Number(current.revision) === Number(expectedRevision)
        ? { ...current, status: 'pendingReview', updatedAt: Date.now() }
        : current
    ), { applyLocally: false });
    throw error;
  }
};

export const rejectCreateProfileMutation = async ({ cardId, expectedRevision }) => {
  const mutation = await loadProfileMutation(cardId);
  if (!mutation) throw new Error('Profile mutation not found');
  if (Number(mutation.revision) !== Number(expectedRevision)) throw new Error('REVISION_CONFLICT');
  const rejected = { ...mutation, status: 'private', updatedAt: Date.now() };
  await update(ref(database, `${PROFILE_MUTATIONS_ROOT}/${cardId}`), rejected);
  return rejected;
};
