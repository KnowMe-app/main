import React from 'react';
import { coloredCard } from './styles';
import { renderTopBlock } from './smallCard/renderTopBlock';
import { btnCompare } from './smallCard/btnCompare';
import { btnEdit } from './smallCard/btnEdit';
import { utilCalculateAge } from './smallCard/utilCalculateAge';
// import { btnExportUsers } from './topBtns/btnExportUsers';

// Компонент для рендерингу полів користувача
const renderFields = (data, parentKey = '') => {
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

    if (['attitude', 'photos', 'whiteList', 'blackList'].includes(key)) {
      return null;
    }

    if (typeof value === 'object' && value !== null) {
      return (
        <div key={nestedKey}>
          <strong>{key}:</strong>
          <div style={{ marginLeft: '20px' }}>{renderFields(value, nestedKey)}</div>
        </div>
      );
    }

    return (
      <div key={nestedKey}>
        <strong>{key}:</strong> {value != null ? value.toString() : '—'}
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
  favoriteUsers,
  setFavoriteUsers,
}) => {
  return (
    <div>
      {renderTopBlock(
        userData,
        setUsers,
        setShowInfoModal,
        setState,
        'isFromListOfUsers',
        favoriteUsers,
        setFavoriteUsers,
      )}
      <div id={userData.userId} style={{ display: 'none' }}>
        {renderFields(userData)}
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
  favoriteUsers = {},
  setFavoriteUsers,
}) => {

  const entries = Object.entries(users);

  return (
    <div style={styles.container}>

      {entries.map(([userId, userData], index) => (
        <div key={userId} style={{ ...coloredCard(index) }}>
          {btnEdit(userData.userId, setSearch, setState)}
          {btnCompare(index, users, setUsers, setShowInfoModal, setCompare, )}
          <UserCard
            setShowInfoModal={setShowInfoModal}
            userData={userData}
            setUsers={setUsers}
            setState={setState}
            favoriteUsers={favoriteUsers}
            setFavoriteUsers={setFavoriteUsers}
          />
        </div>
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

export { UsersList };
