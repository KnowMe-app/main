import React from 'react';
import toast from 'react-hot-toast';
import { auth, fetchUserComment, saveMyCardComment } from '../config';
import { setLocalComment } from '../../utils/commentsStorage';
import { handleSubmitAll } from './actions';

let latestCompareRequest = 0;

const compareIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M7 7h11M7 7l3-3M7 7l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M17 17H6M17 17l-3-3M17 17l-3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const combineComments = (legacyValue, storedValue) => [legacyValue, storedValue]
  .map(value => String(value || '').trim())
  .filter(Boolean)
  .join('\n\n');

const formatValue = val => {
  if (Array.isArray(val)) return new Set(val.map(String));
  if (val !== undefined && val !== null && val !== '') return new Set([String(val)]);
  return new Set();
};

const mergeValues = (currentVal, nextVal) => {
  const toArray = value => {
    if (typeof value === 'string' && value.includes(',')) {
      return value.split(',').map(item => item.trim());
    }
    return value !== undefined && value !== null && value !== '' ? [String(value).trim()] : [];
  };

  if (!currentVal) return '';
  if (!nextVal) return currentVal;
  return [...new Set([...toArray(currentVal), ...toArray(nextVal)])].join(', ');
};

export const btnCompare = (
  index,
  users,
  setUsers,
  setShowInfoModal,
  setCompare,
  style = {},
  content = compareIcon,
) => {
  const delKeys = [
    'photos', 'areTermsConfirmed', 'attitude', 'breastSize', 'chin', 'bodyType',
    'lastAction', 'clothingSize', 'education', 'experience', 'eyeColor', 'faceShape',
    'glasses', 'hairColor', 'hairStructure', 'language', 'lastLogin', 'lipsShape',
    'noseShape', 'profession', 'publish', 'race', 'registrationDate', 'reward',
    'shoeSize', 'street', 'whiteList', 'blackList',
  ];

  const copyValue = async (key, sourceValue, targetUserId) => {
    if (!targetUserId) return;

    if (key === 'myComment') {
      const commentOwnerId = auth.currentUser?.uid;
      if (!commentOwnerId) return;
      try {
        const result = await saveMyCardComment(targetUserId, sourceValue, commentOwnerId);
        setLocalComment(commentOwnerId, targetUserId, sourceValue, result?.lastAction);
        toast.success('Коментар скопійовано в іншу картку');
      } catch (error) {
        const details = error?.message || String(error);
        toast.error(`Не вдалося скопіювати коментар: ${details}`);
      }
      return;
    }

    if (!users[targetUserId]) {
      console.error(`User with ID ${targetUserId} not found`);
      return;
    }

    const updatedUsers = { ...users };
    const updatedTargetUser = { ...updatedUsers[targetUserId] };
    if (key === 'getInTouch' || key === 'lastCycle') {
      updatedTargetUser[key] = sourceValue;
    } else {
      const mergedValue = mergeValues(sourceValue, updatedTargetUser[key]);
      updatedTargetUser[key] = mergedValue.includes(',')
        ? mergedValue.split(',').map(item => item.trim())
        : mergedValue;
    }
    delete updatedTargetUser.duplicate;
    updatedUsers[targetUserId] = updatedTargetUser;
    setUsers(updatedUsers);
    handleSubmitAll(updatedTargetUser, 'overwrite');
  };

  const handleCompareClick = async e => {
    e.stopPropagation();
    const requestId = ++latestCompareRequest;
    const entries = Object.entries(users);
    const currentUserRaw = entries[index]?.[1] || {};
    const nextUserRaw = entries[index + 1]?.[1] || {};
    const ownerId = auth.currentUser?.uid;
    const [currentCommentResult, nextCommentResult] = await Promise.all([
      ownerId && currentUserRaw.userId ? fetchUserComment(ownerId, currentUserRaw.userId) : null,
      ownerId && nextUserRaw.userId ? fetchUserComment(ownerId, nextUserRaw.userId) : null,
    ]);
    if (requestId !== latestCompareRequest) return;

    const currentUser = {
      ...currentUserRaw,
      myComment: combineComments(currentUserRaw.myComment, currentCommentResult?.text),
    };
    const nextUser = {
      ...nextUserRaw,
      myComment: combineComments(nextUserRaw.myComment, nextCommentResult?.text),
    };
    const filteredKeys = new Set([
      ...Object.keys(currentUser).filter(key => !delKeys.includes(key) && key !== 'duplicate'),
      ...Object.keys(nextUser).filter(key => !delKeys.includes(key) && key !== 'duplicate'),
    ]);

    const rows = [...filteredKeys].map(key => {
      const currentSet = formatValue(currentUser[key]);
      const nextSet = formatValue(nextUser[key]);
      if (!currentSet.size && !nextSet.size) return null;
      if ([...currentSet].every(value => nextSet.has(value)) && [...nextSet].every(value => currentSet.has(value))) return null;

      const uniqueCurrent = [...currentSet].filter(value => !nextSet.has(value));
      const uniqueNext = [...nextSet].filter(value => !currentSet.has(value));
      const isUserId = key === 'userId';
      const cellStyle = { width: '40%', whiteSpace: 'normal', wordBreak: 'break-word' };
      return (
        <tr key={key}>
          <td style={{ width: '20%', whiteSpace: 'normal', wordBreak: 'break-word' }}>{key}</td>
          <td
            style={{ ...cellStyle, cursor: isUserId ? 'default' : 'pointer' }}
            onClick={isUserId ? undefined : () => copyValue(key, currentUser[key], nextUser.userId)}
          >
            {uniqueCurrent.join(', ')}
          </td>
          <td
            style={{ ...cellStyle, cursor: isUserId ? 'default' : 'pointer' }}
            onClick={isUserId ? undefined : () => copyValue(key, nextUser[key], currentUser.userId)}
          >
            {uniqueNext.join(', ')}
          </td>
        </tr>
      );
    }).filter(Boolean);

    setShowInfoModal('compareCards');
    setCompare(
      <div style={{ fontSize: '10px', fontFamily: 'Arial, sans-serif' }}>
        <table border="1" cellSpacing="0" cellPadding="5" style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead><tr><th style={{ width: '20%' }}>Key</th><th style={{ width: '40%' }}>Current User</th><th style={{ width: '40%' }}>Next User</th></tr></thead>
          <tbody>{rows}</tbody>
        </table>
      </div>,
    );
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
