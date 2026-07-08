import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Document,
  Image,
  Page,
  pdf,
  StyleSheet,
  Text,
  View,
} from '@react-pdf/renderer';
import { PDF_COLOR, PDF_FONT, pdfBaseStyles, sanitizePdfText } from '../pdfTheme';
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
import { getUserStateShape, updateUserInState } from './userStateUpdate';
import { fieldRole } from './fieldRole';
import { FieldLastCycle } from './fieldLastCycle';
import { FieldComment } from './FieldComment';
import Photos from '../Photos';
import { compactDateButtonStyle } from './compactDateRowStyles';
import { utilCalculateAge } from './utilCalculateAge';
import { fieldBirth } from './fieldBirth';
import { fieldBlood } from './fieldBlood';
import { fieldMaritalStatus } from './fieldMaritalStatus';
import { fieldIMT } from './fieldIMT';
import { normalizeDisplayValue } from '../profileLayoutConfig';
import { formatDateToDisplay } from 'components/inputValidations';
import { normalizeRegion } from '../normalizeLocation';
import { getCurrentValue } from '../getCurrentValue';
import {
  fetchUserById,
  getAllUserPhotos,
  getUserStorageAvatarPhotoFiles,
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

const topBlockAvatarRadius = '10px';
const topBlockHeaderAvatarSize = '72px';

const topBlockPhotoStyle = {
  width: '100%',
  height: '100%',
  borderRadius: topBlockAvatarRadius,
  objectFit: 'cover',
  display: 'block',
};

const topBlockAvatarButtonStyle = {
  position: 'absolute',
  right: '8px',
  top: '50%',
  transform: 'translateY(-50%)',
  width: '48px',
  height: '48px',
  borderRadius: topBlockAvatarRadius,
  padding: 0,
  border: 'none',
  boxShadow: '0 4px 12px rgba(17, 24, 39, 0.28)',
  background: 'rgba(255, 255, 255, 0.9)',
  color: '#e8791a',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
  zIndex: 2,
};

const topBlockHeaderLayoutStyle = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: '8px',
  marginBottom: '6px',
  minWidth: 0,
};

const topBlockHeaderContentStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  flex: '1 1 auto',
  minWidth: 0,
};

const topBlockHeaderAvatarButtonStyle = {
  ...topBlockAvatarButtonStyle,
  position: 'static',
  right: 'auto',
  top: 'auto',
  transform: 'none',
  width: topBlockHeaderAvatarSize,
  height: topBlockHeaderAvatarSize,
  flex: `0 0 ${topBlockHeaderAvatarSize}`,
  zIndex: 1,
};

const emptyAvatarStyle = {
  width: '100%',
  height: '100%',
  borderRadius: topBlockAvatarRadius,
  background: 'linear-gradient(145deg, #fffdf9 0%, #fff1e2 100%)',
  border: 'none',
  boxShadow: 'inset 0 0 0 4px #fff8f0',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
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
  alignItems: 'center',
  justifyContent: 'center',
  width: '30px',
  height: '30px',
  minHeight: '30px',
  flex: '0 0 30px',
  padding: 0,
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
  zIndex: 2147482990,
  padding: '16px',
};

const inlineModalCardStyle = {
  width: 'min(92vw, 560px)',
  background: 'var(--km-card)',
  color: 'var(--km-text)',
  borderRadius: '12px',
  padding: '14px',
  boxShadow: '0 18px 40px rgba(0, 0, 0, 0.35)',
};

const photosModalCardStyle = {
  width: 'min(94vw, 560px)',
  maxHeight: 'min(88vh, 720px)',
  overflowY: 'auto',
  background: 'linear-gradient(180deg, var(--km-accent-light) 0%, var(--km-card) 42%)',
  color: 'var(--km-text)',
  borderRadius: '20px',
  padding: '18px',
  boxShadow: '0 24px 70px rgba(0, 0, 0, 0.38)',
  border: '1px solid var(--km-border)',
};

const photosModalHeaderStyle = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: '12px',
  marginBottom: '14px',
};

const photosModalTitleStyle = {
  margin: 0,
  color: 'var(--km-text)',
  fontSize: '18px',
  lineHeight: 1.2,
};

const photosModalSubtitleStyle = {
  margin: '4px 0 0',
  color: 'var(--km-muted)',
  fontSize: '12px',
  lineHeight: 1.35,
};

const photosCollectionToggleStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  padding: '3px',
  marginTop: '8px',
  borderRadius: '999px',
  background: 'var(--km-accent-light)',
  border: '1px solid var(--km-border)',
};

const getPhotosCollectionToggleButtonStyle = isActive => ({
  border: 'none',
  borderRadius: '999px',
  padding: '5px 10px',
  background: isActive ? 'var(--km-accent)' : 'transparent',
  color: isActive ? '#fff' : 'var(--km-muted)',
  cursor: 'pointer',
  fontSize: '12px',
  fontWeight: 700,
  lineHeight: 1,
  boxShadow: isActive ? '0 3px 8px rgba(232, 121, 26, 0.28)' : 'none',
});

const photosModalCloseButtonStyle = {
  width: '34px',
  height: '34px',
  borderRadius: '50%',
  border: '1px solid var(--km-border)',
  background: 'var(--km-card)',
  color: 'var(--km-text)',
  cursor: 'pointer',
  fontSize: '22px',
  lineHeight: 1,
};

const inlineModalTextareaStyle = {
  width: '100%',
  minHeight: '120px',
  borderRadius: '8px',
  border: '1px solid var(--km-border)',
  background: 'var(--km-card)',
  color: 'var(--km-text)',
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
  background: 'var(--km-border)',
  color: 'var(--km-text)',
};

const modalSaveButtonStyle = {
  ...modalButtonBaseStyle,
  background: '#0288d1',
  color: '#fff',
};

const modalDeleteButtonStyle = {
  ...modalButtonBaseStyle,
  background: 'var(--km-danger)',
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

const getUserProfilePhotoUrls = data => {
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
  return Array.from(new Set(filterOutMedicationPhotos(photos, data?.userId).filter(Boolean)));
};

const hasAgentOrIPRole = data =>
  data.userRole === 'ag' || data.userRole === 'ip' || data.role === 'ag' || data.role === 'ip';

const hasRoleWithoutCycle = data =>
  data.userRole === 'pp' || data.role === 'pp' || hasAgentOrIPRole(data);

const buildRtdbLink = userId =>
  `https://console.firebase.google.com/u/0/project/webringitapp/database/webringitapp-default-rtdb/data/~2FnewUsers~2F${encodeURIComponent(userId || '')}`;

const resolveUserPhotoCollection = data => {
  if (data?.__sourceCollection === 'users' || data?.__sourceCollection === 'newUsers') {
    return data.__sourceCollection;
  }
  return null;
};

const stateContainsUser = (state, userId) => {
  if (!state || !userId) return false;
  const shape = getUserStateShape(state);
  if (shape === 'array') return state.some(item => item?.userId === userId);
  if (shape === 'map') return Boolean(state[userId]);
  if (shape === 'single') return state.userId === userId;
  return false;
};

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

const profilePdfStyles = StyleSheet.create({
  page: {
    position: 'relative',
    paddingTop: 78,
    paddingHorizontal: 88,
    paddingBottom: 74,
    fontFamily: PDF_FONT.base,
    color: PDF_COLOR.ink,
    backgroundColor: PDF_COLOR.white,
  },
  eyebrow: {
    ...pdfBaseStyles.eyebrow,
    textAlign: 'center',
    marginBottom: 8,
  },
  title: {
    fontFamily: PDF_FONT.bold,
    marginBottom: 6,
    textAlign: 'center',
    fontSize: 20,
    lineHeight: 1.25,
    color: PDF_COLOR.ink,
  },
  titleRule: {
    alignSelf: 'center',
    width: 64,
    height: 2,
    borderRadius: 1,
    backgroundColor: PDF_COLOR.accent,
    marginBottom: 28,
  },
  table: {
    borderWidth: 1,
    borderColor: PDF_COLOR.line,
    borderStyle: 'solid',
    borderRadius: 6,
  },
  row: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: PDF_COLOR.line,
    borderTopStyle: 'solid',
  },
  firstRow: {
    borderTopWidth: 0,
  },
  labelCell: {
    width: '38%',
    backgroundColor: PDF_COLOR.headBg,
    borderRightWidth: 1,
    borderRightColor: PDF_COLOR.line,
    borderRightStyle: 'solid',
    paddingVertical: 7,
    paddingHorizontal: 10,
    justifyContent: 'center',
  },
  labelText: {
    fontFamily: PDF_FONT.bold,
    fontSize: 10.5,
    color: '#4d3a26',
  },
  valueCell: {
    width: '62%',
    paddingVertical: 7,
    paddingHorizontal: 10,
    justifyContent: 'center',
  },
  valueText: {
    fontSize: 11,
    lineHeight: 1.4,
  },
  watermark: {
    position: 'absolute',
    left: 52,
    top: 330,
    width: 520,
    textAlign: 'center',
    fontFamily: PDF_FONT.bold,
    fontSize: 106,
    color: PDF_COLOR.watermark,
    opacity: 0.9,
    transform: 'rotate(-42deg)',
  },
  footer: {
    position: 'absolute',
    left: 88,
    right: 88,
    bottom: 28,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: PDF_COLOR.line,
    borderTopStyle: 'solid',
    paddingTop: 8,
    color: PDF_COLOR.muted,
    fontSize: 7.5,
    lineHeight: 1.4,
  },
  footerRight: {
    textAlign: 'right',
  },
  imagePage: {
    position: 'relative',
    paddingTop: 78,
    paddingHorizontal: 70,
    paddingBottom: 74,
    fontFamily: PDF_FONT.base,
    backgroundColor: PDF_COLOR.white,
  },
  profileImageWrap: {
    position: 'relative',
    alignSelf: 'center',
    width: 455,
    maxHeight: 620,
  },
  profileImage: {
    position: 'relative',
    zIndex: 0,
    width: 455,
    maxHeight: 620,
    objectFit: 'contain',
    alignSelf: 'center',
  },
  imageWatermark: {
    position: 'absolute',
    zIndex: 1,
    left: -32,
    top: 230,
    width: 520,
    textAlign: 'center',
    fontFamily: PDF_FONT.bold,
    fontSize: 86,
    color: PDF_COLOR.watermark,
    opacity: 0.9,
    transform: 'rotate(-42deg)',
  },
});

