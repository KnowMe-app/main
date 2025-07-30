import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserCard } from './UsersList';
import { utilCalculateAge } from './smallCard/utilCalculateAge';
import styled, { keyframes } from 'styled-components';
import { color } from './styles';
import toast from 'react-hot-toast';
import {
  fetchUsersByLastLogin2,
  fetchUserById,
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
  updateDataInRealtimeDB,
  updateDataInFiresoreDB,
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
import { loadCache, saveCache } from "../hooks/useMatchingCache";
import { getCurrentDate } from './foramtDate';
import InfoModal from './InfoModal';
import { FaFilter, FaTimes, FaHeart, FaEllipsisV } from 'react-icons/fa';
import { handleEmptyFetch } from './loadMoreUtils';
import {
  normalizeLocation,
  normalizeCountry,
  normalizeRegion,
} from './normalizeLocation';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 5px;
  background-color: #f5f5f5;

  @media (max-width: 768px) {
    padding: 0;
  }
`;

const InnerContainer = styled.div`
  max-width: 480px;
  width: 100%;
  background-color: #f0f0f0;
  padding: 20px 0;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
  border-radius: 8px;
  box-sizing: border-box;
  position: relative;

  @media (max-width: 768px) {
    background-color: #f5f5f5;
    box-shadow: 0 4px 8px #f5f5f5;
    border-radius: 0;
  }
`;


const Grid = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding: 10px 10px 0;
  justify-content: center;
  max-height: 80vh;
  overflow-y: auto;
`;

const CardContainer = styled.div`
  position: relative;
  width: 100%;
`;

const NextPhoto = styled.img`
  position: absolute;
  top: -3px;
  right: -3px;
  width: 100%;
  height: 100%;
  object-fit: cover;
  border: 2px solid ${color.gray3};
  border-radius: 8px;
  z-index: 0;
`;

const ThirdPhoto = styled.img`
  position: absolute;
  top: -6px;
  right: -6px;
  width: 100%;
  height: 100%;
  object-fit: cover;
  border: 2px solid ${color.gray4};
  border-radius: 8px;
  z-index: -1;
`;

const CardWrapper = styled.div`
  position: relative;
  width: 100%;
  border: 2px solid ${color.gray3};
  border-radius: 8px;
  box-sizing: border-box;
  overflow: hidden;
  background: #fff;
  z-index: 1;
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
  min-height: 20px;
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
  height: ${({ $small, $hasPhoto }) => {
    const base = $small ? 30 : 50;
    return `${$hasPhoto ? base : base / 2}vh`;
  }};
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
  height: ${({ $small }) => ($small ? '30vh' : '50vh')};
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

const NameText = styled.span`
  color: ${color.black};
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

const BasicInfo = styled.div`
  position: absolute;
  bottom: 55px;
  left: 0;
  width: 100%;
  text-align: left;
  color: white;
  font-weight: bold;
  text-shadow: 0 0 2px black;
  pointer-events: none;
  line-height: 1.2;
`;

const CardInfo = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  padding: 5px;
  background: rgba(255, 255, 255, 0.8);
  color: ${color.black};
  font-size: 14px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
`;

const RoleHeader = styled(Title)`
  margin-bottom: 2px;
`;

const AdminToggle = styled.div`
  position: absolute;
  top: 5px;
  right: 5px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: ${props => (props.published ? 'green' : 'red')};
  z-index: 10;
  cursor: pointer;
`;

const Id = styled.div`
  font-size: 12px;
  color: ${color.gray3};
  text-align: right;
  margin-top: 5px;
`;

const DescriptionPage = styled.div`
  width: 100%;
  height: 100%;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  color: ${color.black};
`;

const InfoSlide = styled.div`
  width: 100%;
  height: 100%;
  background: #f0f0f0;
  color: ${color.black};
  overflow-y: auto;
  box-sizing: border-box;
  padding: 10px;
`;

const slideLeft = keyframes`
  from {
    transform: translateX(100%);
  }
  to {
    transform: translateX(0);
  }
`;

const slideRight = keyframes`
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(0);
  }
