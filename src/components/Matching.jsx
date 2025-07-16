import React, { useEffect, useState, useRef } from 'react';
import { utilCalculateAge } from './smallCard/utilCalculateAge';
import styled from 'styled-components';
import { color } from './styles';
import {
  fetchLatestUsers,
  getAllUserPhotos,
  fetchFavoriteUsersData,
  fetchDislikeUsersData,
  database,
  auth,
} from './config';
import { onValue, ref as refDb } from 'firebase/database';
import { BtnFavorite } from './smallCard/btnFavorite';
import { BtnDislike } from './smallCard/btnDislike';
import { getCurrentValue } from './getCurrentValue';
import { fieldContactsIcons } from './smallCard/fieldContacts';
import PhotoViewer from './PhotoViewer';

const Grid = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding: 10px;
  justify-content: center;
`;

const Card = styled.div`
  width: calc(50% - 20px);
  height: 40vh;
  background-color: orange;
  background-size: cover;
  background-position: center;
  border-radius: 8px;
  position: relative;
`;

const TopActions = styled.div`
  position: absolute;
  top: 10px;
  right: 10px;
  display: flex;
  gap: 10px;
  z-index: 10;
`;

const ModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
`;



// Styled components for detailed modal card
const DonorCard = styled.div`
  font-family: sans-serif;
  max-width: 400px;
  width: 90%;
  margin: 10px;
  border: 1px solid ${color.gray};
  border-radius: 8px;
  padding: 16px;
  background: ${color.oppositeAccent};
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
  color: ${color.black};
  max-height: 80vh;
  overflow-y: auto;
  position: relative;
`;


const Title = styled.div`
  color: ${color.accent};
  font-weight: bold;
  margin-bottom: 4px;
`;

const ProfileSection = styled.div`
  display: flex;
  align-items: center;
  margin-bottom: 15px;
  border-bottom: 1px solid ${color.gray4};
  padding-bottom: 10px;
`;

const Photo = styled.img`
  width: 90px;
  border-radius: 8px;
  margin-right: 10px;
  object-fit: cover;
  cursor: pointer;
`;

const Info = styled.div`
  flex: 1;
`;

const CloseButton = styled.button`
  position: absolute;
  top: 16px;
  right: 16px;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 20px;
`;

// Fields to display in the details modal
const FIELDS = [
  { key: 'height', label: 'Height (cm)' },
  { key: 'weight', label: 'Weight (kg)' },
  { key: 'bmi', label: 'BMI' },
  { key: 'clothingSize', label: 'Clothing size' },
  { key: 'shoeSize', label: 'Shoe size' },
  { key: 'blood', label: 'Rh' },
  { key: 'eyeColor', label: 'Eyes' },
  { key: 'glasses', label: 'Glasses' },
  { key: 'race', label: 'Race' },
  { key: 'faceShape', label: 'Face shape' },
  { key: 'noseShape', label: 'Nose shape' },
  { key: 'lipsShape', label: 'Lips shape' },
  { key: 'hairColor', label: 'Hair color' },
  { key: 'hairStructure', label: 'Hair structure' },
  { key: 'chin', label: 'Chin' },
  { key: 'breastSize', label: 'Breast size' },
  { key: 'bodyType', label: 'Body type' },
  { key: 'maritalStatus', label: 'Marital status' },
  { key: 'education', label: 'Education' },
  { key: 'profession', label: 'Profession' },
  { key: 'ownKids', label: 'Own kids' },
  { key: 'reward', label: 'Expected reward $' },
  { key: 'experience', label: 'Donation exp' },
];

const Table = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  row-gap: 8px;
  column-gap: 8px;
  font-size: 14px;
  margin-bottom: 15px;

  & > div {
    line-height: 1.2;
    display: flex;
    flex-direction: column;
  }

  & strong {
    font-size: 12px;
    color: ${color.gray3};
  }
