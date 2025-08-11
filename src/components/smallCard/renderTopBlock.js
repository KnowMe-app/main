import React from 'react';
import { btnDel } from './btnDel';
import { btnExport } from './btnExport';
import { fieldDeliveryInfo } from './fieldDeliveryInfo';
import { fieldWriter } from './fieldWritter';
import { fieldContacts } from './fieldContacts';
import { fieldGetInTouch } from './fieldGetInTouch';
import { fieldRole } from './fieldRole';
import { fieldLastCycle } from './fieldLastCycle';
import { FieldComment } from './FieldComment';
import { fieldBirth } from './fieldBirth';
import { fieldBlood } from './fieldBlood';
import { fieldMaritalStatus } from './fieldMaritalStatus';
import { fieldIMT } from './fieldIMT';
import { formatDateToDisplay } from 'components/inputValidations';
import {
  normalizeCountry,
  normalizeRegion,
} from '../normalizeLocation';

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
  isFromListOfUsers,
  favoriteUsers = {},
  setFavoriteUsers,
  dislikeUsers = {},
  setDislikeUsers = () => {},
  currentFilter,
  isDateInRange,
) => {
  if (!userData) return null;

  return (
    <div style={{ padding: '7px', position: 'relative' }}>
      {btnDel(userData, setState, setShowInfoModal, isFromListOfUsers)}
      {btnExport(userData)}
      <div>
        {userData.lastAction && formatDateToDisplay(userData.lastAction)}
        {userData.lastAction && ', '}
        {userData.userId}
        {(userData.userRole !== 'ag' && userData.userRole !== 'ip' && userData.role !== 'ag' && userData.role !== 'ip') &&
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
          )}
        {fieldRole(userData, setUsers, setState)}
        {(userData.userRole !== 'ag' && userData.userRole !== 'ip' && userData.role !== 'ag' && userData.role !== 'ip') && fieldLastCycle(userData, setUsers, setState)}
        {fieldDeliveryInfo(setUsers, setState, userData)}
        {userData.birth && `${userData.birth} - `}
        {userData.birth && fieldBirth(userData.birth)}
      </div>
      {/* <div style={{ color: '#856404', fontWeight: 'bold' }}>{nextContactDate}</div> */}
      <div>
        <strong>
          {(() => {
            const nameParts = [];
            if (userData.surname) nameParts.push(userData.surname);
            if (userData.name) nameParts.push(userData.name);
            if (userData.fathersname) nameParts.push(userData.fathersname);
            return nameParts.length > 0 ? `${nameParts.join(' ')}` : '';
          })()}
        </strong>
        {/* {renderCsection(userData.csection)}  */}
        <div style={{ whiteSpace: 'pre-wrap', display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
          {(() => {
            const parts = [];
            if (userData.maritalStatus) parts.push(fieldMaritalStatus(userData.maritalStatus));
            if (userData.blood) parts.push(fieldBlood(userData.blood));
            if (userData.height) parts.push(userData.height);
            if (userData.height && userData.weight) parts.push('/');
            if (userData.weight) parts.push(`${userData.weight} - `);
            if (userData.weight && userData.height) parts.push(fieldIMT(userData.weight, userData.height));
            return parts.map((part, index) => <React.Fragment key={index}>{part} </React.Fragment>);
          })()}
        </div>
        <div>
          {[
            normalizeCountry(userData.country),
            normalizeRegion(userData.region),
          ]
            .filter(Boolean)
            .join(', ')}
        </div>
      </div>

      {fieldContacts(userData)}
      {fieldWriter(userData, setUsers, setState)}
      <FieldComment userData={userData} setUsers={setUsers} setState={setState} />

      <div
        onClick={() => {
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