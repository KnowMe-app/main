import React from 'react';
import { btnDel } from './btnDel';
import { btnExport } from './btnExport';
import { fieldDeliveryInfo } from './fieldDeliveryInfo';
import { fieldWriter } from './fieldWritter';
import { fieldContacts } from './fieldContacts';
import { fieldGetInTouch } from './fieldGetInTouch';
import { fieldRole } from './fieldRole';
import { FieldLastCycle } from './fieldLastCycle';
import { FieldComment } from './FieldComment';
import { BtnToast } from './btnToast';
import { fieldBirth } from './fieldBirth';
import { fieldBlood } from './fieldBlood';
import { fieldMaritalStatus } from './fieldMaritalStatus';
import { fieldIMT } from './fieldIMT';
import { formatDateToDisplay } from 'components/inputValidations';
import { normalizeRegion } from '../normalizeLocation';
import { fetchUserById } from '../config';
import { updateCard } from 'utils/cardsStorage';

const getParentBackground = element => {
  let el = element;
  let bg = window.getComputedStyle(el).backgroundColor;
  while (el.parentElement && (bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent')) {
    el = el.parentElement;
    bg = window.getComputedStyle(el).backgroundColor;
  }
  return bg;
};

const getContrastColor = background => {
  if (!background) return '#000';
  const rgb = background.match(/\d+/g);
  if (!rgb) return '#000';
  const [r, g, b] = rgb.map(Number);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#000' : '#fff';
};

export const renderTopBlock = (
  userData,
  setUsers,
  setShowInfoModal,
  setState,
  setUserIdToDelete,
  isFromListOfUsers,
  favoriteUsers = {},
  setFavoriteUsers,
  dislikeUsers = {},
  setDislikeUsers = () => {},
  currentFilter,
  isDateInRange,
  isToastOn = false,
  setIsToastOn = () => {}
) => {
  if (!userData) return null;

  const region = normalizeRegion(userData.region);

  return (
    <div style={{ padding: '7px', position: 'relative' }}>
      {btnDel(userData, setShowInfoModal, setUserIdToDelete, isFromListOfUsers)}
      {!isFromListOfUsers && <BtnToast isToastOn={isToastOn} setIsToastOn={setIsToastOn} />}
      {btnExport(userData)}
      <div>
        {userData.lastAction && formatDateToDisplay(userData.lastAction)}
        {userData.lastAction && ', '}
        {userData.userId}
        {userData.userRole !== 'ag' &&
          userData.userRole !== 'ip' &&
          userData.role !== 'ag' &&
          userData.role !== 'ip' &&
          fieldGetInTouch(
            userData,
            setUsers,
            setState,
            currentFilter,
            isDateInRange,
            favoriteUsers,
            setFavoriteUsers,
            dislikeUsers,
            setDislikeUsers,
            isToastOn
          )}
        {fieldRole(userData, setUsers, setState, isToastOn)}
        {userData.userRole !== 'ag' &&
          userData.userRole !== 'ip' &&
          userData.role !== 'ag' &&
          userData.role !== 'ip' && (
            <FieldLastCycle
              userData={userData}
              setUsers={setUsers}
              setState={setState}
              isToastOn={isToastOn}
            />
          )}
        {fieldDeliveryInfo(setUsers, setState, userData)}
        {userData.birth && `${userData.birth} - `}
        {userData.birth && fieldBirth(userData.birth)}
      </div>
      {/* <div style={{ color: '#856404', fontWeight: 'bold' }}>{nextContactDate}</div> */}
      <div>
        <strong>
          {(() => {
            const nameParts = [];

            if (Array.isArray(userData.surname)) {
              if (userData.surname.length === 2) {
                nameParts.push(`${userData.surname[1]} (${userData.surname[0]})`);
              } else if (userData.surname.length > 0) {
                nameParts.push(userData.surname.join(' '));
              }
            } else if (userData.surname) {
              nameParts.push(userData.surname);
            }

            if (userData.name) nameParts.push(userData.name);
            if (userData.fathersname) nameParts.push(userData.fathersname);

            return nameParts.length > 0 ? `${nameParts.join(' ')}` : '';
          })()}
        </strong>
        {/* {renderCsection(userData.csection)}  */}
        <div style={{ whiteSpace: 'pre-wrap', display: 'flex', alignItems: 'center', gap: '2px', flexWrap: 'wrap' }}>
          {(() => {
            const parts = [];
            if (userData.maritalStatus) parts.push(fieldMaritalStatus(userData.maritalStatus));
            if (userData.blood) parts.push(fieldBlood(userData.blood));
            if (userData.height) parts.push(userData.height);
            if (userData.height && userData.weight) parts.push('/');
            if (userData.weight) parts.push(`${userData.weight}-`);
            if (userData.weight && userData.height) parts.push(fieldIMT(userData.weight, userData.height));
            return parts.map((part, index) => <React.Fragment key={index}>{part}</React.Fragment>);
          })()}
        </div>
        {region && <div>{region}</div>}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: '4px',
          }}
        >
          {fieldContacts(userData)}
        </div>
      </div>
      {fieldWriter(userData, setUsers, setState, isToastOn)}
      <FieldComment userData={userData} setUsers={setUsers} setState={setState} isToastOn={isToastOn} />

      <div
        onClick={async () => {
          try {
            const fresh = await fetchUserById(userData.userId);
            if (fresh) {
              updateCard(userData.userId, { ...fresh, updatedAt: Date.now() });
              if (setUsers) {
                setUsers(prev => {
                  if (Array.isArray(prev)) {
                    return prev.map(u => (u.userId === userData.userId ? fresh : u));
                  }
                  if (typeof prev === 'object' && prev !== null) {
                    return { ...prev, [userData.userId]: fresh };
                  }
                  return prev;
                });
              }
              if (setState) {
                setState(prev => ({ ...prev, ...fresh }));
              }
            }
          } catch (error) {
            console.error(error);
          }

          const details = document.getElementById(userData.userId);
          if (details) {
            const isHidden = details.style.display === 'none';
            details.style.display = isHidden ? 'block' : 'none';
            details.style.marginTop = isHidden ? '8px' : '0';
            if (isHidden) {
              const bg = getParentBackground(details);
              details.style.color = getContrastColor(bg);
            }
          }
        }}
        style={{ position: 'absolute', bottom: '10px', right: '10px', cursor: 'pointer', color: '#ebe0c2', fontSize: '18px' }}
      >
        ...
      </div>
    </div>
  );
};