const pdfFooter = (
  <View style={profilePdfStyles.footer} fixed>
    <Text>
      KnowMe: Egg donor
    </Text>
    <Text style={profilePdfStyles.footerRight}>
      E-mail: KnowMeEggDonor@gmail.com{'\n'}
      Google Play: KnowMe: Egg donor
    </Text>
  </View>
);

const CYRILLIC_TO_LATIN = {
  а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh', з: 'z', и: 'y', і: 'i', ї: 'i', й: 'i',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts',
  ч: 'ch', ш: 'sh', щ: 'shch', ь: '', ю: 'iu', я: 'ia', ы: 'y', э: 'e', ё: 'io', ъ: '',
};

const PDF_VALUE_TRANSLATIONS = new Map([
  ['так', 'yes'], ['да', 'yes'], ['yes', 'yes'], ['true', 'yes'], ['+', 'yes'],
  ['ні', 'no'], ['нет', 'no'], ['no', 'no'], ['false', 'no'], ['-', 'no'], ['0', 'no'],
  ['немає', 'none'], ['відсутні', 'none'], ['відсутня', 'none'], ['не має', 'none'], ['none', 'none'],
  ['неодружена', 'not married'], ['незаміжня', 'not married'], ['не заміжня', 'not married'], ['не одружена', 'not married'],
  ['одружена', 'married'], ['заміжня', 'married'], ['європейська', 'European'], ['європеєць', 'European'],
  ['україна', 'Ukraine'], ['українка', 'Ukrainian'], ['українець', 'Ukrainian'], ['українська', 'Ukrainian'], ['українське', 'Ukrainian'],
  ['середня освіта', 'secondary education'], ['середня', 'secondary education'], ['вища освіта', 'higher education'], ['вища', 'higher education'],
  ['здоровий', 'healthy'], ['здорова', 'healthy'], ['здорова/ий', 'healthy'], ['касир', 'cashier'], ['продавець', 'retail cashier'],
]);

const transliterateForPdf = value => String(value || '').replace(/[А-Яа-яЁёЄєІіЇїҐґ]/g, char => {
  const lower = char.toLowerCase();
  const transliterated = CYRILLIC_TO_LATIN[lower] ?? char;
  return char === lower ? transliterated : transliterated.charAt(0).toUpperCase() + transliterated.slice(1);
});

const toPdfEnglishValue = value => {
  const normalized = normalizeDisplayValue(value);
  if (!normalized) return '';
  const translated = PDF_VALUE_TRANSLATIONS.get(normalized.trim().toLowerCase());
  return translated || transliterateForPdf(normalized);
};

