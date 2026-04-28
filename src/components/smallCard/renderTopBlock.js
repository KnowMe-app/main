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
import {
  fetchUserById,
  setUserComment as persistUserComment,
  updateCommentByOwner,
  fetchAllCommentsByCardId
} from '../config';
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

const multiCommentStyle = {
  fontStyle: 'italic',
  color: '#f3dfab',
  cursor: 'pointer',
  textDecoration: 'none',
  fontSize: '60%',
  lineHeight: 1.25,
};

const multiCommentRowStyle = {
  marginTop: '6px',
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
};

const commentAuthorButtonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '20px',
  height: '20px',
  border: 'none',
  background: 'transparent',
  color: '#f3dfab',
  cursor: 'pointer',
  padding: 0,
};

const inlineModalOverlayStyle = {
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.55)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 3000,
  padding: '16px',
};

const inlineModalCardStyle = {
  width: 'min(92vw, 560px)',
  background: '#fff',
  color: '#111',
  borderRadius: '12px',
  padding: '14px',
  boxShadow: '0 18px 40px rgba(0, 0, 0, 0.35)',
};

const inlineModalTextareaStyle = {
  width: '100%',
  minHeight: '120px',
  borderRadius: '8px',
  border: '1px solid #c7c7c7',
  padding: '10px',
  resize: 'vertical',
  fontSize: '14px',
  boxSizing: 'border-box',
};

const inlineModalActionsStyle = {
  marginTop: '10px',
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '8px',
};

const hasAgentOrIPRole = data =>
  data.userRole === 'ag' || data.userRole === 'ip' || data.role === 'ag' || data.role === 'ip';

const hasRoleWithoutCycle = data =>
  data.userRole === 'pp' || data.role === 'pp' || hasAgentOrIPRole(data);

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

const extractMultiDataComments = cardData => {
  const candidates = [
    cardData?.multiData?.comments,
    cardData?.multiDataComments,
    cardData?.comments,
  ];

  const normalized = [];
  candidates.forEach((value, sourceIndex) => {
    if (!value) return;

    if (typeof value === 'string') {
      const text = value.trim();
      if (text) normalized.push({ commentId: `string-${sourceIndex}`, text, authorId: '', lastAction: 0 });
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item, itemIndex) => {
        if (typeof item === 'string') {
          const text = item.trim();
          if (text) normalized.push({ commentId: `arr-${sourceIndex}-${itemIndex}`, text, authorId: '', lastAction: 0 });
        } else if (item?.text) {
          const text = String(item.text).trim();
          if (text) {
            normalized.push({
              commentId: item.commentId || `arr-${sourceIndex}-${itemIndex}`,
              text,
              authorId: item.authorId || '',
              lastAction: item.lastAction || item.date || 0,
            });
          }
        }
      });
      return;
    }

    if (typeof value === 'object') {
      Object.entries(value).forEach(([key, item]) => {
        if (typeof item === 'string') {
          const text = item.trim();
          if (text) normalized.push({ commentId: key, text, authorId: '', lastAction: 0 });
        } else if (item?.text) {
          const text = String(item.text).trim();
          if (text) {
            normalized.push({
              commentId: item.commentId || key,
              text,
              authorId: item.authorId || '',
              lastAction: item.lastAction || item.date || 0,
            });
          }
        }
      });
    }
  });

  return normalized.filter(comment => comment.text);
};

