import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
  const [state, setState] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (userId) {
        const data = await fetchUserById(userId);
        setState(data || { userId });
      }
    };
    load();
  }, [userId]);

  const handleSubmit = async (newState, overwrite, delCondition) => {
    const fieldsForNewUsersOnly = ['role', 'getInTouch', 'lastCycle', 'myComment', 'writer'];
    const contacts = ['instagram', 'facebook', 'email', 'phone', 'telegram', 'tiktok', 'vk', 'userId'];
    const commonFields = ['lastAction', 'lastLogin2'];

    setIsSubmitting(true);
    try {
      const formatDate = date => {
        const dd = String(date.getDate()).padStart(2, '0');
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const yyyy = date.getFullYear();
        return `${dd}.${mm}.${yyyy}`;
      };
      const currentDate = formatDate(new Date());

      const updatedState = newState ? { ...newState, lastAction: currentDate } : { ...state, lastAction: currentDate };

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
      } else if (state?.userId) {
        if (newState) {
          await updateDataInNewUsersRTDB(state.userId, newState, 'update');
        } else {
          await updateDataInNewUsersRTDB(state.userId, state, 'update');
        }
      }
    } finally {
      setIsSubmitting(false);
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
      return newState;
    });
  };

  if (!state) return null;

  return (
    <Container>
      <BackButton onClick={() => navigate(-1)} disabled={isSubmitting}>Back</BackButton>
      <div style={{ ...coloredCard() }}>
        {renderTopBlock(state, () => {}, () => {}, setState)}
      </div>
      <ProfileForm
        state={state}
        setState={setState}
        handleBlur={handleBlur}
        handleSubmit={handleSubmit}
        handleClear={handleClear}
        handleDelKeyValue={handleDelKeyValue}
        isSubmitting={isSubmitting}
      />
    </Container>
  );
};

export default EditProfile;

