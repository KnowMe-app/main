import React from 'react';
import { OrangeBtn, color } from 'components/styles';
import { FaTimes } from 'react-icons/fa';
import { coloredCard, FadeContainer } from './styles';
import { makeNewUser } from './config';
import { renderTopBlock } from './smallCard/renderTopBlock';
import StimulationSchedule from './StimulationSchedule';
import { btnCompare } from './smallCard/btnCompare';
import { btnEdit } from './smallCard/btnEdit';
import { utilCalculateAge } from './smallCard/utilCalculateAge';
import { removeField } from './smallCard/actions';
// import { btnExportUsers } from './topBtns/btnExportUsers';

// Компонент для рендерингу полів користувача
const renderFields = (
  data,
  parentKey = '',
  userId,
  setUsers,
  setState,
  isToastOn = false,
) => {
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

  return sortedKeys.map((key) => {
    const nestedKey = parentKey ? `${parentKey}.${key}` : key;
    const value = extendedData[key];

    if (['attitude', 'whiteList', 'blackList'].includes(key)) {
      return null;
    }

    if (key === 'photos') {
      const photosArray = Array.isArray(value) ? value : Object.values(value || {});
      if (!photosArray.length) {
        return null;
      }
      return (
        <div key={nestedKey}>
          <strong>{key}:</strong>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginTop: '5px' }}>
            {photosArray.map((url, idx) => (
              <div key={idx} style={{ wordBreak: 'break-all' }}>
                {url}
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (typeof value === 'object' && value !== null) {
      return (
        <div key={nestedKey}>
          <strong>{key}:</strong>
          <div style={{ marginLeft: '20px' }}>
            {renderFields(value, nestedKey, userId, setUsers, setState, isToastOn)}
          </div>
        </div>
      );
    }

    return (
      <div
        key={nestedKey}
        style={{
          display: 'inline-flex',
          alignItems: 'flex-end',
          gap: '4px',
          flexWrap: 'wrap',
        }}
      >
        <span
          style={{
            wordBreak: 'break-word',
            whiteSpace: 'pre-wrap',
            display: 'inline',
          }}
        >
          <strong>{key}</strong>
          {': '}
          {value != null ? value.toString() : '—'}
        </span>
        <OrangeBtn
          type="button"
          style={{
            width: '25px',
            height: '25px',
            marginLeft: '5px',
            marginRight: 0,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: `1px solid ${color.iconActive}`,
            padding: 0,
          }}
          onClick={() => removeField(userId, nestedKey, setUsers, setState, isToastOn, nestedKey)}
        >
          <FaTimes size={14} color={color.white} />
        </OrangeBtn>
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
  isToastOn = false,
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
          isToastOn,
        )}
      </div>
      {userData.cycleStatus === 'stimulation' && (
        <div style={{ ...coloredCard(), marginBottom: '8px' }}>
          <StimulationSchedule
            userData={userData}
            setUsers={setUsers}
            setState={setState}
            isToastOn={isToastOn}
          />
        </div>
      )}
      <div id={userData.userId} style={{ display: 'none' }}>
        {renderFields(userData, '', userData.userId, setUsers, setState, isToastOn)}
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
  isToastOn = false,
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
                isToastOn={isToastOn}
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
