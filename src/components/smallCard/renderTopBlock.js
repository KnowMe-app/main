import React from 'react';
import { btnDel } from './btnDel';
import { btnExport } from './btnExport';
import { btnEdit } from './btnEdit';
import { BtnFavorite } from './btnFavorite';
import { BtnDislike } from './btnDislike';
import { fieldDeliveryInfo } from './fieldDeliveryInfo';
import { fieldWriter } from './fieldWritter';
import { fieldContacts } from './fieldContacts';
import { fieldGetInTouch } from './fieldGetInTouch';
import { handleChange } from './actions';
import { fieldRole } from './fieldRole';
import { FieldLastCycle } from './fieldLastCycle';
import { FieldComment } from './FieldComment';
import { fieldBirth } from './fieldBirth';
import { fieldBlood } from './fieldBlood';
import { fieldMaritalStatus } from './fieldMaritalStatus';
import { fieldIMT } from './fieldIMT';
import { formatDateToDisplay } from 'components/inputValidations';
import { normalizeRegion } from '../normalizeLocation';
import { fetchUserById } from '../config';
import { updateCard, clearCardCache } from 'utils/cardsStorage';
import { normalizeLastAction } from 'utils/normalizeLastAction';
import { getEffectiveCycleStatus } from 'utils/cycleStatus';
import toast from 'react-hot-toast';

const topBlockContainerStyle = { padding: '7px', position: 'relative' };

const topButtonsRowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '8px',
  marginBottom: '8px',
};

const topButtonsZoneStyle = {
  border: 'none',
  borderRadius: '12px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '40px',
  height: '40px',
  flex: '0 0 40px',
  padding: 0,
  boxShadow: '0 6px 14px rgba(17, 24, 39, 0.2)',
  transition: 'transform 0.2s ease, box-shadow 0.2s ease, filter 0.2s ease',
};

const topButtonsZones = ['#d32f2f', '#ef6c00', '#f9a825', '#2e7d32', '#0288d1', '#1565c0', '#6a1b9a'];

const zoneActionButtonStyle = {
  position: 'static',
  width: '100%',
  height: '100%',
  minHeight: '40px',
  borderRadius: '12px',
  border: 'none',
  margin: 0,
  padding: 0,
  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.2)',
};

const actionButtonsContainerStyle = {
  position: 'absolute',
  top: '52px',
  right: '10px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-end',
  gap: '6px',
  zIndex: 999,
};

const addedOverlayEntryStyle = {
  color: '#2e7d32',
  fontSize: '12px',
  lineHeight: 1.2,
};

const deletedOverlayEntryStyle = {
  ...addedOverlayEntryStyle,
  color: '#e53935',
};

const identityMetaStyle = {
  whiteSpace: 'pre-wrap',
  display: 'flex',
  alignItems: 'center',
  gap: '2px',
  flexWrap: 'wrap',
};

const contactsWrapperStyle = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: '4px',
};

const commentFieldWrapperStyle = {
  position: 'relative',
};

const detailsToggleStyle = {
  position: 'absolute',
  bottom: '10px',
  right: '10px',
  cursor: 'pointer',
  color: '#ebe0c2',
  fontSize: '18px',
};

const hasAgentOrIPRole = data =>
  data.userRole === 'ag' || data.userRole === 'ip' || data.role === 'ag' || data.role === 'ip';

const buildRtdbLink = userId =>
  `https://console.firebase.google.com/u/0/project/webringitapp/database/webringitapp-default-rtdb/data/~2FnewUsers~2F${encodeURIComponent(userId || '')}`;

const buildName = data => {
  const nameParts = [];

  if (Array.isArray(data.surname)) {
    if (data.surname.length === 2) {
      nameParts.push(`${data.surname[1]} (${data.surname[0]})`);
    } else if (data.surname.length > 0) {
      nameParts.push(data.surname.join(' '));
    }
  } else if (data.surname) {
    nameParts.push(data.surname);
  }

  if (data.name) nameParts.push(data.name);
  if (data.fathersname) nameParts.push(data.fathersname);

  return nameParts.length > 0 ? nameParts.join(' ') : '';
};

