import { get, push, ref, runTransaction, update } from 'firebase/database';

import { database, syncUserSearchKeyIndex } from 'components/config';
import {
  SEARCH_ID_INDEXED_FIELDS,
  buildSearchIdRecordKey,
} from './searchKeyUtils';
import { isAdminUid } from './accessLevel';
import { MULTI_DATA_ACCESS_FIELD } from './multiDataAccess';

// One root for creation drafts, nested by creator - multiData/profileMutations/{creatorUid}/{cardId} -
// the same shape as multiData/edits/{cardUserId}/{editorUserId}. Nesting by
// creator (rather than a flat multiData/profileMutations/{cardId}) is what
// lets RTDB rules scope reads to "your own drafts": a flat collection can
// only be read-scoped per owner by an indexed query, and RTDB queries can't
// be filtered per-row by security rules - the .read grant for a query is
// evaluated once at the queried location, so it would have to allow every
// approved creator to read everyone else's drafts. A direct get() on your
// own nested path doesn't have that problem.
export const PROFILE_MUTATIONS_ROOT = 'multiData/profileMutations';
// Keyed by contact value (email/phone/...), not by creator or card - claiming
// one atomically ("grab this email iff nobody else has it") needs a node
// addressed by that value, which a per-creator tree can't provide.
export const PROFILE_IDENTITY_CLAIMS_ROOT = 'multiData/profileIdentityClaims';

const cleanObject = value => Object.entries(value || {}).reduce((result, [key, item]) => {
  if (key.startsWith('__') || item === undefined) return result;
  result[key] = item;
  return result;
}, {});

// Non-admin creators only ever reach saveCreateProfileMutation through the
// create-profile form, which already hides these fields from them - this
// enforces the same rule again where the draft is actually written, so a
// forged client call can't smuggle elevated access into a card that later
// gets merged verbatim into newUsers on accept.
const PRIVILEGED_PROFILE_FIELDS = new Set([
  'accessLevel',
  'canCreateProfiles',
  'additionalAccessRules',
  MULTI_DATA_ACCESS_FIELD,
]);

