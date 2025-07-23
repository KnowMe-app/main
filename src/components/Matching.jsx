import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserCard } from './UsersList';
import { utilCalculateAge } from './smallCard/utilCalculateAge';
import styled, { keyframes } from 'styled-components';
import { color } from './styles';
import toast from 'react-hot-toast';
import {
  fetchUsersByLastLoginPaged,
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
  updateDataInNewUsersRTDB,
} from './config';
import { onValue, ref as refDb } from 'firebase/database';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { BtnFavorite } from './smallCard/btnFavorite';
import { BtnDislike } from './smallCard/btnDislike';
import { getCurrentValue } from './getCurrentValue';
import { fieldContactsIcons } from './smallCard/fieldContacts';
import PhotoViewer from './PhotoViewer';
import SearchBar from './SearchBar';
import FilterPanel from './FilterPanel';
import { useAutoResize } from '../hooks/useAutoResize';
import { getCurrentDate } from './foramtDate';
import InfoModal from './InfoModal';
import { FaFilter, FaTimes, FaHeart, FaEllipsisV } from 'react-icons/fa';


const Grid = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding: 10px;
  justify-content: center;
`;

const CardWrapper = styled.div`
  width: 100%;
  border: 2px solid ${color.gray3};
  border-radius: 8px;
  box-sizing: border-box;
  overflow: hidden;
`;

const CommentInput = styled.textarea`
  width: 100%;
  margin-top: ${props => props.mt || '0'};
  display: block;
  box-sizing: border-box;
  margin-left: auto;
  margin-right: auto;
  resize: none;
  overflow: hidden;
  border: ${props => (props.plain ? 'none' : `1px solid ${color.gray3}`)};
  border-radius: ${props => (props.plain ? '0' : '8px')};
  outline: ${props => (props.plain ? 'none' : 'auto')};
`;

const ResizableCommentInput = ({ value, onChange, onBlur, onClick, ...rest }) => {
  const ref = useRef(null);
  const autoResize = useAutoResize(ref, value);

  return (
    <CommentInput
      {...rest}
      ref={ref}
      value={value}
      onClick={onClick}
      onChange={e => {
        onChange && onChange(e);
        autoResize(e.target);
      }}
      onBlur={onBlur}
    />
  );
};

const Card = styled.div`
  width: 100%;
  height: 40vh;
  background: linear-gradient(135deg, orange, yellow);
  background-size: cover;
  background-position: center;
  border-radius: 0;
  position: relative;
  overflow: hidden;
  &::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    width: 100%;
    height: 20%;
    background: linear-gradient(
      to bottom,
      rgba(0, 0, 0, 0) 0%,
      rgba(0, 0, 0, 0.5) 100%
    );
    pointer-events: none;
    z-index: 0;
  }
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

const SubmitButton = styled.button`
  padding: 10px 20px;
  color: black;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  font-size: 16px;
  align-self: flex-start;
  border-bottom: 1px solid #ddd;
  width: 100%;
  transition: background-color 0.3s ease;

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background-color: #f5f5f5;
  }
`;

const ExitButton = styled(SubmitButton)`
  background: none;
  border-bottom: none;
  transition: background-color 0.3s ease;
  &:hover {
    background-color: #f5f5f5;
  }
`;

const FilterOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.3);
  z-index: 15;
  display: ${props => (props.show ? 'block' : 'none')};
`;

const FilterContainer = styled.div`
  position: fixed;
  top: 0;
  right: 0;
  height: 100%;
  width: 320px;
  max-width: 80%;
  background: #fff;
  z-index: 20;
  transform: translateX(${props => (props.show ? '0' : '100%')});
  transition: transform 0.3s ease-in-out;
  padding: 10px;
  overflow-y: auto;
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
  background: #f0f0f0;
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
  border-left: 4px solid
    ${props => (props.$isAdmin ? color.red : color.accent)};
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
        value = Math.round((weight / (height * height)) * 10000);
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
const LOAD_MORE = 1;

