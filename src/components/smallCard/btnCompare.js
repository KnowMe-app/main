import React from 'react';
import toast from 'react-hot-toast';
import { auth, fetchPublicProfileComments, fetchPublicProfileCommentsStrict, fetchUserById, fetchUserComment, saveMyCardComment, saveComparisonField } from '../config';
import { setLocalComment } from '../../utils/commentsStorage';
import { copyPublicCommentsBetweenCards } from '../../utils/legacyImportCommentMigration';
import { isAdminUid } from '../../utils/accessLevel';
import { OWNER_MULTI_DATA_STRING_FIELDS } from '../../utils/profileNodeSchema';
import { updateCachedUser } from '../../utils/cache';
import { comparisonValues, mergeComparisonValues, currentPersonalComment } from '../../utils/comparisonValues';

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

/**
 * Позначки власника, які база тримає рядком.
 *
 * Перелік не здогад, а копія схеми: `OWNER_MULTI_DATA_STRING_FIELDS` у
 * `profileNodeSchema` перелічує ті самі поля, і саме на них у
 * `database.rules.json` стоїть `.validate: newData.isString()`.
 */
const OWNER_STRING_KEYS = new Set(OWNER_MULTI_DATA_STRING_FIELDS);

const formatValue = value => new Set(comparisonValues(value));

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
    try {
      await queueCardSave(targetUserId, async () => {
        let savedValue;
        if (key === PUBLIC_COMMENTS_KEY) {
          await copyPublicCommentsBetweenCards({ sourceProfileId: sourceUserId, targetProfileId: targetUserId });
          const comments = await fetchPublicProfileCommentsStrict([targetUserId]);
          savedValue = (comments?.[targetUserId] || []).map(comment => comment.text);
        } else if (key === 'myComment') {
          const ownerId = auth.currentUser?.uid;
          if (!ownerId) throw new Error('Користувач не визначений');
          const incoming = String(sourceValue || '').trim();
          const existing = String(targetValue || '').trim();
          // Перенесення не має стирати те, що адмін уже написав на картці-
          // отримувачі: це особиста нотатка, іншого запису цього тексту
          // ніде немає. Порожній рядок між ними — не той самий текст двічі,
          // якщо джерело там уже є.
          const merged = !existing || existing === incoming
            ? incoming
            : !incoming
              ? existing
              : `${existing}\n\n${incoming}`;
          const result = await saveMyCardComment(targetUserId, merged, ownerId);
          if (!result || typeof result.text !== 'string') throw new Error('Не підтверджено збереження коментаря');
          savedValue = result.text;
          setLocalComment(ownerId, targetUserId, savedValue, result.lastAction);
        } else {
          const target = (usersRef?.current || users)[targetUserId];
          if (!target) throw new Error('Картку не знайдено');
          const merged = mergeComparisonValues(sourceValue, target[key]);
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
      const profiles = await Promise.all(pairIds.map(fetchUserById));
      const loaded = Object.fromEntries(profiles.filter(Boolean).map(user => [user.userId, user]));
      if (usersRef) usersRef.current = { ...usersRef.current, ...loaded };
      setUsers(previous => ({ ...previous, ...loaded }));
    }
    const latest = usersRef?.current || users;
    const currentUserRaw = latest[pairIds[0]] || {};
    const nextUserRaw = latest[pairIds[1]] || {};
    const ownerId = auth.currentUser?.uid;
    const [currentCommentResult, nextCommentResult, publicByProfile] = await Promise.all([
      ownerId && currentUserRaw.userId ? fetchUserComment(ownerId, currentUserRaw.userId) : null,
      ownerId && nextUserRaw.userId ? fetchUserComment(ownerId, nextUserRaw.userId) : null,
      fetchPublicProfileComments([currentUserRaw.userId, nextUserRaw.userId].filter(Boolean)),
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
      const currentSet = formatValue(currentUser[key]);
      const nextSet = formatValue(nextUser[key]);
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

    setCompare(
      <div style={{ fontSize: '10px', fontFamily: 'Arial, sans-serif' }}>
        <table border="1" cellSpacing="0" cellPadding="5" style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead><tr><th style={{ width: '20%' }}>Key</th>{[currentUser, nextUser].map(user => (
            <th key={user.userId} style={{ width: '40%' }}>
              {onOpenCard ? <button type="button" onClick={() => onOpenCard(user.userId, () => refreshComparison(true))}>{user.userId}</button> : user.userId}
            </th>
          ))}</tr></thead>
          <tbody>{rows}</tbody>
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
