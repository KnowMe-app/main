import { get, push, ref, update } from 'firebase/database';

import { database } from 'components/config';

export const PROFILE_MUTATIONS_ROOT = 'profileMutations';
export const PROFILE_MUTATION_HISTORY_ROOT = 'profileMutationHistory';

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

export const saveCreateProfileMutation = async ({ cardId, creatorUid, data, expectedRevision }) => {
  if (!cardId || !creatorUid) throw new Error('cardId and creatorUid are required');
  const mutationRef = ref(database, `${PROFILE_MUTATIONS_ROOT}/${cardId}`);
  const snapshot = await get(mutationRef);
  const current = snapshot.exists() ? snapshot.val() : null;

  if (current && current.createdBy !== creatorUid) throw new Error('Profile mutation belongs to another user');
  if (current && expectedRevision != null && Number(current.revision) !== Number(expectedRevision)) {
    throw new Error('REVISION_CONFLICT');
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
  };
  await update(ref(database), {
    [`${PROFILE_MUTATIONS_ROOT}/${cardId}`]: mutation,
    [`profileMutationsByCreator/${creatorUid}/${cardId}`]: true,
  });
  return mutation;
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
  const mutation = await loadProfileMutation(cardId);
  if (!mutation || mutation.operation !== 'create') throw new Error('Profile mutation not found');
  if (Number(mutation.revision) !== Number(expectedRevision)) throw new Error('REVISION_CONFLICT');

  const acceptedAt = Date.now();
  const profile = { ...cleanObject(finalData || mutation.data), userId: cardId };
  await update(ref(database), {
    [`newUsers/${cardId}`]: profile,
    [`users/${mutation.createdBy}/createdProfileCardIds/${cardId}`]: true,
    [`${PROFILE_MUTATION_HISTORY_ROOT}/${cardId}`]: { ...mutation, data: profile, status: 'accepted', acceptedAt },
    [`${PROFILE_MUTATIONS_ROOT}/${cardId}`]: null,
    [`profileMutationsByCreator/${mutation.createdBy}/${cardId}`]: null,
  });
  return profile;
};

export const rejectCreateProfileMutation = async ({ cardId, expectedRevision }) => {
  const mutation = await loadProfileMutation(cardId);
  if (!mutation) throw new Error('Profile mutation not found');
  if (Number(mutation.revision) !== Number(expectedRevision)) throw new Error('REVISION_CONFLICT');
  const rejected = { ...mutation, status: 'private', updatedAt: Date.now() };
  await update(ref(database, `${PROFILE_MUTATIONS_ROOT}/${cardId}`), rejected);
  return rejected;
};
