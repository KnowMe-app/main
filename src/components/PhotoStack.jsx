import React, { useMemo, useState, useRef } from 'react';
import styled from 'styled-components';
import { color } from './styles';
import { utilCalculateAge } from './smallCard/utilCalculateAge';
import { getCurrentValue } from './getCurrentValue';
import { fieldContactsIcons } from './smallCard/fieldContacts';
import { normalizeLocation, normalizeCountry, normalizeRegion } from './normalizeLocation';

const StackContainer = styled.div`
  position: relative;
  width: 100%;
  height: 50vh;
`;

const Card = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-size: cover;
  background-position: center;
  border-radius: 8px;
  border: 1px solid ${color.gray3};
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
  overflow: hidden;
  touch-action: pan-y;
`;

const InfoWrapper = styled.div`
  background: #f0f0f0;
  width: 100%;
  height: 100%;
  overflow-y: auto;
  padding: 10px;
  box-sizing: border-box;
`;

const ProfileSection = styled.div`
  display: flex;
  align-items: center;
  margin-bottom: 10px;
  border-bottom: 1px solid ${color.gray4};
  padding-bottom: 10px;
`;

const Photo = styled.img`
  width: 90px;
  border-radius: 8px;
  margin-right: 10px;
  object-fit: cover;
`;

const Info = styled.div`
  flex: 1;
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

const InfoCard = ({ user }) => (
  <InfoWrapper>
    <ProfileSection>
      {getCurrentValue(user.photos) && (
        <Photo src={getCurrentValue(user.photos)} alt="Donor" />
      )}
      <Info>
        <strong>
          {(getCurrentValue(user.surname) || '').trim()} {(getCurrentValue(user.name) || '').trim()}
          {user.birth ? `, ${utilCalculateAge(user.birth)}р` : ''}
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
      <div style={{ marginBottom: '10px' }}>
        <strong>Profession</strong>
        <br />
        {getCurrentValue(user.profession)}
      </div>
    )}
    <Contact>
      <Icons>{fieldContactsIcons(user)}</Icons>
    </Contact>
  </InfoWrapper>
);

export const PhotoStack = ({ user, onSelect }) => {
  const photos = useMemo(() => {
    if (Array.isArray(user.photos)) return user.photos;
    const val = getCurrentValue(user.photos);
    return val ? [val] : [];
  }, [user.photos]);

  const slides = useMemo(() => {
    if (photos.length === 0) return ['info'];
    const arr = [];
    arr.push(photos[0]);
    arr.push('info');
    for (let i = 1; i < photos.length; i++) {
      arr.push(photos[i]);
      arr.push('info');
    }
    return arr;
  }, [photos]);

  const [index, setIndex] = useState(0);
  const [offsetX, setOffsetX] = useState(0);
  const startX = useRef(null);
  const removing = useRef(false);

  if (index >= slides.length) return null;

  const handleStart = e => {
    startX.current = e.touches ? e.touches[0].clientX : e.clientX;
  };

  const handleMove = e => {
    if (startX.current === null) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    setOffsetX(clientX - startX.current);
  };

  const handleEnd = () => {
    if (startX.current === null) return;
    const threshold = 100;
    const dx = offsetX;
    const dir = dx > 0 ? 1 : -1;
    if (Math.abs(dx) > threshold) {
      removing.current = true;
      setOffsetX(dir * 1000);
      setTimeout(() => {
        removing.current = false;
        setOffsetX(0);
        setIndex(i => Math.min(i + 1, slides.length));
      }, 300);
    } else {
      setOffsetX(0);
    }
    startX.current = null;
  };

  const handleClick = () => {
    if (Math.abs(offsetX) > 5) return;
    onSelect && onSelect(user);
  };

  const visible = slides.slice(index, index + 3);
  const progress = Math.min(Math.abs(offsetX) / 100, 1);

  return (
    <StackContainer>
      {visible.map((slide, idx) => {
        const isTop = idx === 0;
        const baseRotation = idx === 1 ? 2 : idx === 2 ? -2 : 0;
        const rot = isTop ? offsetX / 20 : baseRotation * (1 - progress);
        const style =
          slide !== 'info'
            ? { backgroundImage: `url(${slide})`, backgroundColor: 'transparent' }
            : { backgroundColor: '#fff' };

        return (
          <Card
            key={`${index}-${idx}-${slide}`}
            style={{
              ...style,
              transform: `translateX(${isTop ? offsetX : 0}px) translateY(${idx * 4}px) rotate(${rot}deg)`,
              zIndex: visible.length - idx,
              transition:
                removing.current && isTop
                  ? 'transform 0.3s ease'
                  : startX.current && isTop
                  ? 'none'
                  : 'transform 0.3s ease',
            }}
            onMouseDown={isTop ? handleStart : undefined}
            onMouseMove={isTop ? handleMove : undefined}
            onMouseUp={isTop ? handleEnd : undefined}
            onMouseLeave={isTop ? handleEnd : undefined}
            onTouchStart={isTop ? handleStart : undefined}
            onTouchMove={isTop ? handleMove : undefined}
            onTouchEnd={isTop ? handleEnd : undefined}
            onClick={isTop ? handleClick : undefined}
          >
            {slide === 'info' ? (
              <InfoCard user={user} />
            ) : index === 0 && isTop ? (
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
            ) : null}
          </Card>
        );
      })}
    </StackContainer>
  );
};

export default PhotoStack;
