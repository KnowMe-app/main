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
  auth,
} from './config';
import { ProfileForm } from './ProfileForm';
import { makeUploadedInfo } from './makeUploadedInfo';
import { renderTopBlock } from './smallCard/renderTopBlock';
import StimulationSchedule from './StimulationSchedule';
import { coloredCard } from './styles';
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
  acceptOverlayForUserCard,
  applyOverlayToCard,
  buildOverlayFromDraft,
  getCanonicalCard,
  getOtherEditorsChangedFields,
  getOverlaysForCard,
  saveOverlayForUserCard,
} from 'utils/multiAccountEdits';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px;
  box-sizing: border-box;
  max-width: 560px;
  width: 100%;
  margin: 0 auto;
`;

const BackButton = styled.button`
  align-self: flex-start;
  margin-bottom: 10px;
`;

const SkeletonCard = styled.div`
  width: 100%;
  border-radius: 12px;
  padding: 14px;
  margin-bottom: 8px;
  background: #f6f7fb;
  border: 1px solid #e7e9f5;
`;

const SkeletonLine = styled.div`
  height: ${props => props.height || 14}px;
  width: ${props => props.width || '100%'};
  border-radius: 8px;
  margin-bottom: 10px;
  background: linear-gradient(90deg, #eceef7 25%, #f7f8fc 50%, #eceef7 75%);
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

const filterObjectByAllowedKeys = (source, isAllowedKey) =>
  Object.fromEntries(
    Object.entries(source || {}).filter(([key]) => isAllowedKey(key))
  );

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

const mergeCardStatePreservingKnownFields = (prevState, nextCardState) => {
  if (!nextCardState || typeof nextCardState !== 'object') {
    return prevState || nextCardState;
  }

  if (!prevState || typeof prevState !== 'object') {
    return nextCardState;
  }

  return {
    ...prevState,
    ...nextCardState,
  };
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
  const [isOverlayResolved, setIsOverlayResolved] = useState(isAdminUid(auth.currentUser?.uid));


  const refreshOverlays = useCallback(async () => {
    if (!userId) return;

    if (!isAdmin && currentUid) {
      setIsOverlayResolved(false);
    }

    let overlays = {};
    let canonical = {};

    try {
      canonical = getCanonicalCardFromCache(userId) || (await getCanonicalCard(userId));

      if (isAdmin) {
        overlays = await getOverlaysForCard(userId);
      } else if (currentUid) {
        const overlaysByEditors = await getOverlaysForCard(userId);
        const ownOverlay = overlaysByEditors?.[currentUid] || null;
        overlays = ownOverlay ? { [currentUid]: ownOverlay } : {};
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
    const cardForEditor = normalizedOwnFields
      ? applyOverlayToCard(canonical, normalizedOwnFields)
      : canonical;

    const normalizedIncomingState = {
      ...cardForEditor,
      userId: cardForEditor?.userId || userId,
      lastAction: normalizeLastAction(cardForEditor?.lastAction),
      lastDelivery: formatDateToDisplay(cardForEditor?.lastDelivery),
    };

    setState(prevState => mergeCardStatePreservingKnownFields(prevState, normalizedIncomingState));

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
  const lastSyncedSnapshotRef = useRef(prepareSyncedSnapshot(state || {}));
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

    if (!canWriteMain) {
      const canonical =
        getCanonicalCardFromCache(updatedState.userId) ||
        (await getCanonicalCard(updatedState.userId));
      const overlayFields = buildOverlayFromDraft(canonical, updatedState);
      await saveOverlayForUserCard({
        editorUserId,
        cardUserId: updatedState.userId,
        fields: overlayFields,
      });
      return {
        ...canonical,
        ...updatedState,
      };
    }

    const fieldsForNewUsersOnly = ['role', 'lastCycle', 'myComment', 'writer', 'cycleStatus', 'stimulationSchedule'];
    const contacts = ['instagram', 'facebook', 'email', 'phone', 'telegram', 'tiktok', 'linkedin', 'youtube', 'twitter', 'line', 'otherLink', 'other', 'vk', 'userId'];
    const ppTechnicalInputFields = ['name', 'surname', ...contacts];
    const commonFields = ['lastAction', 'lastLogin2', 'getInTouch', 'lastDelivery', 'ownKids', 'cycleStatus', 'stimulationSchedule'];
    const isMainProfileField = key => commonFields.includes(key) || !fieldsForNewUsersOnly.includes(key);

    if (updatedState?.userId?.length > 20) {
      const fetchedExistingData = await fetchUserById(updatedState.userId);
      const existingData = fetchedExistingData || lastSyncedSnapshotRef.current || {};

      const cleanedState = filterObjectByAllowedKeys(updatedState, isMainProfileField);
      delete cleanedState.cacheVersion;
      if (delCondition) {
        Object.keys(delCondition).forEach(key => {
          if (key !== 'userId') {
            delete cleanedState[key];
          }
        });
      }

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

      const mainProfileExistingData = filterObjectByAllowedKeys(existingData, isMainProfileField);
      const sanitizedExistingData = applyDeletedKeysToSnapshot(mainProfileExistingData, deletedKeys);
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

      const cleanedStateForNewUsers = Object.fromEntries(
        Object.entries(updatedState).filter(([key]) =>
          [...fieldsForNewUsersOnly, ...ppTechnicalInputFields, 'getInTouch', 'lastDelivery', 'ownKids'].includes(key)
        )
      );
      delete cleanedStateForNewUsers.cacheVersion;
      applyDeletedKeysToPayload(cleanedStateForNewUsers, deletedKeys);

      await updateDataInNewUsersRTDB(updatedState.userId, cleanedStateForNewUsers, 'update', true);
    } else if (updatedState?.userId) {
      const fetchedExistingData = await fetchUserById(updatedState.userId);
      const existingData = fetchedExistingData || lastSyncedSnapshotRef.current || {};
      const payloadForNewUsers = applyDeletedKeysToPayload({ ...updatedState }, deletedKeys);
      await syncUserSearchIdIndex(updatedState.userId, existingData, payloadForNewUsers, deletedKeys);
      await updateDataInNewUsersRTDB(updatedState.userId, payloadForNewUsers, 'update', true);
    }

    return prepareSyncedSnapshot(updatedState, deletedKeys);
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
        updateCachedUser(formatted);
        setDataSource('backend');
      } catch (error) {
        toast.error(error.message);
      }
    };

    load();
  }, [state, userId]);

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

    await handleSubmit(normalizedState, undefined, undefined, 'handleBlur');
    if (!isAdmin || !baseFieldName) return;
    if (focusedField && focusedField !== baseFieldName) return;
    await acceptFocusedFieldChanges(baseFieldName);
  };

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

    setState(prev => {
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

        const delCondition = Object.prototype.hasOwnProperty.call(newState, fieldName)
          ? undefined
          : { [fieldName]: removedValue };

        debugProfileSave('handleClear:computed', {
          fieldName,
          idx,
          newValue: newState?.[fieldName],
          hasKeyInNewState: Object.prototype.hasOwnProperty.call(newState, fieldName),
          delCondition,
        });

        debugProfileSave('handleClear:submit', {
          fieldName,
          idx,
          submitSource: 'handleClear',
          submittedValue: newState?.[fieldName],
          delCondition,
        });

        handleSubmit(newState, 'overwrite', delCondition, 'handleClear');
        return newState;
      }

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

      const delCondition = Object.prototype.hasOwnProperty.call(newState, fieldName)
        ? undefined
        : { [fieldName]: removedValue };

      debugProfileSave('handleClear:computed', {
        fieldName,
        idx,
        newValue: newState?.[fieldName],
        hasKeyInNewState: Object.prototype.hasOwnProperty.call(newState, fieldName),
        delCondition,
      });

      debugProfileSave('handleClear:submit', {
        fieldName,
        idx,
        submitSource: 'handleClear',
        submittedValue: newState?.[fieldName],
        delCondition,
      });

      const submitPromise = handleSubmit(newState, 'overwrite', delCondition, 'handleClear');
      clearDeletingFieldAfterSubmit(fieldName, submitPromise);
      return newState;
    });
  };

  const handleDelKeyValue = fieldName => {
    setState(prev => {
      const newState = { ...prev };
      const deletedValue = newState[fieldName];
      delete newState[fieldName];
      pendingDeletedKeysRef.current.add(fieldName);
      handleSubmit(newState, 'overwrite', { [fieldName]: deletedValue });
      return newState;
    });
  };

  const persistCanonicalByRules = async mergedCard => {
    const fieldsForNewUsersOnly = ['role', 'lastCycle', 'myComment', 'writer', 'cycleStatus', 'stimulationSchedule'];
    const contacts = ['instagram', 'facebook', 'email', 'phone', 'telegram', 'tiktok', 'linkedin', 'youtube', 'twitter', 'line', 'otherLink', 'other', 'vk', 'userId'];
    const ppTechnicalInputFields = ['name', 'surname', ...contacts];
    const commonFields = ['lastAction', 'lastLogin2', 'getInTouch', 'lastDelivery', 'ownKids', 'cycleStatus', 'stimulationSchedule'];

    if (mergedCard?.userId?.length > 20) {
      const existingData = await fetchUserById(mergedCard.userId) || {};
      await syncUserSearchIdIndex(mergedCard.userId, existingData, mergedCard);

      const cleanedState = Object.fromEntries(
        Object.entries(mergedCard).filter(([key]) => commonFields.includes(key) || !fieldsForNewUsersOnly.includes(key))
      );
      delete cleanedState.cacheVersion;
      await updateDataInRealtimeDB(mergedCard.userId, cleanedState, 'update');
      await updateDataInFiresoreDB(mergedCard.userId, cleanedState, 'check');
      const cleanedStateForNewUsers = Object.fromEntries(
        Object.entries(mergedCard).filter(([key]) =>
          [...fieldsForNewUsersOnly, ...ppTechnicalInputFields, 'getInTouch', 'lastDelivery', 'ownKids'].includes(key)
        )
      );
      delete cleanedStateForNewUsers.cacheVersion;
      await updateDataInNewUsersRTDB(mergedCard.userId, cleanedStateForNewUsers, 'update', true);
      return;
    }

    const existingData = await fetchUserById(mergedCard.userId) || {};
    await syncUserSearchIdIndex(mergedCard.userId, existingData, mergedCard);
    const sanitizedMergedCard = { ...mergedCard };
    delete sanitizedMergedCard.cacheVersion;
    await updateDataInNewUsersRTDB(mergedCard.userId, sanitizedMergedCard, 'update', true);
  };

  const effectiveCycleStatus = getEffectiveCycleStatus(state);
  const scheduleUserData = state;
  const shouldShowSchedule = ['stimulation', 'pregnant'].includes(effectiveCycleStatus);

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
      <BackButton onClick={() => navigate(-1)}>Back</BackButton>
      {shouldShowEditorSkeleton ? (
        <TopBlockSkeleton />
      ) : (
        <div style={{ ...coloredCard(), marginBottom: '8px' }}>
          {renderTopBlock({
            userData: state,
            setUsers: () => {},
            setShowInfoModal: () => {},
            setState,
            setUserIdToDelete: () => {},
            onOpenMedications: handleOpenMedications,
            overlayFieldAdditions,
          })}
        </div>
      )}
      {shouldShowSchedule && state && (
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
