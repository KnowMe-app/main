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
import { isJsonStateCard } from 'utils/jsonProfileImport';

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
  const [isStimulationScheduleVisible, setIsStimulationScheduleVisible] = React.useState(false);
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

const formatJsonValue = value => (
  value && typeof value === 'object' ? JSON.stringify(value) : String(value ?? '')
);

// Анкета з JSON-файлу — лише стейт. Звичайна `UserCard` тут не годиться: її
// поля й кнопки пишуть у базу за `userId`, а такого id в базі немає. Тому
// картка показує поля як є і несе одну дію — порівняння з наступною карткою
// групи, де клік по полю переносить значення в картку з бази.
const JsonStateCard = ({ userData, compareButton }) => (
  <div style={{ padding: '10px', color: 'white', display: 'flex', flexDirection: 'column', gap: '4px' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '12px' }}>
      <strong>з файлу #{userData._jsonGroup}</strong>
      <span style={{ background: 'rgba(0,0,0,0.35)', padding: '1px 6px', borderRadius: '6px' }}>не збережено</span>
    </div>
    {Object.entries(userData)
      .filter(([key]) => key !== 'userId' && !key.startsWith('_'))
      .map(([key, value]) => (
        <div key={key} style={{ fontSize: '12px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          <span style={{ opacity: 0.75 }}>{key}: </span>{formatJsonValue(value)}
        </div>
      ))}
    <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>{compareButton}</div>
  </div>
);

// Сусідні елементи з тим самим `_jsonGroup` — анкета з файлу й усе, що за
// нею знайшлось, — стоять в одній рамці.
const groupEntries = entries => entries.reduce((groups, entry, index) => {
  const group = entry[1]?._jsonGroup;
  const last = groups[groups.length - 1];
  if (group !== undefined && last && last.group === group) {
    last.items.push([...entry, index]);
  } else {
    groups.push({ group, items: [[...entry, index]] });
  }
  return groups;
}, []);

// Компонент для рендерингу списку користувачів
const UsersList = ({
  users,
  setUsers,
  setSearch,
  setState,
  setShowInfoModal,
  onOpenMedications,
  setCompare,
  onOpenComparedCard,
  setUserIdToDelete,
  favoriteUsers = {},
  setFavoriteUsers,
  dislikeUsers = {},
  setDislikeUsers,
  currentFilter,
  isDateInRange,
  onOpenMoreActions,
  // Додаток під карткою: список того, що ця людина шукала. Список належить
  // екрану, який його й читав, а не картці — картка про запити нічого не знає.
  renderCardFooter,
}) => {
  const usersRef = React.useRef(users);
  usersRef.current = users;
  const entries = Object.entries(users);

  const handleCreate = async item => {
    const value = item?.searchVal || '';
    const searchKey = item?.searchKey || 'name';
    const searchValue = item?.searchValue || value;
    const rawSearchValue = item?.rawSearchValue || value;
    const res = await makeNewUser({ [searchKey]: searchValue }, rawSearchValue);
    if (item?._jsonGroup !== undefined) {
      // Плитка групи з файлу: нова картка стає на її місце, у ту саму рамку,
      // щоб її одразу можна було порівняти з анкетою з файлу.
      setUsers(prev => Object.entries(prev).reduce((next, [key, existingItem]) => {
        if (existingItem === item) next[res.userId] = { ...res, _jsonGroup: item._jsonGroup };
        else next[key] = existingItem;
        return next;
      }, {}));
      return;
    }
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
      {groupEntries(entries).map(({ group, items }) => {
        const rendered = items.map(([userId, userData, index]) => {
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
          {isJsonStateCard(userData) ? (
            <JsonStateCard
              userData={userData}
              compareButton={btnCompare(
                index,
                users,
                setUsers,
                setShowInfoModal,
                setCompare,
                usersRef,
                { ...cardActionButtonStyle, backgroundColor: 'purple' },
                undefined,
                onOpenComparedCard,
              )}
            />
          ) : userData._notFound ? (
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
                    usersRef,
                    { ...cardActionButtonStyle, backgroundColor: 'purple' },
                    undefined,
                    onOpenComparedCard,
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
          {typeof renderCardFooter === 'function' && renderCardFooter(userId, userData)}
        </FadeContainer>
        );
        });
        if (group === undefined) return <React.Fragment key={items[0][0]}>{rendered}</React.Fragment>;
        const foundCount = items.filter(([, item]) => !isJsonStateCard(item) && !item?._notFound).length;
        return (
          <div
            key={`json-group-${group}`}
            style={{ border: '2px solid #7a5cc4', borderRadius: '14px', padding: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}
          >
            <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#7a5cc4' }}>
              #{group} з файлу · {foundCount ? `знайдено ${foundCount}` : 'не знайдено'}
            </div>
            {rendered}
          </div>
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
