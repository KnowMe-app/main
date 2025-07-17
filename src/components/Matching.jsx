import React, { useEffect, useState, useRef } from 'react';
import { utilCalculateAge } from './smallCard/utilCalculateAge';
import styled, { keyframes } from 'styled-components';
import { color } from './styles';
import {
  fetchLatestUsers,
  getAllUserPhotos,
  fetchFavoriteUsersData,
  fetchDislikeUsersData,
  fetchFavoriteUsers,
  fetchDislikeUsers,
  filterMain,
  searchUsersOnly,
  fetchUserComment,
  setUserComment,
  database,
  auth,
} from './config';
import { onValue, ref as refDb } from 'firebase/database';
import { onAuthStateChanged } from 'firebase/auth';
import { BtnFavorite } from './smallCard/btnFavorite';
import { BtnDislike } from './smallCard/btnDislike';
import { getCurrentValue } from './getCurrentValue';
import { fieldContactsIcons } from './smallCard/fieldContacts';
import PhotoViewer from './PhotoViewer';
import toast from 'react-hot-toast';
import SearchBar from './SearchBar';
import FilterPanel from './FilterPanel';

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

const loadingWave = keyframes`
  0% {
    background-position: -200px 0;
  }
  100% {
    background-position: calc(200px + 100%) 0;
  }
`;

const SkeletonCard = styled(Card)`
  background: linear-gradient(90deg, ${color.paleAccent2} 25%, ${color.paleAccent5} 50%, ${color.paleAccent2} 75%);
  background-size: 200% 100%;
  animation: ${loadingWave} 1.5s infinite;
`;

const TopActions = styled.div`
  position: absolute;
  top: 10px;
  right: 10px;
  display: flex;
  gap: 10px;
  z-index: 10;
`;

