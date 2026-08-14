import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import styled from 'styled-components';
import {
  fetchUserById,
  updateDataInNewUsersRTDB,
  updateDataInRealtimeDB,
  updateDataInFiresoreDB,
  syncUserSearchIdIndex,
  fetchUserComment,
  saveMyCardComment,
  auth,
} from './config';
import { ProfileForm } from './ProfileForm';
import { makeUploadedInfo } from './makeUploadedInfo';
import { TopBlock } from './smallCard/renderTopBlock';
import StimulationSchedule from './StimulationSchedule';
import { coloredCard } from './styles';
import { KmPage, KmGhostButton } from './styles/knowme';
import { FaArrowLeft } from 'react-icons/fa';
import { updateCachedUser } from '../utils/cache';
import { getCard } from '../utils/cardIndex';
import {
  formatDateAndFormula,
  formatDateToDisplay,
  formatDateToServer,
} from 'components/inputValidations';
import { normalizeLastAction } from 'utils/normalizeLastAction';
import { normalizePhoneState } from './inputValidations';
import toast from 'react-hot-toast';
import { getEffectiveCycleStatus } from 'utils/cycleStatus';
import { isAdminUid } from 'utils/accessLevel';
import {
  acceptAllOverlaysForCard,
  acceptOverlayForUserCard,
  applyOverlayToCard,
  applyOverlaysToCard,
  buildOverlayFromDraft,
  getCardStorageCollection,
  getCanonicalCard,
  getOtherEditorsChangedFields,
  getOverlayHistoryForCard,
  getOverlaysForCard,
  removeAllOverlaysForCard,
  saveOverlayForUserCard,
} from 'utils/multiAccountEdits';

const Container = styled(KmPage)`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px;
  box-sizing: border-box;
  max-width: 560px;
  width: 100%;
  margin: 0 auto;
`;

const BackButton = styled(KmGhostButton)`
  align-self: flex-start;
  min-height: 36px;
  padding: 6px 14px;
  margin-bottom: 10px;
`;

const SkeletonCard = styled.div`
  width: 100%;
  border-radius: var(--km-radius);
  padding: 14px;
  margin-bottom: 8px;
  background: var(--km-card);
  border: 1px solid var(--km-border);
`;

const SkeletonLine = styled.div`
  height: ${props => props.height || 14}px;
  width: ${props => props.width || '100%'};
  border-radius: 8px;
  margin-bottom: 10px;
  background: linear-gradient(90deg, var(--km-border) 25%, var(--km-card) 50%, var(--km-border) 75%);
  background-size: 200% 100%;
  animation: skeletonPulse 1.2s ease-in-out infinite;

  @keyframes skeletonPulse {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }
`;

const OverlayReviewBar = styled.div`
  width: 100%;
  box-sizing: border-box;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  padding: 10px 12px;
  border: 1px solid var(--km-border);
  border-radius: var(--km-radius);
  background: var(--km-card);
  font-size: 13px;
`;

const OverlayReviewLabel = styled.span`
  flex: 1 1 160px;
  min-width: 0;
  color: var(--km-muted);
  font-weight: 700;
`;

const OverlayReviewButton = styled(KmGhostButton)`
  min-height: 32px;
  padding: 4px 12px;
  font-size: 13px;
`;

const OverlayHistoryList = styled.div`
  flex: 1 1 100%;
  display: grid;
  gap: 6px;
  margin-top: 4px;
  max-height: 220px;
  overflow-y: auto;
  color: var(--km-muted);
  font-size: 12px;
  line-height: 1.4;
  overflow-wrap: anywhere;
`;

const formatOverlayHistoryValue = value => {
  if (Array.isArray(value)) {
    const parts = value.map(item => String(item ?? '').trim()).filter(Boolean);
    return parts.length ? parts.join(', ') : '—';
  }
  const text = String(value ?? '').trim();
  return text || '—';
};

const describeOverlayHistoryChange = change => {
  if (!change || typeof change !== 'object') return '';
  if (change.discarded) return 'правку знято';
  if ('to' in change || 'from' in change) {
    return `${formatOverlayHistoryValue(change.from)} → ${formatOverlayHistoryValue(change.to)}`;
  }
  return [
    change.added?.length ? `+ ${formatOverlayHistoryValue(change.added)}` : '',
    change.removed?.length ? `− ${formatOverlayHistoryValue(change.removed)}` : '',
  ].filter(Boolean).join(' · ');
};

const OVERLAY_HISTORY_ACTION_LABELS = {
  edit: 'правка',
  accept: 'прийнято',
  discard: 'видалено',
};

const TopBlockSkeleton = () => (
  <SkeletonCard>
    <SkeletonLine width="30%" />
    <SkeletonLine width="45%" />
    <SkeletonLine width="82%" />
    <SkeletonLine width="65%" />
    <SkeletonLine width="40%" />
  </SkeletonCard>
);

const sanitizeOverlayValue = value => {
  if (Array.isArray(value)) {
    const normalized = value.map(item => sanitizeOverlayValue(item)).filter(item => item !== '');
    return normalized.join(', ');
  }

  if (value === null || value === undefined) return '';
  return String(value).trim();
};

const isEmptyOverlayValue = value => sanitizeOverlayValue(value) === '';
const technicalOverlayFields = new Set(['editor', 'cachedAt', 'lastAction', 'cacheVersion']);


const normalizeDeletedKeys = (...sources) => {
  const deleted = new Set();

  sources.forEach(source => {
    if (!source) return;

    if (Array.isArray(source)) {
      source.forEach(key => {
        if (key && key !== 'userId') deleted.add(String(key));
      });
      return;
    }

    if (source instanceof Set) {
      source.forEach(key => {
        if (key && key !== 'userId') deleted.add(String(key));
      });
      return;
    }

    if (typeof source === 'object') {
      Object.keys(source).forEach(key => {
        if (key && key !== 'userId') deleted.add(String(key));
      });
    }
  });

  return [...deleted];
};

