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
  fetchUserComments,
  setUserComment,
  fetchUsersByIds,
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
import { getCacheKey, clearAllCardsCache, setFavoriteIds } from "../utils/cache";
import { normalizeQueryKey, getIdsByQuery, setIdsForQuery, getCard } from '../utils/cardIndex';
import { getCardsByList, updateCard } from '../utils/cardsStorage';
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
import {
  loadComments,
  saveComments,
  setLocalComment,
  pruneComments,
} from '../utils/commentsStorage';

const isValidId = id => typeof id === 'string' && id.length >= 20;
const filterLongUsers = list => list.filter(u => isValidId(u?.userId));

const compareUsersByLastLogin2 = (a = {}, b = {}) =>
  (b.lastLogin2 || '').localeCompare(a.lastLogin2 || '');

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
  padding: 0 40px 0 0;
  resize: none;
  overflow: hidden;
  height: 16px;
  min-height: 16px;
  line-height: 16px;
  border: ${props => (props.plain ? 'none' : `1px solid ${color.gray3}`)};
  border-radius: ${props => (props.plain ? '0' : '8px')};
  outline: ${props => (props.plain ? 'none' : 'auto')};
`;

const CommentBox = styled.div`
  position: relative;
  width: 100%;
`;

const ResizableCommentInput = ({ value, onChange, onBlur, onClick, ...rest }) => {
  const ref = useRef(null);
  const autoResize = useAutoResize(ref, value);

  return (
    <CommentInput
      {...rest}
      rows={1}
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

const SkeletonCardInner = styled.div`
  position: relative;
  width: 100%;
  height: ${({ $small }) => ($small ? '30vh' : '50vh')};
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

const SkeletonPhoto = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='30' r='20' fill='%23ccc'/%3E%3Crect x='15' y='55' width='70' height='35' fill='%23ccc'/%3E%3C/svg%3E");
  background-size: cover;
  background-position: center;
  filter: blur(20px);
`;

const SkeletonInfo = styled.div`
  position: absolute;
  bottom: 55px;
  left: 10px;
  right: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  pointer-events: none;
`;

const SkeletonLine = styled.div`
  height: 12px;
  background: ${color.paleAccent3};
  opacity: 0.7;
  border-radius: 4px;
  width: ${({ $w }) => $w || '80%'};
  animation: ${loadingWave} 1.5s infinite;
  background-size: 200% 100%;
  background-image: linear-gradient(90deg, ${color.paleAccent2} 25%, ${color.paleAccent5} 50%, ${color.paleAccent2} 75%);
`;

const MatchingSkeleton = ({ $small }) => (
  <CardWrapper data-card data-skeleton>
    <SkeletonCardInner $small={$small}>
      <SkeletonPhoto />
      <SkeletonInfo>
        <SkeletonLine $w="60%" />
        <SkeletonLine $w="40%" />
        <SkeletonLine $w="50%" />
      </SkeletonInfo>
    </SkeletonCardInner>
  </CardWrapper>
);

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
  white-space: pre-line;
`;

const Contact = styled.div`
  display: flex;
  justify-content: flex-start;
  align-items: center;
  font-size: 14px;
  border-top: ${props => (props.$withBorder ? `1px solid ${color.gray4}` : 'none')};
  padding-top: ${props => (props.$withBorder ? '10px' : '0')};
  margin-top: ${props => (props.$withBorder ? '10px' : '0')};
`;

