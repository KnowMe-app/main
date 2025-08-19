import React, { useEffect, useRef, useState } from 'react';
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
import { renderTopBlock } from "./smallCard/renderTopBlock";
import { coloredCard } from "./styles";
import { createLocalFirstSync } from '../hooks/localServerSync';
import { updateCard } from '../utils/cardsStorage';
import { mergeCache, getCacheKey } from '../hooks/cardsCache';

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
  const [state, setState] = useState(location.state || null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isToastOn, setIsToastOn] = useState(false);

  async function remoteUpdate({ updatedState, overwrite, delCondition }) {
    const fieldsForNewUsersOnly = ['role', 'getInTouch', 'lastCycle', 'myComment', 'writer'];
    const contacts = ['instagram', 'facebook', 'email', 'phone', 'telegram', 'tiktok', 'vk', 'userId'];
    const commonFields = ['lastAction', 'lastLogin2'];

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
        Object.entries(updatedState).filter(([key]) => [...fieldsForNewUsersOnly, ...contacts].includes(key))
      );

      await updateDataInNewUsersRTDB(updatedState.userId, cleanedStateForNewUsers, 'update');
    } else if (updatedState?.userId) {
      await updateDataInNewUsersRTDB(updatedState.userId, updatedState, 'update');
    }

    return updatedState;
  }

  const syncRef = useRef(
    createLocalFirstSync('pendingProfileUpdate', null, async ({ data }) => {
      setIsSyncing(true);
      try {
        await remoteUpdate(data);
      } finally {
        setIsSyncing(false);
      }
    }),
  );

  useEffect(() => {
    syncRef.current.init();
  }, []);

  useEffect(() => {
    if (!state && userId) {
      const load = async () => {
        const data = await fetchUserById(userId);
        setState(data || { userId });
      };
      load();
    }
  }, [state, userId]);

  const handleSubmit = (newState, overwrite, delCondition) => {
    const formatDate = date => {
      const dd = String(date.getDate()).padStart(2, '0');
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const yyyy = date.getFullYear();
      return `${dd}.${mm}.${yyyy}`;
    };
    const currentDate = formatDate(new Date());

    const updatedState = newState
      ? { ...newState, lastAction: currentDate }
      : { ...state, lastAction: currentDate };

    updateCard(updatedState.userId, updatedState);
    mergeCache(getCacheKey('default'), {
      users: { [updatedState.userId]: updatedState },
    });
    syncRef.current.update({ updatedState, overwrite, delCondition });
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
      return newState;
    });
  };

  if (!state) return null;

  return (
    <Container>
      <BackButton onClick={() => navigate(-1)}>Back</BackButton>
      <div style={{ ...coloredCard() }}>
        {renderTopBlock(
          state,
          () => {},
          () => {},
          setState,
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
      <ProfileForm
        state={state}
        setState={setState}
        handleBlur={handleBlur}
        handleSubmit={handleSubmit}
        handleClear={handleClear}
        handleDelKeyValue={handleDelKeyValue}
      />
      {isSyncing && <div>Syncing...</div>}
    </Container>
  );
};

export default EditProfile;

