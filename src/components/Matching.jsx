import React, { useEffect, useState, useRef } from 'react';
import styled from 'styled-components';
import { color } from './styles';
import { fetchLatestUsers, getAllUserPhotos } from './config';
import { getCurrentValue } from './getCurrentValue';
import { fieldContactsIcons } from './smallCard/fieldContacts';

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
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: ${color.accent};
  font-weight: bold;
  font-size: 20px;
  margin-bottom: 10px;
`;

const ProfileSection = styled.div`
  display: flex;
  align-items: center;
  margin-bottom: 15px;
  border-bottom: 1px solid ${color.gray4};
  padding-bottom: 10px;
`;

const Photo = styled.img`
  width: 110px;
  border-radius: 8px;
  margin-right: 10px;
  object-fit: cover;
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
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
  border-top: 1px solid ${color.gray4};
  padding-top: 10px;
  margin-top: 10px;
`;

const Icons = styled.div`
  display: flex;
  gap: 10px;
  font-size: 18px;
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
          <DonorCard onClick={e => e.stopPropagation()}>
            <Header>
              <span className="title">Egg donor</span>
              <button
                className="close"
                onClick={() => setSelected(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer' }}
              >
                ✕
              </button>
            </Header>
            <ProfileSection>
              {getCurrentValue(selected.photos) && (
                <Photo src={getCurrentValue(selected.photos)} alt="Donor" />
              )}
              <Info>
                <strong>
                  {selected.surname || ''} {selected.name || ''}
                  {selected.fathersname ? `, ${selected.fathersname}` : ''}
                </strong>
                <br />
                {selected.region || ''}
                {selected.city ? `, ${selected.city}` : ''}
              </Info>
            </ProfileSection>
            <Table>{renderSelectedFields(selected)}</Table>
            {selected.myComment && (
              <MoreInfo>
                <strong>More information</strong>
                <br />
                {selected.myComment}
              </MoreInfo>
            )}
            <Contact>
              <Icons>{fieldContactsIcons(selected)}</Icons>
            </Contact>
            <Id>ID: {selected.userId ? selected.userId.slice(0, 5) : ''}</Id>
          </DonorCard>
        </ModalOverlay>
      )}
    </>
  );
};

export default Matching;
