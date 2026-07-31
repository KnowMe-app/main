import { useEffect, useRef, useState } from 'react';
import { FaArrowRight } from 'react-icons/fa';
import { useAutoResize } from '../../hooks/useAutoResize';
import { COMMENTS_ROOT_PATH, auth, fetchUserComment, saveMyCardComment } from '../config';
import toast from 'react-hot-toast';

const FALLBACK_FIREBASE_PROJECT_ID = 'webringitapp';
const getFirebaseConsoleProjectId = () => process.env.REACT_APP_PROJECT_ID || FALLBACK_FIREBASE_PROJECT_ID;
const getFirebaseRealtimeDatabaseName = () => {
  const fallbackProjectId = getFirebaseConsoleProjectId();
  const databaseUrl = process.env.REACT_APP_DATABASE_URL || '';
  try {
    const { hostname } = new URL(databaseUrl);
    return hostname.split('.')[0] || `${fallbackProjectId}-default-rtdb`;
  } catch (error) {
    return `${fallbackProjectId}-default-rtdb`;
  }
};

// Same backend-navigation shortcut ProfileForm's other fields already have (batch 26 §8) - jumps
// straight to this comment's own multiData/comments/{ownerId}/{cardId} record in Firebase.
const buildCommentBackendUrl = (ownerId, cardId) => {
  if (!ownerId || !cardId) return '';
  const projectId = getFirebaseConsoleProjectId();
  const databaseName = getFirebaseRealtimeDatabaseName();
  const encodedPath = [...COMMENTS_ROOT_PATH.split('/'), ownerId, cardId]
    .map(segment => `~2F${encodeURIComponent(segment)}`)
    .join('');
  return `https://console.firebase.google.com/u/0/project/${projectId}/database/${databaseName}/data/${encodedPath}`;
};

// Персональний коментар поточного адміна до картки — зберігається в
// multiData/comments/{ownerId}/{cardId}, а не прямо в самій картці (users/newUsers).
export const FieldComment = ({ userData, extendedMode = false }) => {
  const textareaRef = useRef(null);
  const [text, setText] = useState('');
  const autoResize = useAutoResize(textareaRef, text);
  const ownerId = auth.currentUser?.uid;
  const cardId = userData.userId;

  useEffect(() => {
    let cancelled = false;
    setText('');
    if (!ownerId || !cardId) return undefined;

    fetchUserComment(ownerId, cardId).then(existing => {
      if (cancelled) return;
      setText(existing?.text || '');
    });

    return () => {
      cancelled = true;
    };
  }, [ownerId, cardId]);

  const persist = async value => {
    if (!ownerId || !cardId) {
      toast.error('Не вдалося зберегти коментар: користувач або картка не визначені');
      return false;
    }

    try {
      await saveMyCardComment(cardId, value, ownerId);
      return true;
    } catch (error) {
      const details = error?.message || String(error);
      toast.error(`Не вдалося зберегти коментар: ${details}`);
      return false;
    }
  };

  const showBackendShortcut = extendedMode && Boolean(ownerId && cardId);

  return (
    <div
      style={{
        display: 'flex', // Використовуємо flexbox
        justifyContent: 'center', // Центрування по горизонталі
        alignItems: 'center', // Центрування по вертикалі
        height: '100%', // Висота контейнера
        width: '100%',
        position: 'relative',
      }}
    >
      <textarea
        ref={textareaRef}
        placeholder="Додайте свій коментар"
        value={text}
        onChange={e => {
          setText(e.target.value);
          autoResize(e.target);
        }}
        onBlur={() => {
          void persist(textareaRef.current?.value ?? '');
        }}
        style={{
          // marginLeft: '10px',
          width: '100%',
          minHeight: '30px',
          resize: 'none',
          overflowY: 'hidden',
          padding: '5px',
          paddingRight: showBackendShortcut ? '58px' : text ? '32px' : '5px',
          boxSizing: 'border-box',
        }}
      />
      {showBackendShortcut && (
        <button
          type="button"
          aria-label="Відкрити запис коментаря у Firebase"
          title="Відкрити запис коментаря у Firebase"
          onMouseDown={event => event.preventDefault()}
          onClick={async event => {
            event.stopPropagation();
            const saved = await persist(textareaRef.current?.value ?? '');
            if (!saved) return;
            window.open(buildCommentBackendUrl(ownerId, cardId), '_blank', 'noopener,noreferrer');
          }}
          style={{
            position: 'absolute',
            top: '50%',
            right: text ? '30px' : '6px',
            transform: 'translateY(-50%)',
            cursor: 'pointer',
            border: 'none',
            background: 'transparent',
            color: '#ebe0c2',
            padding: 0,
            display: 'inline-flex',
          }}
        >
          <FaArrowRight size={14} />
        </button>
      )}
      {text && (
        <button
          type="button"
          aria-label="Очистити коментар"
          onClick={async event => {
            event.stopPropagation();
            setText('');
            await persist('');
          }}
          style={{
            position: 'absolute',
            top: '50%',
            right: '6px',
            transform: 'translateY(-50%)',
            cursor: 'pointer',
            border: 'none',
            background: 'transparent',
            color: '#ebe0c2',
            fontSize: '18px',
            lineHeight: 1,
            padding: 0,
          }}
        >
          &times;
        </button>
      )}
    </div>
  );
};