const roleMatchesFilter = (user, filter = {}) => {
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
  const { ed, ag, ip } = filter;
  const checks = [];
  if (ed) checks.push(allRoles.some(r => ['ed', 'sm'].includes(r)));
  if (ag) checks.push(allRoles.some(r => ['ag', 'cl'].includes(r)));
  if (ip) checks.push(allRoles.some(r => ['ip'].includes(r)));
  if (checks.length === 0) return true;
  return checks.some(Boolean);
};

const Matching = () => {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [lastKey, setLastKey] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [selected, setSelected] = useState(null);
  const [showPhoto, setShowPhoto] = useState(false);
  const [favoriteUsers, setFavoriteUsers] = useState({});
  const [dislikeUsers, setDislikeUsers] = useState({});
  const [viewMode, setViewMode] = useState('default');
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({});
  const [comments, setComments] = useState({});
  const [showUserCard, setShowUserCard] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const isAdmin = auth.currentUser?.uid === process.env.REACT_APP_USER1;
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

      const { todayDash } = getCurrentDate();
      updateDataInNewUsersRTDB(user.uid, { lastLogin2: todayDash }, 'update');

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
  }, []);

  const fetchChunk = React.useCallback(
    async (
      limit,
      offset,
      exclude = new Set(),
      onPart
    ) => {
    const added = new Set();
    const handleProgress = async (part, date) => {
      if (date) {
        toast.loading(`Searching ${date}`, { id: 'matching-progress' });
      }
      const arr = Object.entries(part).map(([id, data]) => ({ userId: id, ...data }));
      const filtered = arr.filter(
        u => !exclude.has(u.userId) && roleMatchesFilter(u, filters.role)
      );
      const unique = filtered.filter(u => !added.has(u.userId)).slice(0, limit - added.size);
      if (unique.length > 0) {
        const withPhotos = await Promise.all(
          unique.map(async user => {
            const photos = await getAllUserPhotos(user.userId);
            return { ...user, photos };
          })
        );
        withPhotos.forEach(u => added.add(u.userId));
        if (onPart) onPart(withPhotos);
      }
    };

    const res = await fetchUsersByLastLoginPaged(
      offset,
      limit + exclude.size + 1,
      undefined,
      handleProgress
    );
    console.log('[fetchChunk] loaded', res.users.length, 'offset', offset, 'limit', limit);
    const filtered = res.users.filter(
      u => !exclude.has(u.userId) && roleMatchesFilter(u, filters.role)
    );
    const hasMore = filtered.length > limit || res.hasMore;
    const slice = filtered.slice(0, limit);
    const withPhotos = await Promise.all(
      slice.map(async user => {
        const photos = await getAllUserPhotos(user.userId);
        return { ...user, photos };
      })
    );
    const lastKeyResult = res.lastKey;
    toast.dismiss('matching-progress');
    return { users: withPhotos, lastKey: lastKeyResult, hasMore };
  }, [filters.role]);

  const loadInitial = React.useCallback(async () => {
    loadingRef.current = true;
    setLoading(true);
    loadedIdsRef.current = new Set();
    try {
      const owner = auth.currentUser?.uid;
      let exclude = new Set();
      if (owner) {
        const [favIds, disIds] = await Promise.all([
          fetchFavoriteUsers(owner),
          fetchDislikeUsers(owner),
        ]);
        setFavoriteUsers(favIds);
        setDislikeUsers(disIds);
        exclude = new Set([...Object.keys(favIds), ...Object.keys(disIds)]);
      }
      const res = await fetchChunk(
        INITIAL_LOAD,
        0,
        exclude,
        async part => {
          const unique = part.filter(u => !loadedIdsRef.current.has(u.userId));
          if (unique.length) {
            unique.forEach(u => loadedIdsRef.current.add(u.userId));
            setUsers(prev => [...prev, ...unique]);
            await loadCommentsFor(unique);
          }
        }
      );
      console.log('[loadInitial] initial loaded', res.users.length, 'hasMore', res.hasMore);
      loadedIdsRef.current = new Set([...loadedIdsRef.current, ...res.users.map(u => u.userId)]);
      setUsers(prev => {
        const map = new Map(prev.map(u => [u.userId, u]));
        res.users.forEach(u => map.set(u.userId, u));
        return Array.from(map.values());
      });
      await loadCommentsFor(res.users);
      setLastKey(res.lastKey);
      setHasMore(res.hasMore);
      setViewMode('default');
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [fetchChunk]);

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

  const handleExit = async () => {
    try {
      localStorage.removeItem('isLoggedIn');
      localStorage.removeItem('userEmail');
      setShowInfoModal(false);
      navigate('/my-profile');
      await signOut(auth);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const loadMore = React.useCallback(async () => {
    if (!hasMore || loadingRef.current || viewMode !== 'default') return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const exclude = new Set([
        ...Object.keys(favoriteUsers),
        ...Object.keys(dislikeUsers),
      ]);
      const res = await fetchChunk(
        LOAD_MORE,
        lastKey,
        exclude,
        async part => {
          const unique = part.filter(u => !loadedIdsRef.current.has(u.userId));
          if (unique.length) {
            unique.forEach(u => loadedIdsRef.current.add(u.userId));
            setUsers(prev => [...prev, ...unique]);
            await loadCommentsFor(unique);
          }
        }
      );
      console.log(
        '[loadMore] loaded',
        res.users.length,
        'lastKey',
        lastKey,
        'hasMore',
        res.hasMore
      );
      const unique = res.users.filter(u => !loadedIdsRef.current.has(u.userId));
      unique.forEach(u => loadedIdsRef.current.add(u.userId));
      setUsers(prev => [...prev, ...unique]);
      await loadCommentsFor(unique);
      setLastKey(res.lastKey);
      setHasMore(res.hasMore);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [hasMore, lastKey, favoriteUsers, dislikeUsers, viewMode, fetchChunk]);

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
          favoriteUsers
        ).map(([id, u]) => u)
      : users;

  useEffect(() => {
    if (filteredUsers.length <= 1 && hasMore) {
      loadMore();
    }
  }, [filteredUsers.length, hasMore, loadMore]);

  useEffect(() => {
    if (!gridRef.current || !hasMore) return;

    const cards = gridRef.current.querySelectorAll('[data-card]');
    const index = filteredUsers.length > 3 ? filteredUsers.length - 3 : filteredUsers.length - 1;
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
  }, [loadMore, filteredUsers.length, hasMore]);

  const dotsMenu = () => (
    <>
      {isAdmin && (
        <>
          <SubmitButton onClick={() => navigate('/my-profile')}>my-profile</SubmitButton>
          <SubmitButton onClick={() => navigate('/add')}>add</SubmitButton>
          <SubmitButton onClick={() => navigate('/matching')}>matching</SubmitButton>
        </>
      )}
      <ExitButton onClick={handleExit}>Exit</ExitButton>
    </>
  );

  return (
    <>
      {showFilters && <FilterOverlay show={showFilters} onClick={() => setShowFilters(false)} />}
      <FilterContainer show={showFilters} onClick={e => e.stopPropagation()}>
        <SearchBar
          searchFunc={searchUsersOnly}
          setUsers={applySearchResults}
          setUserNotFound={() => {}}
          wrapperStyle={{ width: '100%', marginBottom: '10px' }}
          leftIcon="🔍"
        />
        <FilterPanel mode="matching" hideUserId hideCommentLength onChange={setFilters} />
      </FilterContainer>
      <div style={{ position: 'relative' }}>
        <TopActions>
          <ActionButton onClick={() => setShowFilters(s => !s)}><FaFilter /></ActionButton>
          <ActionButton onClick={loadDislikeCards}><FaTimes /></ActionButton>
          <ActionButton onClick={loadFavoriteCards}><FaHeart /></ActionButton>
          <ActionButton onClick={() => setShowInfoModal('dotsMenu')}><FaEllipsisV /></ActionButton>
        </TopActions>
        {isAdmin && <p style={{ textAlign: 'center', color: 'black' }}>{filteredUsers.length} карточок</p>}

        <Grid ref={gridRef} style={{ overflowY: 'auto', height: '80vh' }}>
          {filteredUsers.map(user => {
            const photo = getCurrentValue(user.photos);
            return (
              <CardWrapper key={user.userId}>
                <Card data-card onClick={() => setSelected(user)} style={photo ? { backgroundImage: `url(${photo})`, backgroundColor: 'transparent' } : {}}>
                  <BtnFavorite
                    userId={user.userId}
                    favoriteUsers={favoriteUsers}
                    setFavoriteUsers={setFavoriteUsers}
                    dislikeUsers={dislikeUsers}
                    setDislikeUsers={setDislikeUsers}
                    onRemove={viewMode !== 'default' ? handleRemove : undefined}
                  />
                  <BtnDislike
                    userId={user.userId}
                    dislikeUsers={dislikeUsers}
                    setDislikeUsers={setDislikeUsers}
                    favoriteUsers={favoriteUsers}
                    setFavoriteUsers={setFavoriteUsers}
                    onRemove={viewMode !== 'default' ? handleRemove : undefined}
                  />
                </Card>
                <ResizableCommentInput
                  plain
                  value={comments[user.userId] || ''}
                  onClick={e => e.stopPropagation()}
                  onChange={e => {
                    const val = e.target.value;
                    setComments(prev => ({ ...prev, [user.userId]: val }));
                  }}
                  onBlur={() => {
                    const owner = auth.currentUser?.uid;
                    if (owner) setUserComment(owner, user.userId, comments[user.userId] || '');
                  }}
                />
              </CardWrapper>
            );
          })}
          {loading && Array.from({ length: 4 }).map((_, idx) => <SkeletonCard data-card key={`skeleton-${idx}`} />)}
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
            {isAdmin && getCurrentValue(selected.myComment) && (
              <MoreInfo $isAdmin={isAdmin}>
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
            </Contact>
            <ResizableCommentInput
              mt="10px"
              value={comments[selected.userId] || ''}
              onChange={e => setComments(prev => ({ ...prev, [selected.userId]: e.target.value }))}
              onBlur={() => {
                const owner = auth.currentUser?.uid;
                if (owner) setUserComment(owner, selected.userId, comments[selected.userId] || '');
              }}
            />
            <Id
              onClick={() => {
                if (isAdmin) {
                  navigate(`/edit/${selected.userId}`);
                }
              }}
              style={{ cursor: isAdmin ? 'pointer' : 'default' }}
            >
              ID: {selected.userId ? selected.userId.slice(0, 5) : ''}
            </Id>
          </DonorCard>
        </ModalOverlay>
      )}
      {showPhoto && (
        <PhotoViewer
          photos={Array.isArray(selected.photos) ? selected.photos : [getCurrentValue(selected.photos)].filter(Boolean)}
          onClose={() => setShowPhoto(false)}
        />
      )}
      {showUserCard && selected && (
        <ModalOverlay onClick={() => setShowUserCard(false)}>
          <div onClick={e => e.stopPropagation()} style={{ maxHeight: '80vh', overflowY: 'auto' }}>
            <UserCard
              userData={selected}
              setUsers={() => {}}
              setShowInfoModal={() => {}}
              setState={() => {}}
              favoriteUsers={{}}
              setFavoriteUsers={() => {}}
              currentFilter={null}
              isDateInRange={() => true}
            />
          </div>
        </ModalOverlay>
      )}
      {showInfoModal && (
        <InfoModal onClose={() => setShowInfoModal(false)} text="dotsMenu" Context={dotsMenu} />
      )}
    </>
  );
};

export default Matching;
