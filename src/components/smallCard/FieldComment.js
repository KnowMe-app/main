import { useEffect, useRef, useState } from 'react';
import { FaArrowRight } from 'react-icons/fa';
import { useAutoResize } from '../../hooks/useAutoResize';
import {
  COMMENTS_ROOT_PATH,
  auth,
  fetchUserComment,
  migrateMyCardComment,
  saveMyCardComment,
} from '../config';
import toast from 'react-hot-toast';
import { COMMENTS_UPDATED_EVENT } from '../../utils/commentsStorage';

const FALLBACK_FIREBASE_PROJECT_ID = 'webringitapp';
const combineComments = (legacyValue, storedValue) => [legacyValue, storedValue]
  .map(value => String(value || '').trim())
  .filter(Boolean)
  .join('\n\n');
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
export const FieldComment = ({ userData, extendedMode = false, onLegacyCommentMigrated }) => {
  const textareaRef = useRef(null);
  const [text, setText] = useState('');
  const autoResize = useAutoResize(textareaRef, text);
  const ownerId = auth.currentUser?.uid;
  const cardId = userData.userId;
  const legacyComment = String(userData.myComment || '').trim();
  const initialTextRef = useRef('');
  const hasLegacyCommentRef = useRef(Boolean(legacyComment));
  const dirtyRef = useRef(false);
  const fetchedWhileEditingRef = useRef('');
  const initialCommentReadRef = useRef(Promise.resolve(''));

  useEffect(() => {
    let cancelled = false;
    setText(legacyComment);
    initialTextRef.current = legacyComment;
    hasLegacyCommentRef.current = Boolean(legacyComment);
    dirtyRef.current = false;
    fetchedWhileEditingRef.current = '';
    initialCommentReadRef.current = Promise.resolve('');
    if (!ownerId || !cardId) return undefined;

    initialCommentReadRef.current = fetchUserComment(ownerId, cardId).then(existing => {
      const storedText = String(existing?.text || '').trim();
      if (!cancelled) {
        const combined = combineComments(legacyComment, storedText);
        if (!dirtyRef.current) {
          setText(combined);
          initialTextRef.current = combined;
        } else {
          fetchedWhileEditingRef.current = storedText;
        }
      }
      return dirtyRef.current ? storedText : '';
    });

    return () => {
      cancelled = true;
    };
  }, [ownerId, cardId, legacyComment]);

  useEffect(() => {
    const syncCopiedComment = event => {
      if (event.detail?.ownerId !== ownerId || event.detail?.cardId !== cardId) return;
      const combined = combineComments(legacyComment, event.detail.text);
      setText(combined);
      initialTextRef.current = combined;
    };
    window.addEventListener(COMMENTS_UPDATED_EVENT, syncCopiedComment);
    return () => window.removeEventListener(COMMENTS_UPDATED_EVENT, syncCopiedComment);
  }, [ownerId, cardId, legacyComment]);

  const persist = async (value, force = false) => {
    if (!ownerId || !cardId) {
      toast.error('Не вдалося зберегти коментар: користувач або картка не визначені');
      return false;
    }

    try {
      const initiallyStoredTextToMerge = await initialCommentReadRef.current;
      const valueToPersist = combineComments(
        value,
        fetchedWhileEditingRef.current || initiallyStoredTextToMerge,
      );
      if (!force && valueToPersist === initialTextRef.current) return true;

      if (hasLegacyCommentRef.current) {
        await migrateMyCardComment(cardId, valueToPersist, ownerId);
        hasLegacyCommentRef.current = false;
        onLegacyCommentMigrated?.();
      } else {
        await saveMyCardComment(cardId, valueToPersist, ownerId);
      }
      initialTextRef.current = valueToPersist;
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
          dirtyRef.current = true;
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
            // Reserve the tab while this trusted click still has transient
            // user activation; Firebase writes may outlive the popup window.
            const backendWindow = window.open('about:blank', '_blank');
            if (backendWindow) backendWindow.opener = null;
            const saved = await persist(textareaRef.current?.value ?? '', true);
            if (!saved) {
              backendWindow?.close();
              return;
            }
            if (backendWindow) backendWindow.location.href = buildCommentBackendUrl(ownerId, cardId);
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
            dirtyRef.current = true;
            fetchedWhileEditingRef.current = '';
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
