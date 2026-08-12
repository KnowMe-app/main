import { get, push, ref, runTransaction, update } from 'firebase/database';

import { database, syncUserSearchKeyIndex } from 'components/config';
import { buildOverlayFromDraft } from './multiAccountEdits';
import {
  SEARCH_ID_INDEXED_FIELDS,
  buildSearchIdRecordKey,
} from './searchKeyUtils';

export const PROFILE_MUTATIONS_ROOT = 'multiData/profileMutations';
export const PROFILE_IDENTITY_CLAIMS_ROOT = 'multiData/profileIdentityClaims';
export const PROFILE_MUTATION_HISTORY_ROOT = 'multiData/profileMutationHistory';

export const getProfileMutationPath = (creatorUid, cardId) => (
  `${PROFILE_MUTATIONS_ROOT}/${creatorUid}${cardId ? `/${cardId}` : ''}`
);

export const getProfileIdentityClaimPath = claimKey => (
  `${PROFILE_IDENTITY_CLAIMS_ROOT}/${claimKey}`
);

export const getProfileMutationHistoryPath = cardId => (
  `${PROFILE_MUTATION_HISTORY_ROOT}/${cardId}`
);

const cleanObject = value => Object.entries(value || {}).reduce((result, [key, item]) => {
  if (key.startsWith('__') || item === undefined) return result;
  result[key] = item;
  return result;
}, {});

export const buildProfileRevisionHistory = ({ cardId, actorUid, previousData, nextData, at, revision }) => (
  Object.entries(buildOverlayFromDraft(previousData || {}, nextData || {}))
    .map(([fieldName, change]) => ({
      cardId,
      actorUid,
      editorUserId: actorUid,
      action: 'edit',
      fieldName,
      change,
      at,
      revision,
    }))
);

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

const hashKey = value => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

// RTDB limits a child key to 768 UTF-8 bytes. Claims need only be stable and
// collision-resistant within their field, so bound pathological form values.
const getIdentityClaimKey = key => (
  new TextEncoder().encode(key).length <= 700 ? key : `${key.split('_', 1)[0]}_hash_${hashKey(key)}`
);

const appendIndexId = (value, cardId) => {
  const ids = (Array.isArray(value) ? value : [value]).filter(Boolean);
  if (!ids.includes(cardId)) ids.push(cardId);
  return ids.length === 1 ? ids[0] : ids;
};

const claimProfileIdentities = async ({ cardId, data }) => {
  const searchKeys = getSearchIdKeys(data, { contactsOnly: true });
  const keys = searchKeys.map(getIdentityClaimKey);
  const indexedValues = await Promise.all(searchKeys
    .filter(key => new TextEncoder().encode(key).length <= 768)
    .map(key => get(ref(database, `searchId/${key}`))));
  const canonicalConflict = indexedValues.some(snapshot => {
    const value = snapshot.val();
    return (Array.isArray(value) ? value : [value]).filter(Boolean).some(id => id !== cardId);
  });
  if (canonicalConflict) throw new Error('DUPLICATE_PROFILE');
  const acquiredKeys = [];
  try {
    for (const key of keys) {
      const claimRef = ref(database, getProfileIdentityClaimPath(key));
      const existingSnapshot = await get(claimRef);
      const alreadyOwned = existingSnapshot.val() === cardId;
      let duplicate = false;
      const result = await runTransaction(claimRef, current => {
        if (current != null && current !== cardId) {
          duplicate = true;
          return undefined;
        }
        return cardId;
      }, { applyLocally: false });
      if (!result.committed) throw new Error(duplicate ? 'DUPLICATE_PROFILE' : 'REVISION_CONFLICT');
      if (!alreadyOwned) acquiredKeys.push(key);
    }
  } catch (error) {
    await releaseProfileIdentities(cardId, acquiredKeys).catch(() => {});
    throw error;
  }
  return { keys, acquiredKeys };
};

const releaseProfileIdentities = (cardId, keys) => Promise.all((keys || []).map(key => runTransaction(
  ref(database, getProfileIdentityClaimPath(key)),
  current => (current === cardId ? null : current),
  { applyLocally: false },
)));

const syncProfileSearchIdIndex = (cardId, profile) => Promise.all(
  getSearchIdKeys(profile)
    .filter(key => new TextEncoder().encode(key).length <= 768)
    .map(key => runTransaction(ref(database, `searchId/${key}`), current => appendIndexId(current, cardId), {
      applyLocally: false,
    })),
);

