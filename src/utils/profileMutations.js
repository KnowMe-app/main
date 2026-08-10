import { get, push, ref, runTransaction, update } from 'firebase/database';

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

const claimProfileIdentities = async ({ cardId, data }) => {
  const claims = getSearchIdKeys(data, { contactsOnly: true });
  const acquired = [];
  try {
    for (const claim of claims) {
      // Existing canonical profiles predate the reservation table, so consult the
      // established exact-search index before attempting the atomic claim.
      // eslint-disable-next-line no-await-in-loop
      const indexed = await get(ref(database, `searchId/${claim}`));
      if (indexed.exists()) {
        const indexedIds = Array.isArray(indexed.val()) ? indexed.val() : [indexed.val()];
        if (indexedIds.some(id => id && id !== cardId)) throw new Error('DUPLICATE_PROFILE');
      }
      let alreadyOwned = false;
      // A claim is a durable reservation: accepted cards continue to block duplicates.
      // eslint-disable-next-line no-await-in-loop
      const result = await runTransaction(ref(database, `${PROFILE_IDENTITY_CLAIMS_ROOT}/${claim}`), current => {
        alreadyOwned = current === cardId;
        return current == null || alreadyOwned ? cardId : undefined;
      }, { applyLocally: false });
      if (!result.committed) throw new Error('DUPLICATE_PROFILE');
      if (!alreadyOwned) acquired.push(claim);
    }
  } catch (error) {
    await Promise.all(acquired.map(claim => runTransaction(
      ref(database, `${PROFILE_IDENTITY_CLAIMS_ROOT}/${claim}`),
      current => current === cardId ? null : current,
      { applyLocally: false },
    )));
    throw error;
  }
  return { claims, acquired };
};

const releaseProfileIdentities = (cardId, claims) => Promise.all(claims.map(claim => runTransaction(
  ref(database, `${PROFILE_IDENTITY_CLAIMS_ROOT}/${claim}`),
  current => current === cardId ? null : current,
  { applyLocally: false },
)));

const syncProfileSearchIdIndex = (cardId, profile) => Promise.all(getSearchIdKeys(profile).map(key => runTransaction(
  ref(database, `searchId/${key}`),
  current => {
    const ids = (Array.isArray(current) ? current : [current]).filter(Boolean);
    if (ids.includes(cardId)) return current;
    const next = [...ids, cardId];
    return next.length === 1 ? next[0] : next;
  },
  { applyLocally: false },
)));

export const saveCreateProfileMutation = async ({ cardId, creatorUid, data, expectedRevision }) => {
  if (!cardId || !creatorUid) throw new Error('cardId and creatorUid are required');
  const mutationRef = ref(database, `${PROFILE_MUTATIONS_ROOT}/${cardId}`);
  const { acquired } = await claimProfileIdentities({ cardId, data });
  let conflict = '';
  const result = await runTransaction(mutationRef, current => {
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
    const now = Date.now();
    return {
      cardId,
      operation: 'create',
      data: { ...cleanObject(data), userId: cardId },
      createdBy: creatorUid,
      createdAt: current?.createdAt || now,
      updatedAt: now,
      revision: Number(current?.revision || 0) + 1,
      status: 'pendingReview',
    };
  }, { applyLocally: false });
  if (!result.committed) {
    await releaseProfileIdentities(cardId, acquired);
    throw new Error(conflict || 'REVISION_CONFLICT');
  }
  await update(ref(database, `profileMutationsByCreator/${creatorUid}`), { [cardId]: true });
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
  return Object.values(snapshot.val() || {}).filter(item => (
    item?.operation === 'create' && item.status !== 'accepted' && item.status !== 'accepting'
  ));
};

export const acceptCreateProfileMutation = async ({ cardId, expectedRevision, finalData }) => {
  const acceptedAt = Date.now();
  let conflict = 'Profile mutation not found';
  const result = await runTransaction(ref(database, `${PROFILE_MUTATIONS_ROOT}/${cardId}`), mutation => {
    if (!mutation || mutation.operation !== 'create') return undefined;
    if (mutation.status !== 'pendingReview' && mutation.status !== 'private') return undefined;
    if (Number(mutation.revision) !== Number(expectedRevision)) {
      conflict = 'REVISION_CONFLICT';
      return undefined;
    }
    return { ...mutation, status: 'accepting', acceptedAt };
  }, { applyLocally: false });
  if (!result.committed) throw new Error(conflict);
  const mutation = result.snapshot.val();
  const profile = { ...cleanObject(finalData || mutation.data), userId: cardId };
  try {
    await claimProfileIdentities({ cardId, data: profile });
  } catch (error) {
    await runTransaction(ref(database, `${PROFILE_MUTATIONS_ROOT}/${cardId}`), current => (
      current?.status === 'accepting' && current?.acceptedAt === acceptedAt
        ? { ...current, status: 'pendingReview', acceptedAt: null }
        : current
    ), { applyLocally: false });
    throw error;
  }
  await update(ref(database), {
    [`newUsers/${cardId}`]: profile,
    [`users/${mutation.createdBy}/createdProfileCardIds/${cardId}`]: true,
    [`${PROFILE_MUTATION_HISTORY_ROOT}/${cardId}`]: { ...mutation, data: profile, status: 'accepted', acceptedAt },
    [`${PROFILE_MUTATIONS_ROOT}/${cardId}`]: { ...mutation, data: profile, status: 'accepted', acceptedAt },
    [`profileMutationsByCreator/${mutation.createdBy}/${cardId}`]: null,
  });
  await Promise.all([
    syncProfileSearchIdIndex(cardId, profile),
    syncUserSearchKeyIndex(cardId, {}, profile),
  ]);
  return profile;
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