const renderIdentityMeta = data => {
  const parts = [];
  if (data.maritalStatus) parts.push(fieldMaritalStatus(data.maritalStatus));
  if (data.blood) parts.push(fieldBlood(data.blood));
  if (data.height) parts.push(data.height);
  if (data.height && data.weight) parts.push('/');
  if (data.weight) parts.push(`${data.weight}-`);
  if (data.weight && data.height) parts.push(fieldIMT(data.weight, data.height));
  return parts.map((part, index) => <React.Fragment key={index}>{part}</React.Fragment>);
};

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
  setSearch = null,
  topBlueAction = null,
  additionalActions = null,
  overlayFieldAdditions = {},
  onSubmitHistorySnapshot = null
) => {
  if (!userData) return null;

  const cardData = { ...userData, cycleStatus: getEffectiveCycleStatus(userData) };
  const region = normalizeRegion(cardData.region);
  const showSideActions = !additionalActions;
  const isAgentOrIP = hasAgentOrIPRole(cardData);

  const renderOverlayEntries = fieldNames => {
    const normalizedFieldNames = Array.isArray(fieldNames) ? fieldNames : [fieldNames];
    const entries = normalizedFieldNames.flatMap(fieldName =>
      (overlayFieldAdditions?.[fieldName] || []).map(entry => ({ ...entry, fieldName }))
    );

    if (!entries.length) return null;

    return entries.map((entry, idx) => (
      <div
        key={`${entry.fieldName}-${entry.editorUserId || 'unknown'}-${entry.value}-${idx}`}
        style={entry.isDeleted ? deletedOverlayEntryStyle : addedOverlayEntryStyle}
      >
        <strong>{entry.fieldName}:</strong> {entry.value}
      </div>
    ));
  };

  const submitOptions = { onSubmitHistorySnapshot };
  return (
    <div style={topBlockContainerStyle}>
      <div style={topButtonsRowStyle}>
        {topButtonsZones.map((zoneColor, idx) => (
          <div
            key={`top-zone-${idx}`}
            aria-label={`top-zone-${idx + 1}`}
            style={{ ...topButtonsZoneStyle, backgroundColor: zoneColor }}
          >
            {idx === 0 &&
              btnDel(
                cardData,
                setShowInfoModal,
                setUserIdToDelete,
                isFromListOfUsers,
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M4 7h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <path d="M7 7l1 12a1 1 0 0 0 1 .9h6a1 1 0 0 0 1-.9L17 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <path d="M10 11v5M14 11v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>,
                { ...zoneActionButtonStyle, backgroundColor: '#d32f2f', color: '#fff' }
              )}
            {idx === 1 && (
              <BtnDislike
                title="Дизлайк"
                ariaLabel="Дизлайк"
                userId={cardData.userId}
                userData={cardData}
                dislikeUsers={dislikeUsers}
                setDislikeUsers={setDislikeUsers}
                onDislikeAdded={() =>
                  handleChange(
                    setUsers,
                    setState,
                    cardData.userId,
                    'getInTouch',
                    '2099-99-99',
                    true,
                    { currentFilter, isDateInRange, ...submitOptions },
                  )
                }
                onDislikeRemoved={() =>
                  handleChange(
                    setUsers,
                    setState,
                    cardData.userId,
                    'getInTouch',
                    '',
                    true,
                    { currentFilter, isDateInRange, ...submitOptions },
                  )
                }
                favoriteUsers={favoriteUsers}
                setFavoriteUsers={setFavoriteUsers}
                customStyle={{
                  ...zoneActionButtonStyle,
                  backgroundColor: '#ef6c00',
                  border: 'none',
                }}
                iconSize={18}
              />
            )}
            {idx === 2 && (
              <BtnFavorite
                title="В обране"
                ariaLabel="В обране"
                userId={cardData.userId}
                userData={cardData}
                favoriteUsers={favoriteUsers}
                setFavoriteUsers={setFavoriteUsers}
                dislikeUsers={dislikeUsers}
                setDislikeUsers={setDislikeUsers}
                onDislikeRemoved={() =>
                  handleChange(
                    setUsers,
                    setState,
                    cardData.userId,
                    'getInTouch',
                    '',
                    true,
                    { currentFilter, isDateInRange, ...submitOptions },
                  )
                }
                customStyle={{
                  ...zoneActionButtonStyle,
                  backgroundColor: '#f9a825',
                  border: 'none',
                }}
                iconSize={18}
              />
            )}
            {idx === 3 && (
              <button
                style={{ ...zoneActionButtonStyle, backgroundColor: '#2e7d32', color: '#fff' }}
                onClick={event => {
                  event.stopPropagation();
                  if (typeof onOpenMedications === 'function') {
                    onOpenMedications(cardData);
                  }
                }}
                disabled={!cardData?.userId || typeof onOpenMedications !== 'function'}
                aria-label="Ліки"
                title="Ліки"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M8.5 8.5l7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <path d="M6.2 10.8a3.25 3.25 0 0 1 4.6-4.6l6.9 6.9a3.25 3.25 0 1 1-4.6 4.6l-6.9-6.9z" stroke="currentColor" strokeWidth="2" />
                </svg>
              </button>
            )}
            {idx === 4 &&
              (topBlueAction ? (
                <button
                  type="button"
                  onClick={event => {
                    event.stopPropagation();
                    if (typeof topBlueAction.onClick === 'function') {
                      topBlueAction.onClick(cardData);
                    }
                  }}
                  style={{ ...zoneActionButtonStyle, backgroundColor: '#0288d1', color: '#fff' }}
                  aria-label={topBlueAction.ariaLabel || topBlueAction.title || 'Синя кнопка'}
                  title={topBlueAction.title || topBlueAction.ariaLabel || 'Синя кнопка'}
                >
                  {topBlueAction.icon}
                </button>
              ) : (
                isFromListOfUsers &&
                typeof setSearch === 'function' &&
                btnEdit(
                  cardData,
                  setSearch,
                  setState,
                  { ...zoneActionButtonStyle, backgroundColor: '#0288d1', color: '#fff' },
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M4 20h4l10-10-4-4L4 16v4z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                    <path d="M13 7l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                )
              ))}
            {idx === 5 && <button type="button" style={{ ...zoneActionButtonStyle, backgroundColor: '#1565c0', color: '#fff' }} aria-label="Додаткова синя кнопка" title="Додаткова синя кнопка" />}
            {idx === 6 && <button type="button" style={{ ...zoneActionButtonStyle, backgroundColor: '#6a1b9a', color: '#fff' }} aria-label="Додаткова фіолетова кнопка" title="Додаткова фіолетова кнопка" />}
          </div>
        ))}
      </div>
      <div style={actionButtonsContainerStyle}>
        {showSideActions && btnExport(cardData)}
        {additionalActions}
      </div>
      <div>
        {cardData.lastAction && formatDateToDisplay(normalizeLastAction(cardData.lastAction))}
        {cardData.lastAction && ', '}
        {cardData.userId && (
          <a
            href={buildRtdbLink(cardData.userId)}
            target="_blank"
            rel="noreferrer"
            title="Відкрити профіль в Firebase RTDB"
            onClick={event => event.stopPropagation()}
            style={{ color: 'inherit', textDecoration: 'none' }}
          >
            {cardData.userId}
          </a>
        )}
        {!isAgentOrIP &&
          fieldGetInTouch(cardData, setUsers, setState, currentFilter, isDateInRange, submitOptions)}
        {fieldRole(cardData, setUsers, setState, submitOptions)}
        {!isAgentOrIP && <FieldLastCycle userData={cardData} setUsers={setUsers} setState={setState} submitOptions={submitOptions} />}
        <div>{fieldDeliveryInfo(setUsers, setState, cardData, submitOptions)}</div>
        {renderOverlayEntries(['lastDelivery', 'ownKids'])}
        <div>
          {cardData.birth && `${cardData.birth} - `}
          {cardData.birth && fieldBirth(cardData.birth)}
        </div>
        {renderOverlayEntries('birth')}
      </div>
      {/* <div style={{ color: '#856404', fontWeight: 'bold' }}>{nextContactDate}</div> */}
      <div>
        <strong>{buildName(cardData)}</strong>
        {renderOverlayEntries(['surname', 'name', 'fathersname'])}
        {/* {renderCsection(cardData.csection)}  */}
        <div style={identityMetaStyle}>{renderIdentityMeta(cardData)}</div>
        {renderOverlayEntries(['maritalStatus', 'blood', 'height', 'weight'])}
        {region && <div>{region}</div>}
        {renderOverlayEntries('region')}
        <div style={contactsWrapperStyle}>
          {fieldContacts(cardData)}
        </div>
        {renderOverlayEntries(['phone', 'phone2', 'phone3', 'telegram', 'email', 'facebook', 'instagram', 'tiktok', 'vk'])}
      </div>
      {fieldWriter(cardData, setUsers, setState, submitOptions)}
      <div style={commentFieldWrapperStyle}>
        <FieldComment userData={cardData} setUsers={setUsers} setState={setState} submitOptions={submitOptions} />
      </div>

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
        style={detailsToggleStyle}
      >
        ...
      </div>
    </div>
  );
};
