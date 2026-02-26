import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import styled from 'styled-components';
import {
  fetchUserById,
  updateDataInNewUsersRTDB,
  updateDataInRealtimeDB,
  updateDataInFiresoreDB,
  removeKeyFromFirebase,
  auth,
} from './config';
import { makeUploadedInfo } from './makeUploadedInfo';
import { ProfileForm } from './ProfileForm';
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
  padding: 20px;
  box-sizing: border-box;
  max-width: 450px;
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

const sanitizeOverlayValue = value => {
  if (Array.isArray(value)) {
    const normalized = value.map(item => sanitizeOverlayValue(item)).filter(item => item !== '');
    return normalized.join(', ');
  }

  if (value === null || value === undefined) return '';
  return String(value).trim();
};

const isEmptyOverlayValue = value => sanitizeOverlayValue(value) === '';
const technicalOverlayFields = new Set(['editor', 'cachedAt', 'lastAction']);


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

const EditProfile = () => {
  const { userId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [state, setState] = useState(() => getCard(userId) || location.state || null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
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
      canonical = await getCanonicalCard(userId);

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
    if (ownOverlay?.fields) {
      const normalizedOwnFields = normalizeEditorOverlayFields(ownOverlay.fields);
      const mergedForEditor = applyOverlayToCard(canonical, normalizedOwnFields);
      setState({
        ...mergedForEditor,
        lastAction: normalizeLastAction(mergedForEditor.lastAction),
        lastDelivery: formatDateToDisplay(mergedForEditor.lastDelivery),
      });
    }

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

  async function remoteUpdate({ updatedState, overwrite, delCondition }) {
    const editorUserId = auth.currentUser?.uid;
    const canWriteMain = isAdminUid(editorUserId);

    if (!canWriteMain) {
      const canonical = await getCanonicalCard(updatedState.userId);
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
    const contacts = ['instagram', 'facebook', 'email', 'phone', 'telegram', 'tiktok', 'vk', 'userId'];
    const commonFields = ['lastAction', 'lastLogin2', 'getInTouch', 'lastDelivery', 'ownKids', 'cycleStatus', 'stimulationSchedule'];

    if (updatedState?.userId?.length > 20) {
      const { existingData } = await fetchUserById(updatedState.userId);

      const sanitizedExistingData = { ...existingData };
      if (delCondition) {
        Object.keys(delCondition).forEach(key => {
          delete sanitizedExistingData[key];
        });
      }

      const cleanedState = Object.fromEntries(
        Object.entries(updatedState).filter(([key]) => commonFields.includes(key) || !fieldsForNewUsersOnly.includes(key))
      );

      const uploadedInfo = makeUploadedInfo(sanitizedExistingData, cleanedState, overwrite);

      await updateDataInRealtimeDB(updatedState.userId, uploadedInfo, 'update');
      await updateDataInFiresoreDB(updatedState.userId, uploadedInfo, 'check', delCondition);

      const cleanedStateForNewUsers = Object.fromEntries(
        Object.entries(updatedState).filter(([key]) =>
          [...fieldsForNewUsersOnly, ...contacts, 'getInTouch', 'lastDelivery', 'ownKids'].includes(key)
        )
      );

      await updateDataInNewUsersRTDB(updatedState.userId, cleanedStateForNewUsers, 'update');
    } else if (updatedState?.userId) {
      await updateDataInNewUsersRTDB(updatedState.userId, updatedState, 'update');
    }

    try {
      const fresh = await fetchUserById(updatedState.userId);
      return fresh || updatedState;
    } catch {
      return updatedState;
    }
  }


  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, user => {
      setCurrentUid(user?.uid || '');
      setIsAdmin(isAdminUid(user?.uid));
      setIsOverlayResolved(isAdminUid(user?.uid));
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isDataLoaded) {
      if (state) {
        setDataSource('cache');
        setIsDataLoaded(true);
      } else if (userId) {
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
            updateCachedUser(formatted);
            setDataSource('backend');
          } catch (error) {
            toast.error(error.message);
          } finally {
            setIsDataLoaded(true);
          }
        };
        load();
      }
    }
  }, [state, userId, isDataLoaded]);

  useEffect(() => {
    if (!userId) return;
    if (!isDataLoaded) return;
    if (!currentUid) return;

    refreshOverlays();
  }, [userId, refreshOverlays, currentUid, isDataLoaded]);

  useEffect(() => {
    refreshOverlays();
  }, [refreshOverlays]);

  const handleSubmit = async (newState, overwrite, delCondition) => {
    const now = Date.now();
    const baseState = newState ? { ...newState } : { ...state };
    const updatedState = { ...baseState, lastAction: now };
    setState(updatedState);

    const removeKeys = delCondition ? Object.keys(delCondition) : [];
    updateCachedUser(updatedState, { removeKeys });

    const formattedLastDelivery = formatDateToServer(
      formatDateAndFormula(updatedState.lastDelivery),
    );
    const syncedState = {
      ...updatedState,
      ...(formattedLastDelivery ? { lastDelivery: formattedLastDelivery } : {}),
    };
    setIsSyncing(true);
    try {
      const serverData = await remoteUpdate({
        updatedState: syncedState,
        overwrite,
        delCondition,
      });
      const serverLast = normalizeLastAction(serverData?.lastAction);
      if (serverLast && serverLast > updatedState.lastAction) {
        const formattedServerData = {
          ...serverData,
          lastAction: serverLast,
          lastDelivery: formatDateToDisplay(serverData.lastDelivery),
          cycleStatus: serverData.cycleStatus || 'menstruation',
        };
        updateCachedUser(formattedServerData);
        setState(formattedServerData);
      }
    } finally {
      setIsSyncing(false);
      await refreshOverlays();
    }
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

  const handleBlur = async fieldName => {
    await handleSubmit();
    if (!isAdmin || !fieldName) return;
    if (focusedField && focusedField !== fieldName) return;
    await acceptFocusedFieldChanges(fieldName);
  };

  const handleClear = (fieldName, idx) => {
    setState(prev => {
      const isArray = Array.isArray(prev[fieldName]);
      const newState = { ...prev };
      let removedValue;

      if (isArray) {
        const filtered = prev[fieldName].filter((_, i) => i !== idx);
        removedValue = prev[fieldName][idx];

        if (filtered.length === 0 || (filtered.length === 1 && filtered[0] === '')) {
          const deletedValue = prev[fieldName];
          delete newState[fieldName];
          if (isAdmin) {
            removeKeyFromFirebase(fieldName, deletedValue, prev.userId);
          }
        } else if (filtered.length === 1) {
          newState[fieldName] = filtered[0];
        } else {
          newState[fieldName] = filtered;
        }
      } else {
        removedValue = prev[fieldName];
        const deletedValue = prev[fieldName];
        delete newState[fieldName];
        if (isAdmin) {
          removeKeyFromFirebase(fieldName, deletedValue, prev.userId);
        }
      }

      handleSubmit(newState, 'overwrite', { [fieldName]: removedValue });
      return newState;
    });
  };

  const handleDelKeyValue = fieldName => {
    setState(prev => {
      const newState = { ...prev };
      const deletedValue = newState[fieldName];
      delete newState[fieldName];
      if (isAdmin) {
        removeKeyFromFirebase(fieldName, deletedValue, prev.userId);
      }
      handleSubmit(newState, 'overwrite', { [fieldName]: deletedValue });
      return newState;
    });
  };

  const persistCanonicalByRules = async mergedCard => {
    const fieldsForNewUsersOnly = ['role', 'lastCycle', 'myComment', 'writer', 'cycleStatus', 'stimulationSchedule'];
    const contacts = ['instagram', 'facebook', 'email', 'phone', 'telegram', 'tiktok', 'vk', 'userId'];
    const commonFields = ['lastAction', 'lastLogin2', 'getInTouch', 'lastDelivery', 'ownKids', 'cycleStatus', 'stimulationSchedule'];

    if (mergedCard?.userId?.length > 20) {
      const cleanedState = Object.fromEntries(
        Object.entries(mergedCard).filter(([key]) => commonFields.includes(key) || !fieldsForNewUsersOnly.includes(key))
      );
      await updateDataInRealtimeDB(mergedCard.userId, cleanedState, 'update');
      await updateDataInFiresoreDB(mergedCard.userId, cleanedState, 'check');
      const cleanedStateForNewUsers = Object.fromEntries(
        Object.entries(mergedCard).filter(([key]) =>
          [...fieldsForNewUsersOnly, ...contacts, 'getInTouch', 'lastDelivery', 'ownKids'].includes(key)
        )
      );
      await updateDataInNewUsersRTDB(mergedCard.userId, cleanedStateForNewUsers, 'update');
      return;
    }

    await updateDataInNewUsersRTDB(mergedCard.userId, mergedCard, 'update');
  };

  const effectiveCycleStatus = getEffectiveCycleStatus(state);
  const scheduleUserData = state
    ? { ...state, cycleStatus: effectiveCycleStatus ?? state.cycleStatus }
    : state;
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

  const shouldShowNonAdminSkeleton = !isAdmin && isDataLoaded && currentUid && !isOverlayResolved;

  return (
    <Container>
      <BackButton onClick={() => navigate(-1)}>Back</BackButton>
      <div style={{ ...coloredCard(), marginBottom: '8px' }}>
        {renderTopBlock(
          state,
          () => {},
          () => {},
          setState,
          () => {},
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          handleOpenMedications,
          undefined,
          overlayFieldAdditions,
        )}
      </div>
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
      {shouldShowNonAdminSkeleton ? (
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
        />
      )}

      {isSyncing && <div>Syncing...</div>}
    </Container>
  );
};

export default EditProfile;