const stripPrivilegedFields = data => Object.entries(data || {}).reduce((result, [key, value]) => {
  if (PRIVILEGED_PROFILE_FIELDS.has(key)) return result;
  result[key] = value;
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

  let duplicate = false;
  const result = await runTransaction(ref(database, PROFILE_IDENTITY_CLAIMS_ROOT), current => {
    const claims = current || {};
    if (keys.some(key => claims[key] && claims[key] !== cardId)) {
      duplicate = true;
      return undefined;
    }
    return keys.reduce((next, key) => ({ ...next, [key]: cardId }), { ...claims });
  }, { applyLocally: false });
  if (!result.committed) throw new Error(duplicate ? 'DUPLICATE_PROFILE' : 'REVISION_CONFLICT');
  return keys;
};

const releaseProfileIdentities = (cardId, keys) => runTransaction(
  ref(database, PROFILE_IDENTITY_CLAIMS_ROOT),
  current => (keys || []).reduce((next, key) => {
    if (next[key] === cardId) delete next[key];
    return next;
  }, { ...(current || {}) }),
  { applyLocally: false },
);

const syncProfileSearchIdIndex = (cardId, profile) => Promise.all(
  getSearchIdKeys(profile)
    .filter(key => new TextEncoder().encode(key).length <= 768)
    .map(key => runTransaction(ref(database, `searchId/${key}`), current => appendIndexId(current, cardId), {
      applyLocally: false,
    })),
);

export const saveCreateProfileMutation = async ({ cardId, creatorUid, actorUid, data, expectedRevision }) => {
  if (!cardId || !creatorUid) throw new Error('cardId and creatorUid are required');
  // The acting editor (who may be an admin fixing up someone else's draft
  // before accepting it) determines whether privileged fields survive, not
  // the draft's original owner - a non-admin creatorUid must never let an
  // admin's own technical-field edits get silently stripped.
  const sanitizedData = isAdminUid(actorUid || creatorUid) ? (data || {}) : stripPrivilegedFields(data);
  const identityKeys = await claimProfileIdentities({ cardId, data: sanitizedData });
  let conflict = '';
  let previousIdentityKeys = [];
  const result = await runTransaction(ref(database, `${PROFILE_MUTATIONS_ROOT}/${creatorUid}/${cardId}`), current => {
    previousIdentityKeys = current?.identityKeys || [];
    if (current && current.status !== 'pendingReview' && current.status !== 'private') {
      conflict = 'REVISION_CONFLICT';
      return undefined;
    }
    if (current && expectedRevision != null && Number(current.revision) !== Number(expectedRevision)) {
      conflict = 'REVISION_CONFLICT';
      return undefined;
    }
    const now = Date.now();
    const mutation = {
      cardId,
      operation: 'create',
      data: { ...cleanObject(sanitizedData), userId: cardId },
      createdBy: creatorUid,
      createdAt: current?.createdAt || now,
      updatedAt: now,
      revision: Number(current?.revision || 0) + 1,
      status: 'pendingReview',
      identityKeys,
    };
    return mutation;
  }, { applyLocally: false });
  if (!result.committed) {
    // Only keys absent from the durable draft were acquired by this failed save.
    const existing = result.snapshot.val();
    const newlyClaimed = identityKeys.filter(key => !(existing?.identityKeys || []).includes(key));
    await releaseProfileIdentities(cardId, newlyClaimed);
    throw new Error(conflict || 'REVISION_CONFLICT');
  }
  const mutation = result.snapshot.val();
  // Cleanup is idempotent bookkeeping after the revision is already committed.
  releaseProfileIdentities(cardId, previousIdentityKeys.filter(key => !identityKeys.includes(key))).catch(() => {});
  return mutation;
};

export const loadOwnProfileMutations = async creatorUid => {
  if (!creatorUid) return [];
  const snapshot = await get(ref(database, `${PROFILE_MUTATIONS_ROOT}/${creatorUid}`));
  if (!snapshot.exists()) return [];
  return Object.values(snapshot.val() || {}).filter(item => item && item.status !== 'accepted');
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
  const byCreator = Object.values(snapshot.val() || {});
  return byCreator
    .flatMap(bucket => Object.values(bucket || {}))
    .filter(item => item?.operation === 'create' && item.status !== 'accepted' && item.status !== 'accepting');
};

export const acceptCreateProfileMutation = async ({ cardId, creatorUid, expectedRevision, finalData }) => {
  if (!cardId || !creatorUid) throw new Error('cardId and creatorUid are required');
  const acceptedAt = Date.now();
  let conflict = 'Profile mutation not found';
  let acceptedProfile = null;
  const mutationRef = ref(database, `${PROFILE_MUTATIONS_ROOT}/${creatorUid}/${cardId}`);
  const mutationSnapshot = await get(mutationRef);
  const pendingMutation = mutationSnapshot.val();
  if (!pendingMutation || pendingMutation.operation !== 'create') throw new Error(conflict);
  const candidateProfile = { ...cleanObject(finalData || pendingMutation.data), userId: cardId };
  const identityKeys = await claimProfileIdentities({ cardId, data: candidateProfile });
  const previousIdentityKeys = pendingMutation.identityKeys || [];
  const result = await runTransaction(mutationRef, mutation => {
    if (!mutation || mutation.operation !== 'create') return undefined;
    if (mutation.status !== 'pendingReview' && mutation.status !== 'private' && mutation.status !== 'publishing') return undefined;
    if (Number(mutation.revision) !== Number(expectedRevision)) {
      conflict = 'REVISION_CONFLICT';
      return undefined;
    }
    acceptedProfile = { ...cleanObject(finalData || mutation.data), userId: cardId };
    return { ...mutation, data: acceptedProfile, identityKeys, status: 'publishing', acceptedAt };
  }, { applyLocally: false });
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
    await runTransaction(mutationRef, current => (
      current?.status === 'publishing' && current?.acceptedAt === acceptedAt
        ? { ...current, status: pendingMutation.status, acceptedAt: null }
        : current
    ), { applyLocally: false });
    throw error;
  }
  await update(ref(database), {
    [`newUsers/${cardId}`]: acceptedProfile,
    [`users/${creatorUid}/createdProfileCardIds/${cardId}`]: true,
    [`${PROFILE_MUTATIONS_ROOT}/${creatorUid}/${cardId}`]: { ...mutation, status: 'accepted' },
  });
  releaseProfileIdentities(cardId, previousIdentityKeys.filter(key => !identityKeys.includes(key))).catch(() => {});
  return acceptedProfile;
};

export const rejectCreateProfileMutation = async ({ cardId, creatorUid, expectedRevision }) => {
  if (!cardId || !creatorUid) throw new Error('cardId and creatorUid are required');
  let conflict = 'Profile mutation not found';
  const result = await runTransaction(ref(database, `${PROFILE_MUTATIONS_ROOT}/${creatorUid}/${cardId}`), mutation => {
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
