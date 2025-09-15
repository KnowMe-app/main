import React from 'react';
import { coloredCard, FadeContainer } from './styles';
import { makeNewUser, removeKeyFromFirebase } from './config';
import { updateCard } from 'utils/cardsStorage';
import { renderTopBlock } from './smallCard/renderTopBlock';
import StimulationSchedule from './StimulationSchedule';
import { btnCompare } from './smallCard/btnCompare';
import { btnEdit } from './smallCard/btnEdit';
import { utilCalculateAge } from './smallCard/utilCalculateAge';
// import { btnExportUsers } from './topBtns/btnExportUsers';

// Компонент для рендерингу полів користувача
const handleDeleteField = async (userData, field, setUsers, setState) => {
  await removeKeyFromFirebase(field, userData[field], userData.userId);
  const updated = updateCard(userData.userId, {}, undefined, [field]);
  if (setUsers) {
    setUsers(prev => {
      if (Array.isArray(prev)) {
        return prev.map(u => (u.userId === userData.userId ? updated : u));
      }
      if (typeof prev === 'object' && prev !== null) {
        return { ...prev, [userData.userId]: updated };
      }
      return prev;
    });
  }
  if (setState) {
    setState(prev => ({ ...prev, ...updated }));
  }
};

const handleDeleteArrayItem = async (userData, field, index, setUsers, setState) => {
  const current = Array.isArray(userData[field]) ? [...userData[field]] : [];
  const removedValue = current[index];
  const updatedArray = current.filter((_, i) => i !== index);

  await removeKeyFromFirebase(field, removedValue, userData.userId);

  let data = {};
  let removeKeys = [];
  if (updatedArray.length === 0) {
    removeKeys = [field];
  } else if (updatedArray.length === 1) {
    data[field] = updatedArray[0];
  } else {
    data[field] = updatedArray;
  }

  const updated = updateCard(userData.userId, data, undefined, removeKeys);
  if (setUsers) {
    setUsers(prev => {
      if (Array.isArray(prev)) {
        return prev.map(u => (u.userId === userData.userId ? updated : u));
      }
      if (typeof prev === 'object' && prev !== null) {
        return { ...prev, [userData.userId]: updated };
      }
      return prev;
    });
  }
  if (setState) {
    setState(prev => ({ ...prev, ...updated }));
  }
};