const hasOwn = (object, key) =>
  Object.prototype.hasOwnProperty.call(object || {}, key);

const applyDeletedKeysToPayload = (payload, deletedKeys = []) => {
  deletedKeys.forEach(key => {
    if (key && key !== 'userId') {
      payload[key] = null;
    }
  });

  return payload;
};

const applyDeletedKeysToSnapshot = (snapshot, deletedKeys = []) => {
  const nextSnapshot = snapshot && typeof snapshot === 'object' ? { ...snapshot } : {};

  deletedKeys.forEach(key => {
    if (key && key !== 'userId') {
      delete nextSnapshot[key];
    }
  });

  return nextSnapshot;
};

const prepareSyncedSnapshot = (snapshot, deletedKeys = []) => {
  const cleaned = applyDeletedKeysToSnapshot(snapshot, deletedKeys);
  delete cleaned.cacheVersion;
  delete cleaned.cachedAt;

  return cleaned;
};

const DEBUG_PROFILE_SAVE = true;

const debugProfileSave = (step, data = {}) => {
  const isAllowedMode =
    process.env.NODE_ENV === 'development' ||
    process.env.NODE_ENV === 'test' ||
    isAdminUid(auth.currentUser?.uid);

  if (!DEBUG_PROFILE_SAVE || !isAllowedMode) return;

  console.groupCollapsed(
    `%c[ProfileSaveDebug] ${step}`,
    'color:#8b5cf6;font-weight:bold;'
  );
  console.log({
    time: new Date().toISOString(),
    ...data,
  });
  console.trace('[ProfileSaveDebug trace]');
  console.groupEnd();
};


const resolveOverlayIncomingValue = change => {
  if (!change || typeof change !== 'object') return undefined;

  if (Object.prototype.hasOwnProperty.call(change, 'to')) {
    return change.to;
  }

  if (Object.prototype.hasOwnProperty.call(change, 'added')) {
    return change.added;
  }

  if (Object.prototype.hasOwnProperty.call(change, 'add')) {
    return change.add;
  }

  return undefined;
};

const normalizeEditorOverlayFields = fields => {
  if (!fields || typeof fields !== 'object') return {};

  return Object.entries(fields).reduce((acc, [fieldName, change]) => {
    if (!change || typeof change !== 'object') return acc;

    if (Object.prototype.hasOwnProperty.call(change, 'add') && !Object.prototype.hasOwnProperty.call(change, 'added')) {
      acc[fieldName] = {
        ...change,
        added: change.add,
      };
      delete acc[fieldName].add;
      return acc;
    }

    acc[fieldName] = change;
    return acc;
  }, {});
};

// refreshOverlays() fetches canonical/overlay data in the background - on
// mount, and again after every submit - and its snapshot is captured at the
// start of that specific async call. If the user types into a field and
// blurs (submitting the edit) while an earlier, still-in-flight
// refreshOverlays() call is pending (e.g. the very first edit right after
// opening a card, before its background canonical/overlay fetch has
// resolved), that call's eventual setState used to unconditionally spread
// `nextCardState` over `prevState` - silently reverting the just-saved edit
// back to the pre-edit value with no error, since `nextCardState` was
// fetched before the edit happened. Only let incoming data win for fields
// that haven't been changed locally since the last confirmed sync, so a
// stale in-flight refresh can't clobber a fresher local edit.
const mergeCardStatePreservingKnownFields = (prevState, nextCardState, lastSyncedSnapshot) => {
  if (!nextCardState || typeof nextCardState !== 'object') {
    return prevState || nextCardState;
  }

  if (!prevState || typeof prevState !== 'object') {
    return nextCardState;
  }

  if (!lastSyncedSnapshot || typeof lastSyncedSnapshot !== 'object') {
    return {
      ...prevState,
      ...nextCardState,
    };
  }

  const merged = { ...prevState };
  Object.keys(nextCardState).forEach(key => {
    const isLocallyModifiedSinceLastSync = prevState[key] !== lastSyncedSnapshot[key];
    if (!isLocallyModifiedSinceLastSync) {
      merged[key] = nextCardState[key];
    }
  });

  return merged;
};

const getCanonicalCardFromCache = cardUserId => {
  if (!cardUserId) return null;
  const cachedCard = getCard(cardUserId);
  if (!cachedCard || typeof cachedCard !== 'object') return null;

  return {
    ...cachedCard,
    userId: cachedCard.userId || cardUserId,
  };
};