const resolvePdfValue = (data, keys, { translate = true } = {}) => {
  const normalizedKeys = Array.isArray(keys) ? keys : [keys];
  for (const key of normalizedKeys) {
    const value = normalizeDisplayValue(data?.[key]);
    if (value) return translate ? toPdfEnglishValue(value) : value;
  }
  return '';
};

const resolvePdfAge = data => {
  const explicitAge = resolvePdfValue(data, ['age'], { translate: false });
  if (explicitAge) return explicitAge;
  const birth = resolvePdfValue(data, ['birth', 'birthDate', 'dateOfBirth'], { translate: false });
  const calculatedAge = utilCalculateAge(birth);
  return calculatedAge || '';
};

const normalizePdfYesNo = value => {
  if (value === null || value === undefined) return '';
  const raw = String(value).trim();
  if (!raw) return '';
  const loweredRaw = raw.toLowerCase();
  if (['-', '0'].includes(loweredRaw)) return 'no';

  const normalized = normalizeDisplayValue(value);
  if (!normalized) return '';
  const lowered = normalized.toLowerCase();
  if (['yes', 'true', 'так', 'да', '+'].includes(lowered)) return 'yes';
  if (['no', 'false', 'ні', 'нет', 'не було', 'none', 'немає', 'відсутні'].includes(lowered)) return 'no';
  return toPdfEnglishValue(normalized);
};

const resolvePdfYesNoValue = (data, keys) => {
  const normalizedKeys = Array.isArray(keys) ? keys : [keys];
  for (const key of normalizedKeys) {
    const value = normalizePdfYesNo(data?.[key]);
    if (value) return value;
  }
  return '';
};

const resolvePdfMetric = (data, keys, unit) => {
  const value = resolvePdfValue(data, keys, { translate: false });
  if (!value) return '';
  return new RegExp(`\\b${unit}\\b`, 'i').test(value) ? value : `${value} ${unit}`;
};

const resolvePdfCombinedValue = (data, entries) => {
  const values = entries
    .map(([label, keys]) => {
      const value = resolvePdfValue(data, keys);
      return value ? `${label}: ${value}` : '';
    })
    .filter(Boolean);
  return values.join('; ');
};

const resolvePdfHarmfulHabits = data => {
  const summary = resolvePdfValue(data, ['harmfulHabits', 'badHabits']);
  if (summary) return summary;

  const smoking = normalizePdfYesNo(data?.smoking);
  const alcohol = normalizePdfYesNo(data?.alcohol);
  if (!smoking && !alcohol) return 'no';
  if ([smoking, alcohol].filter(Boolean).every(value => value === 'no')) return 'no';

  return resolvePdfCombinedValue(data, [
    ['Smoking', ['smoking']],
    ['Alcohol', ['alcohol']],
  ]);
};

const resolvePdfGeneralHealth = data => {
  const chronicDiseases = normalizePdfYesNo(data?.chronicDiseases);
  if (chronicDiseases === 'no') return 'healthy';
  if (chronicDiseases === 'yes') return 'has chronic diseases';
  return chronicDiseases;
};

const resolvePdfMaritalStatus = data => {
  const value = resolvePdfValue(data, ['maritalStatus']);
  if (value === 'no') return 'not married';
  if (value === 'yes') return 'married';
  return value;
};

const resolvePdfBloodType = data => {
  const value = resolvePdfValue(data, ['blood', 'bloodType'], { translate: false }).replace(/\s+/g, '');
  if (!value) return '';
  const match = value.match(/^([1-4])([+-])?$/);
  if (match) {
    const groupMap = { 1: 'O', 2: 'A', 3: 'B', 4: 'AB' };
    return `${groupMap[match[1]]}${match[2] ? ` Rh${match[2] === '-' ? '−' : '+'}` : ''}`;
  }
  return toPdfEnglishValue(value).replace(/Rh-/g, 'Rh−');
};

