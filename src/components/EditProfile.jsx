import React, { useCallback, useEffect, useState } from 'react';
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
  buildOverlayFromDraft,
  formatOverlayPreview,
  getCanonicalCard,
  getOtherEditorsChangedFields,
  getOverlayForUserCard,
  getOverlaysForCard,
  removeOverlayForUserCard,
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

const EditProfile = () => {
  const { userId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [state, setState] = useState(() => getCard(userId) || location.state || null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [dataSource, setDataSource] = useState('');
  const [isAdmin, setIsAdmin] = useState(auth.currentUser?.uid === process.env.REACT_APP_USER1);
  const [pendingOverlays, setPendingOverlays] = useState({});
  const [highlightedFields, setHighlightedFields] = useState([]);
  const [deletedOverlayFields, setDeletedOverlayFields] = useState([]);
  const [focusedField, setFocusedField] = useState('');

  const refreshOverlays = useCallback(async () => {
    if (!userId) return;

    const currentUid = auth.currentUser?.uid;
    const isOwnProfile = !!currentUid && currentUid === userId;

    if (isOwnProfile || !isAdmin) {
      setPendingOverlays({});
      setHighlightedFields([]);
      setDeletedOverlayFields([]);
      return;
    }

    const [overlays, canonical] = await Promise.all([
      getOverlaysForCard(userId),
      getCanonicalCard(userId),
    ]);

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

    setPendingOverlays(overlays);
    setHighlightedFields(getOtherEditorsChangedFields(overlays, currentUid));

    const deletedFields = new Set();
    Object.entries(overlays || {}).forEach(([editorId, overlay]) => {
      if (editorId === auth.currentUser?.uid) return;
      if (!isAdminUid(editorId)) return;

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
  }, [userId, isAdmin]);

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
      setIsAdmin(isAdminUid(user?.uid));
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

    const currentUid = auth.currentUser?.uid;
    if (!currentUid) return;

    const isOwnProfile = currentUid === userId;
    if (isOwnProfile || isAdmin) return;

    const loadWithOverlay = async () => {
      const canonical = await getCanonicalCard(userId);
      const overlay = await getOverlayForUserCard({
        editorUserId: currentUid,
        cardUserId: userId,
      });

      if (overlay?.fields) {
        const merged = Object.entries(overlay.fields).reduce((acc, [fieldName, change]) => {
          if (change?.to !== undefined) {
            acc[fieldName] = change.to;
            return acc;
          }
          if (Array.isArray(canonical[fieldName])) {
            const base = canonical[fieldName] || [];
            const removed = change.removed || [];
            const added = change.added || [];
            acc[fieldName] = [...base.filter(v => !removed.includes(v)), ...added.filter(v => !base.includes(v))];
          }
          return acc;
        }, { ...canonical });
        setState(prev => ({ ...(prev || {}), ...merged }));
      }
    };

    loadWithOverlay();
    refreshOverlays();
  }, [userId, refreshOverlays, isAdmin]);

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

  const handleApprove = async editorUserId => {
    if (!isAdmin || !userId) return;
    await acceptOverlayForUserCard({
      editorUserId,
      cardUserId: userId,
      persistCard: persistCanonicalByRules,
    });
    toast.success('Правку погоджено');
    const fresh = await fetchUserById(userId);
    setState(fresh);
    await refreshOverlays();
  };

  const handleReject = async editorUserId => {
    if (!isAdmin || !userId) return;
    await removeOverlayForUserCard({ editorUserId, cardUserId: userId });
    toast.success('Правку видалено');
    await refreshOverlays();
  };

  const effectiveCycleStatus = getEffectiveCycleStatus(state);
  const scheduleUserData = state
    ? { ...state, cycleStatus: effectiveCycleStatus ?? state.cycleStatus }
    : state;
  const shouldShowSchedule = ['stimulation', 'pregnant'].includes(effectiveCycleStatus);


  const isDeletedValue = value => {
    if (value === '' || value === null || value === undefined) return true;
    if (Array.isArray(value) && value.length === 0) return true;
    return false;
  };

  const renderPendingValue = value => {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    if (isDeletedValue(value)) {
      return <span style={{ color: '#9ca3af' }}>{serialized || '∅ (видалено)'}</span>;
    }

    return <span>{serialized}</span>;
  };

  if (!state) return null;

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
      />
      {isAdmin && (
        <div style={{ width: '100%', marginTop: 12 }}>
          <h4>Pending edits</h4>
          {Object.entries(pendingOverlays).length === 0 && <div>No pending edits</div>}
          {Object.entries(pendingOverlays).map(([editorUserId, overlay]) => (
            <div key={editorUserId} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 8, marginBottom: 8 }}>
              <div><strong>cardUserId:</strong> {userId}</div>
              <div><strong>editorUserId:</strong> {editorUserId}</div>
              <ul>
                {Object.entries(overlay?.fields || {}).map(([fieldName, change]) => {
                  const preview = formatOverlayPreview({ fieldName, change, canonicalValue: state?.[fieldName] });
                  if (!preview) return null;
                  const isDeleteAction = isDeletedValue(preview.newValue) && !isDeletedValue(preview.oldValue);
                  return (
                    <li key={fieldName} style={isDeleteAction ? { color: '#9ca3af' } : undefined}>
                      <strong>{fieldName}:</strong> {renderPendingValue(preview.oldValue)} {' → '} {renderPendingValue(preview.newValue)}
                      {isDeleteAction && <em style={{ marginLeft: 6, color: '#9ca3af' }}>(видалення)</em>}
                    </li>
                  );
                })}
              </ul>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={() => handleApprove(editorUserId)}>Прийняти</button>
                <button type="button" onClick={() => handleReject(editorUserId)}>Видалити</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {isSyncing && <div>Syncing...</div>}
    </Container>
  );
};

export default EditProfile;