export const saveCreateProfileMutation = async ({ cardId, creatorUid, actorUid, data, expectedRevision }) => {
  if (!cardId || !creatorUid || !actorUid) throw new Error('cardId, creatorUid and actorUid are required');
  let identityKeys;
  let acquiredIdentityKeys;
  try {
    ({ keys: identityKeys, acquiredKeys: acquiredIdentityKeys } = await claimProfileIdentities({ cardId, data }));
  } catch (error) {
    error.profileSaveStage = 'identity-claim';
    throw error;
  }
  let conflict = '';
  let previousIdentityKeys = [];
  let revisionHistory = [];
  let result;
  try {
    result = await runTransaction(ref(database, getProfileMutationPath(creatorUid, cardId)), current => {
      previousIdentityKeys = current?.identityKeys || [];
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
      const revision = Number(current?.revision || 0) + 1;
      // Use the same normalization/diff representation as editor overlays so
      // both audit streams can be rendered by the same admin UI.
      revisionHistory = buildProfileRevisionHistory({
        cardId,
        actorUid,
        previousData: current?.data,
        nextData: data,
        at: now,
        revision,
      });
      return {
        cardId,
        operation: 'create',
        data: { ...cleanObject(data), userId: cardId },
        createdBy: creatorUid,
        createdAt: current?.createdAt || now,
        updatedAt: now,
        revision,
        status: 'pendingReview',
        identityKeys,
      };
    }, { applyLocally: false });
  } catch (error) {
    await releaseProfileIdentities(cardId, acquiredIdentityKeys).catch(() => {});
    error.profileSaveStage = 'profile-mutation';
    throw error;
  }
  if (!result.committed) {
    // Only keys absent from the durable draft were acquired by this failed save.
    const existing = result.snapshot.val();
    const newlyClaimed = identityKeys.filter(key => !(existing?.identityKeys || []).includes(key));
    await releaseProfileIdentities(cardId, newlyClaimed);
    throw new Error(conflict || 'REVISION_CONFLICT');
  }
  const mutation = result.snapshot.val();
  if (revisionHistory.length) {
    const historyRef = ref(database, getProfileMutationHistoryPath(cardId));
    const historyUpdates = revisionHistory.reduce((entries, entry) => {
      const key = push(historyRef).key;
      if (key) entries[key] = entry;
      return entries;
    }, {});
    if (Object.keys(historyUpdates).length) await update(historyRef, historyUpdates);
  }
  // Cleanup is idempotent bookkeeping after the revision is already committed.
  releaseProfileIdentities(cardId, previousIdentityKeys.filter(key => !identityKeys.includes(key))).catch(() => {});
  return mutation;
};

// Admin-only reader. Its shape intentionally matches overlay history.
export const loadProfileMutationHistory = async cardId => {
  if (!cardId) return [];
  const snapshot = await get(ref(database, getProfileMutationHistoryPath(cardId)));
  if (!snapshot.exists()) return [];
  return Object.entries(snapshot.val() || {})
    .filter(([, entry]) => entry && typeof entry === 'object' && !Array.isArray(entry))
    .map(([entryId, entry]) => ({ entryId: `revision-${entryId}`, ...entry }))
    .sort((a, b) => Number(b.at || 0) - Number(a.at || 0));
};

export const loadProfileMutation = async (creatorUid, cardId) => {
  if (!creatorUid || !cardId) return null;
  const snapshot = await get(ref(database, getProfileMutationPath(creatorUid, cardId)));
  return snapshot.exists() ? snapshot.val() : null;
};

export const loadOwnProfileMutations = async creatorUid => {
  if (!creatorUid) return [];
  const snapshot = await get(ref(database, getProfileMutationPath(creatorUid)));
  if (!snapshot.exists()) return [];
  return Object.values(snapshot.val() || {}).filter(item => (
    item && item.createdBy === creatorUid && item.status !== 'accepted'
  ));
};

