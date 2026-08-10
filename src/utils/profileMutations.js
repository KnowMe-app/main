import { equalTo, get, orderByChild, push, query, ref, runTransaction, update } from 'firebase/database';

import { database, syncUserSearchKeyIndex } from 'components/config';
import {
  SEARCH_ID_INDEXED_FIELDS,
  buildSearchIdRecordKey,
} from './searchKeyUtils';
import { isAdminUid } from './accessLevel';
import { MULTI_DATA_ACCESS_FIELD } from './multiDataAccess';

// Only two roots for this feature, same as multiData/edits is the only root
// for the edit-overlay feature:
// - PROFILE_MUTATIONS_ROOT holds the actual draft records, one per cardId.
//   "My own drafts" is answered with an indexed orderByChild('createdBy')
//   query instead of hand-maintaining a separate reverse-index root.
// - PROFILE_IDENTITY_CLAIMS_ROOT can't be folded into the above: it's keyed
//   by contact value (email/phone/...), not by cardId, because claiming one
//   atomically (via runTransaction, "grab this email iff nobody else has
//   it") needs a node addressed by that value - a query can list matches
//   but can't give you an atomic compare-and-swap across them.
// A prior "profileMutationHistory" root that mirrored the same record a
// second time on accept, and a "profileMutationsByCreator" reverse-index,
// were both dropped: nothing ever read the history copy, and the indexed
// query above replaces the reverse-index.
export const PROFILE_MUTATIONS_ROOT = 'multiData/profileMutations';
export const PROFILE_IDENTITY_CLAIMS_ROOT = 'multiData/profileIdentityClaims';

// Drafts saved before this migration still live under these top-level roots
// (no multiData/ prefix). Nothing here ever writes brand-new records to them
// again, but existing records are read from - and, while being edited/
// accepted/rejected in place, written back to - whichever root actually
// holds them, so no pre-migration draft silently disappears or loses its
// duplicate-identity protection. reserveProfileCardId() only ever mints keys
// under the new root, so a cardId with no record in either root resolves to
// the new one.
const LEGACY_PROFILE_MUTATIONS_ROOT = 'profileMutations';
const LEGACY_PROFILE_IDENTITY_CLAIMS_ROOT = 'profileIdentityClaims';

const cleanObject = value => Object.entries(value || {}).reduce((result, [key, item]) => {
  if (key.startsWith('__') || item === undefined) return result;
  result[key] = item;
  return result;
}, {});

// Non-admin creators only ever reach saveCreateProfileMutation through
// ProfileForm, which already hides these fields from them - this enforces
// the same rule again where the draft is actually written, so a forged
// client call can't smuggle elevated access into a card that later gets
// merged verbatim into newUsers on accept.
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

  // Drafts saved before the multiData/ migration still hold their identity
  // claims under the legacy root - check it too so a brand-new submission
  // can't grab an email/phone/etc. a not-yet-migrated legacy draft already owns.
  const legacyClaimsSnapshot = await get(ref(database, LEGACY_PROFILE_IDENTITY_CLAIMS_ROOT));
  const legacyClaims = legacyClaimsSnapshot.val() || {};
  if (keys.some(key => legacyClaims[key] && legacyClaims[key] !== cardId)) {
    throw new Error('DUPLICATE_PROFILE');
  }

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

const releaseIdentitiesFromRoot = (root, cardId, keys) => runTransaction(
  ref(database, root),
  current => (keys || []).reduce((next, key) => {
    if (next[key] === cardId) delete next[key];
    return next;
  }, { ...(current || {}) }),
  { applyLocally: false },
);

// Releases from both roots unconditionally (a no-op on whichever root never
// held the key) rather than tracking which root each key was claimed under -
// simpler, and correct either way since a legacy draft's claims live in the
// legacy root while every claim taken going forward lives in the new one.
const releaseProfileIdentities = (cardId, keys) => Promise.all([
  releaseIdentitiesFromRoot(PROFILE_IDENTITY_CLAIMS_ROOT, cardId, keys),
  releaseIdentitiesFromRoot(LEGACY_PROFILE_IDENTITY_CLAIMS_ROOT, cardId, keys),
]);

const syncProfileSearchIdIndex = (cardId, profile) => Promise.all(
  getSearchIdKeys(profile)
    .filter(key => new TextEncoder().encode(key).length <= 768)
    .map(key => runTransaction(ref(database, `searchId/${key}`), current => appendIndexId(current, cardId), {
      applyLocally: false,
    })),
);

// A cardId with no record in either root (i.e. a freshly reserved one)
// resolves to the new root, so every genuinely new draft lands in multiData/
// straight away. An existing record - legacy or already-migrated - is read
// from and, by every caller below, subsequently written back to the same
// root it was found in, so it keeps working right where it already lives.
const resolveMutationRootForCardId = async cardId => {
  const newSnapshot = await get(ref(database, `${PROFILE_MUTATIONS_ROOT}/${cardId}`));
  if (newSnapshot.exists()) return { root: PROFILE_MUTATIONS_ROOT, snapshot: newSnapshot };
  const legacySnapshot = await get(ref(database, `${LEGACY_PROFILE_MUTATIONS_ROOT}/${cardId}`));
  if (legacySnapshot.exists()) return { root: LEGACY_PROFILE_MUTATIONS_ROOT, snapshot: legacySnapshot };
  return { root: PROFILE_MUTATIONS_ROOT, snapshot: newSnapshot };
};

