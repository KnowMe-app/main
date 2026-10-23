import React from 'react';
import toast from 'react-hot-toast';
import {
  auth,
  copyProfilePhotosBetweenCards,
  fetchPublicProfileComments,
  fetchPublicProfileCommentsStrict,
  fetchUserById,
  fetchUserComment,
  getAllUserPhotos,
  photoComparisonKey,
  saveMyCardComment,
  saveComparisonField,
} from '../config';
import { setLocalComment } from '../../utils/commentsStorage';
import { copyPublicCommentsBetweenCards } from '../../utils/legacyImportCommentMigration';
import { isAdminUid } from '../../utils/accessLevel';
import { OWNER_MULTI_DATA_STRING_FIELDS } from '../../utils/profileNodeSchema';
import { updateCachedUser } from '../../utils/cache';
import { isJsonStateCard } from '../../utils/jsonProfileImport';
import {
  appendComparisonText,
  appendComparisonValues,
  comparisonValuesForKey,
  currentPersonalComment,
  isFreeTextComparisonKey,
  mergeComparisonText,
  mergeComparisonValues,
} from '../../utils/comparisonValues';

let latestCompareRequest = 0;
const pendingCardSaves = new Map();

const queueCardSave = (userId, save) => {
  const previous = pendingCardSaves.get(userId) || Promise.resolve();
  const next = previous.catch(() => undefined).then(save).finally(() => {
    if (pendingCardSaves.get(userId) === next) pendingCardSaves.delete(userId);
  });
  pendingCardSaves.set(userId, next);
  return next;
};

const compareIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M7 7h11M7 7l3-3M7 7l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M17 17H6M17 17l-3-3M17 17l-3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// Публічні відгуки — не поле картки, а окреме дерево `comments/{profileId}`,
// тож у таблиці порівняння вони стоять під власним ключем. Раніше їх тут не
// було взагалі: злиття дублікатів переносило поля й особисту нотатку, а
// відгуки лишались на картці, яку закривають, — тобто зникали з очей разом з
// нею. Значення в рядку — самі тексти; переносить їх окремий шлях, який
// зберігає автора й дату (`copyPublicCommentsBetweenCards`).
const PUBLIC_COMMENTS_KEY = 'publicComments';

// Фото теж стоять у таблиці окремим рядком, а не сирим полем `photos`: поле
// тут було виключене (`delKeys`), бо адреси Storage в комірці нічого не кажуть,
// — і разом з ним зникла сама можливість перенести фото з дубліката. Частина
// фото лежить лише в Storage, повз поле, тож рядок бере повний перелік
// (`getAllUserPhotos`), показує мініатюри, а переносить файли
// `copyProfilePhotosBetweenCards`.
const PHOTOS_KEY = 'photos';

const normalizePhotoList = value => (Array.isArray(value) ? value : [value])
  .map(item => (typeof item === 'string' ? item.trim() : ''))
  .filter(Boolean);

/**
 * Позначки власника, які база тримає рядком.
 *
 * Перелік не здогад, а копія схеми: `OWNER_MULTI_DATA_STRING_FIELDS` у
 * `profileNodeSchema` перелічує ті самі поля, і саме на них у
 * `database.rules.json` стоїть `.validate: newData.isString()`.
 */
const OWNER_STRING_KEYS = new Set(OWNER_MULTI_DATA_STRING_FIELDS);

const formatValue = (key, value) => new Set(comparisonValuesForKey(key, value));

