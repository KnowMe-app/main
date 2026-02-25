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
import { fieldBirth } from './fieldBirth';
import { fieldBlood } from './fieldBlood';
import { fieldMaritalStatus } from './fieldMaritalStatus';
import { fieldIMT } from './fieldIMT';
import { btnMedications } from './btnMedications';
import { formatDateToDisplay } from 'components/inputValidations';
import { normalizeRegion } from '../normalizeLocation';
import { fetchUserById } from '../config';
import { updateCard, clearCardCache } from 'utils/cardsStorage';
import { normalizeLastAction } from 'utils/normalizeLastAction';
import { getEffectiveCycleStatus } from 'utils/cycleStatus';
import toast from 'react-hot-toast';

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
  onOpenMedications,
  additionalActions = null,
  overlayFieldAdditions = {}
) => {
  if (!userData) return null;

  const cardData = { ...userData, cycleStatus: getEffectiveCycleStatus(userData) };
  const region = normalizeRegion(cardData.region);

  const renderOverlayEntries = fieldNames => {
    const normalizedFieldNames = Array.isArray(fieldNames) ? fieldNames : [fieldNames];
    const entries = normalizedFieldNames.flatMap(fieldName =>
      (overlayFieldAdditions?.[fieldName] || []).map(entry => ({ ...entry, fieldName }))
    );

    if (!entries.length) return null;

    return entries.map((entry, idx) => (
      <div
        key={`${entry.fieldName}-${entry.editorUserId || 'unknown'}-${entry.value}-${idx}`}
        style={{
          color: entry.isDeleted ? '#e53935' : '#2e7d32',
          fontSize: '12px',
          lineHeight: 1.2,
        }}
      >
        {entry.value}
      </div>
    ));
  };

  return (
    <div style={{ padding: '7px', position: 'relative' }}>
      <div
        style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: '6px',
          zIndex: 999,
        }}
      >
        {btnExport(cardData)}
        {btnDel(cardData, setShowInfoModal, setUserIdToDelete, isFromListOfUsers)}
        {btnMedications(cardData, onOpenMedications)}
        {additionalActions}
      </div>
      <div>
        {cardData.lastAction && formatDateToDisplay(normalizeLastAction(cardData.lastAction))}
        {cardData.lastAction && ', '}
        {cardData.userId}
        {cardData.userRole !== 'ag' &&
          cardData.userRole !== 'ip' &&
          cardData.role !== 'ag' &&
          cardData.role !== 'ip' &&
          fieldGetInTouch(cardData, setUsers, setState, currentFilter, isDateInRange, favoriteUsers, setFavoriteUsers, dislikeUsers, setDislikeUsers)}
        {fieldRole(cardData, setUsers, setState)}
        {cardData.userRole !== 'ag' && cardData.userRole !== 'ip' && cardData.role !== 'ag' && cardData.role !== 'ip' && (
          <FieldLastCycle userData={cardData} setUsers={setUsers} setState={setState} />
        )}
        <div>{fieldDeliveryInfo(setUsers, setState, cardData)}</div>
        {renderOverlayEntries(['lastDelivery', 'ownKids'])}
        <div>
          {cardData.birth && `${cardData.birth} - `}
          {cardData.birth && fieldBirth(cardData.birth)}
        </div>
        {renderOverlayEntries('birth')}
      </div>
      {/* <div style={{ color: '#856404', fontWeight: 'bold' }}>{nextContactDate}</div> */}
      <div>
        <strong>
          {(() => {
            const nameParts = [];

            if (Array.isArray(cardData.surname)) {
              if (cardData.surname.length === 2) {
                nameParts.push(`${cardData.surname[1]} (${cardData.surname[0]})`);
              } else if (cardData.surname.length > 0) {
                nameParts.push(cardData.surname.join(' '));
              }
            } else if (cardData.surname) {
              nameParts.push(cardData.surname);
            }

            if (cardData.name) nameParts.push(cardData.name);
            if (cardData.fathersname) nameParts.push(cardData.fathersname);

            return nameParts.length > 0 ? `${nameParts.join(' ')}` : '';
          })()}
        </strong>
        {renderOverlayEntries(['surname', 'name', 'fathersname'])}
        {/* {renderCsection(cardData.csection)}  */}
        <div style={{ whiteSpace: 'pre-wrap', display: 'flex', alignItems: 'center', gap: '2px', flexWrap: 'wrap' }}>
          {(() => {
            const parts = [];
            if (cardData.maritalStatus) parts.push(fieldMaritalStatus(cardData.maritalStatus));
            if (cardData.blood) parts.push(fieldBlood(cardData.blood));
            if (cardData.height) parts.push(cardData.height);
            if (cardData.height && cardData.weight) parts.push('/');
            if (cardData.weight) parts.push(`${cardData.weight}-`);
            if (cardData.weight && cardData.height) parts.push(fieldIMT(cardData.weight, cardData.height));
            return parts.map((part, index) => <React.Fragment key={index}>{part}</React.Fragment>);
          })()}
        </div>
        {renderOverlayEntries(['maritalStatus', 'blood', 'height', 'weight'])}
        {region && <div>{region}</div>}
        {renderOverlayEntries('region')}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: '4px',
          }}
        >
          {fieldContacts(cardData)}
        </div>
        {renderOverlayEntries(['phone', 'phone2', 'phone3', 'telegram', 'email', 'facebook', 'instagram', 'tiktok', 'vk'])}
      </div>
      {fieldWriter(cardData, setUsers, setState)}
      <FieldComment userData={cardData} setUsers={setUsers} setState={setState} />

      <div
        onClick={async e => {
          e.stopPropagation();
          const details = document.getElementById(cardData.userId);
          const toggleDetails = () => {
            if (details) {
              const isHidden = details.style.display === 'none';
              details.style.display = isHidden ? 'block' : 'none';
              details.style.marginTop = isHidden ? '8px' : '0';
              if (isHidden) {
                const bg = getParentBackground(details);
                details.style.color = getContrastColor(bg);
              }
            }
          };

          toggleDetails();

          let fresh = null;
          let toastFn = toast.error;
          let toastMsg = 'Не вдалося завантажити дані';
          try {
            fresh = await fetchUserById(cardData.userId);
            if (fresh) {
              clearCardCache(cardData.userId);
              const updated = updateCard(cardData.userId, fresh);

              if (setUsers) {
                setUsers(prev => {
                  if (Array.isArray(prev)) {
                    return prev.map(u => (u.userId === cardData.userId ? updated : u));
                  }
                  if (typeof prev === 'object' && prev !== null) {
                    return { ...prev, [cardData.userId]: updated };
                  }
                  return prev;
                });
              }

              if (setState && !isFromListOfUsers) {
                setState(prev => ({ ...prev, ...updated }));
              }

              toastFn = toast.success;
              toastMsg = 'Дані завантажено з бекенду';
            } else {
              toastMsg = 'Свіжі дані відсутні';
            }
          } catch (error) {
            console.error(error);
            toastMsg = error.message || 'Не вдалося завантажити дані';
          } finally {
            toastFn(toastMsg);
          }
        }}
        style={{ position: 'absolute', bottom: '10px', right: '10px', cursor: 'pointer', color: '#ebe0c2', fontSize: '18px' }}
      >
        ...
      </div>
    </div>
  );
};