const TopBlock = ({
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
}) => {
  const formatCommentDate = React.useCallback(value => {
    if (!value) return '';
    const parsed = typeof value === 'number' ? new Date(value) : new Date(String(value));
    if (Number.isNaN(parsed.getTime())) return '';
    const day = String(parsed.getDate()).padStart(2, '0');
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const year = parsed.getFullYear();
    return `${day}.${month}.${year}`;
  }, []);

  const [editableComment, setEditableComment] = React.useState('');
  const [isCommentModalOpen, setIsCommentModalOpen] = React.useState(false);
  const [selectedComment, setSelectedComment] = React.useState(null);
  const [backendMultiComments, setBackendMultiComments] = React.useState([]);
  const cardData = React.useMemo(() => {
    if (!userData) return null;
    return { ...userData, cycleStatus: getEffectiveCycleStatus(userData) };
  }, [userData]);
  const localMultiDataComments = extractMultiDataComments(cardData);
  const multiDataComments = React.useMemo(() => {
    const fromLocal = localMultiDataComments.map(item => ({
      ...item,
      source: 'local',
    }));
    const fromBackend = backendMultiComments.map(item => ({
      commentId: item.commentId,
      text: item.text,
      authorId: item.authorId || item.ownerId || '',
      ownerId: item.ownerId || '',
      source: 'backend',
      lastAction: item.lastAction || 0,
    }));
    const combined = [...fromLocal, ...fromBackend];
    const uniq = new Map();
    combined.forEach(comment => {
      const key = `${comment.commentId || ''}|${comment.authorId || ''}|${comment.text || ''}`;
      if (!uniq.has(key)) {
        uniq.set(key, comment);
      }
    });
    return Array.from(uniq.values());
  }, [localMultiDataComments, backendMultiComments]);
  const region = normalizeRegion(cardData.region);
  const showSideActions = !additionalActions;
  const hasHiddenCycleFieldRole = hasRoleWithoutCycle(cardData);

  React.useEffect(() => {
    if (!cardData?.userId) {
      setBackendMultiComments([]);
      return;
    }
    let isMounted = true;
    const loadAllComments = async () => {
      const allByCard = await fetchAllCommentsByCardId(cardData.userId);
      if (!isMounted) return;
      setBackendMultiComments(allByCard);
    };
    loadAllComments();
    return () => {
      isMounted = false;
    };
  }, [cardData?.userId]);

  if (!cardData) return null;

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

  const saveMultiComment = async () => {
    const prepared = editableComment.trim();
    const targetCommentId = selectedComment?.commentId || '';
    const targetOwnerId = selectedComment?.ownerId || selectedComment?.authorId || '';
    if (!targetCommentId) {
      toast.error('Не обрано коментар для редагування');
      return;
    }
    const updatedComments = (multiDataComments || []).map(comment =>
      comment.commentId === targetCommentId ? { ...comment, text: prepared } : comment
    );
    const optimisticCard = {
      ...cardData,
      multiData: {
        ...(cardData.multiData || {}),
        comments: updatedComments.map(comment => ({
          commentId: comment.commentId,
          text: comment.text,
          authorId: comment.authorId || '',
        })),
      },
    };
    if (typeof setUsers === 'function') {
      setUsers(prev => {
        if (Array.isArray(prev)) {
          return prev.map(item => (item?.userId === cardData.userId ? optimisticCard : item));
        }
        if (prev && typeof prev === 'object') {
          const current = prev[cardData.userId];
          if (!current) return prev;
          return {
            ...prev,
            [cardData.userId]: optimisticCard,
          };
        }
        return prev;
      });
    }
    if (typeof setState === 'function' && !isFromListOfUsers) {
      setState(prev => ({ ...prev, ...optimisticCard }));
    }

    const result = targetOwnerId
      ? await updateCommentByOwner({
          ownerId: targetOwnerId,
          commentId: targetCommentId,
          cardId: cardData.userId,
          text: prepared,
        })
      : await persistUserComment(cardData.userId, prepared);
    if (!result) {
      toast.error('Не вдалося зберегти коментар в multiData');
      return;
    }
    toast.success('Коментар в multiData збережено');
    setIsCommentModalOpen(false);
    setSelectedComment(null);
  };

  const openAuthorCardForEdit = async authorId => {
    if (!authorId) {
      toast.error('Немає автора для цього коментаря');
      return;
    }
    if (typeof setSearch !== 'function' || typeof setState !== 'function') {
      toast.error('Режим редагування недоступний у цьому контексті');
      return;
    }
    const authorCard = await fetchUserById(authorId);
    if (!authorCard) {
      toast.error('Картку автора не знайдено');
      return;
    }
    setSearch(authorId);
    setState(authorCard);
  };

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
                  color: '#fff',
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
                  color: '#fff',
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
        {fieldGetInTouch(cardData, setUsers, setState, currentFilter, isDateInRange, submitOptions)}
        {fieldRole(cardData, setUsers, setState, submitOptions)}
        {!hasHiddenCycleFieldRole && <FieldLastCycle userData={cardData} setUsers={setUsers} setState={setState} submitOptions={submitOptions} />}
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
        {multiDataComments.map(comment => (
          <div key={comment.commentId || `${comment.authorId}-${comment.text}`} style={multiCommentRowStyle}>
            <button
              type="button"
              style={commentAuthorButtonStyle}
              title="Відкрити автора коментаря в режимі редагування"
              aria-label="Відкрити автора коментаря в режимі редагування"
              onClick={event => {
                event.stopPropagation();
                openAuthorCardForEdit(comment.authorId);
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8" />
                <path d="M5 20a7 7 0 0 1 14 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
            <div
              style={multiCommentStyle}
              title="Редагувати коментар multiData"
              onClick={event => {
                event.stopPropagation();
                setSelectedComment(comment);
                setEditableComment(comment.text);
                setIsCommentModalOpen(true);
              }}
            >
              {`${formatCommentDate(comment.lastAction) || '--.--.----'} - ${comment.text}`}
            </div>
          </div>
        ))}
      </div>
      {isCommentModalOpen && (
        <div
          style={inlineModalOverlayStyle}
          onClick={event => {
            event.stopPropagation();
            setIsCommentModalOpen(false);
            setSelectedComment(null);
          }}
        >
          <div
            style={inlineModalCardStyle}
            onClick={event => event.stopPropagation()}
          >
            <strong>Коментар з multiData</strong>
            <textarea
              value={editableComment}
              onChange={event => setEditableComment(event.target.value)}
              style={inlineModalTextareaStyle}
            />
            <div style={inlineModalActionsStyle}>
              <button
                type="button"
                onClick={() => {
                  setIsCommentModalOpen(false);
                  setSelectedComment(null);
                }}
              >
                Скасувати
              </button>
              <button type="button" onClick={saveMultiComment}>
                Зберегти
              </button>
            </div>
          </div>
        </div>
      )}

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
) => (
  <TopBlock
    userData={userData}
    setUsers={setUsers}
    setShowInfoModal={setShowInfoModal}
    setState={setState}
    setUserIdToDelete={setUserIdToDelete}
    isFromListOfUsers={isFromListOfUsers}
    favoriteUsers={favoriteUsers}
    setFavoriteUsers={setFavoriteUsers}
    dislikeUsers={dislikeUsers}
    setDislikeUsers={setDislikeUsers}
    currentFilter={currentFilter}
    isDateInRange={isDateInRange}
    onOpenMedications={onOpenMedications}
    setSearch={setSearch}
    topBlueAction={topBlueAction}
    additionalActions={additionalActions}
    overlayFieldAdditions={overlayFieldAdditions}
    onSubmitHistorySnapshot={onSubmitHistorySnapshot}
  />
);