export const btnCompare = (
  index,
  users,
  setUsers,
  setShowInfoModal,
  setCompare,
  usersRef,
  style = {},
  content = compareIcon,
  onOpenCard,
) => {
  const delKeys = [
    'photos', 'areTermsConfirmed', 'attitude', 'breastSize', 'chin', 'bodyType',
    'lastAction', 'clothingSize', 'education', 'experience', 'eyeColor', 'faceShape',
    'glasses', 'hairColor', 'hairStructure', 'language', 'lastLogin', 'lipsShape',
    'noseShape', 'profession', 'publish', 'race', 'registrationDate', 'reward',
    'shoeSize', 'street', 'whiteList', 'blackList',
    'publicComment', 'accessLevel', 'canCreateProfiles', 'additionalAccessRules',
  ];

  let pairIds = [];
  let requestId;
  const copyValue = async (key, sourceValue, targetUserId, sourceUserId, targetValue) => {
    if (!targetUserId) return;
    const latestTarget = (usersRef?.current || users)[targetUserId];
    if (isJsonStateCard(latestTarget)) {
      // Анкета з файлу живе лише в стейті: значення з бази туди переносимо,
      // нічого не записуючи. У базу пише лише протилежний напрямок.
      const updateTarget = previous => ({
        ...previous,
        [targetUserId]: { ...previous[targetUserId], [key]: sourceValue },
      });
      if (usersRef) usersRef.current = updateTarget(usersRef.current);
      setUsers(updateTarget);
      await refreshComparison();
      return;
    }
    try {
      await queueCardSave(targetUserId, async () => {
        let savedValue;
        if (key === PHOTOS_KEY) {
          const targetPhotos = new Set((targetValue || []).map(url => photoComparisonKey(url, targetUserId)));
          const missing = (sourceValue || []).filter(url => !targetPhotos.has(photoComparisonKey(url, sourceUserId)));
          const copied = await copyProfilePhotosBetweenCards({ sourceUserId, targetUserId, photoUrls: missing });
          const target = (usersRef?.current || users)[targetUserId] || {};
          // Власні фото лишаються першими: перше — головне (`appendComparisonValues`).
          const merged = appendComparisonValues(copied, normalizePhotoList(target.photos));
          savedValue = await saveComparisonField(targetUserId, PHOTOS_KEY, merged);
          updateCachedUser({ userId: targetUserId, [PHOTOS_KEY]: savedValue });
        } else if (key === PUBLIC_COMMENTS_KEY) {
          await copyPublicCommentsBetweenCards({ sourceProfileId: sourceUserId, targetProfileId: targetUserId });
          const comments = await fetchPublicProfileCommentsStrict([targetUserId]);
          savedValue = (comments?.[targetUserId] || []).map(comment => comment.text);
        } else if (key === 'myComment') {
          const ownerId = auth.currentUser?.uid;
          if (!ownerId) throw new Error('Користувач не визначений');
          // Перенесення не має стирати те, що адмін уже написав на картці-
          // отримувачі: це особиста нотатка, іншого запису цього тексту
          // ніде немає.
          const merged = appendComparisonText(targetValue, sourceValue);
          const result = await saveMyCardComment(targetUserId, merged, ownerId);
          if (!result || typeof result.text !== 'string') throw new Error('Не підтверджено збереження коментаря');
          savedValue = result.text;
          setLocalComment(ownerId, targetUserId, savedValue, result.lastAction);
        } else {
          const target = (usersRef?.current || users)[targetUserId];
          if (!target) throw new Error('Картку не знайдено');
          const merged = isFreeTextComparisonKey(key)
            ? mergeComparisonText(sourceValue, target[key])
            : mergeComparisonValues(sourceValue, target[key]);
          const value = key === 'getInTouch' || key === 'lastCycle'
            ? sourceValue
            : OWNER_STRING_KEYS.has(key) ? merged.join(', ') : merged;
          savedValue = await saveComparisonField(targetUserId, key, value);
          updateCachedUser({ userId: targetUserId, [key]: savedValue });
        }
        const updateTarget = previous => ({
          ...previous,
          [targetUserId]: { ...previous[targetUserId], [key]: savedValue },
        });
        if (usersRef) usersRef.current = updateTarget(usersRef.current);
        setUsers(updateTarget);
        toast.success(`${key} → ${Array.isArray(savedValue) ? savedValue.join(', ') : savedValue}`, { duration: 2500 });
        await refreshComparison();
      });
    } catch (error) {
      toast.error(`Не вдалося зберегти ${key}: ${error?.message || error}`);
    }
  };

  const refreshComparison = async (reloadProfiles = false) => {
    if (reloadProfiles) {
      const latestBefore = usersRef?.current || users;
      const profiles = await Promise.all(pairIds
        .filter(id => !isJsonStateCard(latestBefore[id]))
        .map(fetchUserById));
      const loaded = Object.fromEntries(profiles.filter(Boolean).map(user => [user.userId, user]));
      if (usersRef) usersRef.current = { ...usersRef.current, ...loaded };
      setUsers(previous => ({ ...previous, ...loaded }));
    }
    const latest = usersRef?.current || users;
    const currentUserRaw = latest[pairIds[0]] || {};
    const nextUserRaw = latest[pairIds[1]] || {};
    const ownerId = auth.currentUser?.uid;
    // У анкети з файлу немає ні нотатки, ні відгуків, ні фото в Storage —
    // питати базу про її id нема сенсу.
    const remoteId = user => (isJsonStateCard(user) ? undefined : user.userId);
    const [currentCommentResult, nextCommentResult, publicByProfile, currentPhotos, nextPhotos] = await Promise.all([
      ownerId && remoteId(currentUserRaw) ? fetchUserComment(ownerId, currentUserRaw.userId) : null,
      ownerId && remoteId(nextUserRaw) ? fetchUserComment(ownerId, nextUserRaw.userId) : null,
      fetchPublicProfileComments([remoteId(currentUserRaw), remoteId(nextUserRaw)].filter(Boolean)),
      remoteId(currentUserRaw) ? getAllUserPhotos(currentUserRaw.userId) : [],
      remoteId(nextUserRaw) ? getAllUserPhotos(nextUserRaw.userId) : [],
    ]);
    if (requestId !== latestCompareRequest) return;

    // Тексти — лише для показу різниці; переносить відгуки не ця таблиця, а
    // `copyPublicCommentsBetweenCards`, яка читає їх наново разом з автором.
    const publicCommentTexts = profileId => (publicByProfile?.[profileId] || [])
      .map(comment => String(comment?.text || '').trim())
      .filter(Boolean);

    const currentUser = {
      ...currentUserRaw,
      myComment: currentPersonalComment(currentUserRaw.myComment, currentCommentResult),
      [PUBLIC_COMMENTS_KEY]: publicCommentTexts(currentUserRaw.userId),
    };
    const currentPhotoList = normalizePhotoList(currentPhotos);
    const nextPhotoList = normalizePhotoList(nextPhotos);
    const nextUser = {
      ...nextUserRaw,
      myComment: currentPersonalComment(nextUserRaw.myComment, nextCommentResult),
      [PUBLIC_COMMENTS_KEY]: publicCommentTexts(nextUserRaw.userId),
    };
    const filteredKeys = new Set([
      ...Object.keys(currentUser).filter(key => !delKeys.includes(key) && key !== 'duplicate' && !key.startsWith('_')),
      ...Object.keys(nextUser).filter(key => !delKeys.includes(key) && key !== 'duplicate' && !key.startsWith('_')),
    ]);

    const rows = [...filteredKeys].map(key => {
      const currentSet = formatValue(key, currentUser[key]);
      const nextSet = formatValue(key, nextUser[key]);
      if (!currentSet.size && !nextSet.size) return null;
      if ([...currentSet].every(value => nextSet.has(value)) && [...nextSet].every(value => currentSet.has(value))) return null;

      const uniqueCurrent = [...currentSet].filter(value => !nextSet.has(value));
      const uniqueNext = [...nextSet].filter(value => !currentSet.has(value));
      const isUserId = key === 'userId';
      const canCopyPublicComments = key !== PUBLIC_COMMENTS_KEY || isAdminUid(auth.currentUser?.uid);
      const canCopyCurrent = !isUserId && canCopyPublicComments && currentSet.size > 0;
      const canCopyNext = !isUserId && canCopyPublicComments && nextSet.size > 0;
      const cellStyle = { width: '40%', whiteSpace: 'normal', wordBreak: 'break-word' };
      return (
        <tr key={key}>
          <td style={{ width: '20%', whiteSpace: 'normal', wordBreak: 'break-word' }}>{key}</td>
          <td
            style={{ ...cellStyle, cursor: canCopyCurrent ? 'pointer' : 'default' }}
            onClick={canCopyCurrent
              ? () => copyValue(key, currentUser[key], nextUser.userId, currentUser.userId, nextUser[key])
              : undefined}
          >
            {uniqueCurrent.join(', ')}
          </td>
          <td
            style={{ ...cellStyle, cursor: canCopyNext ? 'pointer' : 'default' }}
            onClick={canCopyNext
              ? () => copyValue(key, nextUser[key], currentUser.userId, nextUser.userId, currentUser[key])
              : undefined}
          >
            {uniqueNext.join(', ')}
          </td>
        </tr>
      );
    }).filter(Boolean);

    const photosRow = (() => {
      const currentKeys = new Set(currentPhotoList.map(url => photoComparisonKey(url, currentUser.userId)));
      const nextKeys = new Set(nextPhotoList.map(url => photoComparisonKey(url, nextUser.userId)));
      const uniqueCurrent = currentPhotoList.filter(url => !nextKeys.has(photoComparisonKey(url, currentUser.userId)));
      const uniqueNext = nextPhotoList.filter(url => !currentKeys.has(photoComparisonKey(url, nextUser.userId)));
      if (!uniqueCurrent.length && !uniqueNext.length) return null;
      const photoCell = (unique, source, target, sourceList, targetList) => (
        <td
          style={{ width: '40%', whiteSpace: 'normal', cursor: unique.length ? 'pointer' : 'default' }}
          title={unique.length ? `Перенести ${unique.length} фото в ${target.userId}` : undefined}
          onClick={unique.length
            ? () => copyValue(PHOTOS_KEY, sourceList, target.userId, source.userId, targetList)
            : undefined}
        >
          {unique.map(url => (
            <img key={url} src={url} alt="" style={{ width: 40, height: 40, objectFit: 'cover', margin: 2, borderRadius: 4 }} />
          ))}
          {unique.length ? <div>→ перенести {unique.length}</div> : null}
        </td>
      );
      return (
        <tr key={PHOTOS_KEY}>
          <td style={{ width: '20%' }}>{PHOTOS_KEY}</td>
          {photoCell(uniqueCurrent, currentUser, nextUser, currentPhotoList, nextPhotoList)}
          {photoCell(uniqueNext, nextUser, currentUser, nextPhotoList, currentPhotoList)}
        </tr>
      );
    })();

    setCompare(
      <div style={{ fontSize: '10px', fontFamily: 'Arial, sans-serif' }}>
        <table border="1" cellSpacing="0" cellPadding="5" style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead><tr><th style={{ width: '20%' }}>Key</th>{[currentUser, nextUser].map(user => (
            <th key={user.userId} style={{ width: '40%' }}>
              {onOpenCard && !isJsonStateCard(user) ? <button type="button" onClick={() => onOpenCard(user.userId, () => refreshComparison(true))}>{user.userId}</button> : user.userId}
            </th>
          ))}</tr></thead>
          <tbody>{photosRow}{rows}</tbody>
        </table>
      </div>,
    );
  };

  const handleCompareClick = async e => {
    e.stopPropagation();
    pairIds = Object.keys(users).slice(index, index + 2);
    if (pairIds.length !== 2) return;
    requestId = ++latestCompareRequest;
    setCompare(null);
    setShowInfoModal('compareCards');
    try {
      await refreshComparison();
    } catch (error) {
      toast.error(`Не вдалося відкрити порівняння: ${error?.message || error}`);
    }
  };

  return (
    <button
      type="button"
      style={{ ...styles.removeButton, ...style }}
      aria-label="Порівняти"
      title="Порівняти"
      onClick={handleCompareClick}
    >
      {content}
    </button>
  );
};

const styles = {
  removeButton: {
    width: '30px', height: '30px', minHeight: '30px', padding: 0,
    backgroundColor: 'purple', color: 'white', border: 'none', borderRadius: '9px',
    cursor: 'pointer', position: 'static', display: 'inline-flex', alignItems: 'center',
    justifyContent: 'center', boxShadow: '0 3px 8px rgba(17, 24, 39, 0.25)',
  },
};