const buildProfilePdfRows = data => ([
  ['Name', toPdfEnglishValue(buildName(data))],
  ['Age', resolvePdfAge(data)],
  ['Profession', resolvePdfValue(data, ['profession', 'specialization'])],
  ['Education', resolvePdfValue(data, ['education'])],
  ['Marital status', resolvePdfMaritalStatus(data)],
  ['Number of pregnancies', resolvePdfValue(data, ['ownKids'], { translate: false })],
  ['Ethnic group', resolvePdfValue(data, ['race', 'ethnicGroup', 'ethnicity'])],
  ['General health', resolvePdfGeneralHealth(data)],
  ['Weight', resolvePdfMetric(data, ['weight'], 'kg')],
  ['Height', resolvePdfMetric(data, ['height'], 'cm')],
  ['Blood type', resolvePdfBloodType(data)],
  ['Harmful habits', resolvePdfHarmfulHabits(data)],
  ['Nationality', 'Ukrainian'],
  ['Experience in surrogacy', resolvePdfYesNoValue(data, ['surrogacyExperience', 'experienceInSurrogacy'])],
  ['Cesarean section', resolvePdfYesNoValue(data, ['csection', 'cSection', 'c_section', 'cesareanSection'])],
]).filter(([, value]) => value);

const buildProfilePdfFileName = data => {
  const name = buildName(data) || data?.userId || 'profile';
  const safeName = name
    .toString()
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 80);
  return `${safeName || 'profile'}-KnowMe.pdf`;
};

const ProfilePdfDocument = ({ userData, photoUrls }) => {
  const rows = buildProfilePdfRows(userData);
  const photos = Array.isArray(photoUrls) ? photoUrls : [];
  const photoEntries = photos.map(photo => (
    photo && typeof photo === 'object' ? photo : { src: photo }
  )).filter(photo => photo?.src);
  return (
    <Document title={`${buildName(userData) || 'Profile'} - KnowMe: Egg donor`}>
      <Page size="A4" style={profilePdfStyles.page}>
        <Text style={profilePdfStyles.watermark}>KnowMe</Text>
        <Text style={profilePdfStyles.eyebrow}>{sanitizePdfText('KnowMe · Egg donor')}</Text>
        <Text style={profilePdfStyles.title}>
          {sanitizePdfText("Surrogacy mother's profile")}
        </Text>
        <View style={profilePdfStyles.titleRule} />
        <View style={profilePdfStyles.table}>
          {rows.map(([label, value], index) => (
            <View key={label} style={[profilePdfStyles.row, index === 0 ? profilePdfStyles.firstRow : null]} wrap={false}>
              <View style={profilePdfStyles.labelCell}><Text style={profilePdfStyles.labelText}>{sanitizePdfText(label)}</Text></View>
              <View style={profilePdfStyles.valueCell}><Text style={profilePdfStyles.valueText}>{sanitizePdfText(value)}</Text></View>
            </View>
          ))}
        </View>
        {pdfFooter}
      </Page>
      {photoEntries.map((photo, index) => (
        <Page key={`${photo.src}-${index}`} size="A4" style={profilePdfStyles.imagePage}>
          <View style={profilePdfStyles.profileImageWrap}>
            <Text style={profilePdfStyles.imageWatermark}>KnowMe</Text>
            <Image src={photo.src} style={profilePdfStyles.profileImage} />
          </View>
          {pdfFooter}
        </Page>
      ))}
    </Document>
  );
};

const pdfExportButtonStyle = {
  ...compactTopActionButtonStyle,
  backgroundColor: '#455a64',
  color: '#fff',
  textDecoration: 'none',
};

const resolvePdfPhotoUrls = async ({ cardData, photoUrls, photosCollection }) => {
  const existingPhotos = Array.isArray(photoUrls) ? photoUrls : [];

  if (!cardData?.userId) {
    return existingPhotos;
  }

  const { items: storageFiles } = await getUserStorageAvatarPhotoFiles(cardData.userId);
  const storagePhotos = storageFiles.map(file => file.dataUrl).filter(Boolean);
  if (storagePhotos.length) {
    return Array.from(new Set(storagePhotos));
  }

  const sourceCollection = photosCollection || resolveUserPhotoCollection(cardData);
  let databasePhotos = [];
  try {
    databasePhotos = await getAllUserPhotos(cardData.userId, sourceCollection, { includeStorage: false });
  } catch (error) {
    console.error('Unable to load PDF fallback photos', error);
  }

  const combinedPhotos = filterOutMedicationPhotos([...existingPhotos, ...databasePhotos], cardData.userId)
    .map(convertDriveLinkToImage)
    .filter(Boolean);
  return Array.from(new Set(combinedPhotos));
};

const readBlobAsDataUrl = blob => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : '');
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(blob);
});

