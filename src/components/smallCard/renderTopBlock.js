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
import { updateUserInState } from './userStateUpdate';
import { fieldRole } from './fieldRole';
import { FieldLastCycle } from './fieldLastCycle';
import { FieldComment } from './FieldComment';
import { compactDateButtonStyle } from './compactDateRowStyles';
import { fieldBirth } from './fieldBirth';
import { fieldBlood } from './fieldBlood';
import { fieldMaritalStatus } from './fieldMaritalStatus';
import { fieldIMT } from './fieldIMT';
import { formatDateToDisplay } from 'components/inputValidations';
import { normalizeRegion } from '../normalizeLocation';
import { getCurrentValue } from '../getCurrentValue';
import {
  fetchUserById,
  setUserComment as persistUserComment,
  fetchAllCommentsByCardId,
  updateCommentByOwner,
  deleteCommentByOwner,
} from '../config';
import { updateCard, clearCardCache } from 'utils/cardsStorage';
import { getCard } from 'utils/cardIndex';
import { normalizeLastAction } from 'utils/normalizeLastAction';
import { filterOutMedicationPhotos } from 'utils/photoFilters';
import { convertDriveLinkToImage } from 'utils/convertDriveLinkToImage';
import { getEffectiveCycleStatus } from 'utils/cycleStatus';
import { isAdminUid } from 'utils/accessLevel';
import { auth } from '../config';
import toast from 'react-hot-toast';

const topBlockContainerStyle = {
  padding: '8px',
  position: 'relative',
  boxSizing: 'border-box',
  width: '100%',
  minWidth: 0,
  overflow: 'hidden',
  backgroundSize: 'cover',
  backgroundPosition: 'center',
  backgroundRepeat: 'no-repeat',
  isolation: 'isolate',
};

const topBlockPhotoStyle = {
  position: 'absolute',
  right: '8px',
  top: '50%',
  transform: 'translateY(-50%)',
  width: '44px',
  height: '44px',
  borderRadius: '50%',
  objectFit: 'cover',
  border: '2px solid rgba(255, 255, 255, 0.9)',
  boxShadow: '0 4px 12px rgba(17, 24, 39, 0.28)',
  backgroundColor: 'rgba(255, 255, 255, 0.85)',
  pointerEvents: 'none',
};

const topButtonsRowStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '5px',
  flexWrap: 'wrap',
  marginBottom: '5px',
  minWidth: 0,
};

const topButtonsZoneStyle = {
  border: 'none',
  borderRadius: '9px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '30px',
  height: '30px',
  flex: '0 0 30px',
  padding: 0,
  boxShadow: '0 3px 8px rgba(17, 24, 39, 0.25)',
  transition: 'transform 0.15s ease, box-shadow 0.15s ease',
};


const zoneActionButtonStyle = {
  position: 'static',
  width: '100%',
  height: '100%',
  minHeight: '30px',
  borderRadius: '9px',
  border: 'none',
  margin: 0,
  padding: 0,
  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.2)',
};

const secondaryActionsStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '5px',
  flex: '1 1 90px',
  justifyContent: 'flex-end',
  flexWrap: 'wrap',
  marginLeft: 'auto',
  minWidth: 0,
};

const compactTopActionButtonStyle = {
  ...zoneActionButtonStyle,
  display: 'inline-flex',
  width: '30px',
  height: '30px',
  minHeight: '30px',
  flex: '0 0 30px',
};

const compactReactionButtonStyle = {
  ...compactDateButtonStyle,
  position: 'static',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: compactDateButtonStyle.height,
  padding: 0,
  margin: 0,
  boxShadow: '0 2px 5px rgba(17, 24, 39, 0.18)',
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

const cardHeaderStyle = {
  marginBottom: '5px',
  minWidth: 0,
};

const cardNameRowStyle = {
  display: 'flex',
  alignItems: 'baseline',
  gap: '6px',
  flexWrap: 'wrap',
  marginBottom: '2px',
};

const cardNameStyle = {
  fontSize: '15px',
  fontWeight: 700,
  lineHeight: 1.2,
  minWidth: 0,
  overflowWrap: 'anywhere',
};

const cardIdRowStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '5px',
  fontSize: '10px',
  opacity: 0.55,
  flexWrap: 'wrap',
  minWidth: 0,
  overflowWrap: 'anywhere',
};

