import React, { useEffect, useState, useRef } from 'react';
import styled from 'styled-components';
import './DonorCard.css';
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
  width: calc(50% - 20px);
  height: 40vh;
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


// Styles for detailed modal card are defined in DonorCard.css

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

  const loadMore = React.useCallback(async () => {
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
  }, [hasMore, lastKey]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  const loaderRef = useRef(null);
  const gridRef = useRef(null);

  useEffect(() => {
    const node = loaderRef.current;
    const root = gridRef.current;
    if (!node || !root) return;

    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting) {
          loadMore();
        }
      },
      { root }
    );

    observer.observe(node);
    return () => {
      observer.unobserve(node);
      observer.disconnect();
    };
  }, [loadMore, users.length]);

  return (
    <>
      <Grid ref={gridRef} style={{ overflowY: 'auto', height: '80vh' }}>
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
          <div className="donor-card" onClick={e => e.stopPropagation()}>
            <div className="header">
              <span className="title">Egg donor</span>
              <button
                className="close"
                onClick={() => setSelected(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>
            <div className="profile-section">
              {getCurrentValue(selected.photos) && (
                <img className="photo" src={getCurrentValue(selected.photos)} alt="Donor" />
              )}
              <div className="info">
                <strong>
                  {selected.surname || ''} {selected.name || ''}
                  {selected.fathersname ? `, ${selected.fathersname}` : ''}
                </strong>
                <br />
                {selected.region || ''}
                {selected.city ? `, ${selected.city}` : ''}
              </div>
            </div>
            <div className="table">{renderFields(selected)}</div>
            {selected.myComment && (
              <div className="more-info">
                <strong>More information</strong>
                <br />
                {selected.myComment}
              </div>
            )}
            <div className="contact">
              <div className="phone">
                {Array.isArray(selected.phone) ? selected.phone[0] : selected.phone}
              </div>
              <div className="icons">{fieldContacts(selected)}</div>
            </div>
            <div className="id">ID: {selected.userId}</div>
          </div>
        </ModalOverlay>
      )}
    </>
  );
};

export default Matching;
