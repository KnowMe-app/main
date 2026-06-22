import React from 'react';
import { coloredCard, FadeContainer } from './styles';
import { makeNewUser } from './config';
import { TopBlock } from './smallCard/renderTopBlock';
import { btnCompare } from './smallCard/btnCompare';
import { btnMore } from './smallCard/btnMore';
import { renderAllFields } from './ProfileForm';
// import { btnExportUsers } from './topBtns/btnExportUsers';
import StimulationSchedule from './StimulationSchedule';
import { getEffectiveCycleStatus } from 'utils/cycleStatus';

const cardActionButtonStyle = {
  width: '30px',
  height: '30px',
  minHeight: '30px',
  flex: '0 0 30px',
  padding: 0,
  border: 'none',
  borderRadius: '9px',
  color: '#fff',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxShadow: '0 3px 8px rgba(17, 24, 39, 0.25)',
};

// Компонент для рендерингу картки користувача
const UserCard = ({
  userData,
  setUsers,
  setShowInfoModal,
  setSearch,
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
  const [isStimulationScheduleVisible, setIsStimulationScheduleVisible] = React.useState(true);
  const role = userData?.role || userData?.userRole;

  return (
    <div>
      <div style={{ ...coloredCard(role), marginBottom: '8px' }}>
        <TopBlock
          userData={userData}
          setUsers={setUsers}
          setShowInfoModal={setShowInfoModal}
          setState={setState}
          setUserIdToDelete={setUserIdToDelete}
          isFromListOfUsers={true}
          favoriteUsers={favoriteUsers}
          setFavoriteUsers={setFavoriteUsers}
          dislikeUsers={dislikeUsers}
          setDislikeUsers={setDislikeUsers}
          currentFilter={currentFilter}
          isDateInRange={isDateInRange}
          onOpenMedications={onOpenMedications}
          setSearch={setSearch}
          additionalActions={actions}
          stimulationScheduleToggle={shouldShowSchedule
            ? {
                visible: isStimulationScheduleVisible,
                onToggle: () => setIsStimulationScheduleVisible(prev => !prev),
              }
            : null}
        />
      </div>
      {shouldShowSchedule && isStimulationScheduleVisible && (
        <div style={{ ...coloredCard(role), marginBottom: '8px' }}>
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
  onOpenMoreActions,
}) => {
  const entries = Object.entries(users);

  const handleCreate = async item => {
    const value = item?.searchVal || '';
    const searchKey = item?.searchKey || 'name';
    const searchValue = item?.searchValue || value;
    const rawSearchValue = item?.rawSearchValue || value;
    const res = await makeNewUser({ [searchKey]: searchValue }, rawSearchValue);
    setUsers(prev => {
      const copy = { ...prev };
      Object.entries(copy).forEach(([key, existingItem]) => {
        if (existingItem === item || (existingItem?._notFound && existingItem.searchVal === value)) {
          delete copy[key];
        }
      });
      return { ...copy, [res.userId]: res };
    });
  };

  return (
    <div style={styles.container}>
      {entries.map(([userId, userData], index) => {
        const entryRole = userData?.role || userData?.userRole;
        return (
        <FadeContainer
          key={userId}
          className={`fade-in${userData._pendingRemove ? ' fade-out' : ''}`}
          style={{ ...coloredCard(entryRole || index) }}
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
              <svg onClick={() => handleCreate(userData)} width="40" height="40" viewBox="0 0 40 40" style={{ cursor: 'pointer' }}>
                <rect x="18" y="8" width="4" height="24" fill="white" />
                <rect x="8" y="18" width="24" height="4" fill="white" />
              </svg>
            </div>
          ) : (
            <UserCard
              setShowInfoModal={setShowInfoModal}
              userData={userData}
              setUsers={setUsers}
              setSearch={setSearch}
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
                  {btnCompare(
                    index,
                    users,
                    setUsers,
                    setShowInfoModal,
                    setCompare,
                    { ...cardActionButtonStyle, backgroundColor: 'purple' },
                  )}
                  {btnMore(
                    userData,
                    onOpenMoreActions,
                    { ...cardActionButtonStyle, backgroundColor: '#1976d2' },
                  )}
                </>
              }
            />
          )}
        </FadeContainer>
        );
      })}
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