const roleBadgeStyle = role => ({
  display: 'inline-flex',
  alignItems: 'center',
  padding: '1px 7px',
  borderRadius: '10px',
  fontSize: '10px',
  fontWeight: 700,
  letterSpacing: '0.6px',
  textTransform: 'uppercase',
  background: 'rgba(255,255,255,0.22)',
  color: '#fff',
  flexShrink: 0,
  border: `1px solid rgba(255,255,255,0.3)`,
  cursor: 'pointer',
  lineHeight: 1.4,
});

const statusRowStyle = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'stretch',
  gap: '6px',
  padding: '6px',
  borderRadius: '8px',
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.1)',
  margin: '5px 0',
  boxSizing: 'border-box',
  width: '100%',
  minWidth: 0,
};

const statusItemStyle = {
  display: 'flex',
  alignItems: 'center',
  minWidth: 0,
  width: '100%',
  overflow: 'visible',
};

const getInTouchStatusItemStyle = {
  ...statusItemStyle,
};

const roleEditorStyle = {
  width: '100%',
  padding: '4px 6px',
  borderRadius: '8px',
  background: 'rgba(0,0,0,0.12)',
  border: '1px solid rgba(255,255,255,0.14)',
  boxSizing: 'border-box',
  minWidth: 0,
};

const bioSectionStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '3px',
  minWidth: 0,
};

const bioRowStyle = {
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: '4px',
  fontSize: '12px',
  minWidth: 0,
};

const factChipStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '3px',
  minWidth: 0,
  maxWidth: '100%',
  padding: '1px 5px',
  borderRadius: '999px',
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.08)',
  lineHeight: 1.35,
  overflowWrap: 'anywhere',
};

const contactsSectionStyle = {
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: '3px 6px',
  marginTop: '4px',
  fontSize: '12px',
  minWidth: 0,
  overflowWrap: 'anywhere',
};

const commentsSectionStyle = {
  marginTop: '5px',
  padding: '4px 6px',
  borderRadius: '7px',
  background: 'rgba(255,255,255,0.07)',
  display: 'flex',
  flexDirection: 'column',
  gap: '3px',
  minHeight: '36px',
  height: 'auto',
  overflow: 'visible',
  boxSizing: 'border-box',
  minWidth: 0,
};

const detailsToggleStyle = {
  ...compactTopActionButtonStyle,
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  backgroundColor: '#1976d2',
  color: '#fff',
  border: 'none',
  boxShadow: '0 3px 8px rgba(17, 24, 39, 0.25)',
  lineHeight: 1,
};

const multiCommentStyle = {
  fontStyle: 'italic',
  color: '#f3dfab',
  cursor: 'pointer',
  textDecoration: 'none',
  fontSize: '11px',
  lineHeight: 1.25,
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  minWidth: 0,
  overflowWrap: 'anywhere',
};

const multiCommentRowStyle = {
  marginTop: '2px',
  display: 'flex',
  alignItems: 'center',
  gap: '5px',
  minWidth: 0,
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

const commentDeleteButtonStyle = {
  ...commentAuthorButtonStyle,
  color: '#ffb4b4',
  fontSize: '14px',
  fontWeight: 700,
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

const modalButtonBaseStyle = {
  padding: '7px 16px',
  borderRadius: '8px',
  border: 'none',
  fontSize: '14px',
  fontWeight: 600,
  cursor: 'pointer',
  lineHeight: 1.4,
};

const modalCancelButtonStyle = {
  ...modalButtonBaseStyle,
  background: '#e5e7eb',
  color: '#374151',
};

const modalSaveButtonStyle = {
  ...modalButtonBaseStyle,
  background: '#0288d1',
  color: '#fff',
};

const modalDeleteButtonStyle = {
  ...modalButtonBaseStyle,
  background: '#d32f2f',
  color: '#fff',
};


const deleteModalTextStyle = {
  marginTop: '8px',
  marginBottom: '12px',
  lineHeight: 1.35,
};

const normalizePhotoValue = value => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

const normalizePhotoList = value => {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(normalizePhotoList);
  if (typeof value === 'object') return Object.values(value).flatMap(normalizePhotoList);
  const photo = normalizePhotoValue(value);
  return photo ? [photo] : [];
};

const normalizeCurrentPhoto = value => {
  const photo = normalizePhotoValue(getCurrentValue(value));
  return photo ? [photo] : [];
};

const getUserPhotoUrl = data => {
  const photos = [
    ...normalizePhotoList([data?.photos, data?.photoUrls, data?.avatarUrls]),
    ...[
      data?.photoURL,
      data?.photoUrl,
      data?.mainPhoto,
      data?.userPhoto,
      data?.avatar,
      data?.photo,
      data?.image,
      data?.picture,
    ].flatMap(normalizeCurrentPhoto),
  ].map(convertDriveLinkToImage);
  return filterOutMedicationPhotos(photos, data?.userId)[0] || '';
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
      if (text) normalized.push({ commentId: `string-${sourceIndex}`, text, authorId: '' });
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item, itemIndex) => {
        if (typeof item === 'string') {
          const text = item.trim();
          if (text) normalized.push({ commentId: `arr-${sourceIndex}-${itemIndex}`, text, authorId: '' });
        } else if (item?.text) {
          const text = String(item.text).trim();
          if (text) {
            normalized.push({
              commentId: item.commentId || `arr-${sourceIndex}-${itemIndex}`,
              text,
              authorId: item.authorId || '',
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
          if (text) normalized.push({ commentId: key, text, authorId: '' });
        } else if (item?.text) {
          const text = String(item.text).trim();
          if (text) {
            normalized.push({
              commentId: item.commentId || key,
              text,
              authorId: item.authorId || '',
            });
          }
        }
      });
    }
  });

  return normalized.filter(comment => comment.text);
};