`;

const AnimatedCard = styled(Card)`
  animation: ${({ $dir }) =>
    $dir === 'left'
      ? slideLeft
      : $dir === 'right'
      ? slideRight
      : 'none'} 0.3s ease;
`;

const SwipeableCard = ({
  user,
  photo,
  role,
  isAgency,
  nameParts,
  isAdmin,
  favoriteUsers,
  setFavoriteUsers,
  dislikeUsers,
  setDislikeUsers,
  viewMode,
  handleRemove,
  togglePublish,
  onSelect,
}) => {
  const wordCount = text =>
    text ? text.trim().split(/\s+/).filter(Boolean).length : 0;

  const moreInfo = getCurrentValue(user.moreInfo_main);
  const profession = getCurrentValue(user.profession);

  const moreInfoWords = wordCount(moreInfo);
  const professionWords = wordCount(profession);
  const showDescriptionSlide = moreInfoWords > 10 || professionWords > 10;

  const slides = React.useMemo(() => {
    const photos = Array.isArray(user.photos)
      ? user.photos
      : [getCurrentValue(user.photos)].filter(Boolean);
    const base = ['main', ...photos];
    if (showDescriptionSlide) base.push('description');
    base.push('info');
    return base;
  }, [user.photos, showDescriptionSlide]);

  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState(null);
  const startX = useRef(null);
  const wasSwiped = useRef(false);

  const handleTouchStart = e => {
    if (e.touches && e.touches.length > 0) {
      startX.current = e.touches[0].clientX;
    }
  };

  const handleTouchEnd = e => {
    if (startX.current === null) return;
    const deltaX = e.changedTouches[0].clientX - startX.current;
    if (deltaX > 50) {
      setDir('right');
      setIndex(i => (i - 1 + slides.length) % slides.length);
      wasSwiped.current = true;
      setTimeout(() => {
        wasSwiped.current = false;
      }, 50);
    } else if (deltaX < -50) {
      setDir('left');
      setIndex(i => (i + 1) % slides.length);
      wasSwiped.current = true;
      setTimeout(() => {
        wasSwiped.current = false;
      }, 50);
    }
    startX.current = null;
  };

  useEffect(() => {
    if (dir) {
      const t = setTimeout(() => setDir(null), 300);
      return () => clearTimeout(t);
    }
  }, [dir]);

  const handleClick = () => {
    if (wasSwiped.current) {
      wasSwiped.current = false;
      return;
    }
    onSelect(user);
  };

  const current = slides[index];
  const style =
    current === 'main'
      ? photo
        ? { backgroundImage: `url(${photo})`, backgroundColor: 'transparent' }
        : { backgroundColor: '#fff' }
      : current !== 'description' && current !== 'info'
      ? { backgroundImage: `url(${current})`, backgroundColor: 'transparent' }
      : { backgroundColor: '#fff' };

  return (
    <AnimatedCard
      $dir={dir}
      $small={isAgency}
      $hasPhoto={!!photo}
      data-card
      onClick={handleClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      style={style}
    >
      {current === 'description' && (
        <DescriptionPage style={{ whiteSpace: 'pre-wrap', padding: '10px' }}>
          {moreInfoWords > 10 && <div>{moreInfo}</div>}
          {professionWords > 10 && <div>{profession}</div>}
        </DescriptionPage>
      )}
      {current === 'info' && (
        <InfoSlide>
          <ProfileSection>
            <Info>
              <Title>Egg donor profile</Title>
              <strong>
                {(getCurrentValue(user.surname) || '').trim()} {(getCurrentValue(user.name) || '').trim()}
                {user.birth ? `, ${utilCalculateAge(user.birth)}` : ''}
              </strong>
              <br />
              {normalizeLocation([
                getCurrentValue(user.region),
                getCurrentValue(user.city),
              ]
                .filter(Boolean)
                .join(', '))}
            </Info>
          </ProfileSection>
          <Table>{renderSelectedFields(user)}</Table>
          {getCurrentValue(user.profession) && (
            <MoreInfo>
              <strong>Profession</strong>
              <br />
              {getCurrentValue(user.profession)}
            </MoreInfo>
          )}
          {getCurrentValue(user.moreInfo_main) && (
            <MoreInfo>
              <strong>More information</strong>
              <br />
              {getCurrentValue(user.moreInfo_main)}
            </MoreInfo>
          )}
          <Contact>
            <Icons>{fieldContactsIcons(user)}</Icons>
          </Contact>
        </InfoSlide>
      )}
      {current === 'main' && (
        <BasicInfo>
          {(getCurrentValue(user.name) || '').trim()} {(getCurrentValue(user.surname) || '').trim()}
          {user.birth ? `, ${utilCalculateAge(user.birth)}` : ''}
          <br />
          {[
            normalizeCountry(getCurrentValue(user.country)),
            normalizeRegion(getCurrentValue(user.region)),
          ]
            .filter(Boolean)
            .join(', ')}
        </BasicInfo>
      )}
      {current === 'main' && isAdmin && (
        <AdminToggle
          published={user.publish}
          onClick={e => {
            e.stopPropagation();
            togglePublish(user);
          }}
        />
      )}
      {current === 'main' && (
        <>
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
        </>
      )}
      {current === 'main' && isAgency && (
        <CardInfo>
          <RoleHeader>{role === 'ag' ? 'Agency' : 'Couple'}</RoleHeader>
          {nameParts && (
            <div>
              <strong>{nameParts}</strong>
            </div>
          )}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              flexWrap: 'wrap',
              justifyContent: 'flex-start',
            }}
          >
            {getCurrentValue(user.country) && (
              <span>{normalizeCountry(getCurrentValue(user.country))}</span>
            )}
            <Icons>{fieldContactsIcons(user)}</Icons>
          </div>
        </CardInfo>
      )}
    </AnimatedCard>
  );
};

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

const Matching = () => {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [lastKey, setLastKey] = useState(undefined);
  const [hasMore, setHasMore] = useState(true);
  const [selected, setSelected] = useState(null);
  const [showPhoto, setShowPhoto] = useState(false);
  const [favoriteUsers, setFavoriteUsers] = useState({});
  const [dislikeUsers, setDislikeUsers] = useState({});
  const favoriteUsersRef = useRef(favoriteUsers);
  const dislikeUsersRef = useRef(dislikeUsers);
  const [viewMode, setViewMode] = useState('default');
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({});
  const [comments, setComments] = useState({});
  const [showUserCard, setShowUserCard] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [userScrolled, setUserScrolled] = useState(false);
  const isAdmin = auth.currentUser?.uid === process.env.REACT_APP_USER1;
  const loadingRef = useRef(false);
  const loadedIdsRef = useRef(new Set());

  const countWords = text =>
    text ? text.trim().split(/\s+/).filter(Boolean).length : 0;

  const selectedProfession = selected ? getCurrentValue(selected.profession) : '';
  const selectedMoreInfoMain = selected ? getCurrentValue(selected.moreInfo_main) : '';
  const selectedProfessionWords = countWords(selectedProfession);
  const selectedMoreInfoWords = countWords(selectedMoreInfoMain);
  const handleRemove = id => {
    setUsers(prev => prev.filter(u => u.userId !== id));
  };

  const togglePublish = async user => {
    if (!isAdmin) return;
    const newValue = !user.publish;
    setUsers(prev =>
      prev.map(u =>
        u.userId === user.userId ? { ...u, publish: newValue } : u
      )
    );
    try {
      await updateDataInRealtimeDB(user.userId, { publish: newValue }, 'update');
      await updateDataInFiresoreDB(user.userId, { publish: newValue }, 'update');
    } catch (err) {
      console.error('Failed to toggle publish', err);
    }
  };

  const applySearchResults = async res => {
    const arr = Array.isArray(res) ? res : Object.values(res || {});
    setUsers(arr);
    setHasMore(false);
    await loadCommentsFor(arr);
  };

  useEffect(() => {
    favoriteUsersRef.current = favoriteUsers;
  }, [favoriteUsers]);

  useEffect(() => {
    dislikeUsersRef.current = dislikeUsers;
  }, [dislikeUsers]);

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
      lastDate,
      exclude = new Set(),
      onPart
    ) => {
      const res = await fetchUsersByLastLogin2(
        limit + exclude.size + 1,
        lastDate
      );

      const filtered = filterMain(
        res.users.map(u => [u.userId, u]),
        null,
        filters,
        favoriteUsersRef.current
      )
        .map(([id, u]) => u)
        .filter(u => !exclude.has(u.userId));

      const excluded = res.users.length - filtered.length;
      const hasMore = filtered.length > limit || res.hasMore;
      const slice = filtered.slice(0, limit);
      const enrichedSlice = await Promise.all(
        slice.map(user => fetchUserById(user.userId))
      );
      const validSlice = enrichedSlice.filter(Boolean);
      if (onPart) onPart(validSlice);

      return {
        users: validSlice,
        lastKey: res.lastKey,
        hasMore,
        excludedCount: excluded,
      };
    },
    [filters]
  );

  const loadInitial = React.useCallback(async () => {
    console.log('[loadInitial] start');
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

      const cacheKey = JSON.stringify(filters || {});
      const cached = loadCache(cacheKey);
      if (cached) {
        console.log('[loadInitial] using cache', cached.users.length);
        loadedIdsRef.current = new Set(cached.users.map(u => u.userId));
        setUsers(cached.users);
        await loadCommentsFor(cached.users);
        setLastKey(cached.lastKey);
        setHasMore(cached.hasMore);
        setViewMode('default');
        // continue to fetch latest data to refresh cache
      }
      const res = await fetchChunk(
        INITIAL_LOAD,
        undefined,
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
        const result = Array.from(map.values());
        saveCache(cacheKey, { users: result, lastKey: res.lastKey, hasMore: res.hasMore });
        return result;
      });
      await loadCommentsFor(res.users);
      if (res.excludedCount) {
        toast.success(`${res.excludedCount} excluded`, { id: 'matching-excluded' });
      }
      setLastKey(res.lastKey);
      setHasMore(res.hasMore);
      setViewMode('default');
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [fetchChunk, filters]); // include fetchChunk to satisfy react-hooks/exhaustive-deps

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
    if (!hasMore || loadingRef.current || viewMode !== 'default') {
      console.log('[loadMore] skip', { hasMore, loading: loadingRef.current, viewMode });
      return;
    }
    console.log('[loadMore] start', { lastKey, hasMore });
    loadingRef.current = true;
    setLoading(true);
    try {
      const exclude = new Set([
        ...Object.keys(favoriteUsersRef.current),
        ...Object.keys(dislikeUsersRef.current),
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
      console.log('[loadMore] loaded', res.users.length, 'lastKey', lastKey, 'hasMore', res.hasMore);
      const unique = res.users.filter(u => !loadedIdsRef.current.has(u.userId));
      unique.forEach(u => loadedIdsRef.current.add(u.userId));
      setUsers(prev => {
        const map = new Map(prev.map(u => [u.userId, u]));
        unique.forEach(u => map.set(u.userId, u));
        const result = Array.from(map.values());
        const cacheKey = JSON.stringify(filters || {});
        saveCache(cacheKey, { users: result, lastKey: res.lastKey, hasMore: res.hasMore });
        return result;
      });
      await loadCommentsFor(unique);
      if (res.excludedCount) {
        toast.success(`${res.excludedCount} excluded`, { id: 'matching-excluded' });
      }
      if (handleEmptyFetch(res, lastKey, setHasMore)) {
        console.log('[loadMore] empty fetch, no more cards');
        toast.error('No more cards found', { id: 'matching-no-more' });
      } else {
        setHasMore(res.hasMore);
      }
      setLastKey(res.lastKey);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [hasMore, lastKey, viewMode, fetchChunk, filters]);

  useEffect(() => {
    console.log('[useEffect] calling loadInitial');
    loadInitial();
  }, [loadInitial]);

  const gridRef = useRef(null);
  const observerRef = useRef(null);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const onScroll = () => setUserScrolled(true);
    grid.addEventListener('scroll', onScroll);
    return () => grid.removeEventListener('scroll', onScroll);
  }, []);

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
    if (filteredUsers.length < 6 && hasMore) {
      console.log('[useEffect] few users left, loading more');
      loadMore();
    }
  }, [filteredUsers.length, hasMore, loadMore]);

  useEffect(() => {
    if (!gridRef.current || !hasMore || !userScrolled) return;

    console.log('[useEffect] setting up IntersectionObserver');

    const cards = gridRef.current.querySelectorAll(
      '[data-card]:not([data-skeleton])'
    );
    const index = filteredUsers.length > 3 ? filteredUsers.length - 3 : filteredUsers.length - 1;
    const target = cards[index];
    if (!target) return;

    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting) {
          console.log('[IntersectionObserver] trigger loadMore');
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
  }, [loadMore, filteredUsers.length, hasMore, userScrolled]);

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
      <Container>
        <InnerContainer>
          <div style={{ position: 'relative' }}>
            <TopActions>
              <ActionButton onClick={() => setShowFilters(s => !s)}><FaFilter /></ActionButton>
              <ActionButton onClick={loadDislikeCards}><FaTimes /></ActionButton>
              <ActionButton onClick={loadFavoriteCards}><FaHeart /></ActionButton>
              <ActionButton onClick={() => setShowInfoModal('dotsMenu')}><FaEllipsisV /></ActionButton>
            </TopActions>
            {isAdmin && <p style={{ textAlign: 'center', color: 'black' }}>{filteredUsers.length} карточок</p>}

            <Grid ref={gridRef}>
              {filteredUsers.map(user => {
                const photos = Array.isArray(user.photos)
                  ? user.photos
                  : [getCurrentValue(user.photos)].filter(Boolean);
                const photo = photos[0];
                const nextPhoto = photos[1];
                const thirdPhoto = photos[2];
                const role = (user.role || user.userRole || '')
                  .toString()
                  .trim()
                  .toLowerCase();
                const isAgency = role === 'ag' || role === 'ip';
                const nameParts = [getCurrentValue(user.name), getCurrentValue(user.surname)]
                  .filter(Boolean)
                  .join(' ');
                return (
                  <CardContainer key={user.userId}>
                    {thirdPhoto && <ThirdPhoto src={thirdPhoto} alt="third" />}
                    {nextPhoto && <NextPhoto src={nextPhoto} alt="next" />}
                    <CardWrapper>
                      <SwipeableCard
                        user={user}
                        photo={photo}
                        role={role}
                        isAgency={isAgency}
                        nameParts={nameParts}
                        isAdmin={isAdmin}
                        favoriteUsers={favoriteUsers}
                        setFavoriteUsers={setFavoriteUsers}
                        dislikeUsers={dislikeUsers}
                        setDislikeUsers={setDislikeUsers}
                        viewMode={viewMode}
                        handleRemove={handleRemove}
                        togglePublish={togglePublish}
                        onSelect={setSelected}
                      />
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
                  </CardContainer>
                );
              })}
          {loading &&
            Array.from({ length: 4 }).map((_, idx) => (
              <SkeletonCard data-card data-skeleton key={`skeleton-${idx}`} />
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
                {normalizeLocation([
                  getCurrentValue(selected.region),
                  getCurrentValue(selected.city),
                ]
                  .filter(Boolean)
                  .join(', '))}
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
            {selectedProfession && selectedProfessionWords <= 10 && (
              <MoreInfo>
                <strong>Profession</strong>
                <br />
                {selectedProfession}
              </MoreInfo>
            )}
            {selectedMoreInfoMain && selectedMoreInfoWords <= 10 && (
              <MoreInfo>
                <strong>More information</strong>
                <br />
                {selectedMoreInfoMain}
              </MoreInfo>
            )}
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
          {(selectedProfessionWords > 10 || selectedMoreInfoWords > 10) && (
            <DonorCard onClick={e => e.stopPropagation()}>
              {selectedProfessionWords > 10 && (
                <MoreInfo>
                  <strong>Profession</strong>
                  <br />
                  {selectedProfession}
                </MoreInfo>
              )}
              {selectedMoreInfoWords > 10 && (
                <MoreInfo>
                  <strong>More information</strong>
                  <br />
                  {selectedMoreInfoMain}
                </MoreInfo>
              )}
            </DonorCard>
          )}
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
        </InnerContainer>
      </Container>
    </>
  );
};

export default Matching;