export const saveCreateProfileMutation = async ({ cardId, creatorUid, actorUid, data, expectedRevision }) => {
  if (!cardId || !creatorUid) throw new Error('cardId and creatorUid are required');
  // The acting editor (who may be an admin fixing up someone else's draft
  // before accepting it) determines whether privileged fields survive, not
  // the draft's original owner - a non-admin creatorUid must never let an
  // admin's own technical-field edits get silently stripped.
  const sanitizedData = isAdminUid(actorUid || creatorUid) ? (data || {}) : stripPrivilegedFields(data);
  const { root: mutationRoot } = await resolveMutationRootForCardId(cardId);
  const identityKeys = await claimProfileIdentities({ cardId, data: sanitizedData });
  let conflict = '';
  let previousIdentityKeys = [];
  const result = await runTransaction(ref(database, `${mutationRoot}/${cardId}`), current => {
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

export const loadProfileMutation = async cardId => {
  const { snapshot } = await resolveMutationRootForCardId(cardId);
  return snapshot.exists() ? snapshot.val() : null;
};

const queryByCreator = (root, creatorUid) => get(
  query(ref(database, root), orderByChild('createdBy'), equalTo(creatorUid)),
);

export const loadOwnProfileMutations = async creatorUid => {
  if (!creatorUid) return [];
  const [snapshot, legacySnapshot] = await Promise.all([
    queryByCreator(PROFILE_MUTATIONS_ROOT, creatorUid),
    queryByCreator(LEGACY_PROFILE_MUTATIONS_ROOT, creatorUid),
  ]);
  const byCardId = new Map();
  Object.values(legacySnapshot.exists() ? legacySnapshot.val() || {} : {}).forEach(item => {
    if (item?.cardId) byCardId.set(item.cardId, item);
  });
  Object.values(snapshot.exists() ? snapshot.val() || {} : {}).forEach(item => {
    if (item?.cardId) byCardId.set(item.cardId, item);
  });
  return [...byCardId.values()].filter(item => item.status !== 'accepted');
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
  const [snapshot, legacySnapshot] = await Promise.all([
    get(ref(database, PROFILE_MUTATIONS_ROOT)),
    get(ref(database, LEGACY_PROFILE_MUTATIONS_ROOT)),
  ]);
  const byCardId = new Map();
  Object.values(legacySnapshot.exists() ? legacySnapshot.val() || {} : {}).forEach(item => {
    if (item?.cardId) byCardId.set(item.cardId, item);
  });
  Object.values(snapshot.exists() ? snapshot.val() || {} : {}).forEach(item => {
    if (item?.cardId) byCardId.set(item.cardId, item);
  });
  return [...byCardId.values()].filter(item => (
    item?.operation === 'create' && item.status !== 'accepted' && item.status !== 'accepting'
  ));
};

export const acceptCreateProfileMutation = async ({ cardId, expectedRevision, finalData }) => {
  const acceptedAt = Date.now();
  let conflict = 'Profile mutation not found';
  let acceptedProfile = null;
  const { root: mutationRoot, snapshot: mutationSnapshot } = await resolveMutationRootForCardId(cardId);
  const pendingMutation = mutationSnapshot.val();
  if (!pendingMutation || pendingMutation.operation !== 'create') throw new Error(conflict);
  const candidateProfile = { ...cleanObject(finalData || pendingMutation.data), userId: cardId };
  const identityKeys = await claimProfileIdentities({ cardId, data: candidateProfile });
  const previousIdentityKeys = pendingMutation.identityKeys || [];
  const result = await runTransaction(ref(database, `${mutationRoot}/${cardId}`), mutation => {
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
    await runTransaction(ref(database, `${mutationRoot}/${cardId}`), current => (
      current?.status === 'publishing' && current?.acceptedAt === acceptedAt
        ? { ...current, status: pendingMutation.status, acceptedAt: null }
        : current
    ), { applyLocally: false });
    throw error;
  }
  await update(ref(database), {
    [`newUsers/${cardId}`]: acceptedProfile,
    [`users/${mutation.createdBy}/createdProfileCardIds/${cardId}`]: true,
    [`${mutationRoot}/${cardId}`]: { ...mutation, status: 'accepted' },
  });
  releaseProfileIdentities(cardId, previousIdentityKeys.filter(key => !identityKeys.includes(key))).catch(() => {});
  return acceptedProfile;
};

export const rejectCreateProfileMutation = async ({ cardId, expectedRevision }) => {
  let conflict = 'Profile mutation not found';
  const { root: mutationRoot } = await resolveMutationRootForCardId(cardId);
  const result = await runTransaction(ref(database, `${mutationRoot}/${cardId}`), mutation => {
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