export const TopBlock = ({
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
  onSubmitHistorySnapshot = null,
  stimulationScheduleToggle = null
}) => {
  const [editableComment, setEditableComment] = React.useState('');
  const [isCommentModalOpen, setIsCommentModalOpen] = React.useState(false);
  const [selectedComment, setSelectedComment] = React.useState(null);
  const [commentToDelete, setCommentToDelete] = React.useState(null);
  const [isRoleEditorOpen, setIsRoleEditorOpen] = React.useState(false);
  const [backendMultiComments, setBackendMultiComments] = React.useState([]);
  const isAdmin = isAdminUid(auth.currentUser?.uid);
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
      lastAction: Number(item.lastAction) || 0,
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

  const userPhotoUrl = getUserPhotoUrl(cardData);

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
    const currentUid = auth.currentUser?.uid || '';
    if (!targetCommentId) {
      toast.error('Не обрано коментар для редагування');
      return;
    }
    if (selectedComment?.ownerId && selectedComment.ownerId !== currentUid && !isAdmin) {
      toast.error('Недостатньо прав для редагування цього коментаря');
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
          return updateUserInState(prev, cardData.userId, () => optimisticCard);
        }
        return updateUserInState(prev, cardData.userId, () => optimisticCard);
      });
    }
    if (typeof setState === 'function' && !isFromListOfUsers) {
      setState(prev => ({ ...prev, ...optimisticCard }));
    }

    let result = null;
    if (selectedComment?.ownerId && selectedComment?.commentId) {
      result = await updateCommentByOwner({
        ownerId: selectedComment.ownerId,
        commentId: selectedComment.commentId,
        cardId: cardData.userId,
        text: prepared,
      });
    } else {
      result = await persistUserComment(cardData.userId, prepared);
    }
    if (!result) {
      toast.error('Не вдалося зберегти коментар в multiData');
      return;
    }
    setBackendMultiComments(prev =>
      prev.map(item =>
        item.commentId === targetCommentId && (item.ownerId || '') === (selectedComment?.ownerId || '')
          ? { ...item, text: prepared, lastAction: result.lastAction || Date.now() }
          : item
      )
    );
    toast.success('Коментар в multiData збережено');
    setIsCommentModalOpen(false);
    setSelectedComment(null);
  };

  const handleDeleteComment = async comment => {
    if (!isAdmin || !comment?.ownerId || !comment?.commentId) {
      toast.error('Видалення недоступне');
      return;
    }
    const isDeleted = await deleteCommentByOwner({
      ownerId: comment.ownerId,
      commentId: comment.commentId,
    });
    if (!isDeleted) {
      toast.error('Не вдалося видалити коментар');
      return;
    }
    setBackendMultiComments(prev =>
      prev.filter(item => !(item.commentId === comment.commentId && item.ownerId === comment.ownerId))
    );
    toast.success('Коментар видалено');
  };

  const formatCommentDate = timestamp => {
    const normalizedTimestamp = Number(timestamp);
    if (!Number.isFinite(normalizedTimestamp) || normalizedTimestamp <= 0) return '';
    const date = new Date(normalizedTimestamp);
    if (Number.isNaN(date.getTime())) return '';
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = String(date.getFullYear());
    return `${day}.${month}.${year}`;
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
    setSearch(authorId);
    const cachedAuthorCard = getCard(authorId);
    setState(cachedAuthorCard || { userId: authorId }, {
      source: cachedAuthorCard ? 'localStorage' : 'userChange',
      caller: 'renderTopBlock.openAuthorCardForEdit',
      reason: 'open-author-local-first',
    });
  };

  const refreshCardFromBackend = async () => {
    let fresh = null;
    let toastFn = toast.error;
    let toastMsg = 'Не вдалося завантажити дані';
    try {
      fresh = await fetchUserById(cardData.userId);
      if (fresh) {
        clearCardCache(cardData.userId);
        updateCard(cardData.userId, fresh);
        const backendCard = { ...fresh, userId: cardData.userId };

        if (setUsers) {
          setUsers(prev => {
            return updateUserInState(prev, cardData.userId, () => backendCard);
          });
        }

        if (setState && !isFromListOfUsers) {
          setState(backendCard, {
            source: 'backend',
            caller: 'renderTopBlock.detailsRefreshButton',
            reason: 'manual-backend-refresh',
          });
        }

        console.log('[ProfileSnapshotDebug][renderTopBlock]', {
          source: 'backend',
          caller: 'details-refresh-button',
          userId: cardData.userId,
          fieldsCount: Object.keys(backendCard).length,
          applied: true,
          timestamp: new Date().toISOString(),
        });
        toastFn = toast.success;
        toastMsg = `Дані завантажено з бекенду (${Object.keys(backendCard).length} полів)`;
      } else {
        toastMsg = 'Свіжі дані відсутні';
      }
    } catch (error) {
      console.error(error);
      toastMsg = error.message || 'Не вдалося завантажити дані';
    } finally {
      toastFn(toastMsg);
    }
  };

  const cardRole = cardData.role || cardData.userRole;
  const displayRole = cardRole || 'role';
  const identityMeta = renderIdentityMeta(cardData);
  const updateContext = {
    mode: isFromListOfUsers ? 'list' : 'single',
    userId: cardData.userId,
    setCurrentUser: setState,
    setUserCollection: setUsers,
  };

  const deliveryInfo = fieldDeliveryInfo({
    userData: cardData,
    setUsers,
    setState,
    submitOptions,
    updateContext,
  });

  const handleDetailsRefresh = async event => {
    event.stopPropagation();
    const details = document.getElementById(cardData.userId);
    const showDetails = () => {
      if (details) {
        details.style.display = 'block';
        details.style.marginTop = '8px';
        const bg = getParentBackground(details);
        details.style.color = getContrastColor(bg);
      }
    };

    showDetails();
    await refreshCardFromBackend();
  };

  const blueActionElement = topBlueAction ? (
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
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 20h4l10-10-4-4L4 16v4z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M13 7l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    )
  );

  const getInTouchReactionActions = (
    <>
      <button
        type="button"
        style={{
          ...compactReactionButtonStyle,
          backgroundColor: '#d32f2f',
          border: 'none',
          color: '#fff',
        }}
        onClick={event => {
          event.stopPropagation();
          handleChange(
            setUsers,
            setState,
            cardData.userId,
            'getInTouch',
            '',
            true,
            { currentFilter, isDateInRange, ...submitOptions },
          );
        }}
        disabled={!cardData?.userId}
        title="Видалити дату контакту"
        aria-label="Видалити дату контакту"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      </button>
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
          ...compactReactionButtonStyle,
          backgroundColor: '#ef6c00',
          border: 'none',
        }}
        inactiveIconColor="#fff"
        activeIconColor="#1f2937"
        iconSize={11}
        activeBorderWidth={2}
        activeBoxShadowWidth={1}
      />
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
          ...compactReactionButtonStyle,
          backgroundColor: '#f9a825',
          border: 'none',
        }}
        inactiveIconColor="#fff"
        activeIconColor="#1f2937"
        iconSize={11}
        activeBorderWidth={2}
        activeBoxShadowWidth={1}
      />
    </>
  );

  const stimulationScheduleToggleTitle = stimulationScheduleToggle?.visible
    ? 'Приховати графік стимуляції'
    : 'Показати графік стимуляції';

  const stimulationScheduleToggleButton = stimulationScheduleToggle ? (
    <button
      type="button"
      onClick={event => {
        event.stopPropagation();
        if (typeof stimulationScheduleToggle.onToggle === 'function') {
          stimulationScheduleToggle.onToggle(cardData);
        }
      }}
      style={{
        ...detailsToggleStyle,
        backgroundColor: stimulationScheduleToggle.visible ? '#6a1b9a' : '#455a64',
      }}
      disabled={stimulationScheduleToggle.disabled}
      title={stimulationScheduleToggle.title || stimulationScheduleToggleTitle}
      aria-label={stimulationScheduleToggle.ariaLabel || stimulationScheduleToggleTitle}
      aria-pressed={Boolean(stimulationScheduleToggle.visible)}
    >
      {stimulationScheduleToggle.visible ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 19V5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M4 17H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M7 14L11 10L14 13L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M5 5L19 19" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 19V5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M4 17H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M7 14L11 10L14 13L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  ) : null;

  const topActions = [
    {
      key: 'delete',
      color: '#d32f2f',
      content: btnDel(
        cardData,
        setShowInfoModal,
        setUserIdToDelete,
        isFromListOfUsers,
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 7h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M7 7l1 12a1 1 0 0 0 1 .9h6a1 1 0 0 0 1-.9L17 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M10 11v5M14 11v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>,
        { ...zoneActionButtonStyle, backgroundColor: '#d32f2f', color: '#fff' }
      ),
    },
    typeof onOpenMedications === 'function' && {
      key: 'medications',
      color: '#2e7d32',
      content: (
        <button
          type="button"
          style={{ ...zoneActionButtonStyle, backgroundColor: '#2e7d32', color: '#fff' }}
          onClick={event => {
            event.stopPropagation();
            onOpenMedications(cardData);
          }}
          disabled={!cardData?.userId}
          aria-label="Ліки"
          title="Ліки"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M8.5 8.5l7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path d="M6.2 10.8a3.25 3.25 0 0 1 4.6-4.6l6.9 6.9a3.25 3.25 0 1 1-4.6 4.6l-6.9-6.9z" stroke="currentColor" strokeWidth="2" />
          </svg>
        </button>
      ),
    },
    blueActionElement && {
      key: 'blue-action',
      color: '#0288d1',
      content: blueActionElement,
    },
  ].filter(action => action && action.content);

  const statusRowWithPhotoStyle = userPhotoUrl
    ? { ...statusRowStyle, paddingRight: '64px' }
    : statusRowStyle;

  return (
    <div style={topBlockContainerStyle}>
      {userPhotoUrl && (
        <img
          src={userPhotoUrl}
          alt={buildName(cardData) || 'Фото користувача'}
          style={topBlockPhotoStyle}
          loading="lazy"
        />
      )}
      <div style={cardHeaderStyle}>
        <div style={cardNameRowStyle}>
          <div style={cardNameStyle}>{buildName(cardData)}</div>
          <button
            type="button"
            style={roleBadgeStyle(cardRole)}
            onClick={event => {
              event.stopPropagation();
              setIsRoleEditorOpen(open => !open);
            }}
            aria-expanded={isRoleEditorOpen}
            aria-label="Редагувати роль"
            title="Редагувати роль"
          >
            {displayRole}
          </button>
        </div>
        {isRoleEditorOpen && (
          <div style={roleEditorStyle} onClick={event => event.stopPropagation()}>
            {fieldRole({ userData: cardData, setUsers, setState, submitOptions, updateContext })}
          </div>
        )}
        {renderOverlayEntries(['surname', 'name', 'fathersname'])}
        <div style={cardIdRowStyle}>
          {cardData.lastAction && <span>{formatDateToDisplay(normalizeLastAction(cardData.lastAction))}</span>}
          {cardData.lastAction && cardData.userId && <span>·</span>}
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
        </div>
      </div>
      <div style={topButtonsRowStyle}>
        {topActions.map(action => (
          <div
            key={action.key}
            aria-label={action.key}
            style={{ ...topButtonsZoneStyle, backgroundColor: action.color }}
          >
            {action.content}
          </div>
        ))}
        <div style={secondaryActionsStyle}>
          {showSideActions &&
            btnExport(cardData, {
              ...compactTopActionButtonStyle,
              backgroundColor: 'green',
              color: '#fff',
            })}
          {additionalActions}
          {stimulationScheduleToggleButton}
          <button
            type="button"
            onClick={handleDetailsRefresh}
            style={detailsToggleStyle}
            title="Оновити дані з бекенду та показати всі поля"
            aria-label="Оновити дані з бекенду та показати всі поля"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 12a8 8 0 0 1 14.93-4H15" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M20 12a8 8 0 0 1-14.93 4H9" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>
      <div style={statusRowWithPhotoStyle}>
        <div style={getInTouchStatusItemStyle}>
          {fieldGetInTouch({
            userData: cardData,
            setUsers,
            setState,
            currentFilter,
            isDateInRange,
            submitOptions,
            trailingActions: getInTouchReactionActions,
            updateContext,
          })}
        </div>
        {!hasHiddenCycleFieldRole && (
          <div style={statusItemStyle}>
            <FieldLastCycle userData={cardData} setUsers={setUsers} setState={setState} submitOptions={submitOptions} />
          </div>
        )}
      </div>
      <div style={bioSectionStyle}>
        <div style={bioRowStyle}>
          {cardData.birth && (
            <span style={factChipStyle}>
              {cardData.birth} {fieldBirth(cardData.birth)}
            </span>
          )}
          {identityMeta.length > 0 && (
            <div style={{ ...factChipStyle, ...identityMetaStyle }}>{identityMeta}</div>
          )}
          {deliveryInfo && <div style={factChipStyle}>{deliveryInfo}</div>}
          {region && <div style={factChipStyle}>{region}</div>}
        </div>
        {renderOverlayEntries(['birth', 'maritalStatus', 'blood', 'height', 'weight'])}
        {renderOverlayEntries(['lastDelivery', 'ownKids'])}
        {renderOverlayEntries('region')}
      </div>
      <div style={contactsSectionStyle}>
        {fieldContacts(cardData)}
        {renderOverlayEntries(['phone', 'phone2', 'phone3', 'telegram', 'email', 'facebook', 'instagram', 'ameblo', 'tiktok', 'linkedin', 'youtube', 'twitter', 'line', 'otherLink', 'vk'])}
      </div>
      <div style={commentsSectionStyle}>
        {fieldWriter({ userData: cardData, setUsers, setState, submitOptions, updateContext })}
        <FieldComment
          userData={cardData}
          setUsers={setUsers}
          setState={setState}
          submitOptions={submitOptions}
        />
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
            {isAdmin && comment.ownerId && (
              <button
                type="button"
                style={commentDeleteButtonStyle}
                title="Видалити оригінальний коментар"
                aria-label="Видалити оригінальний коментар"
                onClick={event => {
                  event.stopPropagation();
                  setCommentToDelete(comment);
                }}
              >
                ×
              </button>
            )}
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
                style={modalCancelButtonStyle}
                onClick={() => {
                  setIsCommentModalOpen(false);
                  setSelectedComment(null);
                }}
              >
                Скасувати
              </button>
              <button type="button" style={modalSaveButtonStyle} onClick={saveMultiComment}>
                Зберегти
              </button>
            </div>
          </div>
        </div>
      )}
      {commentToDelete && (
        <div
          style={inlineModalOverlayStyle}
          onClick={event => {
            event.stopPropagation();
            setCommentToDelete(null);
          }}
        >
          <div
            style={inlineModalCardStyle}
            onClick={event => event.stopPropagation()}
          >
            <strong>Підтвердження видалення</strong>
            <div style={deleteModalTextStyle}>
              Ви впевнені, що хочете видалити цей коментар?
            </div>
            <div style={inlineModalActionsStyle}>
              <button
                type="button"
                style={modalCancelButtonStyle}
                onClick={() => {
                  setCommentToDelete(null);
                }}
              >
                Скасувати
              </button>
              <button
                type="button"
                style={modalDeleteButtonStyle}
                onClick={async () => {
                  await handleDeleteComment(commentToDelete);
                  setCommentToDelete(null);
                }}
              >
                Видалити
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export const renderTopBlock = ({
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
  onSubmitHistorySnapshot = null,
  stimulationScheduleToggle = null,
}) => (
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
    stimulationScheduleToggle={stimulationScheduleToggle}
  />
);