// Drafts somebody else created that this user may open and edit. Only cards
// still waiting for review are shared: a draft an admin sent back to
// `private` belongs to its author again, and an accepted one is a normal
// card. Editing one of these never writes to the author's node - the edits
// land in the editor's own overlay (multiData/edits/{cardId}/{editorUid}).
export const loadSharedProfileMutations = async viewerUid => {
  const snapshot = await get(ref(database, PROFILE_MUTATIONS_ROOT));
  if (!snapshot.exists()) return [];
  return Object.values(snapshot.val() || {}).flatMap(creatorMutations => (
    Object.values(creatorMutations || {})
  )).filter(item => (
    item?.operation === 'create'
    && item.status === 'pendingReview'
    && item.createdBy
    && item.createdBy !== viewerUid
  ));
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
  return Object.values(snapshot.val() || {}).flatMap(creatorMutations => (
    Object.values(creatorMutations || {})
  )).filter(item => (
    item?.operation === 'create' && item.status !== 'accepted' && item.status !== 'accepting'
  ));
};

export const acceptCreateProfileMutation = async ({ cardId, creatorUid, expectedRevision, finalData }) => {
  if (!cardId || !creatorUid) throw new Error('cardId and creatorUid are required');
  const acceptedAt = Date.now();
  let conflict = 'Profile mutation not found';
  let acceptedProfile = null;
  const mutationPath = getProfileMutationPath(creatorUid, cardId);
  const mutationSnapshot = await get(ref(database, mutationPath));
  const pendingMutation = mutationSnapshot.val();
  if (!pendingMutation || pendingMutation.operation !== 'create') throw new Error(conflict);
  const candidateProfile = { ...cleanObject(finalData || pendingMutation.data), userId: cardId };
  const { keys: identityKeys, acquiredKeys: acquiredIdentityKeys } = await claimProfileIdentities({
    cardId,
    data: candidateProfile,
  });
  const previousIdentityKeys = pendingMutation.identityKeys || [];
  let result;
  try {
    result = await runTransaction(ref(database, mutationPath), mutation => {
      if (!mutation || mutation.operation !== 'create') return undefined;
      if (mutation.status !== 'pendingReview' && mutation.status !== 'private' && mutation.status !== 'publishing') return undefined;
      if (Number(mutation.revision) !== Number(expectedRevision)) {
        conflict = 'REVISION_CONFLICT';
        return undefined;
      }
      acceptedProfile = { ...cleanObject(finalData || mutation.data), userId: cardId };
      return { ...mutation, data: acceptedProfile, identityKeys, status: 'publishing', acceptedAt };
    }, { applyLocally: false });
  } catch (error) {
    await releaseProfileIdentities(cardId, acquiredIdentityKeys).catch(() => {});
    throw error;
  }
  if (!result.committed) {
    await releaseProfileIdentities(cardId, identityKeys.filter(key => !previousIdentityKeys.includes(key)));
    throw new Error(conflict);
  }
  const mutation = result.snapshot.val();
  // Finish all fallible index work before the single publication update. A
  // publishing record is deliberately retryable after an interrupted attempt.
  try {
    await Promise.all([
      syncProfileSearchIdIndex(cardId, acceptedProfile),
      syncUserSearchKeyIndex(cardId, {}, acceptedProfile),
    ]);
  } catch (error) {
    await runTransaction(ref(database, mutationPath), current => (
      current?.status === 'publishing' && current?.acceptedAt === acceptedAt
        ? { ...current, status: pendingMutation.status, acceptedAt: null }
        : current
    ), { applyLocally: false });
    throw error;
  }
  await update(ref(database), {
    [`newUsers/${cardId}`]: acceptedProfile,
    [`users/${mutation.createdBy}/createdProfileCardIds/${cardId}`]: true,
    [mutationPath]: { ...mutation, status: 'accepted' },
  });
  releaseProfileIdentities(cardId, previousIdentityKeys.filter(key => !identityKeys.includes(key))).catch(() => {});
  return acceptedProfile;
};

export const rejectCreateProfileMutation = async ({ cardId, creatorUid, expectedRevision }) => {
  if (!cardId || !creatorUid) throw new Error('cardId and creatorUid are required');
  let conflict = 'Profile mutation not found';
  const result = await runTransaction(ref(database, getProfileMutationPath(creatorUid, cardId)), mutation => {
    if (!mutation) return undefined;
    if (mutation.status !== 'pendingReview') return undefined;
    if (Number(mutation.revision) !== Number(expectedRevision)) {
      conflict = 'REVISION_CONFLICT';
      return undefined;
    }
    return { ...mutation, status: 'private', revision: Number(mutation.revision || 0) + 1, updatedAt: Date.now() };
  }, { applyLocally: false });
  if (!result.committed) throw new Error(conflict);
  const mutation = result.snapshot.val();
  releaseProfileIdentities(cardId, mutation.identityKeys || []).catch(() => {});
  return mutation;
};