// @react-pdf/renderer only reliably embeds baseline JPEG/PNG; re-encoding through
// a canvas normalizes progressive JPEGs, unusual PNG color modes, and EXIF-rotated
// photos that would otherwise render as a blank page with no error.
const reencodePdfImageDataUrl = src => new Promise(resolve => {
  // window.Image, not the react-pdf Image component imported above — that
  // import shadows the global and `new Image()` here threw "not a constructor",
  // killing the whole export.
  if (typeof window === 'undefined' || typeof window.Image !== 'function' || typeof document === 'undefined') {
    resolve(src);
    return;
  }

  const img = new window.Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    try {
      const width = img.naturalWidth || img.width;
      const height = img.naturalHeight || img.height;
      if (!width || !height) {
        resolve(src);
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.92));
    } catch (error) {
      console.error('Unable to re-encode PDF photo', error);
      resolve(src);
    }
  };
  img.onerror = () => resolve(src);
  img.src = src;
});

const loadPdfEmbeddedImage = async photoUrl => {
  const result = await resolvePdfEmbeddedImageSource(photoUrl);
  if (!result.src) return result;
  const normalizedSrc = await reencodePdfImageDataUrl(result.src);
  return { ...result, src: normalizedSrc };
};

const resolvePdfEmbeddedImageSource = async photoUrl => {
  if (!photoUrl) {
    return { src: '' };
  }

  if (String(photoUrl).startsWith('data:image/')) {
    return { src: photoUrl };
  }

  try {
    const response = await fetch(photoUrl);
    if (!response.ok) {
      throw new Error(`Photo request failed with status ${response.status}`);
    }
    const blob = await response.blob();
    const dataUrl = await readBlobAsDataUrl(blob);
    if (!dataUrl.startsWith('data:image/')) {
      return { src: '' };
    }
    return { src: dataUrl };
  } catch (error) {
    // Remote URLs are never handed to @react-pdf: its own fetch would hit the
    // same CORS wall and abort rendering of the whole document.
    console.error('Unable to load PDF photo', photoUrl, error);
    return { src: '' };
  }
};

const isSurrogateMotherRole = data => String(data?.userRole || data?.role || '').trim().toLowerCase() === 'sm';