const ActionButton = styled.button`
  width: 35px;
  height: 35px;
  padding: 3px;
  border: none;
  background-color: ${color.accent5};
  color: white;
  border-radius: 50px;
  cursor: pointer;
  font-size: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
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

const roleMatchesFilter = (user, filter) => {
  const userRoles = Array.isArray(user.userRole)
    ? user.userRole.map(r => String(r).toLowerCase())
    : user.userRole
    ? [String(user.userRole).toLowerCase()]
    : [];
  const roles = Array.isArray(user.role)
    ? user.role.map(r => String(r).toLowerCase())
    : user.role
    ? [String(user.role).toLowerCase()]
    : [];
  const allRoles = [...userRoles, ...roles];
  if (filter === 'donor') {
    return allRoles.some(r => ['ed', 'sm'].includes(r));
  }
  if (filter === 'agency') {
    return allRoles.some(r => ['ag', 'cl'].includes(r));
  }
  if (filter === 'parent') {
    return allRoles.some(r => ['ip'].includes(r));
  }
  return true;
};

const Matching = () => {
  const [users, setUsers] = useState([]);
  const [lastKey, setLastKey] = useState();
  const [hasMore, setHasMore] = useState(true);
  const [selected, setSelected] = useState(null);
  const [showPhoto, setShowPhoto] = useState(false);
  const [favoriteUsers, setFavoriteUsers] = useState({});
  const [dislikeUsers, setDislikeUsers] = useState({});
  const [viewMode, setViewMode] = useState('default');
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState('donor');
  const [filters, setFilters] = useState({});
  const [comments, setComments] = useState({});
  const loadingRef = useRef(false);
  const loadedIdsRef = useRef(new Set());
  const handleRemove = id => {
    setUsers(prev => prev.filter(u => u.userId !== id));
  };

  const applySearchResults = async res => {
    const arr = Array.isArray(res) ? res : Object.values(res || {});
    setUsers(arr);
    setHasMore(false);
    await loadCommentsFor(arr);
  };

  const loadCommentsFor = async list => {
    const owner = auth.currentUser?.uid;
    if (!owner) return;
    const results = await Promise.all(list.map(u => fetchUserComment(owner, u.userId)));
    setComments(prev => {
      const copy = { ...prev };
      list.forEach((u, idx) => {
        copy[u.userId] = results[idx] || '';
      });
      return copy;
    });
  };

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, user => {
      if (!user) {
        setFavoriteUsers({});
        setDislikeUsers({});
        return;
      }

      const favRef = refDb(database, `multiData/favorites/${user.uid}`);
      const disRef = refDb(database, `multiData/dislikes/${user.uid}`);

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
    });

    return () => {
      unsubscribeAuth();
    };
  }, [roleFilter]);

  const fetchChunk = async (limit, key, exclude = new Set(), role) => {
    const res = await fetchLatestUsers(limit + exclude.size + 1, key);
    const filtered = res.users.filter(
      u => !exclude.has(u.userId) && roleMatchesFilter(u, role),
    );
    const hasMore = filtered.length > limit || res.hasMore;
    const slice = filtered.slice(0, limit);
    const withPhotos = await Promise.all(
      slice.map(async user => {
        const photos = await getAllUserPhotos(user.userId);
        return { ...user, photos };
      })
    );
    const lastKeyResult = slice.length > 0 ? slice[slice.length - 1].userId : res.lastKey;
    return { users: withPhotos, lastKey: lastKeyResult, hasMore };
  };

  const loadInitial = React.useCallback(async () => {
    loadingRef.current = true;
    setLoading(true);
    loadedIdsRef.current = new Set();
    try {
      const owner = auth.currentUser?.uid;
      let exclude = new Set();
      if (owner) {
        const [favIds, disIds] = await Promise.all([fetchFavoriteUsers(owner), fetchDislikeUsers(owner)]);
        setFavoriteUsers(favIds);
        setDislikeUsers(disIds);
        exclude = new Set([...Object.keys(favIds), ...Object.keys(disIds)]);
      }
      const res = await fetchChunk(INITIAL_LOAD, undefined, exclude, roleFilter);
      loadedIdsRef.current = new Set(res.users.map(u => u.userId));
      setUsers(res.users);
      await loadCommentsFor(res.users);
      setLastKey(res.lastKey);
      setHasMore(res.hasMore);
      setViewMode('default');
      toast(
        `Initial load: ${res.users.length} users. hasMore: ${res.hasMore}. lastKey: ${res.lastKey}`,
      );
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [roleFilter]);

  const loadFavoriteCards = async () => {
    const owner = auth.currentUser?.uid;
    if (!owner) return;
    setLoading(true);
    const loaded = await fetchFavoriteUsersData(owner);
    loadedIdsRef.current = new Set(Object.keys(loaded));
    setUsers(Object.values(loaded));
    await loadCommentsFor(Object.values(loaded));
    setHasMore(false);
    setLastKey(null);
    setViewMode('favorites');
    setLoading(false);
  };

  const loadDislikeCards = async () => {
    const owner = auth.currentUser?.uid;
    if (!owner) return;
    setLoading(true);
    const loaded = await fetchDislikeUsersData(owner);
    loadedIdsRef.current = new Set(Object.keys(loaded));
    setUsers(Object.values(loaded));
    await loadCommentsFor(Object.values(loaded));
    setHasMore(false);
    setLastKey(null);
    setViewMode('dislikes');
    setLoading(false);
  };

  const loadMore = React.useCallback(async () => {
    if (!hasMore || loadingRef.current || viewMode !== 'default') return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const exclude = new Set([...Object.keys(favoriteUsers), ...Object.keys(dislikeUsers)]);
      const res = await fetchChunk(LOAD_MORE, lastKey, exclude, roleFilter);
      const unique = res.users.filter(u => !loadedIdsRef.current.has(u.userId));
      unique.forEach(u => loadedIdsRef.current.add(u.userId));
      setUsers(prev => [...prev, ...unique]);
      await loadCommentsFor(unique);
      setLastKey(res.lastKey);
      setHasMore(res.hasMore);
      toast(
        `Loaded ${res.users.length} more. hasMore: ${res.hasMore}. lastKey: ${res.lastKey}`,
      );
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [hasMore, lastKey, favoriteUsers, dislikeUsers, viewMode, roleFilter]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  const gridRef = useRef(null);
  const observerRef = useRef(null);

  const filteredUsers =
    filters && Object.keys(filters).length > 0
      ? filterMain(
          users.map(u => [u.userId, u]),
          null,
          filters,
          favoriteUsers,
        ).map(([id, u]) => u)
      : users;

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
      { root: gridRef.current, rootMargin: '0px 0px 200px 0px' }
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
          <ActionButton onClick={loadFavoriteCards}>❤</ActionButton>
          <ActionButton onClick={loadDislikeCards}>👎</ActionButton>
        </TopActions>
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '10px',
            marginBottom: '10px',
            marginTop: '20px',
          }}
        >
          <button
            onClick={() => setRoleFilter('donor')}
            disabled={roleFilter === 'donor'}
          >
            Донори
          </button>
          <button
            onClick={() => setRoleFilter('agency')}
            disabled={roleFilter === 'agency'}
          >
            Агентсва та Клініки
          </button>
          <button
            onClick={() => setRoleFilter('parent')}
            disabled={roleFilter === 'parent'}
          >
            Біо батьки
          </button>
        </div>
        <SearchBar
          searchFunc={searchUsersOnly}
          setUsers={applySearchResults}
          setUserNotFound={() => {}}
        />
        <FilterPanel hideUserId hideCommentLength onChange={setFilters} />
        <Grid ref={gridRef} style={{ overflowY: 'auto', height: '80vh' }}>
          {filteredUsers.map(user => {
            const photo = getCurrentValue(user.photos);
            return (
              <Card
                data-card
                key={user.userId}
                onClick={() => setSelected(user)}
                style={photo ? { backgroundImage: `url(${photo})`, backgroundColor: 'transparent' } : {}}
              >
                <BtnFavorite
                  userId={user.userId}
                  favoriteUsers={favoriteUsers}
                  setFavoriteUsers={setFavoriteUsers}
                  onRemove={viewMode === 'favorites' ? handleRemove : undefined}
                />
                <BtnDislike
                  userId={user.userId}
                  dislikeUsers={dislikeUsers}
                  setDislikeUsers={setDislikeUsers}
                  onRemove={viewMode !== 'default' ? handleRemove : undefined}
                />
                <textarea
                  value={comments[user.userId] || ''}
                  onChange={e => {
                    const val = e.target.value;
                    setComments(prev => ({ ...prev, [user.userId]: val }));
                  }}
                  onBlur={() => {
                    const owner = auth.currentUser?.uid;
                    if (owner) setUserComment(owner, user.userId, comments[user.userId] || '');
                  }}
                  style={{ position: 'absolute', bottom: '5px', left: '5px', width: '90%' }}
                />
              </Card>
            );
          })}
          {loading &&
            Array.from({ length: 4 }).map((_, idx) => (
              <SkeletonCard data-card key={`skeleton-${idx}`} />
            ))}
        </Grid>
      </div>
      {selected && (
        <ModalOverlay
          onClick={() => {
            setSelected(null);
            setShowPhoto(false);
          }}
        >
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
              {getCurrentValue(selected.photos) && <Photo src={getCurrentValue(selected.photos)} alt="Donor" onClick={() => setShowPhoto(true)} />}
              <Info>
                <Title>Egg donor profile</Title>
                <strong>
                  {(getCurrentValue(selected.surname) || '').trim()} {(getCurrentValue(selected.name) || '').trim()}
                  {selected.birth ? `, ${utilCalculateAge(selected.birth)}р` : ''}
                </strong>
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
            {getCurrentValue(selected.profession) && (
              <MoreInfo>
                <strong>Profession</strong>
                <br />
                {getCurrentValue(selected.profession)}
              </MoreInfo>
            )}
            {getCurrentValue(selected.moreInfo_main) && <MoreInfo>{getCurrentValue(selected.moreInfo_main)}</MoreInfo>}
            <Contact>
              <Icons>{fieldContactsIcons(selected)}</Icons>
              {getCurrentValue(selected.writer) && <div style={{ marginLeft: '10px' }}>{getCurrentValue(selected.writer)}</div>}
            </Contact>
            <textarea
              value={comments[selected.userId] || ''}
              onChange={e => setComments(prev => ({ ...prev, [selected.userId]: e.target.value }))}
              onBlur={() => {
                const owner = auth.currentUser?.uid;
                if (owner) setUserComment(owner, selected.userId, comments[selected.userId] || '');
              }}
              style={{ width: '100%', marginTop: '10px' }}
            />
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
