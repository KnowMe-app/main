import React from 'react';
import { coloredCard, FadeContainer } from './styles';
import { makeNewUser } from './config';
import { renderTopBlock } from './smallCard/renderTopBlock';
import { btnCompare } from './smallCard/btnCompare';
import { btnEdit } from './smallCard/btnEdit';
import { renderAllFields } from './ProfileForm';
// import { btnExportUsers } from './topBtns/btnExportUsers';
import StimulationSchedule from './StimulationSchedule';
import { getEffectiveCycleStatus } from 'utils/cycleStatus';

// Компонент для рендерингу картки користувача
const UserCard = ({
  userData,
  setUsers,
  setShowInfoModal,
  setState,
  setUserIdToDelete,
  onOpenMedications,
  favoriteUsers,
  setFavoriteUsers,
  dislikeUsers,
  setDislikeUsers,
  currentFilter,
  isDateInRange,
  actions,
}) => {
  const effectiveStatus = getEffectiveCycleStatus(userData);
  const scheduleUserData = {
    ...userData,
    cycleStatus: effectiveStatus ?? userData?.cycleStatus,
  };
  const shouldShowSchedule = ['stimulation', 'pregnant'].includes(effectiveStatus);

  return (
    <div>
      <div style={{ ...coloredCard(), marginBottom: '8px' }}>
        {renderTopBlock(
          userData,
          setUsers,
          setShowInfoModal,
          setState,
          setUserIdToDelete,
          true,
          favoriteUsers,
          setFavoriteUsers,
          dislikeUsers,
          setDislikeUsers,
          currentFilter,
          isDateInRange,
          onOpenMedications,
          actions
        )}
      </div>
      {shouldShowSchedule && (
        <div style={{ ...coloredCard(), marginBottom: '8px' }}>
          <StimulationSchedule
            userData={scheduleUserData}
            setUsers={setUsers}
            setState={setState}
            onLastCyclePersisted={({ lastCycle, lastDelivery, needsSync }) => {
              if (!needsSync) return;
              const updates = {};
              if (lastCycle) updates.lastCycle = lastCycle;
              if (lastDelivery) updates.lastDelivery = lastDelivery;
              if (!Object.keys(updates).length) return;

              if (typeof setState === 'function') {
                setState(prev => {
                  if (!prev || prev.userId !== userData.userId) return prev;
                  return { ...prev, ...updates };
                });
              }
              if (typeof setUsers === 'function') {
                setUsers(prev => {
                  if (!prev) return prev;
                  if (Array.isArray(prev)) {
                    return prev.map(item => (item?.userId === userData.userId ? { ...item, ...updates } : item));
                  }
                  if (typeof prev === 'object') {
                    const current = prev[userData.userId];
                    if (!current) return prev;
                    return {
                      ...prev,
                      [userData.userId]: {
                        ...current,
                        ...updates,
                      },
                    };
                  }
                  return prev;
                });
              }
            }}
          />
        </div>
      )}
      <div id={userData.userId} style={{ display: 'none' }}>
        {renderAllFields(userData, '', {
          userId: userData.userId,
          setUsers,
          stateUpdater: setState,
        })}
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
  onOpenMedications,
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
    const res = await makeNewUser({ name: value }, value);
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
              <svg onClick={() => handleCreate(userData.searchVal)} width="40" height="40" viewBox="0 0 40 40" style={{ cursor: 'pointer' }}>
                <rect x="18" y="8" width="4" height="24" fill="white" />
                <rect x="8" y="18" width="24" height="4" fill="white" />
              </svg>
            </div>
          ) : (
            <UserCard
              setShowInfoModal={setShowInfoModal}
              userData={userData}
              setUsers={setUsers}
              setState={setState}
              setUserIdToDelete={setUserIdToDelete}
              onOpenMedications={onOpenMedications}
              favoriteUsers={favoriteUsers}
              setFavoriteUsers={setFavoriteUsers}
              dislikeUsers={dislikeUsers}
              setDislikeUsers={setDislikeUsers}
              currentFilter={currentFilter}
              isDateInRange={isDateInRange}
              actions={
                <>
                  {btnEdit(userData, setSearch, setState, {
                    backgroundColor: '#FF8C00',
                  })}
                  {btnCompare(index, users, setUsers, setShowInfoModal, setCompare)}
                </>
              }
            />
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