const renderFields = (data, backendKeys = [], onDeleteField, onDeleteArrayItem, parentKey = '') => {
  if (!data || typeof data !== 'object') {
    console.error('Invalid data passed to renderFields:', data);
    return null;
  }

  const extendedData = { ...data };
  if (typeof extendedData.birth === 'string') {
    extendedData.age = utilCalculateAge(extendedData.birth);
  }

  const sortedKeys = Object.keys(extendedData).sort((a, b) => {
    const priority = ['name', 'surname', 'fathersname', 'birth', 'blood', 'maritalStatus', 'csection', 'weight', 'height', 'ownKids', 'lastDelivery', 'lastCycle', 'facebook', 'instagram', 'telegram', 'phone', 'tiktok', 'vk', 'writer', 'myComment', 'region', 'city'];
    const indexA = priority.indexOf(a);
    const indexB = priority.indexOf(b);

    if (indexA === -1 && indexB === -1) return 0;
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  });

  return sortedKeys.map(key => {
    const nestedKey = parentKey ? `${parentKey}.${key}` : key;
    const value = extendedData[key];

    if (['attitude', 'whiteList', 'blackList'].includes(key)) {
      return null;
    }

    const isHighlighted = !parentKey && backendKeys.includes(key);
    const wrapperStyle = isHighlighted
      ? { backgroundColor: '#d4edda', padding: '2px' }
      : {};

    const btnStyle = {
      cursor: 'pointer',
      marginLeft: '4px',
      background: 'none',
      border: 'none',
    };

    if (Array.isArray(value) || key === 'photos') {
      const arr = Array.isArray(value) ? value : Object.values(value || {});
      if (arr.length === 0) return null;

      if (arr.length > 1) {
        return (
          <div key={nestedKey} style={wrapperStyle}>
            <strong>{key}:</strong>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginTop: '5px' }}>
              {arr.map((item, idx) => (
                <div
                  key={idx}
                  style={{ wordBreak: 'break-all', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  {item != null ? item.toString() : '—'}
                  {onDeleteArrayItem && (
                    <button
                      style={btnStyle}
                      onClick={() => onDeleteArrayItem(key, idx)}
                    >
                      ✖
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      }

      const single = arr[0];
      return (
        <div
          key={nestedKey}
          style={{ ...wrapperStyle, display: 'flex', alignItems: 'center', gap: '4px' }}
        >
          <strong>{key}:</strong> {single != null ? single.toString() : '—'}
          {onDeleteField && (
            <button style={btnStyle} onClick={() => onDeleteField(key)}>
              ✖
            </button>
          )}
        </div>
      );
    }

    if (typeof value === 'object' && value !== null) {
      return (
        <div key={nestedKey} style={wrapperStyle}>
          <strong>{key}:</strong>
          <div style={{ marginLeft: '20px' }}>{renderFields(value, backendKeys, undefined, undefined, nestedKey)}</div>
        </div>
      );
    }

    return (
      <div
        key={nestedKey}
        style={{ ...wrapperStyle, display: 'flex', alignItems: 'center', gap: '4px' }}
      >
        <strong>{key}:</strong> {value != null ? value.toString() : '—'}
        {onDeleteField && (
          <button style={btnStyle} onClick={() => onDeleteField(key)}>
            ✖
          </button>
        )}
      </div>
    );
  });
};

// Компонент для рендерингу картки користувача
const UserCard = ({
  userData,
  setUsers,
  setShowInfoModal,
  setState,
  setUserIdToDelete,
  favoriteUsers,
  setFavoriteUsers,
  dislikeUsers,
  setDislikeUsers,
  currentFilter,
  isDateInRange,
}) => {
  return (
    <div>
      <div style={{ ...coloredCard(), marginBottom: '8px' }}>
        {renderTopBlock(
          userData,
          setUsers,
          setShowInfoModal,
          setState,
          setUserIdToDelete,
          'isFromListOfUsers',
          favoriteUsers,
          setFavoriteUsers,
          dislikeUsers,
          setDislikeUsers,
          currentFilter,
          isDateInRange,
        )}
      </div>
      {userData.cycleStatus === 'stimulation' && (
        <div style={{ ...coloredCard(), marginBottom: '8px' }}>
          <StimulationSchedule userData={userData} setUsers={setUsers} setState={setState} />
        </div>
      )}
      <div id={userData.userId} style={{ display: 'none' }}>
        {renderFields(
          userData,
          userData.__backendKeys || [],
          field => handleDeleteField(userData, field, setUsers, setState),
          (field, idx) => handleDeleteArrayItem(userData, field, idx, setUsers, setState)
        )}
      </div>
    </div>
  );
};

// Компонент для рендерингу списку користувачів
const UsersList = ({
  users,
  setUsers,
  setSearch,
  setState,
  setShowInfoModal,
  setCompare,
  setUserIdToDelete,
  favoriteUsers = {},
  setFavoriteUsers,
  dislikeUsers = {},
  setDislikeUsers,
  currentFilter,
  isDateInRange,
}) => {
  const entries = Object.entries(users);

  const handleCreate = async value => {
    const res = await makeNewUser({ name: value });
    setUsers(prev => {
      const copy = { ...prev };
      delete copy[`new_${value}`];
      return { ...copy, [res.userId]: res };
    });
  };

  return (
    <div style={styles.container}>

      {entries.map(([userId, userData], index) => (
        <FadeContainer
          key={userId}
          className={`fade-in${userData._pendingRemove ? ' fade-out' : ''}`}
          style={{ ...coloredCard(index) }}
          onAnimationEnd={() => {
            if (userData._pendingRemove) {
              setUsers(prev => {
                const copy = { ...prev };
                delete copy[userId];
                return copy;
              });
            }
          }}
        >
          {userData._notFound ? (
            <div
              style={{
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                color: 'white',
              }}
            >
              <span>{userData.searchVal}</span>
              <svg
                onClick={() => handleCreate(userData.searchVal)}
                width="40"
                height="40"
                viewBox="0 0 40 40"
                style={{ cursor: 'pointer' }}
              >
                <rect x="18" y="8" width="4" height="24" fill="white" />
                <rect x="8" y="18" width="24" height="4" fill="white" />
              </svg>
            </div>
          ) : (
            <>
              {btnEdit(userData, setSearch, setState)}
              {btnCompare(index, users, setUsers, setShowInfoModal, setCompare, )}
              <UserCard
                setShowInfoModal={setShowInfoModal}
                userData={userData}
                setUsers={setUsers}
                setState={setState}
                setUserIdToDelete={setUserIdToDelete}
                favoriteUsers={favoriteUsers}
                setFavoriteUsers={setFavoriteUsers}
                dislikeUsers={dislikeUsers}
                setDislikeUsers={setDislikeUsers}
                currentFilter={currentFilter}
                isDateInRange={isDateInRange}
              />
            </>
          )}
        </FadeContainer>
      ))}
    </div>
  );
};

// Стилі
const styles = {
  container: {
    display: 'flex',
    flexWrap: 'wrap',
  },
};

export { UsersList, UserCard };