const Icons = styled.div`
  display: flex;
  gap: 4px;
  font-size: inherit;
  color: ${color.accent};
  align-items: center;
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
  top: 0;
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
    let base;
    if (role === 'ag') {
      base = ['main'];
    } else {
      base = photo ? ['main', 'info'] : ['info'];
    }
    if (showDescriptionSlide) base.push('description');
    base.push(...photosArr.slice(1));
    return base;
  }, [user.photos, showDescriptionSlide, photo, role]);

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
  const isEggDonor = (role || '').includes('ed');
  const contacts = fieldContactsIcons(user, { phoneAsIcon: true, iconSize: 16 });
  const selectedFields = renderSelectedFields(user).filter(Boolean);
  const regionInfo = normalizeRegion(getCurrentValue(user.region));
  const cityInfo = getCurrentValue(user.city);
  const locationInfo = isEggDonor
    ? regionInfo || ''
    : getCurrentValue(user.country)
    ? [
        normalizeCountry(getCurrentValue(user.country)),
        cityInfo || regionInfo,
      ]
        .filter(Boolean)
        .join(', ')
    : cityInfo || regionInfo;

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
              {role === 'ag' ? (
                moreInfo
              ) : (
                <>
                  <strong>More information</strong>
                  <br />
                  {moreInfo}
                </>
              )}
            </MoreInfo>
          )}
        </InfoSlide>
      )}
      {current === 'info' && (
        <InfoSlide>
          <ProfileSection>
            <Info>
              <Title>{getRoleTitle(user)}</Title>
          <DonorName>
            {displayName}
            {user.birth ? `, ${utilCalculateAge(user.birth)}` : ''}
          </DonorName>
          <br />
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              flexWrap: 'nowrap',
              justifyContent: 'flex-start',
            }}
          >
            <span>{locationInfo}</span>
            {isEggDonor && contacts && <Icons>{contacts}</Icons>}
          </div>
        </Info>
      </ProfileSection>
      {selectedFields.length > 0 && <Table>{selectedFields}</Table>}
      {!isEggDonor && contacts && (
        <Contact $withBorder={selectedFields.length > 0}>
          <Icons>{contacts}</Icons>
        </Contact>
      )}
    </InfoSlide>
  )}
      {current === 'main' && role !== 'ag' && (
        <BasicInfo>
          {displayName}
          {user.birth ? `, ${utilCalculateAge(user.birth)}` : ''}
          <br />
          {locationInfo}
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
              flexWrap: 'nowrap',
              justifyContent: 'flex-start',
            }}
          >
            {locationInfo && <span>{locationInfo}</span>}
            {contacts && <Icons>{contacts}</Icons>}
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

    if (field.key === 'maritalStatus') {
      const role = (user.userRole || '').toString().trim().toLowerCase();
      if (role === 'ed' && value) {
        const normalized = value.toString().trim().toLowerCase();
        if (
          ['yes', 'так', '+', 'married', 'заміжня', 'одружена'].includes(
            normalized
          )
        ) {
          value = 'Married';
        } else if (
          [
            'no',
            'ні',
            '-',
            'single',
            'unmarried',
            'незаміжня',
            'не заміжня',
          ].includes(normalized)
        ) {
          value = 'Single';
        }
      }
    }

    if (value === undefined || value === '' || value === null) return null;

    return (
      <div key={field.key}>
        <strong>{field.label}</strong>{' '}
        {String(value)}
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

const getRoleTitle = user => {
  const role = (user.userRole || user.role || '')
    .toString()
    .trim()
    .toLowerCase();

  if (role === 'ag') return 'Agency';
  if (role === 'ip') return 'Intended parents';
  if (role === 'ed') return 'Egg donor';
  return '';
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
  const role = (user.userRole || user.role || '')
    .toString()
    .trim()
    .toLowerCase();
  const isEggDonor = role.includes('ed');
  const contacts = fieldContactsIcons(user, { phoneAsIcon: true, iconSize: 16 });
  const selectedFields = renderSelectedFields(user).filter(Boolean);
  const regionInfo = normalizeRegion(getCurrentValue(user.region));
  const cityInfo = getCurrentValue(user.city);
  const locationInfo = isEggDonor
    ? regionInfo || ''
    : getCurrentValue(user.country)
    ? [
        normalizeCountry(getCurrentValue(user.country)),
        cityInfo || regionInfo,
      ]
        .filter(Boolean)
        .join(', ')
    : cityInfo || regionInfo;

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
            {role === 'ag' ? (
              moreInfo
            ) : (
              <>
                <strong>More information</strong>
                <br />
                {moreInfo}
              </>
            )}
          </MoreInfo>
        )}
      </InfoSlide>
    );
  }

  return (
    <InfoSlide>
      <ProfileSection>
        <Info>
          <Title>{getRoleTitle(user)}</Title>
          <DonorName>
            {displayName}
            {user.birth ? `, ${utilCalculateAge(user.birth)}` : ''}
          </DonorName>
          <br />
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              flexWrap: 'nowrap',
              justifyContent: 'flex-start',
            }}
          >
            <span>{locationInfo}</span>
            {isEggDonor && contacts && <Icons>{contacts}</Icons>}
          </div>
        </Info>
      </ProfileSection>
      {selectedFields.length > 0 && <Table>{selectedFields}</Table>}
      {!isEggDonor && contacts && (
        <Contact $withBorder={selectedFields.length > 0}>
          <Icons>{contacts}</Icons>
        </Contact>
      )}
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
  const usersRef = useRef(users);
  const [lastKey, setLastKey] = useState(undefined);
  const [hasMore, setHasMore] = useState(true);
  // removed selected user modal logic
  const [favoriteUsers, setFavoriteUsers] = useState({});
  const [dislikeUsers, setDislikeUsers] = useState({});
  const favoriteUsersRef = useRef(favoriteUsers);
  const dislikeUsersRef = useRef(dislikeUsers);
  const [viewMode, setViewMode] = useState('default');
  const viewModeRef = useRef(viewMode);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({});
  const [comments, setComments] = useState({});
  const [showFilters, setShowFilters] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [ownerId, setOwnerId] = useState(null);
  const isAdmin = auth.currentUser?.uid === process.env.REACT_APP_USER1;
  const loadingRef = useRef(false);
  const loadedIdsRef = useRef(new Set());
  const restoreRef = useRef(false);
  const scrollPositionRef = useRef(0);
  const saveScrollPosition = () => {
    sessionStorage.setItem(SCROLL_Y_KEY, String(scrollPositionRef.current));
  };
  const handleRemove = id => {
    setUsers(prev => prev.filter(u => u.userId !== id));
  };
  useEffect(() => {
    viewModeRef.current = viewMode;
  }, [viewMode]);
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

  const getOwnerId = () => auth.currentUser?.uid || localStorage.getItem('ownerId');
  const waitForOwnerId = () =>
    new Promise(resolve => {
      const check = () => {
        const id = getOwnerId();
        if (id) {
          resolve(id);
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });

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
    const filtered = arr.filter(u => isValidId(u?.userId));
    setUsers(filtered);
    setHasMore(false);
    await loadCommentsFor(filtered);
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
    usersRef.current = users;
    const ids = users.map(u => u.userId);
    pruneComments(ids);
    setComments(prev => {
      const map = {};
      ids.forEach(id => {
        if (prev[id]) map[id] = prev[id];
      });
      return map;
    });
  }, [users]);

  useEffect(() => {
    if (viewMode === 'favorites' || viewMode === 'dislikes') {
      return;
    }
    setUsers(prev =>
      prev.filter(
        u => !favoriteUsers[u.userId] && !dislikeUsers[u.userId]
      )
    );
  }, [favoriteUsers, dislikeUsers, viewMode]);

  const loadCommentsFor = async list => {
    const owner = auth.currentUser?.uid;
    if (!owner) return;
    const ids = Array.from(
      new Set([...usersRef.current.map(u => u.userId), ...list.map(u => u.userId)])
    );
    const cache = loadComments();
    const fetched = await fetchUserComments(owner, ids);
    const newStore = {};
    const commentsMap = {};
    ids.forEach(id => {
      const arr = fetched[id] || [];
      const server = arr[0];
      const local = cache[id];
      if (server && (!local || server.lastAction > local.lastAction)) {
        newStore[id] = server;
        commentsMap[id] = server.text;
      } else if (local) {
        newStore[id] = local;
        commentsMap[id] = local.text;
      } else {
        commentsMap[id] = '';
      }
    });
    saveComments(newStore);
    setComments(commentsMap);
  };

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, user => {
      if (user) {
        localStorage.setItem('ownerId', user.uid);
        setOwnerId(user.uid);
      } else {
        localStorage.removeItem('ownerId');
        setOwnerId('');
        setFavoriteUsers({});
        setDislikeUsers({});
        return;
      }

      const { todayDash } = getCurrentDate();
      updateDataInNewUsersRTDB(user.uid, { lastLogin2: todayDash }, 'update');

      const favRef = refDb(database, `multiData/favorites/${user.uid}`);
      const disRef = refDb(database, `multiData/dislikes/${user.uid}`);

        const unsubFav = onValue(favRef, snap => {
          const data = snap.exists() ? snap.val() : {};
          setFavoriteUsers(data);
          syncFavorites(data);
        });
        const unsubDis = onValue(disRef, snap => {
          const data = snap.exists() ? snap.val() : {};
          setDislikeUsers(data);
          syncDislikes(data);
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
        .filter(u => isValidId(u.userId) && !exclude.has(u.userId));

      const excluded = res.users.length - filtered.length;
      const hasMore = filtered.length > limit || res.hasMore;
      const slice = filtered.slice(0, limit);
      const ids = slice.map(user => user.userId);
      const enrichedMap = await fetchUsersByIds(ids);
      const validSlice = ids.map(id => enrichedMap[id]).filter(Boolean);
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
    const startMode = viewModeRef.current;
    setLoading(true);
    if (startMode !== 'default') {
      loadingRef.current = false;
      setLoading(false);
      return;
    }
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
          exclude = new Set([
            ...Object.keys(favIds),
            ...Object.keys(disIds),
          ]);
        }

      const { cards: cached } = await getCardsByList('default');
      if (cached.length && viewModeRef.current === startMode) {
        console.log('[loadInitial] using cache', cached.length);
        const filteredCached = cached.filter(
          u => isValidId(u.userId) && !exclude.has(u.userId)
        );
        loadedIdsRef.current = new Set(filteredCached.map(u => u.userId));
        setUsers(filteredCached);
        setIdsForQuery('default', filteredCached.map(u => u.userId));
        await loadCommentsFor(filteredCached);
        if (viewModeRef.current !== startMode) return;
        setViewMode('default');
        // continue to fetch latest data to refresh cache
      }
      const res = await fetchChunk(
        INITIAL_LOAD,
        undefined,
        exclude,
        async part => {
          if (viewModeRef.current !== startMode) return;
          const unique = part.filter(u => !loadedIdsRef.current.has(u.userId));
          if (unique.length) {
            unique.forEach(u => loadedIdsRef.current.add(u.userId));
            setUsers(prev => [...prev, ...unique]);
            await loadCommentsFor(unique);
          }
        }
      );
      if (viewModeRef.current !== startMode) return;
      console.log('[loadInitial] initial loaded', res.users.length, 'hasMore', res.hasMore);
      loadedIdsRef.current = new Set([
        ...loadedIdsRef.current,
        ...res.users.map(u => u.userId),
      ]);
      res.users.forEach(u => updateCard(u.userId, u));
      setUsers(prev => {
        const map = new Map(prev.map(u => [u.userId, u]));
        res.users.forEach(u => map.set(u.userId, u));
        const result = Array.from(map.values());
        setIdsForQuery('default', result.map(u => u.userId));
        return result;
      });
      await loadCommentsFor(res.users);
      if (viewModeRef.current !== startMode) return;
      setLastKey(res.lastKey);
      setHasMore(res.hasMore);
      setViewMode('default');
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [fetchChunk]); // include fetchChunk to satisfy react-hooks/exhaustive-deps

  const reloadDefault = React.useCallback(() => {
    viewModeRef.current = 'default';
    setViewMode('default');
    loadInitial();
  }, [loadInitial]);

  const loadFavoriteCards = async () => {
    setViewMode('favorites');
    setLoading(true);
    setUsers([]);
    const owner = await waitForOwnerId();
    if (!owner) {
      setLoading(false);
      return;
    }

    const localIds = getIdsByQuery('favorite').filter(isValidId);
    if (localIds.length > 0) {
      const favMap = getFavorites();
      setFavoriteUsers(favMap);
      setFavoriteIds(favMap);
      syncFavorites(favMap);
      const { cards: favCards } = await getFavoriteCards(id => fetchUserById(id));
      const list = filterLongUsers(favCards).sort(compareUsersByLastLogin2);
      loadedIdsRef.current = new Set(list.map(u => u.userId));
      setUsers(list);
      await loadCommentsFor(list);
      setHasMore(false);
      setLastKey(null);
      setLoading(false);
      return;
    }

    const favUsers = await fetchFavoriteUsersData(owner);
    const favMap = Object.fromEntries(Object.keys(favUsers).map(id => [id, true]));
    syncFavorites(favMap);
    setFavoriteUsers(favMap);
    setFavoriteIds(favMap);
    cacheFavoriteUsers(favUsers);
    setIdsForQuery('favorite', Object.keys(favMap));
    const { cards: favCards } = await getFavoriteCards(id => fetchUserById(id));
    const list = filterLongUsers(favCards).sort(compareUsersByLastLogin2);
    loadedIdsRef.current = new Set(list.map(u => u.userId));
    setUsers(list);
    await loadCommentsFor(list);
    setHasMore(false);
    setLastKey(null);
    setLoading(false);
  };

  const loadDislikeCards = async () => {
    setViewMode('dislikes');
    setLoading(true);
    setUsers([]);
    const owner = await waitForOwnerId();
    if (!owner) {
      setLoading(false);
      return;
    }

    const localIds = getIdsByQuery('dislike').filter(isValidId);
    if (localIds.length > 0) {
      const localDis = getDislikes();
      const disMap = Object.fromEntries(Object.keys(localDis).map(id => [id, true]));
      setDislikeUsers(disMap);
      setIdsForQuery('dislike', Object.keys(disMap));
      const list = filterLongUsers(
        await getDislikedCards(id => fetchUserById(id))
      ).sort(compareUsersByLastLogin2);
      loadedIdsRef.current = new Set(list.map(u => u.userId));
      setUsers(list);
      await loadCommentsFor(list);
      setHasMore(false);
      setLastKey(null);
      setLoading(false);
      return;
    }

    const loaded = await fetchDislikeUsersData(owner);
    const disMap = Object.fromEntries(Object.keys(loaded).map(id => [id, true]));
    cacheDislikedUsers(loaded);
    syncDislikes(disMap);
    setDislikeUsers(disMap);
    setIdsForQuery('dislike', Object.keys(disMap));
    const list = filterLongUsers(
      await getDislikedCards(id => fetchUserById(id))
    ).sort(compareUsersByLastLogin2);
    loadedIdsRef.current = new Set(list.map(u => u.userId));
    setUsers(list);
    await loadCommentsFor(list);
    setHasMore(false);
    setLastKey(null);
    setLoading(false);
  };

  const searchUsers = async params => {
    const [key, value] = Object.entries(params)[0] || [];
    const term = key && value ? `${key}=${value}` : undefined;
    const cacheKey = getCacheKey('search', term ? normalizeQueryKey(term) : term);
    const ids = getIdsByQuery(cacheKey).filter(isValidId);
    if (ids.length > 0) {
      const cards = ids.map(id => getCard(id)).filter(c => c && isValidId(c.userId));
      if (cards.length > 0) {
        if (key === 'name' || key === 'names') {
          return Object.fromEntries(cards.map(c => [c.userId, c]));
        }
        return cards[0];
      }
    }
    const res = await searchUsersOnly(params);
    if (res && Object.keys(res).length > 0) {
      const arr = Array.isArray(res) ? res : Object.values(res);
      const filtered = arr.filter(u => isValidId(u.userId));
      filtered.forEach(u => updateCard(u.userId, u));
      setIdsForQuery(cacheKey, filtered.map(u => u.userId));
      return Array.isArray(res)
        ? filtered
        : Object.fromEntries(filtered.map(u => [u.userId, u]));
    }
    return res;
  };

  const handleExit = async () => {
    try {
      localStorage.removeItem('isLoggedIn');
      localStorage.removeItem('userEmail');
      localStorage.removeItem('ownerId');
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
      res.users.forEach(u => updateCard(u.userId, u));
      setUsers(prev => {
        const map = new Map(prev.map(u => [u.userId, u]));
        unique.forEach(u => map.set(u.userId, u));
        const result = Array.from(map.values());
        setIdsForQuery('default', result.map(u => u.userId));
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
    console.log('[useEffect] calling loadInitial');
    reloadDefault();
  }, [reloadDefault]);

  const gridRef = useRef(null);


  const filteredUsers =
    viewMode === 'favorites' || viewMode === 'dislikes' || !filters || Object.keys(filters).length === 0
      ? users
      : filterMain(
          users.map(u => [u.userId, u]),
          null,
          filters,
          favoriteUsers
        )
          .map(([id, u]) => u)
          .filter(u => isValidId(u.userId));

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
          onClear={reloadDefault}
        />
        <FilterPanel mode="matching" hideUserId hideCommentLength onChange={setFilters} />
      </FilterContainer>
      <Container>
        <InnerContainer>
          <HeaderContainer>
            <CardCount>{filteredUsers.length} карточок</CardCount>
            <TopActions>
              {viewMode !== 'default' && (
                <ActionButton onClick={reloadDefault}><FaDownload /></ActionButton>
              )}
              <ActionButton onClick={() => setShowFilters(s => !s)}><FaFilter /></ActionButton>
              <ActionButton
                onClick={loadDislikeCards}
                disabled={viewMode === 'dislikes' || !ownerId}
              >
                <FaTimes />
              </ActionButton>
              <ActionButton
                onClick={loadFavoriteCards}
                disabled={viewMode === 'favorites' || !ownerId}
              >
                <FaHeart />
              </ActionButton>
              <ActionButton onClick={() => setShowInfoModal('dotsMenu')}><FaEllipsisV /></ActionButton>
            </TopActions>
          </HeaderContainer>
          {!ownerId && (
            <p style={{ textAlign: 'center', padding: '0 10px' }}>
              {ownerId === '' ? 'Owner not found' : 'Loading owner...'}
            </p>
          )}

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
              const role = (user.role || user.userRole || '')
                .toString()
                .trim()
                .toLowerCase();
              const isAgency = role === 'ag' || role === 'ip';

              const infoVariants = [];
              if (role === 'ag') {
                const moreInfo = getCurrentValue(user.moreInfo_main);
                const profession = getCurrentValue(user.profession);
                const education = getCurrentValue(user.education);
                const showDescriptionSlide = Boolean(
                  moreInfo || profession || education
                );
                if (showDescriptionSlide) infoVariants.push('description');
              } else {
                const infoSlides = getInfoSlidesCount(user);
                if (infoSlides >= 1) infoVariants.push('info');
                if (infoSlides >= 2) infoVariants.push('description');
                if (!photo) infoVariants.shift();
              }

              const nextVariant = nextPhoto ? null : infoVariants.shift();
              const thirdVariant = thirdPhoto ? null : infoVariants.shift();

              const nameParts = [
                getCurrentValue(user.name),
                getCurrentValue(user.surname),
              ]
                .filter(Boolean)
                .map(v => String(v).trim())
                .join(' ');
              return (
                <CardContainer key={user.userId}>
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
                      <CommentBox>
                        <ResizableCommentInput
                          plain
                          placeholder="Мій коментар / My comment"
                          value={comments[user.userId] || ''}
                          onClick={e => e.stopPropagation()}
                          onChange={e => {
                            const val = e.target.value;
                            setComments(prev => ({ ...prev, [user.userId]: val }));
                          }}
                          onBlur={async () => {
                            if (auth.currentUser) {
                              const text = comments[user.userId] || '';
                              const res = await setUserComment(user.userId, text);
                              setLocalComment(user.userId, text, res?.lastAction);
                            }
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
                      </CommentBox>
                    </CardWrapper>
                  </CardContainer>
                );
              })}
          {loading &&
            Array.from({ length: 4 }).map((_, idx) => (
              <MatchingSkeleton key={`skeleton-${idx}`} />
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
