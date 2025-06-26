import React from 'react';
import { btnDel } from './btnDel';
import { btnExport } from './btnExport';
import { BtnFavorite } from './btnFavorite';
import { fieldDeliveryInfo } from './fieldDeliveryInfo';
import { fieldWriter } from './fieldWritter';
import { fieldContacts } from './fieldContacts';
import { FieldGetInTouch } from './fieldGetInTouch';
import { fieldRole } from './fieldRole';
import { fieldLastCycle } from './fieldLastCycle';
import { FieldComment } from './FieldComment';
import { fieldBirth } from './fieldBirth';
import { fieldBlood } from './fieldBlood';
import { fieldMaritalStatus } from './fieldMaritalStatus';
import { utilCalculateIMT } from './utilCalculateIMT';
import { formatDateToDisplay } from 'components/inputValidations';

export const renderTopBlock = (
  userData,
  setUsers,
  setShowInfoModal,
  setState,
  isFromListOfUsers,
  favoriteUsers = {},
  setFavoriteUsers,
  currentFilter,
  isDateInRange,
) => {
  if (!userData) return null;

  return (
    <div style={{ padding: '7px', position: 'relative' }}>
      {btnDel(userData, setState, setShowInfoModal, isFromListOfUsers)}
      <BtnFavorite
        userId={userData.userId}
        favoriteUsers={favoriteUsers}
        setFavoriteUsers={setFavoriteUsers}
      />
      {btnExport(userData)}
      <div>
        {userData.lastAction && formatDateToDisplay(userData.lastAction)}
        {userData.lastAction && ', '}
        {userData.userId}
        {(userData.userRole !== 'ag' && userData.userRole !== 'ip' && userData.role !== 'ag' && userData.role !== 'ip') &&
          FieldGetInTouch(userData, setUsers, setState, currentFilter, isDateInRange)}
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
        <div style={{ whiteSpace: 'pre-wrap' }}>
          {(() => {
            const parts = [];
            if (userData.maritalStatus) parts.push(fieldMaritalStatus(userData.maritalStatus));
            if (userData.blood) parts.push(fieldBlood(userData.blood));
            if (userData.height) parts.push(userData.height);
            if (userData.height && userData.weight) parts.push('/');
            if (userData.weight) parts.push(`${userData.weight} - `);
            if (userData.weight && userData.height) parts.push(`${utilCalculateIMT(userData.weight, userData.height)}`);
            return parts.map((part, index) => <React.Fragment key={index}>{part} </React.Fragment>);
          })()}
        </div>
        <div>
          {(() => {
            const locationParts = [];
            if (userData.region) locationParts.push(userData.region);
            if (userData.city) locationParts.push(userData.city);
            return locationParts.join(', ');
          })()}
        </div>
      </div>

      {fieldContacts(userData)}
      {fieldWriter(userData, setUsers, setState)}
      <FieldComment userData={userData} setUsers={setUsers} setState={setState} />

      <div
        onClick={() => {
          const details = document.getElementById(userData.userId);
          if (details) {
            details.style.display = details.style.display === 'none' ? 'block' : 'none';
          }
        }}
        style={{ position: 'absolute', bottom: '10px', right: '10px', cursor: 'pointer', color: '#ebe0c2', fontSize: '18px' }}
      >
        ...
      </div>
    </div>
  );
};