const ProfilePdfExportButton = ({ cardData, photoUrls, photosCollection }) => {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleExport = async event => {
    event.stopPropagation();
    if (isGenerating) return;

    setIsGenerating(true);
    const fileName = buildProfilePdfFileName(cardData);

    const downloadBlob = blob => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    };

    try {
      const effectivePhotoUrls = await resolvePdfPhotoUrls({ cardData, photoUrls, photosCollection });
      const embeddedPhotoEntries = await Promise.all(
        effectivePhotoUrls.map(photoUrl => loadPdfEmbeddedImage(photoUrl))
      );
      const printablePhotoEntries = embeddedPhotoEntries.filter(entry => entry?.src);
      const blob = await pdf(
        <ProfilePdfDocument userData={cardData} photoUrls={printablePhotoEntries} />
      ).toBlob();
      downloadBlob(blob);
    } catch (error) {
      console.error('Unable to export profile PDF', error);
      try {
        const fallbackBlob = await pdf(
          <ProfilePdfDocument userData={cardData} photoUrls={[]} />
        ).toBlob();
        downloadBlob(fallbackBlob);
      } catch (fallbackError) {
        console.error('Unable to produce fallback PDF', fallbackError);
        toast.error('Не вдалося експортувати PDF');
      }
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <button
      type="button"
      style={pdfExportButtonStyle}
      title="Експорт профілю в PDF"
      aria-label="Експорт профілю в PDF"
      onClick={handleExport}
      disabled={isGenerating}
    >
      {isGenerating ? (
        <span style={{ fontSize: '10px', fontWeight: 700 }}>...</span>
      ) : (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M7 3h7l4 4v14H7V3z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M14 3v5h4" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M9 13h6M9 16h6M9 19h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );
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
  const [isPhotosModalOpen, setIsPhotosModalOpen] = React.useState(false);
  const [backendMultiComments, setBackendMultiComments] = React.useState([]);
  const [resolvedPhotosCollection, setResolvedPhotosCollection] = React.useState(null);
  const [selectedPhotosCollection, setSelectedPhotosCollection] = React.useState(null);
  const syncedPhotosCollectionRef = React.useRef({ userId: null, sourceCollection: undefined });
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
  const userPhotoUrls = getUserProfilePhotoUrls(cardData);
  const userPhotoUrl = userPhotoUrls[0] || '';

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

  React.useEffect(() => {
    const sourceCollection = resolveUserPhotoCollection(cardData);
    setResolvedPhotosCollection(sourceCollection);
    const syncedPhotosCollection = syncedPhotosCollectionRef.current;
    const shouldSyncSelectedCollection =
      syncedPhotosCollection.userId !== cardData?.userId ||
      syncedPhotosCollection.sourceCollection !== sourceCollection;
    if (shouldSyncSelectedCollection) {
      setSelectedPhotosCollection(sourceCollection || null);
      syncedPhotosCollectionRef.current = {
        userId: cardData?.userId || null,
        sourceCollection,
      };
    }

    if (sourceCollection || !cardData?.userId) {
      return undefined;
    }

    let isMounted = true;
    const resolveCollection = async () => {
      try {
        const fresh = await fetchUserById(cardData.userId);
        if (!isMounted) return;

        const freshCollection = resolveUserPhotoCollection(fresh);
        if (!freshCollection) {
          if (isPhotosModalOpen) toast.error('Не вдалося визначити джерело фото профілю');
          return;
        }

        setResolvedPhotosCollection(freshCollection);
        setSelectedPhotosCollection(prev => prev || freshCollection);
        if (typeof setState === 'function' && !isFromListOfUsers) {
          setState(prev => {
            const currentCard = prev && typeof prev === 'object' ? prev : cardData;
            if (currentCard?.userId && currentCard.userId !== cardData.userId) return prev;
            return {
              ...currentCard,
              __sourceCollection: freshCollection,
            };
          }, {
            source: 'userChange',
            caller: 'renderTopBlock.resolvePhotosCollection',
            reason: 'photos-source-resolved',
          });
        }

        if (typeof setUsers === 'function') {
          setUsers(prev => (
            stateContainsUser(prev, cardData.userId)
              ? updateUserInState(prev, cardData.userId, currentCard => ({
                ...currentCard,
                __sourceCollection: freshCollection,
              }))
              : prev
          ));
        }
      } catch (error) {
        if (isMounted) {
          console.error('Error resolving photo source:', error);
          if (isPhotosModalOpen) toast.error('Не вдалося визначити джерело фото профілю');
        }
      }
    };

    resolveCollection();
    return () => {
      isMounted = false;
    };
  }, [cardData, isFromListOfUsers, isPhotosModalOpen, setState, setUsers]);

  const photosCollection = resolvedPhotosCollection;
  const effectivePhotosCollection = selectedPhotosCollection || photosCollection;

  React.useEffect(() => {
    if (!cardData?.userId || userPhotoUrls.length > 0 || !effectivePhotosCollection) {
      return undefined;
    }

    let isMounted = true;
    const hydrateTopBlockPhotos = async () => {
      try {
        const urls = await getAllUserPhotos(cardData.userId, effectivePhotosCollection);
        if (!isMounted) return;
        const filteredUrls = filterOutMedicationPhotos(urls, cardData.userId);
        if (!filteredUrls.length) return;

        const updatePhotos = currentCard => {
          const baseCard = currentCard || cardData;
          if (baseCard?.userId && baseCard.userId !== cardData.userId) return currentCard;
          const currentUrls = getUserProfilePhotoUrls(baseCard);
          if (currentUrls.length > 0) return currentCard || baseCard;
          return {
            ...baseCard,
            photos: filteredUrls,
            __photosHydrated: true,
          };
        };

        if (typeof setState === 'function' && !isFromListOfUsers) {
          setState(prev => updatePhotos(prev), {
            source: 'userChange',
            caller: 'renderTopBlock.hydrateTopBlockPhotos',
            reason: 'photos-hydrated-on-open',
          });
        }

        if (typeof setUsers === 'function') {
          setUsers(prev => (
            stateContainsUser(prev, cardData.userId)
              ? updateUserInState(prev, cardData.userId, updatePhotos)
              : prev
          ));
        }
      } catch (error) {
        if (isMounted) {
          console.error('Error hydrating top block photos:', error);
        }
      }
    };

    hydrateTopBlockPhotos();
    return () => {
      isMounted = false;
    };
  }, [cardData, effectivePhotosCollection, isFromListOfUsers, setState, setUsers, userPhotoUrls.length]);

  if (!cardData) return null;

  const setCardPhotosState = updater => {
    const resolveNextCard = currentCard => {
      const baseCard = currentCard || cardData;
      return typeof updater === 'function' ? updater(baseCard) : updater;
    };

    if (typeof setUsers === 'function' && cardData.userId) {
      setUsers(prev => (
        stateContainsUser(prev, cardData.userId)
          ? updateUserInState(prev, cardData.userId, currentCard => resolveNextCard(currentCard))
          : prev
      ));
    }

    if (typeof setState === 'function' && !isFromListOfUsers) {
      setState(prev => resolveNextCard(prev), {
        source: 'userChange',
        caller: 'renderTopBlock.photosModal',
        reason: 'photos-updated',
      });
    }
  };

  const clearCardPhotosState = () => {
    setCardPhotosState(currentCard => {
      if (!currentCard || !Object.prototype.hasOwnProperty.call(currentCard, 'photos')) {
        return currentCard;
      }

      const { photos, ...cardWithoutPhotos } = currentCard;
      return cardWithoutPhotos;
    });
  };

  const handlePhotosCollectionSelect = collection => {
    if (!collection || collection === effectivePhotosCollection) return;
    setSelectedPhotosCollection(collection);
    clearCardPhotosState();
  };

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

  const avatarLabel = userPhotoUrl ? 'Відкрити фото користувача' : 'Додати фото користувача';
  const avatarContent = userPhotoUrl ? (
    <img
      src={userPhotoUrl}
      alt={buildName(cardData) || 'Фото користувача'}
      style={topBlockPhotoStyle}
      loading="lazy"
    />
  ) : (
    <span style={emptyAvatarStyle} aria-hidden="true">
      <svg width="23" height="23" viewBox="0 0 24 24" fill="none">
        <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
    </span>
  );

  return (
    <div style={topBlockContainerStyle}>
      <div style={topBlockHeaderLayoutStyle}>
        <button
          type="button"
          style={topBlockHeaderAvatarButtonStyle}
          onClick={event => {
            event.stopPropagation();
            setIsPhotosModalOpen(true);
          }}
          aria-label={avatarLabel}
          title={avatarLabel}
        >
          {avatarContent}
        </button>
        <div style={topBlockHeaderContentStyle}>
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
              {isSurrogateMotherRole(cardData) && (
                <ProfilePdfExportButton
                  cardData={cardData}
                  photoUrls={userPhotoUrls}
                  photosCollection={photosCollection}
                />
              )}
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
        </div>
      </div>
      <div style={statusRowStyle}>
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
      {isPhotosModalOpen && (() => {
        const collectionOptions = ['users', 'newUsers'];
        const photosModalContent = (
          <div
            style={inlineModalOverlayStyle}
            onClick={event => {
              event.stopPropagation();
              setIsPhotosModalOpen(false);
            }}
          >
            <div
              style={photosModalCardStyle}
              onClick={event => event.stopPropagation()}
            >
              <div style={photosModalHeaderStyle}>
                <div>
                  <h3 style={photosModalTitleStyle}>Фото профілю</h3>
                  <p style={photosModalSubtitleStyle}>
                    {buildName(cardData) || cardData.userId || 'Користувач'}
                    {effectivePhotosCollection ? ` · ${effectivePhotosCollection}` : ' · визначаємо джерело фото…'}
                  </p>
                  <div
                    style={photosCollectionToggleStyle}
                    role="group"
                    aria-label="Вибір колекції фото"
                  >
                    {collectionOptions.map(collection => (
                      <button
                        key={collection}
                        type="button"
                        style={getPhotosCollectionToggleButtonStyle(effectivePhotosCollection === collection)}
                        onClick={() => handlePhotosCollectionSelect(collection)}
                        aria-pressed={effectivePhotosCollection === collection}
                      >
                        {collection}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  style={photosModalCloseButtonStyle}
                  onClick={() => setIsPhotosModalOpen(false)}
                  aria-label="Закрити фото"
                  title="Закрити"
                >
                  ×
                </button>
              </div>
              {effectivePhotosCollection === 'users' || effectivePhotosCollection === 'newUsers' ? (
                <Photos
                  state={cardData}
                  setState={setCardPhotosState}
                  collection={effectivePhotosCollection}
                  uploadInputId={`file-upload-${cardData.userId || 'card'}`}
                  cropAspectRatio={2 / 3}
                />
              ) : (
                <p style={photosModalSubtitleStyle}>Визначаємо джерело фото перед збереженням…</p>
              )}
            </div>
          </div>
        );

        return typeof document !== 'undefined'
          ? createPortal(photosModalContent, document.body)
          : photosModalContent;
      })()}
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