const EditProfile = () => {
  const { userId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [state, setState] = useState(() => getCard(userId) || location.state || null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [dataSource, setDataSource] = useState('');
  const [isAdmin, setIsAdmin] = useState(isAdminUid(auth.currentUser?.uid));
  const [currentUid, setCurrentUid] = useState(auth.currentUser?.uid || '');
  const [pendingOverlays, setPendingOverlays] = useState({});
  const [overlayReadError, setOverlayReadError] = useState('');
  const [highlightedFields, setHighlightedFields] = useState([]);
  const [deletedOverlayFields, setDeletedOverlayFields] = useState([]);
  const [focusedField, setFocusedField] = useState('');
  const [overlayHistory, setOverlayHistory] = useState([]);
  const [isOverlayHistoryVisible, setIsOverlayHistoryVisible] = useState(false);
  const [isReviewingOverlays, setIsReviewingOverlays] = useState(false);
  const [isOverlayResolved, setIsOverlayResolved] = useState(isAdminUid(auth.currentUser?.uid));
  const lastSyncedSnapshotRef = useRef(prepareSyncedSnapshot(state || {}));
  const syncedSnapshotVersionRef = useRef(0);
  const overlayRefreshSequenceRef = useRef(0);
  // Deletion handlers below must read/write this synchronously (plain JS,
  // never inside a setState updater function) rather than rely on React's
  // "eager state" optimization actually running that updater before the next
  // rapid click. That optimization only fires when no other update is
  // already pending on this fiber - which isn't guaranteed once handleSubmit
  // immediately does its own setState right after - so a stale/undefined
  // captured snapshot could otherwise be submitted for the 2nd+ rapid delete.
  const liveFieldsRef = useRef(state);

  useEffect(() => {
    liveFieldsRef.current = state;
  }, [state]);


  const refreshOverlays = useCallback(async () => {
    if (!userId) return;

    const refreshSequence = overlayRefreshSequenceRef.current + 1;
    overlayRefreshSequenceRef.current = refreshSequence;
    const snapshotVersionAtStart = syncedSnapshotVersionRef.current;
    const syncedSnapshotAtStart = lastSyncedSnapshotRef.current;

    if (!isAdmin && currentUid) {
      setIsOverlayResolved(false);
    }

    let overlays = {};
    let canonical = {};

    try {
      canonical = getCanonicalCardFromCache(userId) || (await getCanonicalCard(userId));

      // Non-admins used to be narrowed to their own overlay here, so two
      // editors of the same card never saw each other's pending edits. They
      // now read the whole queue as well - not to review it (that stays
      // admin-only, see the setPendingOverlays({}) branch below), but so the
      // card can be rendered with every editor's change stacked on top of it.
      if (isAdmin || currentUid) {
        overlays = await getOverlaysForCard(userId, { includeAdminOnly: isAdmin });
      }

      setOverlayReadError('');
    } catch (error) {
      const message =
        error?.code === 'PERMISSION_DENIED' || error?.code === 'permission-denied'
          ? 'Overlay: немає доступу на читання (RTDB rules).'
          : `Overlay: помилка завантаження (${error?.code || 'unknown'}).`;

      setOverlayReadError(message);
      setPendingOverlays({});
      setHighlightedFields([]);
      setDeletedOverlayFields([]);
      if (!isAdmin) {
        setIsOverlayResolved(true);
      }
      return;
    }

    // A save (or a newer refresh) that completed while these reads were in
    // flight owns the newer baseline. Applying this response against that
    // mutable baseline could reintroduce values fetched before the save.
    if (
      refreshSequence !== overlayRefreshSequenceRef.current ||
      snapshotVersionAtStart !== syncedSnapshotVersionRef.current
    ) {
      return;
    }

    const hasMeaningfulValue = value => {
      if (value === null || value === undefined) return false;
      if (typeof value === 'string') return value.trim() !== '';
      if (Array.isArray(value)) return value.length > 0;
      return true;
    };

    const isEmptyValue = value => {
      if (value === null || value === undefined) return true;
      if (typeof value === 'string') return value.trim() === '';
      if (Array.isArray(value)) return value.length === 0;
      return false;
    };

    const ownOverlay = currentUid ? overlays?.[currentUid] : null;
    const normalizedOwnFields = ownOverlay?.fields
      ? normalizeEditorOverlayFields(ownOverlay.fields)
      : null;
    // An admin edits the canonical card itself and reviews the pending
    // overlays alongside it, so their form must keep showing canonical
    // values. Everyone else edits the shared draft, which is the canonical
    // card with every editor's overlay replayed onto it in save order - so
    // each editor sees the others' latest values, not just their own.
    const cardForEditor = isAdmin
      ? (normalizedOwnFields ? applyOverlayToCard(canonical, normalizedOwnFields) : canonical)
      : applyOverlaysToCard(canonical, overlays);

    const normalizedIncomingState = {
      ...cardForEditor,
      userId: cardForEditor?.userId || userId,
      lastAction: normalizeLastAction(cardForEditor?.lastAction),
      lastDelivery: formatDateToDisplay(cardForEditor?.lastDelivery),
    };

    setState(prevState => {
      if (
        refreshSequence !== overlayRefreshSequenceRef.current ||
        snapshotVersionAtStart !== syncedSnapshotVersionRef.current
      ) {
        return prevState;
      }

      const mergedState = mergeCardStatePreservingKnownFields(
        prevState,
        normalizedIncomingState,
        syncedSnapshotAtStart
      );
      const advancedSnapshot = { ...syncedSnapshotAtStart };

      Object.keys(normalizedIncomingState).forEach(key => {
        if (prevState?.[key] === syncedSnapshotAtStart?.[key]) {
          advancedSnapshot[key] = normalizedIncomingState[key];
        }
      });

      lastSyncedSnapshotRef.current = prepareSyncedSnapshot(advancedSnapshot);
      syncedSnapshotVersionRef.current += 1;
      return mergedState;
    });

    const visibleOverlays = overlays;

    if (!isAdmin) {
      setPendingOverlays({});
      setHighlightedFields([]);
      setDeletedOverlayFields([]);
      setIsOverlayResolved(true);
      return;
    }

    setPendingOverlays(visibleOverlays);
    setHighlightedFields(getOtherEditorsChangedFields(visibleOverlays));

    const deletedFields = new Set();
    Object.entries(visibleOverlays || {}).forEach(([, overlay]) => {

      Object.entries(overlay?.fields || {}).forEach(([fieldName, change]) => {
        const canonicalValue = canonical?.[fieldName];

        const hasExplicitStringDelete =
          Object.prototype.hasOwnProperty.call(change || {}, 'from') &&
          Object.prototype.hasOwnProperty.call(change || {}, 'to') &&
          hasMeaningfulValue(change?.from) &&
          isEmptyValue(change?.to) &&
          hasMeaningfulValue(canonicalValue);

        const isArrayDelete =
          Array.isArray(change?.removed) &&
          change.removed.length > 0 &&
          (!Array.isArray(change?.added) || change.added.length === 0) &&
          hasMeaningfulValue(canonicalValue);

        if (hasExplicitStringDelete || isArrayDelete) {
          deletedFields.add(fieldName);
        }
      });
    });

    setDeletedOverlayFields(Array.from(deletedFields));
    setIsOverlayResolved(true);
  }, [userId, currentUid, isAdmin]);

  const deletingFieldsRef = useRef(new Set());
  const pendingDeletedKeysRef = useRef(new Set());
  const syncQueueRef = useRef(Promise.resolve());
  const activeSyncCountRef = useRef(0);
  const submitSequenceRef = useRef(0);
  const currentProfileUserIdRef = useRef(userId);
  const profileSyncGenerationRef = useRef(0);

  const clearDeletingFieldAfterSubmit = useCallback((fieldName, submitPromise) => {
    Promise.resolve(submitPromise)
      .finally(() => {
        const clearDeletingField = () => {
          deletingFieldsRef.current.delete(fieldName);
        };

        if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
          window.requestAnimationFrame(() => window.setTimeout(clearDeletingField, 0));
          return;
        }

        setTimeout(clearDeletingField, 0);
      })
      .catch(() => {});
  }, []);

  const handleOpenMedications = useCallback(
    user => {
      if (!user?.userId) return;
      const labelParts = [user.name, user.surname].filter(Boolean);
      navigate(`/medications/${user.userId}`, {
        state: {
          from: location.pathname,
          label: labelParts.join(' '),
          user,
        },
      });
    },
    [navigate, location.pathname],
  );

  async function remoteUpdate({ updatedState, overwrite, delCondition, deletedKeys = [] }) {
    const editorUserId = auth.currentUser?.uid;
    const canWriteMain = isAdminUid(editorUserId);
    let commentSaveFailed = false;

    if (!canWriteMain) {
      const canonical =
        getCanonicalCardFromCache(updatedState.userId) ||
        (await getCanonicalCard(updatedState.userId));

      // The form the editor just submitted shows the stacked card, so it also
      // contains the other editors' pending values. Diffing it against bare
      // canonical would copy those values into *this* editor's overlay and
      // credit them with somebody else's change. Diff against the card as it
      // looks with everyone else's overlay already applied instead, so the
      // overlay we store holds this editor's own delta and nothing more.
      let baseForOwnOverlay = canonical;
      try {
        const overlaysByEditor = await getOverlaysForCard(updatedState.userId, {
          includeAdminOnly: canWriteMain,
        });
        baseForOwnOverlay = applyOverlaysToCard(canonical, overlaysByEditor, {
          excludeEditorUserId: editorUserId,
        });
      } catch (error) {
        console.warn('[EditProfile] failed to read overlays before save', error);
      }

      const overlayFields = buildOverlayFromDraft(baseForOwnOverlay, updatedState);
      await saveOverlayForUserCard({
        editorUserId,
        cardUserId: updatedState.userId,
        fields: overlayFields,
      });
      return {
        ...baseForOwnOverlay,
        ...updatedState,
      };
    }

    if (updatedState?.userId && Object.prototype.hasOwnProperty.call(updatedState, 'myComment')) {
      const previousComment = lastSyncedSnapshotRef.current?.myComment ?? '';
      const nextComment = updatedState.myComment ?? '';
      if (nextComment !== previousComment) {
        try {
          await saveMyCardComment(updatedState.userId, nextComment, editorUserId);
        } catch (error) {
          // Keep the previous baseline so the same draft is retried on the
          // next profile sync instead of being marked as successfully saved.
          commentSaveFailed = true;
          const details = error?.message || String(error);
          toast.error(`Не вдалося зберегти коментар: ${details}`);
        }
      }
    }

    // A submit whose sole purpose is deleting field(s) (handleClear/
    // handleDelKeyValue set delCondition exactly when a field disappears
    // entirely from newState) gets a minimal, targeted null-only payload
    // instead of going through makeUploadedInfo's full-profile merge. That
    // merge rebuilds uploadedInfo from a locally-captured snapshot merged
    // against a freshly fetched server copy — when several deletions fire in
    // quick succession, a later call's merge can end up re-including a field
    // an earlier, still-in-flight call already deleted, resurrecting it on
    // the backend. A payload containing nothing but explicit nulls for the
    // fields we know are deleted (deletedKeys — the accumulated set, so an
    // earlier not-yet-confirmed deletion gets reinforced too) can never
    // resurrect anything, because it never carries any other field's value.
    const deleteOnlyKeys = delCondition
      ? (deletedKeys || []).filter(key => key && key !== 'userId')
      : [];
    const isDeleteOnlySubmit = deleteOnlyKeys.length > 0;

    const storageCollection = updatedState?.userId
      ? await getCardStorageCollection(updatedState.userId)
      : null;

    if (storageCollection === 'users') {
      const fetchedExistingData = await fetchUserById(updatedState.userId);
      const existingData = fetchedExistingData || lastSyncedSnapshotRef.current || {};

      if (isDeleteOnlySubmit) {
        const deletePayload = { lastAction: updatedState.lastAction };
        deleteOnlyKeys.forEach(key => {
          deletePayload[key] = null;
        });

        debugProfileSave('remoteUpdate:delete-only', {
          delCondition,
          deleteOnlyKeys,
        });

        await syncUserSearchIdIndex(updatedState.userId, existingData, deletePayload, deletedKeys);
        await updateDataInRealtimeDB(updatedState.userId, deletePayload, 'update');
        await updateDataInFiresoreDB(updatedState.userId, deletePayload, 'check', delCondition);

        debugProfileSave('remoteUpdate:success', { delCondition, deleteOnlyKeys });
      } else {
        const cleanedState = { ...updatedState };
        delete cleanedState.cacheVersion;

        debugProfileSave('remoteUpdate:start', {
          overwrite,
          delCondition,
          cleanedStateWatched: {
            surname: cleanedState?.surname,
            name: cleanedState?.name,
            phone: cleanedState?.phone,
            email: cleanedState?.email,
          },
        });

        const sanitizedExistingData = applyDeletedKeysToSnapshot(existingData, deletedKeys);
        const uploadedInfo = applyDeletedKeysToPayload(
          makeUploadedInfo(sanitizedExistingData, cleanedState, overwrite),
          deletedKeys
        );

        await syncUserSearchIdIndex(updatedState.userId, existingData, uploadedInfo, deletedKeys);

        debugProfileSave('remoteUpdate:payload-before-backend', {
          delCondition,
          uploadedInfoWatched: {
            surname: uploadedInfo?.surname,
            name: uploadedInfo?.name,
            phone: uploadedInfo?.phone,
            email: uploadedInfo?.email,
          },
          uploadedInfoHasSurname: Object.prototype.hasOwnProperty.call(uploadedInfo, 'surname'),
          fullPayload: uploadedInfo,
        });

        await updateDataInRealtimeDB(updatedState.userId, uploadedInfo, 'update');
        await updateDataInFiresoreDB(updatedState.userId, uploadedInfo, 'check', delCondition);

        debugProfileSave('remoteUpdate:success', {
          delCondition,
          uploadedInfoWatched: {
            surname: uploadedInfo?.surname,
          },
        });
      }
    } else if (storageCollection === 'newUsers') {
      const fetchedExistingData = await fetchUserById(updatedState.userId);
      const existingData = fetchedExistingData || lastSyncedSnapshotRef.current || {};

      if (isDeleteOnlySubmit) {
        const deletePayload = { lastAction: updatedState.lastAction };
        deleteOnlyKeys.forEach(key => {
          deletePayload[key] = null;
        });
        await syncUserSearchIdIndex(updatedState.userId, existingData, deletePayload, deletedKeys);
        await updateDataInNewUsersRTDB(updatedState.userId, deletePayload, 'update', true);
      } else {
        const payloadForNewUsers = applyDeletedKeysToPayload({ ...updatedState }, deletedKeys);
        await syncUserSearchIdIndex(updatedState.userId, existingData, payloadForNewUsers, deletedKeys);
        await updateDataInNewUsersRTDB(updatedState.userId, payloadForNewUsers, 'update', true);
      }
    }

    const syncedState = commentSaveFailed
      ? { ...updatedState, myComment: lastSyncedSnapshotRef.current?.myComment ?? '' }
      : updatedState;
    return prepareSyncedSnapshot(syncedState, deletedKeys);
  }


  const enqueueProfileSync = useCallback(({ updatedState, overwrite, delCondition, deletedKeys, submitSeq }) => {
    const queuedUserId = updatedState?.userId;
    const queuedGeneration = profileSyncGenerationRef.current;
    activeSyncCountRef.current += 1;
    setIsSyncing(true);

    const runSync = async () => {
      const syncedSnapshot = await remoteUpdate({
        updatedState,
        overwrite,
        delCondition,
        deletedKeys,
      });

      const finalSnapshot = prepareSyncedSnapshot(syncedSnapshot || updatedState, deletedKeys);
      const isCurrentProfile =
        queuedGeneration === profileSyncGenerationRef.current &&
        queuedUserId &&
        queuedUserId === currentProfileUserIdRef.current;

      if (!isCurrentProfile) {
        return finalSnapshot;
      }

      lastSyncedSnapshotRef.current = finalSnapshot;
      syncedSnapshotVersionRef.current += 1;
      deletedKeys.forEach(key => pendingDeletedKeysRef.current.delete(key));

      if (submitSeq === submitSequenceRef.current) {
        await refreshOverlays();
      }

      return finalSnapshot;
    };

    const queuedSync = syncQueueRef.current
      .catch(error => {
        console.error('Previous profile sync failed', error);
      })
      .then(runSync)
      .finally(() => {
        if (queuedGeneration !== profileSyncGenerationRef.current) {
          return;
        }

        activeSyncCountRef.current = Math.max(0, activeSyncCountRef.current - 1);
        if (activeSyncCountRef.current === 0) {
          setIsSyncing(false);
        }
      });

    syncQueueRef.current = queuedSync.catch(() => {});

    return queuedSync;
  }, [refreshOverlays]);


  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, user => {
      setCurrentUid(user?.uid || '');
      setIsAdmin(isAdminUid(user?.uid));
      setIsOverlayResolved(isAdminUid(user?.uid));
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    currentProfileUserIdRef.current = userId;
    profileSyncGenerationRef.current += 1;
    const cachedCard = getCard(userId) || location.state || null;
    setState(cachedCard);
    lastSyncedSnapshotRef.current = prepareSyncedSnapshot(cachedCard || {});
    syncedSnapshotVersionRef.current += 1;
    overlayRefreshSequenceRef.current += 1;
    pendingDeletedKeysRef.current.clear();
    syncQueueRef.current = Promise.resolve();
    activeSyncCountRef.current = 0;
    submitSequenceRef.current = 0;
    setIsSyncing(false);
    setDataSource(cachedCard ? 'cache' : '');
  }, [userId, location.state]);

  useEffect(() => {
    if (state) {
      setDataSource('cache');
      return;
    }

    if (!userId) return;

    const load = async () => {
      try {
        const data = await fetchUserById(userId);
        const formatted =
          data
            ? {
                ...data,
                lastAction: normalizeLastAction(data.lastAction),
                lastDelivery: formatDateToDisplay(data.lastDelivery),
              }
            : { userId };
        setState(formatted);
        lastSyncedSnapshotRef.current = prepareSyncedSnapshot(formatted);
        syncedSnapshotVersionRef.current += 1;
        updateCachedUser(formatted);
        setDataSource('backend');
      } catch (error) {
        toast.error(error.message);
      }
    };

    load();
  }, [state, userId]);

  // myComment no longer lives on the card itself — it's a per-admin note
  // in multiData/comments/{ownerId}/{cardId} (setUserComment/fetchUserComment). Once the card is
  // loaded, overlay the current admin's own comment onto state.myComment so
  // the existing ProfileForm textarea keeps working exactly as before, and
  // mirror it into lastSyncedSnapshotRef so remoteUpdate's change-detection
  // below has an accurate "before" value to diff against.
  useEffect(() => {
    if (!userId || !currentUid || !isAdmin || !dataSource) return;
    let cancelled = false;

    (async () => {
      const existing = await fetchUserComment(currentUid, userId);
      if (cancelled) return;
      const myComment = existing?.text || '';
      setState(prev => (prev && prev.userId === userId ? { ...prev, myComment } : prev));
      if (lastSyncedSnapshotRef.current) {
        lastSyncedSnapshotRef.current = { ...lastSyncedSnapshotRef.current, myComment };
        syncedSnapshotVersionRef.current += 1;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, currentUid, isAdmin, dataSource]);

  useEffect(() => {
    if (!userId) return;
    if (!isAdmin && !currentUid) return;

    refreshOverlays();
  }, [userId, refreshOverlays, currentUid, isAdmin, location.key]);

  const handleSubmit = async (newState, overwrite, delCondition, submitSource) => {
    const submitState = newState || state || {};

    debugProfileSave('handleSubmit:start', {
      submitSource,
      overwrite,
      delCondition,
      keys: Object.keys(submitState),
      watchedValues: {
        surname: submitState?.surname,
        name: submitState?.name,
        phone: submitState?.phone,
        email: submitState?.email,
      },
    });

    const now = Date.now();
    const baseState = normalizePhoneState(newState ? { ...newState } : { ...state });
    const updatedState = { ...baseState, lastAction: now };

    if (!isAdmin && currentUid) {
      setIsOverlayResolved(false);
    }

    liveFieldsRef.current = updatedState;
    setState(updatedState);

    const removeKeys = normalizeDeletedKeys(delCondition);
    pendingDeletedKeysRef.current.forEach(key => {
      if (hasOwn(updatedState, key) && !removeKeys.includes(key)) {
        pendingDeletedKeysRef.current.delete(key);
      }
    });
    removeKeys.forEach(key => pendingDeletedKeysRef.current.add(key));
    const deletedKeys = normalizeDeletedKeys(pendingDeletedKeysRef.current, removeKeys);
    updateCachedUser(updatedState, { removeKeys: deletedKeys });

    const formattedLastDelivery = formatDateToServer(
      formatDateAndFormula(updatedState.lastDelivery),
    );
    const syncedState = {
      ...updatedState,
      ...(formattedLastDelivery ? { lastDelivery: formattedLastDelivery } : {}),
    };
    delete syncedState.cacheVersion;
    const submitSeq = ++submitSequenceRef.current;

    return enqueueProfileSync({
      updatedState: syncedState,
      overwrite,
      delCondition,
      deletedKeys,
      submitSeq,
    });
  };

  const handleFieldFocus = fieldName => {
    if (!fieldName) return;
    setFocusedField(fieldName);
  };

  const acceptFocusedFieldChanges = async fieldName => {
    if (!isAdmin || !fieldName) return;
    const approvals = Object.entries(pendingOverlays).filter(([, overlay]) =>
      Object.prototype.hasOwnProperty.call(overlay?.fields || {}, fieldName)
    );
    if (!approvals.length) return;

    const [editorUserId] = approvals[0];
    await acceptOverlayForUserCard({
      editorUserId,
      cardUserId: userId,
      persistCard: persistCanonicalByRules,
    });

    toast.success(`Погоджено 1 правку по полю ${fieldName}`);
    const fresh = await fetchUserById(userId);
    setState(fresh);
    await refreshOverlays();
  };

  const handleBlur = async name => {
    const baseFieldName = String(name || '').replace(/-\d+$/, '');

    debugProfileSave('handleBlur:start', {
      fieldName: baseFieldName,
      rawNameFromBlur: name,
      baseFieldName,
      valueInState: state?.[baseFieldName],
    });

    const normalizedState = normalizePhoneState(state);
    if (normalizedState !== state) {
      setState(normalizedState);
    }

    debugProfileSave('handleBlur:submit', {
      submitSource: 'handleBlur',
      rawNameFromBlur: name,
      baseFieldName,
      submittedValue: normalizedState?.[baseFieldName],
      fullFieldExists: Object.prototype.hasOwnProperty.call(normalizedState || {}, baseFieldName),
    });

    // Every other submit path here (handleClear, handleDelKeyValue) passes
    // 'overwrite' so a changed scalar field cleanly replaces the stored
    // value. This one didn't, so makeUploadedInfo's no-overwrite branch
    // turned any edited text field (name, surname, email, phone...) that
    // differed from the server copy into a `[oldValue, newValue]` array
    // instead of just saving the new value — the edit was technically
    // written, but not as the plain value the UI expects, so it looked like
    // nothing was saved until a later, unrelated 'overwrite' submit (e.g. a
    // getInTouch button click, which resubmits the whole local state)
    // happened to replace the array with the correct scalar.
    await handleSubmit(normalizedState, 'overwrite', undefined, 'handleBlur');
    if (!isAdmin || !baseFieldName) return;
    if (focusedField && focusedField !== baseFieldName) return;
    await acceptFocusedFieldChanges(baseFieldName);
  };

  // handleSubmit (called below) does its own setState and enqueues the actual
  // network write, so it must never run *inside* a setState updater callback —
  // nested/side-effecting setState calls interleave unpredictably once several
  // deletions fire in quick succession. Relying on setState's functional form
  // to compute newState doesn't fix this either: React only runs that updater
  // synchronously via an internal "eager state" optimization, and only when
  // no other update is already pending on this fiber - not guaranteed once
  // handleSubmit's own setState schedules one right after. So instead of
  // capturing a value out of a setState callback, read/write liveFieldsRef
  // directly with plain synchronous JS - that has no scheduling ambiguity, so
  // each rapid click deterministically builds on the previous click's result.
  const handleClear = (fieldName, idx) => {
    debugProfileSave('handleClear:start', {
      fieldName,
      idx,
      prevValue: state?.[fieldName],
    });

    const hasIndex = Number.isInteger(idx);

    if (!hasIndex) {
      deletingFieldsRef.current.add(fieldName);
    }

    const prev = liveFieldsRef.current;
    const newState = { ...prev };
    let removedValue;
    const currentValue = prev[fieldName];

    if (hasIndex) {
      const sourceArray = Array.isArray(currentValue)
        ? currentValue
        : (currentValue !== undefined && currentValue !== null ? [currentValue] : []);

      const filtered = sourceArray.filter((_, i) => i !== idx);
      removedValue = sourceArray[idx];

      if (filtered.length > 1) {
        newState[fieldName] = filtered;
      } else if (filtered.length === 1 && filtered[0] !== '') {
        newState[fieldName] = filtered[0];
      } else {
        delete newState[fieldName];
      }
    } else {
      const isArray = Array.isArray(currentValue);

      if (isArray) {
        const filtered = currentValue.filter((_, i) => i !== idx);
        removedValue = currentValue[idx];

        if (filtered.length === 0 || (filtered.length === 1 && filtered[0] === '')) {
          delete newState[fieldName];
        } else if (filtered.length === 1) {
          newState[fieldName] = filtered[0];
        } else {
          newState[fieldName] = filtered;
        }
      } else {
        removedValue = currentValue;
        delete newState[fieldName];
      }
    }

    const capturedNewState = newState;
    const capturedDelCondition = Object.prototype.hasOwnProperty.call(newState, fieldName)
      ? undefined
      : { [fieldName]: removedValue };

    liveFieldsRef.current = capturedNewState;
    setState(capturedNewState);

    debugProfileSave('handleClear:computed', {
      fieldName,
      idx,
      newValue: capturedNewState?.[fieldName],
      hasKeyInNewState: Object.prototype.hasOwnProperty.call(capturedNewState, fieldName),
      delCondition: capturedDelCondition,
    });

    debugProfileSave('handleClear:submit', {
      fieldName,
      idx,
      submitSource: 'handleClear',
      submittedValue: capturedNewState?.[fieldName],
      delCondition: capturedDelCondition,
    });

    const submitPromise = handleSubmit(capturedNewState, 'overwrite', capturedDelCondition, 'handleClear');
    if (!hasIndex) {
      clearDeletingFieldAfterSubmit(fieldName, submitPromise);
    }
  };

  const handleDelKeyValue = fieldName => {
    const prev = liveFieldsRef.current;
    const newState = { ...prev };
    const capturedDeletedValue = newState[fieldName];
    delete newState[fieldName];
    const capturedNewState = newState;

    liveFieldsRef.current = capturedNewState;
    setState(capturedNewState);

    pendingDeletedKeysRef.current.add(fieldName);
    handleSubmit(capturedNewState, 'overwrite', { [fieldName]: capturedDeletedValue });
  };

  const persistCanonicalByRules = async mergedCard => {
    if (mergedCard?.userId?.length > 20) {
      const existingData = await fetchUserById(mergedCard.userId) || {};
      await syncUserSearchIdIndex(mergedCard.userId, existingData, mergedCard);

      const cleanedState = { ...mergedCard };
      delete cleanedState.cacheVersion;
      await updateDataInRealtimeDB(mergedCard.userId, cleanedState, 'update');
      await updateDataInFiresoreDB(mergedCard.userId, cleanedState, 'check');
      return;
    }

    const existingData = await fetchUserById(mergedCard.userId) || {};
    await syncUserSearchIdIndex(mergedCard.userId, existingData, mergedCard);
    const sanitizedMergedCard = { ...mergedCard };
    delete sanitizedMergedCard.cacheVersion;
    await updateDataInNewUsersRTDB(mergedCard.userId, sanitizedMergedCard, 'update', true);
  };

  // Bulk review of everything editors have pending on this card. Accepting
  // writes the stacked result - exactly what the editors already see - into
  // the card and clears the queue; discarding drops the queue and leaves the
  // card as it is. Both are admin-only, as is the journal below them.
  const runOverlayReview = async (action, successMessage, failureMessage) => {
    if (!isAdmin || !userId) return;

    setIsReviewingOverlays(true);
    try {
      await action();
      const fresh = await fetchUserById(userId);
      if (fresh) setState(fresh);
      await refreshOverlays();
      if (isOverlayHistoryVisible) {
        setOverlayHistory(await getOverlayHistoryForCard(userId));
      }
      toast.success(successMessage);
    } catch (error) {
      toast.error(`${failureMessage}: ${error?.code || error?.message || 'unknown'}`);
    } finally {
      setIsReviewingOverlays(false);
    }
  };

  const handleAcceptAllOverlays = () => runOverlayReview(
    () => acceptAllOverlaysForCard({ cardUserId: userId, persistCard: persistCanonicalByRules }),
    'Усі правки прийнято',
    'Не вдалося прийняти правки',
  );

  const handleDiscardAllOverlays = () => runOverlayReview(
    () => removeAllOverlaysForCard(userId),
    'Усі правки видалено',
    'Не вдалося видалити правки',
  );

  const toggleOverlayHistory = async () => {
    const nextVisible = !isOverlayHistoryVisible;
    setIsOverlayHistoryVisible(nextVisible);
    if (!nextVisible) return;

    try {
      setOverlayHistory(await getOverlayHistoryForCard(userId));
    } catch (error) {
      setOverlayHistory([]);
      toast.error(`Історія правок недоступна: ${error?.code || error?.message || 'unknown'}`);
    }
  };

  const pendingOverlayEditorCount = Object.keys(pendingOverlays || {}).length;

  const effectiveCycleStatus = getEffectiveCycleStatus(state);
  const scheduleUserData = state;
  const shouldShowSchedule = ['stimulation', 'pregnant'].includes(effectiveCycleStatus);
  const [isStimulationScheduleVisible, setIsStimulationScheduleVisible] = useState(false);

  useEffect(() => {
    setIsStimulationScheduleVisible(false);
  }, [state?.userId, shouldShowSchedule]);

  const overlayFieldAdditions = useMemo(() => {
    const result = {};

    Object.entries(pendingOverlays || {}).forEach(([editorUserId, overlay]) => {
      Object.entries(overlay?.fields || {}).forEach(([fieldName, change]) => {
        if (technicalOverlayFields.has(fieldName)) return;
        if (!change || typeof change !== 'object') return;

        const hasTo = Object.prototype.hasOwnProperty.call(change, 'to');
        const hasAdd = Object.prototype.hasOwnProperty.call(change, 'add');
        const hasAdded = Object.prototype.hasOwnProperty.call(change, 'added');
        const hasFrom = Object.prototype.hasOwnProperty.call(change, 'from');
        const incomingValue = resolveOverlayIncomingValue(change);
        const normalizedTo = sanitizeOverlayValue(incomingValue);
        const normalizedFrom = sanitizeOverlayValue(change?.from);
        const fieldEntries = result[fieldName] || [];
        const hasIncomingValue = hasTo || hasAdded || hasAdd;

        if (hasIncomingValue && !isEmptyOverlayValue(incomingValue)) {
          if (!fieldEntries.some(entry => entry.value === normalizedTo && entry.editorUserId === editorUserId)) {
            result[fieldName] = [...fieldEntries, { value: normalizedTo, editorUserId, isDeleted: false }];
          }
          return;
        }

        if (hasIncomingValue && hasFrom && !isEmptyOverlayValue(change?.from)) {
          if (!fieldEntries.some(entry => entry.value === normalizedFrom && entry.editorUserId === editorUserId)) {
            result[fieldName] = [...fieldEntries, { value: normalizedFrom, editorUserId, isDeleted: true }];
          }
        }
      });
    });

    return result;
  }, [pendingOverlays]);


  if (!state) return null;

  const shouldShowEditorSkeleton = !isAdmin && !isOverlayResolved;

  return (
    <Container>
      <BackButton type="button" onClick={() => navigate(-1)}>
        <FaArrowLeft size={12} /> Back
      </BackButton>
      {isAdmin && (pendingOverlayEditorCount > 0 || isOverlayHistoryVisible) && (
        <OverlayReviewBar>
          <OverlayReviewLabel>
            Правки редакторів: {highlightedFields.length} у {pendingOverlayEditorCount} редакторів
          </OverlayReviewLabel>
          <OverlayReviewButton
            type="button"
            disabled={isReviewingOverlays || pendingOverlayEditorCount === 0}
            onClick={handleAcceptAllOverlays}
          >
            Прийняти всі
          </OverlayReviewButton>
          <OverlayReviewButton
            type="button"
            disabled={isReviewingOverlays || pendingOverlayEditorCount === 0}
            onClick={handleDiscardAllOverlays}
          >
            Видалити всі
          </OverlayReviewButton>
          <OverlayReviewButton type="button" onClick={toggleOverlayHistory}>
            {isOverlayHistoryVisible ? 'Сховати історію' : 'Історія правок'}
          </OverlayReviewButton>
          {isOverlayHistoryVisible && (
            <OverlayHistoryList>
              {overlayHistory.length === 0
                ? <span>Історія порожня.</span>
                : overlayHistory.map(entry => (
                  <span key={entry.entryId}>
                    {entry.at ? new Date(entry.at).toLocaleString('uk-UA') : '—'}
                    {' · '}{OVERLAY_HISTORY_ACTION_LABELS[entry.action] || entry.action}
                    {' · '}{entry.fieldName}: {describeOverlayHistoryChange(entry.change)}
                    {' · '}{entry.editorUserId}
                  </span>
                ))}
            </OverlayHistoryList>
          )}
        </OverlayReviewBar>
      )}
      {shouldShowEditorSkeleton ? (
        <TopBlockSkeleton />
      ) : (
        <div style={{ ...coloredCard(), marginBottom: '8px' }}>
          <TopBlock
            userData={state}
            setUsers={() => {}}
            setShowInfoModal={() => {}}
            setState={setState}
            setUserIdToDelete={() => {}}
            onOpenMedications={handleOpenMedications}
            overlayFieldAdditions={overlayFieldAdditions}
            stimulationScheduleToggle={shouldShowSchedule
              ? {
                  visible: isStimulationScheduleVisible,
                  onToggle: () => setIsStimulationScheduleVisible(prev => !prev),
                }
              : null}
          />
        </div>
      )}
      {shouldShowSchedule && isStimulationScheduleVisible && state && (
        <div style={{ ...coloredCard(), marginBottom: '8px' }}>
          <StimulationSchedule
            userData={scheduleUserData}
            setState={setState}
            onLastCyclePersisted={({ lastCycle, lastDelivery, needsSync }) => {
              if (!needsSync) return;
              const updates = {};
              if (lastCycle) updates.lastCycle = lastCycle;
              if (lastDelivery) updates.lastDelivery = lastDelivery;
              if (!Object.keys(updates).length) return;
              setState(prev => ({ ...prev, ...updates }));
            }}
          />
        </div>
      )}
      {shouldShowEditorSkeleton ? (
        <SkeletonCard>
          <SkeletonLine width="55%" height={18} />
          <SkeletonLine width="100%" />
          <SkeletonLine width="92%" />
          <SkeletonLine width="75%" />
          <SkeletonLine width="38%" height={34} />
        </SkeletonCard>
      ) : (
        <ProfileForm
          state={state}
          setState={setState}
          handleBlur={handleBlur}
          handleSubmit={handleSubmit}
          handleClear={handleClear}
          handleDelKeyValue={handleDelKeyValue}
          handleFieldFocus={handleFieldFocus}
          dataSource={dataSource}
          highlightedFields={highlightedFields}
          deletedOverlayFields={deletedOverlayFields}
          isAdmin={isAdmin}
          overlayFieldAdditions={overlayFieldAdditions}
          refreshOverlayForEditor={refreshOverlays}
          overlayDebugData={pendingOverlays}
          overlayDebugError={overlayReadError}
          deletingFieldsRef={deletingFieldsRef}
        />
      )}

      {isSyncing && <div>Syncing...</div>}
    </Container>
  );
};

export default EditProfile;
