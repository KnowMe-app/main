import React, { useEffect, useState, useRef } from 'react';
import styled from 'styled-components';
import { fetchLatestUsers, getAllUserPhotos } from './config';
import { getCurrentValue } from './getCurrentValue';
import { fieldContacts } from './smallCard/fieldContacts';

const Grid = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding: 10px;
`;

const Card = styled.div`
  width: 120px;
  height: 160px;
  background-color: orange;
  background-size: cover;
  background-position: center;
  border-radius: 8px;
`;

const ModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
`;

const ModalContent = styled.div`
  background: white;
  padding: 20px;
  border-radius: 8px;
  max-height: 90vh;
  overflow-y: auto;
  color: black;
`;

const renderFields = (data, parentKey = '') => {
  if (!data || typeof data !== 'object') {
    console.error('Invalid data passed to renderFields:', data);
    return null;
  }

  const extendedData = { ...data };

  const sortedKeys = Object.keys(extendedData).sort((a, b) => {
    const priority = [
      'name',
      'surname',
      'fathersname',
      'birth',
      'blood',
      'maritalStatus',
      'csection',
      'weight',
      'height',
      'ownKids',
      'lastDelivery',
      'lastCycle',
      'facebook',
      'instagram',
      'telegram',
      'phone',
      'tiktok',
      'vk',
      'writer',
      'myComment',
      'region',
      'city',
    ];
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

    if (['attitude', 'photos', 'whiteList', 'blackList'].includes(key)) {
      return null;
    }

    if (typeof value === 'object' && value !== null) {
      return (
        <div key={nestedKey} style={{ marginLeft: '10px' }}>
          <strong>{key}:</strong>
          <div>{renderFields(value, nestedKey)}</div>
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

const INITIAL_LOAD = 9;
const LOAD_MORE = 3;

const Matching = () => {
  const [users, setUsers] = useState([]);
  const [lastKey, setLastKey] = useState();
  const [hasMore, setHasMore] = useState(true);
  const [selected, setSelected] = useState(null);
  const loadingRef = useRef(false);

  const fetchChunk = async (limit, key) => {
    const res = await fetchLatestUsers(limit, key);
    const withPhotos = await Promise.all(
      res.users.map(async user => {
        const photos = await getAllUserPhotos(user.userId);
        return { ...user, photos };
      }),
    );
    return { users: withPhotos, lastKey: res.lastKey, hasMore: res.hasMore };
  };

  const loadInitial = React.useCallback(async () => {
    loadingRef.current = true;
    try {
      const res = await fetchChunk(INITIAL_LOAD);
      setUsers(res.users);
      setLastKey(res.lastKey);
      setHasMore(res.hasMore);
    } finally {
      loadingRef.current = false;
    }
  }, []);

  const loadMore = async () => {
    if (!hasMore || loadingRef.current) return;
    loadingRef.current = true;
    try {
      const res = await fetchChunk(LOAD_MORE, lastKey);
      setUsers(prev => [...prev, ...res.users]);
      setLastKey(res.lastKey);
      setHasMore(res.hasMore);
    } finally {
      loadingRef.current = false;
    }
  };

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  const loaderRef = useRef(null);

  useEffect(() => {
    const node = loaderRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) {
        loadMore();
      }
    });

    observer.observe(node);
    return () => observer.unobserve(node);
  }, [loadMore]);

  return (
    <>
      <Grid style={{ overflowY: 'auto', height: '80vh' }}>
        {users.map(user => {
          const photo = getCurrentValue(user.photos);
          return (
            <Card
              key={user.userId}
              onClick={() => setSelected(user)}
              style={
                photo
                  ? { backgroundImage: `url(${photo})`, backgroundColor: 'transparent' }
                  : {}
              }
            />
          );
        })}
        <div ref={loaderRef} style={{ width: '100%', height: '1px' }} />
      </Grid>
      {selected && (
        <ModalOverlay onClick={() => setSelected(null)}>
          <ModalContent onClick={e => e.stopPropagation()}>
            {renderFields(selected)}
            <div style={{ marginTop: '10px' }}>{fieldContacts(selected)}</div>
          </ModalContent>
        </ModalOverlay>
      )}
    </>
  );
};

export default Matching;