`;

const MoreInfo = styled.div`
  background-color: ${color.paleAccent2};
  padding: 10px;
  border-left: 4px solid ${color.accent};
  margin-bottom: 10px;
  font-size: 14px;
`;

const Contact = styled.div`
  display: flex;
  justify-content: flex-start;
  align-items: center;
  font-size: 14px;
  border-top: 1px solid ${color.gray4};
  padding-top: 10px;
  margin-top: 10px;
`;

const Icons = styled.div`
  display: flex;
  gap: 10px;
  font-size: 16px;
  color: ${color.accent};
`;

const Id = styled.div`
  font-size: 12px;
  color: ${color.gray3};
  text-align: right;
  margin-top: 5px;
`;

const renderSelectedFields = user => {
  return FIELDS.map(field => {
    let value = user[field.key];
    if (field.key === 'bmi') {
      const { weight, height } = user;
      if (weight && height) {
        value = ((weight / (height * height)) * 10000).toFixed(2);
      } else {
        value = null;
      }
    }

    value = getCurrentValue(value);

    if (value === undefined || value === '' || value === null) return null;

    return (
      <div key={field.key}>
        <strong>{field.label}</strong> {String(value)}
      </div>
    );
  });
};

const INITIAL_LOAD = 6;
const LOAD_MORE = 2;

const Matching = () => {
  const [users, setUsers] = useState([]);
  const [lastKey, setLastKey] = useState();
  const [hasMore, setHasMore] = useState(true);
  const [selected, setSelected] = useState(null);
  const [showPhoto, setShowPhoto] = useState(false);
  const [favoriteUsers, setFavoriteUsers] = useState({});
  const [dislikeUsers, setDislikeUsers] = useState({});
  const loadingRef = useRef(false);

  useEffect(() => {
    const ownerId = auth.currentUser?.uid;
    if (!ownerId) return;

    const favRef = refDb(database, `multiData/favorites/${ownerId}`);
    const disRef = refDb(database, `multiData/dislikes/${ownerId}`);

    const unsubFav = onValue(favRef, snap => {
      setFavoriteUsers(snap.exists() ? snap.val() : {});
    });
    const unsubDis = onValue(disRef, snap => {
      setDislikeUsers(snap.exists() ? snap.val() : {});
    });

    return () => {
      unsubFav();
      unsubDis();
    };
  }, []);

  const fetchChunk = async (limit, key) => {
    const ignored = new Set([
      ...Object.keys(favoriteUsers || {}),
      ...Object.keys(dislikeUsers || {}),
    ]);
    let hasMoreRes = true;
    let last = key;
    const collected = [];

    while (hasMoreRes && collected.length < limit) {
      const res = await fetchLatestUsers(limit, last);
      last = res.lastKey;
      hasMoreRes = res.hasMore;

      const filtered = res.users.filter(u => !ignored.has(u.userId));
      const withPhotos = await Promise.all(
        filtered.map(async user => {
          const photos = await getAllUserPhotos(user.userId);
          return { ...user, photos };
        }),
      );
      collected.push(...withPhotos);

      if (!hasMoreRes) break;
      if (collected.length < limit) {
        continue;
      }
    }

    return { users: collected.slice(0, limit), lastKey: last, hasMore: hasMoreRes };
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
  }, [fetchChunk]);

  const loadFavoriteCards = async () => {
    const owner = auth.currentUser?.uid;
    if (!owner) return;
    const loaded = await fetchFavoriteUsersData(owner);
    setUsers(Object.values(loaded));
    setHasMore(false);
    setLastKey(null);
  };

  const loadDislikeCards = async () => {
    const owner = auth.currentUser?.uid;
    if (!owner) return;
    const loaded = await fetchDislikeUsersData(owner);
    setUsers(Object.values(loaded));
    setHasMore(false);
    setLastKey(null);
  };

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
  }, [fetchChunk, hasMore, lastKey]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  const gridRef = useRef(null);
  const observerRef = useRef(null);

  useEffect(() => {
    if (!gridRef.current || !hasMore) return;

    const cards = gridRef.current.querySelectorAll('[data-card]');
    const index = users.length - 3;
    const target = cards[index];
    if (!target) return;

    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting) {
          loadMore();
        }
      },
      { root: gridRef.current, rootMargin: '100px' }
    );

    observer.observe(target);
    observerRef.current = observer;
    return () => {
      if (observerRef.current) observerRef.current.disconnect();
    };
  }, [loadMore, users.length, hasMore]);

  return (
    <>
      <div style={{ position: 'relative' }}>
        <TopActions>
          <button onClick={loadFavoriteCards}>❤</button>
          <button onClick={loadDislikeCards}>👎</button>
        </TopActions>
        <Grid ref={gridRef} style={{ overflowY: 'auto', height: '80vh' }}>
          {users.map(user => {
            const photo = getCurrentValue(user.photos);
            return (
              <Card
                data-card
              key={user.userId}
              onClick={() => setSelected(user)}
              style={
                photo
                  ? { backgroundImage: `url(${photo})`, backgroundColor: 'transparent' }
                  : {}
              }
            >
              <BtnDislike
                userId={user.userId}
                dislikeUsers={dislikeUsers}
                setDislikeUsers={setDislikeUsers}
                style={{ bottom: '10px', left: '10px', top: 'auto', right: 'auto' }}
                onToggle={disliked => {
                  if (disliked) {
                    setUsers(prev => prev.filter(u => u.userId !== user.userId));
                  }
                }}
              />
              <BtnFavorite
                userId={user.userId}
                favoriteUsers={favoriteUsers}
                setFavoriteUsers={setFavoriteUsers}
                style={{ bottom: '10px', right: '10px', top: 'auto', left: 'auto' }}
              />
            </Card>
          );
        })
        </Grid>
      </div>
      {selected && (
        <ModalOverlay onClick={() => { setSelected(null); setShowPhoto(false); }}>
          <DonorCard onClick={e => e.stopPropagation()}>
            <CloseButton
              className="close"
              onClick={() => {
                setSelected(null);
                setShowPhoto(false);
              }}
            >
              ✕
            </CloseButton>
            <ProfileSection>
              {getCurrentValue(selected.photos) && (
                <Photo
                  src={getCurrentValue(selected.photos)}
                  alt="Donor"
                  onClick={() => setShowPhoto(true)}
                />
              )}
              <Info>
                <Title>Egg donor profile</Title>
                <strong>{getCurrentValue(selected.surname) || ''} {getCurrentValue(selected.name) || ''}{selected.birth ? `, ${utilCalculateAge(selected.birth)}р` : ''}</strong>
                <br />
                {getCurrentValue(selected.region) || ''}
                {getCurrentValue(selected.city) ? `, ${getCurrentValue(selected.city)}` : ''}
              </Info>
            </ProfileSection>
            <Table>{renderSelectedFields(selected)}</Table>
            {getCurrentValue(selected.myComment) && (
              <MoreInfo>
                <strong>More information</strong>
                <br />
                {getCurrentValue(selected.myComment)}
              </MoreInfo>
            )}
            {getCurrentValue(selected.moreInfo_main) && (
              <MoreInfo>
                {getCurrentValue(selected.moreInfo_main)}
              </MoreInfo>
            )}
            <Contact>
              <Icons>{fieldContactsIcons(selected)}</Icons>
              {getCurrentValue(selected.writer) && (
                <div style={{ marginLeft: '10px' }}>{getCurrentValue(selected.writer)}</div>
              )}
            </Contact>
            <Id>ID: {selected.userId ? selected.userId.slice(0, 5) : ''}</Id>
          </DonorCard>
        </ModalOverlay>
      )}
      {showPhoto && (
        <PhotoViewer
          photos={Array.isArray(selected.photos) ? selected.photos : [getCurrentValue(selected.photos)].filter(Boolean)}
          onClose={() => setShowPhoto(false)}
        />
      )}
    </>
  );
};

export default Matching;
