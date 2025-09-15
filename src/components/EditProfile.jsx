import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import styled from 'styled-components';
import {
  fetchUserById,
  updateDataInNewUsersRTDB,
  updateDataInRealtimeDB,
  updateDataInFiresoreDB,
  removeKeyFromFirebase,
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
  const [isToastOn, setIsToastOn] = useState(true);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [dataSource, setDataSource] = useState('');

  async function remoteUpdate({ updatedState, overwrite, delCondition }) {
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

  const handleBlur = () => handleSubmit();

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
          removeKeyFromFirebase(fieldName, deletedValue, prev.userId);
        } else if (filtered.length === 1) {
          newState[fieldName] = filtered[0];
        } else {
          newState[fieldName] = filtered;
        }
      } else {
        removedValue = prev[fieldName];
        const deletedValue = prev[fieldName];
        delete newState[fieldName];
        removeKeyFromFirebase(fieldName, deletedValue, prev.userId);
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
      removeKeyFromFirebase(fieldName, deletedValue, prev.userId);
      handleSubmit(newState, 'overwrite', { [fieldName]: deletedValue });
      return newState;
    });
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
          isToastOn,
          setIsToastOn,
        )}
      </div>
      {state.cycleStatus === 'stimulation' && (
        <div style={{ ...coloredCard(), marginBottom: '8px' }}>
          <StimulationSchedule userData={state} setState={setState} isToastOn={isToastOn} />
        </div>
      )}
      <ProfileForm
        state={state}
        setState={setState}
        handleBlur={handleBlur}
        handleSubmit={handleSubmit}
        handleClear={handleClear}
        handleDelKeyValue={handleDelKeyValue}
        dataSource={dataSource}
      />
      {isSyncing && <div>Syncing...</div>}
    </Container>
  );
};

export default EditProfile;

