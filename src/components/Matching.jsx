import React, { useEffect, useState, useRef, useLayoutEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { utilCalculateAge } from './smallCard/utilCalculateAge';
import styled, { keyframes } from 'styled-components';
import { color } from './styles';
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
import SearchBar from './SearchBar';
import FilterPanel from './FilterPanel';
import { useAutoResize } from '../hooks/useAutoResize';
import { loadCache, saveCache } from "../hooks/cardsCache";
import { getCacheKey, clearAllCardsCache, setFavoriteIds } from "../utils/cache";
import { normalizeQueryKey, getIdsByQuery, setIdsForQuery } from '../utils/cardIndex';
import { getCurrentDate } from './foramtDate';
import InfoModal from './InfoModal';
import { FaFilter, FaTimes, FaHeart, FaEllipsisV, FaArrowDown, FaDownload } from 'react-icons/fa';
import { handleEmptyFetch } from './loadMoreUtils';
import {
  normalizeCountry,
  normalizeRegion,
} from './normalizeLocation';
import { convertDriveLinkToImage } from '../utils/convertDriveLinkToImage';
import {
  cacheFavoriteUsers,
  syncFavorites,
  getFavorites,
  getFavoriteCards,
} from '../utils/favoritesStorage';
import {
  cacheDislikedUsers,
  syncDislikes,
  getDislikes,
  getDislikedCards,
} from '../utils/dislikesStorage';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0;
  background-color: #f5f5f5;
`;

const InnerContainer = styled.div`
  max-width: 480px;
  width: 100%;
  background-color: #f0f0f0;
  padding: 0;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
  border-radius: 8px;
  box-sizing: border-box;
  position: relative;

  display: flex;
  flex-direction: column;

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
  padding: 0 10px;
  justify-content: center;
`;

const CardContainer = styled.div`
  position: relative;
  width: 100%;
  overflow: hidden;
  max-height: 1000px;
  transition: max-height 0.3s ease, margin 0.3s ease, opacity 0.3s ease,
    transform 0.3s ease;

  &.removing {
    max-height: 0;
    margin: 0;
    opacity: 0;
  }

  &.removing.up {
    transform: translateY(-100%);
  }

  &.removing.down {
    transform: translateY(100%);
  }
`;

const NextPhoto = styled.img`
  position: absolute;
  top: 0;
  right: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  box-sizing: border-box;
  border: 2px solid ${color.gray3};
  border-radius: 8px;
  transform: translate(4px, -4px);
  z-index: 1;
`;

const ThirdPhoto = styled.img`
  position: absolute;
  top: 0;
  right: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  box-sizing: border-box;
  border: 2px solid ${color.gray4};
  border-radius: 8px;
  transform: translate(8px, -8px);
  z-index: 0;
`;

const NextInfoCard = styled.div`
  position: absolute;
  top: 0;
  right: 0;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  border: 2px solid ${color.gray3};
  border-radius: 8px;
  transform: translate(4px, -4px);
  z-index: 1;
  background: #fff;
  overflow: hidden;
`;

const ThirdInfoCard = styled(NextInfoCard)`
  border-color: ${color.gray4};
  transform: translate(8px, -8px);
  z-index: 0;
`;

const CardWrapper = styled.div`
  position: relative;
  width: 100%;
  border: 2px solid ${color.gray3};
  border-radius: 8px;
  box-sizing: border-box;
  overflow: hidden;
  background: #fff;
  z-index: 2;
`;

const CommentInput = styled.textarea`
  width: 100%;
  margin: 0;
  display: block;
  box-sizing: border-box;
  margin-left: auto;
  margin-right: auto;
  padding: 0;
  resize: none;
  overflow: hidden;
  min-height: 16px;
  line-height: 16px;
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
  height: ${({ $small }) => {
    const base = $small ? 30 : 50;
    return `${base}vh`;
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
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
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
  &:disabled {
    background-color: ${color.gray3};
    color: ${color.gray4};
    cursor: default;
  }
`;

const HeaderContainer = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px;
`;

const CardCount = styled.p`
  width: 100%;
  margin: 0;
  text-align: center;
  color: black;
`;

const LoadMoreButton = styled(ActionButton)`
  margin: 10px auto;
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

// Components below were previously defined for a modal that is no longer
// rendered. They were causing "assigned a value but never used" warnings
// during builds, so the unused definitions have been removed.

const Title = styled.span`
  color: ${color.accent};
  font-weight: bold;
  margin-bottom: 4px;
  margin-right: 4px;
  display: inline-block;
`;

const DonorName = styled.strong`
  display: inline;
  margin-bottom: 2px;
  line-height: 1.2;
`;

const ProfileSection = styled.div`
  display: flex;
  align-items: center;
  margin-bottom: 15px;
  border-bottom: 1px solid ${color.gray4};
  padding-bottom: 10px;
`;

const Info = styled.div`
  flex: 1;
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
  left: 10px;
  right: 0;
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

const HeaderRow = styled.div`
  display: flex;
  align-items: baseline;
  gap: 4px;
  flex-wrap: wrap;
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
  position: absolute;
  right: 10px;
  bottom: 10px;
  z-index: 2;
  font-size: 12px;
  color: ${color.gray3};
  text-align: right;
  display: inline-block;
  padding-right: 4px;
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
}) => {
  const moreInfo = getCurrentValue(user.moreInfo_main);
  const profession = getCurrentValue(user.profession);
  const education = getCurrentValue(user.education);

  const showDescriptionSlide = Boolean(moreInfo || profession || education);

  const slides = React.useMemo(() => {
    const photosArr = Array.isArray(user.photos)
      ? user.photos.filter(Boolean).map(convertDriveLinkToImage)
      : [getCurrentValue(user.photos)]
          .filter(Boolean)
          .map(convertDriveLinkToImage);
    const base = photo ? ['main', 'info'] : ['info'];
    if (showDescriptionSlide) base.push('description');
    base.push(...photosArr.slice(1));
    return base;
  }, [user.photos, showDescriptionSlide, photo]);

  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState(null);
  const startX = useRef(null);
  const wasSwiped = useRef(false);

  const handleTouchStart = e => {
    if (slides.length <= 1) return;
    if (e.touches && e.touches.length > 0) {
      startX.current = e.touches[0].clientX;
    }
  };

  const handleTouchEnd = e => {
    if (slides.length <= 1) return;
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

  const handleClick = e => {
    if (wasSwiped.current) {
      wasSwiped.current = false;
      return;
    }
    if (slides.length > 1) {
      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      if (clickX > rect.width / 2) {
        setDir('left');
        setIndex(i => (i + 1) % slides.length);
      } else {
        setDir('right');
        setIndex(i => (i - 1 + slides.length) % slides.length);
      }
    }
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

  const displayName = [
    getCurrentValue(user.name),
    getCurrentValue(user.surname),
  ]
    .filter(Boolean)
    .map(v => String(v).trim())
    .join(' ');

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
        <InfoSlide>
          {education && (
            <MoreInfo>
              <strong>Education</strong>
              <br />
              {education}
            </MoreInfo>
          )}
          {profession && (
            <MoreInfo>
              <strong>Profession</strong>
              <br />
              {profession}
            </MoreInfo>
          )}
          {moreInfo && (
            <MoreInfo>
              <strong>More information</strong>
              <br />
              {moreInfo}
            </MoreInfo>
          )}
        </InfoSlide>
      )}
      {current === 'info' && (
        <InfoSlide>
          <ProfileSection>
            <Info>
              <Title>Egg donor</Title>
              <DonorName>
                {displayName}
                {user.birth ? `, ${utilCalculateAge(user.birth)}` : ''}
              </DonorName>
              <br />
              {[
                normalizeCountry(getCurrentValue(user.country)),
                normalizeRegion(getCurrentValue(user.region)),
              ]
                .filter(Boolean)
                .join(', ')}
            </Info>
          </ProfileSection>
          <Table>{renderSelectedFields(user)}</Table>
          <Contact>
            <Icons>{fieldContactsIcons(user)}</Icons>
          </Contact>
        </InfoSlide>
      )}
      {current === 'main' && (
        <BasicInfo>
          {displayName}
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
      {(current === 'main' || (!photo && current === 'info')) && isAdmin && (
        <AdminToggle
          published={user.publish}
          onClick={e => {
            e.stopPropagation();
            togglePublish(user);
          }}
        />
      )}
      <BtnFavorite
        userId={user.userId}
        userData={user}
        favoriteUsers={favoriteUsers}
        setFavoriteUsers={setFavoriteUsers}
        dislikeUsers={dislikeUsers}
        setDislikeUsers={setDislikeUsers}
        onRemove={viewMode !== 'default' ? handleRemove : undefined}
      />
      <BtnDislike
        userId={user.userId}
        userData={user}
        dislikeUsers={dislikeUsers}
        setDislikeUsers={setDislikeUsers}
        favoriteUsers={favoriteUsers}
        setFavoriteUsers={setFavoriteUsers}
        onRemove={viewMode !== 'default' ? handleRemove : undefined}
      />
      {current === 'main' && isAgency && (
        <CardInfo>
          <HeaderRow>
            <RoleHeader>{role === 'ag' ? 'Agency' : 'Couple'}</RoleHeader>
            {nameParts && <strong>{nameParts}</strong>}
          </HeaderRow>
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
      {(current === 'info' || current === 'main') && null}
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

const getInfoSlidesCount = user => {
  const moreInfo = getCurrentValue(user.moreInfo_main);
  const profession = getCurrentValue(user.profession);
  const education = getCurrentValue(user.education);
  const showDescriptionSlide = Boolean(moreInfo || profession || education);
  return 1 + (showDescriptionSlide ? 1 : 0);
};

const InfoCardContent = ({ user, variant }) => {
  const moreInfo = getCurrentValue(user.moreInfo_main);
  const profession = getCurrentValue(user.profession);
  const education = getCurrentValue(user.education);

  const displayName = [
    getCurrentValue(user.name),
    getCurrentValue(user.surname),
  ]
    .filter(Boolean)
    .map(v => String(v).trim())
    .join(' ');

  if (variant === 'description') {
    return (
      <InfoSlide>
        {education && (
          <MoreInfo>
            <strong>Education</strong>
            <br />
            {education}
          </MoreInfo>
        )}
        {profession && (
          <MoreInfo>
            <strong>Profession</strong>
            <br />
            {profession}
          </MoreInfo>
        )}
        {moreInfo && (
          <MoreInfo>
            <strong>More information</strong>
            <br />
            {moreInfo}
          </MoreInfo>
        )}
      </InfoSlide>
    );
  }

  return (
    <InfoSlide>
      <ProfileSection>
        <Info>
          <Title>Egg donor</Title>
          <DonorName>
            {displayName}
            {user.birth ? `, ${utilCalculateAge(user.birth)}` : ''}
          </DonorName>
          <br />
          {[
            normalizeCountry(getCurrentValue(user.country)),
            normalizeRegion(getCurrentValue(user.region)),
          ]
            .filter(Boolean)
            .join(', ')}
        </Info>
      </ProfileSection>
      <Table>{renderSelectedFields(user)}</Table>
      <Contact>
        <Icons>{fieldContactsIcons(user)}</Icons>
      </Contact>
    </InfoSlide>
  );
};


const INITIAL_LOAD = 6;
const LOAD_MORE = 6;
const SCROLL_Y_KEY = 'matchingScrollY';
const SEARCH_KEY = 'matchingSearchQuery';

const Matching = () => {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [lastKey, setLastKey] = useState(undefined);
  const [hasMore, setHasMore] = useState(true);
  // removed selected user modal logic
  const [favoriteUsers, setFavoriteUsers] = useState({});
  const [dislikeUsers, setDislikeUsers] = useState({});
  const [removing, setRemoving] = useState({});
  const favoriteUsersRef = useRef(favoriteUsers);
  const dislikeUsersRef = useRef(dislikeUsers);
  const [viewMode, setViewMode] = useState('default');
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({});
  const [comments, setComments] = useState({});
  const [showFilters, setShowFilters] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const isAdmin = auth.currentUser?.uid === process.env.REACT_APP_USER1;
  const loadingRef = useRef(false);
  const loadedIdsRef = useRef(new Set());
  const restoreRef = useRef(false);
  const scrollPositionRef = useRef(0);
  const saveScrollPosition = () => {
    sessionStorage.setItem(SCROLL_Y_KEY, String(scrollPositionRef.current));
  };
  const handleRemove = (id, dir = 'up') => {
    setRemoving(prev => ({ ...prev, [id]: dir }));
  };

  const handleTransitionEnd = id => {
    setUsers(prev => prev.filter(u => u.userId !== id));
    setRemoving(prev => {
      const { [id]: _, ...rest } = prev;
      return rest;
    });
  };
  useEffect(() => {
    window.history.scrollRestoration = 'manual';
    const handleScroll = () => {
      scrollPositionRef.current = window.scrollY;
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll);
      saveScrollPosition();
    };
  }, []);

  useLayoutEffect(() => {
    if (restoreRef.current || loading || users.length === 0) return;
    const savedY = sessionStorage.getItem(SCROLL_Y_KEY);
    if (savedY !== null) {
      requestAnimationFrame(() => {
        window.scrollTo(0, Number(savedY));
        restoreRef.current = true;
        sessionStorage.removeItem(SCROLL_Y_KEY);
      });
    }
  }, [loading, users]);

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
    setLastKey(null);
    setViewMode('search');
  };

  useEffect(() => {
    favoriteUsersRef.current = favoriteUsers;
  }, [favoriteUsers]);

  useEffect(() => {
    dislikeUsersRef.current = dislikeUsers;
  }, [dislikeUsers]);

  useEffect(() => {
    setUsers(prev => {
      if (viewMode === 'favorites') {
        return prev.filter(u => favoriteUsers[u.userId]);
      }
      if (viewMode === 'dislikes') {
        return prev.filter(u => dislikeUsers[u.userId]);
      }
      return prev.filter(
        u => !favoriteUsers[u.userId] && !dislikeUsers[u.userId]
      );
    });
  }, [favoriteUsers, dislikeUsers, viewMode]);

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
    setUsers([]); // clear previous list to avoid caching wrong data
    loadedIdsRef.current = new Set();
    try {
      const owner = auth.currentUser?.uid;
      let exclude = new Set();
      const localFav = getFavorites();
      const localDis = getDislikes();
      if (Object.keys(localFav).length || Object.keys(localDis).length) {
        setFavoriteUsers(localFav);
        setDislikeUsers(localDis);
        exclude = new Set([
          ...Object.keys(localFav),
          ...Object.keys(localDis),
        ]);
      }
      if (owner) {
        const [favIds, disIds] = await Promise.all([
          fetchFavoriteUsers(owner),
          fetchDislikeUsers(owner),
        ]);
        setFavoriteUsers(favIds);
        setDislikeUsers(disIds);
        syncFavorites(favIds);
        syncDislikes(disIds);
        exclude = new Set([...Object.keys(favIds), ...Object.keys(disIds)]);
      }

      const cacheKey = getCacheKey('default');
      const cached = loadCache(cacheKey);
      if (cached) {
        console.log('[loadInitial] using cache', cached.users.length);
        const filteredCached = cached.users.filter(
          u => !exclude.has(u.userId)
        );
        loadedIdsRef.current = new Set(filteredCached.map(u => u.userId));
        setUsers(filteredCached);
        await loadCommentsFor(filteredCached);
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
      loadedIdsRef.current = new Set([
        ...loadedIdsRef.current,
        ...res.users.map(u => u.userId),
      ]);
      setUsers(prev => {
        const map = new Map(prev.map(u => [u.userId, u]));
        res.users.forEach(u => map.set(u.userId, u));
        const result = Array.from(map.values());
        saveCache(cacheKey, {
          users: result,
          lastKey: res.lastKey,
          hasMore: res.hasMore,
        });
        return result;
      });
      await loadCommentsFor(res.users);
      setLastKey(res.lastKey);
      setHasMore(res.hasMore);
      setViewMode('default');
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [fetchChunk]); // include fetchChunk to satisfy react-hooks/exhaustive-deps

  const loadFavoriteCards = async () => {
    const owner = auth.currentUser?.uid;
    if (!owner) return;
    setLoading(true);
    setUsers([]);

    const localIds = getIdsByQuery('favorite');
    if (localIds.length > 0) {
      const localFav = getFavorites();
      const favMap = Object.fromEntries(
        Object.keys(localFav)
          .filter(id => id.length > 20)
          .map(id => [id, true])
      );
      setFavoriteUsers(favMap);
      setFavoriteIds(favMap);
      const list = (await getFavoriteCards(id => fetchUserById(id)))
        .filter(u => (u?.id || u?.userId || '').length > 20);
      loadedIdsRef.current = new Set(list.map(u => u.id));
      setUsers(list);
      await loadCommentsFor(list);
      setHasMore(false);
      setLastKey(null);
      setViewMode('favorites');
      setLoading(false);
      return;
    }

    const favUsers = await fetchFavoriteUsersData(owner);
    const validEntries = Object.entries(favUsers).filter(([id]) => id.length > 20);
    const favUsersFiltered = Object.fromEntries(validEntries);
    const favMap = Object.fromEntries(validEntries.map(([id]) => [id, true]));
    syncFavorites(favMap);
    setFavoriteUsers(favMap);
    setFavoriteIds(favMap);
    cacheFavoriteUsers(favUsersFiltered);
    const list = (await getFavoriteCards(id => fetchUserById(id)))
      .filter(u => (u?.id || u?.userId || '').length > 20);
    loadedIdsRef.current = new Set(list.map(u => u.id));
    setUsers(list);
    await loadCommentsFor(list);
    setHasMore(false);
    setLastKey(null);
    setViewMode('favorites');
    setLoading(false);
  };

  const loadDislikeCards = async () => {
    const owner = auth.currentUser?.uid;
    if (!owner) return;
    setLoading(true);

    const localIds = getIdsByQuery('dislike');
    if (localIds.length > 0) {
      const localDis = getDislikes();
      const disMap = Object.fromEntries(
        Object.keys(localDis)
          .filter(id => id.length > 20)
          .map(id => [id, true])
      );
      setDislikeUsers(disMap);
      setIdsForQuery('dislike', Object.keys(disMap));
      const list = (await getDislikedCards(id => fetchUserById(id)))
        .filter(u => (u?.id || u?.userId || '').length > 20);
      loadedIdsRef.current = new Set(list.map(u => u.id));
      setUsers(list);
      await loadCommentsFor(list);
      setHasMore(false);
      setLastKey(null);
      setViewMode('dislikes');
      setLoading(false);
      return;
    }

    const loaded = await fetchDislikeUsersData(owner);
    const validEntries = Object.entries(loaded).filter(([id]) => id.length > 20);
    const filtered = Object.fromEntries(validEntries);
    const disMap = Object.fromEntries(validEntries.map(([id]) => [id, true]));
    cacheDislikedUsers(filtered);
    syncDislikes(disMap);
    setDislikeUsers(disMap);
    const list = (await getDislikedCards(id => fetchUserById(id)))
      .filter(u => (u?.id || u?.userId || '').length > 20);
    loadedIdsRef.current = new Set(list.map(u => u.id));
    setUsers(list);
    await loadCommentsFor(list);
    setHasMore(false);
    setLastKey(null);
    setViewMode('dislikes');
    setLoading(false);
  };

  const searchUsers = async params => {
    const [key, value] = Object.entries(params)[0] || [];
    const term = key && value ? `${key}=${value}` : undefined;
    const cacheKey = getCacheKey('search', term ? normalizeQueryKey(term) : term);
    const cached = loadCache(cacheKey);
    if (cached) return cached.raw;
    const res = await searchUsersOnly(params);
    if (res && Object.keys(res).length > 0) {
      const arr = Array.isArray(res) ? res : Object.values(res);
      saveCache(cacheKey, { raw: res, users: arr });
    }
    return res;
  };

  const handleExit = async () => {
    try {
      localStorage.removeItem('isLoggedIn');
      localStorage.removeItem('userEmail');
      setShowInfoModal(false);
      saveScrollPosition();
      navigate('/my-profile');
      await signOut(auth);
      clearAllCardsCache();
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
      const cacheKey = getCacheKey('default');
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
        saveCache(cacheKey, { users: result, lastKey: res.lastKey, hasMore: res.hasMore });
        return result;
      });
      await loadCommentsFor(unique);
      if (handleEmptyFetch(res, lastKey, setHasMore)) {
        console.log('[loadMore] empty fetch, no more cards');
      } else {
        setHasMore(res.hasMore);
      }
      setLastKey(res.lastKey);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [hasMore, lastKey, viewMode, fetchChunk]);

  useEffect(() => {
    const savedSearch = localStorage.getItem(SEARCH_KEY);
    if (savedSearch) {
      return;
    }
    console.log('[useEffect] calling loadInitial');
    loadInitial();
  }, [loadInitial]);

  const gridRef = useRef(null);


  const filteredUsers =
    filters && Object.keys(filters).length > 0
      ? filterMain(
          users.map(u => [u.userId, u]),
          null,
          filters,
          favoriteUsers
        ).map(([id, u]) => u)
      : users;

  // automatic loading disabled

  const dotsMenu = () => (
    <>
      {isAdmin && (
        <>
          <SubmitButton onClick={() => { saveScrollPosition(); navigate('/my-profile'); }}>my-profile</SubmitButton>
          <SubmitButton onClick={() => { saveScrollPosition(); navigate('/add'); }}>add</SubmitButton>
          <SubmitButton onClick={() => { saveScrollPosition(); navigate('/matching'); }}>matching</SubmitButton>
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
          searchFunc={searchUsers}
          setUsers={applySearchResults}
          setUserNotFound={() => {}}
          wrapperStyle={{ width: '100%', marginBottom: '10px' }}
          leftIcon="🔍"
          storageKey={SEARCH_KEY}
          onClear={loadInitial}
        />
        <FilterPanel mode="matching" hideUserId hideCommentLength onChange={setFilters} />
      </FilterContainer>
      <Container>
        <InnerContainer>
          <HeaderContainer>
            <CardCount>{filteredUsers.length} карточок</CardCount>
            <TopActions>
              {viewMode !== 'default' && (
                <ActionButton onClick={loadInitial}><FaDownload /></ActionButton>
              )}
              <ActionButton onClick={() => setShowFilters(s => !s)}><FaFilter /></ActionButton>
              <ActionButton
                onClick={loadDislikeCards}
                disabled={viewMode === 'dislikes'}
              >
                <FaTimes />
              </ActionButton>
              <ActionButton
                onClick={loadFavoriteCards}
                disabled={viewMode === 'favorites'}
              >
                <FaHeart />
              </ActionButton>
              <ActionButton onClick={() => setShowInfoModal('dotsMenu')}><FaEllipsisV /></ActionButton>
            </TopActions>
          </HeaderContainer>

          <Grid ref={gridRef}>
            {filteredUsers.map(user => {
              const photos = Array.isArray(user.photos)
                ? user.photos.filter(Boolean).map(convertDriveLinkToImage)
                : [getCurrentValue(user.photos)]
                    .filter(Boolean)
                    .map(convertDriveLinkToImage);
              const photo = photos[0];
              const nextPhoto = photos[1];
              const thirdPhoto = photos[2];
              const infoSlides = getInfoSlidesCount(user);

              const infoVariants = [];
              if (infoSlides >= 1) infoVariants.push('info');
              if (infoSlides >= 2) infoVariants.push('description');
              if (!photo) infoVariants.shift();

              const nextVariant = nextPhoto ? null : infoVariants.shift();
              const thirdVariant = thirdPhoto ? null : infoVariants.shift();

                const role = (user.role || user.userRole || '')
                  .toString()
                  .trim()
                  .toLowerCase();
                const isAgency = role === 'ag' || role === 'ip';
                const nameParts = [
                  getCurrentValue(user.name),
                  getCurrentValue(user.surname),
                ]
                  .filter(Boolean)
                  .map(v => String(v).trim())
                  .join(' ');
                return (
                  <CardContainer
                    key={user.userId}
                    className={
                      removing[user.userId] ? `removing ${removing[user.userId]}` : ''
                    }
                    onTransitionEnd={e => {
                      if (
                        e.propertyName === 'max-height' &&
                        e.target === e.currentTarget &&
                        removing[user.userId]
                      ) {
                        handleTransitionEnd(user.userId);
                      }
                    }}
                  >
                    {thirdVariant && (
                      <ThirdInfoCard>
                        <InfoCardContent user={user} variant={thirdVariant} />
                      </ThirdInfoCard>
                    )}
                    {thirdPhoto && <ThirdPhoto src={thirdPhoto} alt="third" />}
                    {nextVariant && (
                      <NextInfoCard>
                        <InfoCardContent user={user} variant={nextVariant} />
                      </NextInfoCard>
                    )}
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
                      {isAdmin && (
                        <Id
                          onClick={() => {
                            saveScrollPosition();
                            navigate(`/edit/${user.userId}`, { state: user });
                          }}
                          style={{ cursor: 'pointer' }}
                        >
                          ID: {user.userId ? user.userId.slice(0, 5) : ''}
                        </Id>
                      )}
                    </CardWrapper>
                  </CardContainer>
                );
              })}
          {loading &&
            Array.from({ length: 4 }).map((_, idx) => (
              <SkeletonCard data-card data-skeleton key={`skeleton-${idx}`} />
            ))}
          {hasMore && !loading && (
            <LoadMoreButton onClick={loadMore}>
              <FaArrowDown />
            </LoadMoreButton>
          )}
          </Grid>

          {showInfoModal && (
            <InfoModal onClose={() => setShowInfoModal(false)} text="dotsMenu" Context={dotsMenu} />
          )}
        </InnerContainer>
      </Container>
    </>
  );
};

export default Matching;
