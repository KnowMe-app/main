import { useEffect, useRef, useState } from 'react';
import { useAutoResize } from '../../hooks/useAutoResize';
import { auth, fetchUserComment, saveMyCardComment } from '../config';

// Персональний коментар поточного адміна до картки — зберігається в
// comments/{ownerId}/{cardId}, а не прямо в самій картці (users/newUsers).
export const FieldComment = ({ userData }) => {
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

  const persist = value => {
    if (!ownerId || !cardId) return;
    saveMyCardComment(cardId, value, ownerId);
  };

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
          persist(textareaRef.current?.value ?? '');
        }}
        style={{
          // marginLeft: '10px',
          width: '100%',
          minHeight: '30px',
          resize: 'none',
          overflowY: 'hidden',
          padding: '5px',
          paddingRight: text ? '32px' : '5px',
          boxSizing: 'border-box',
        }}
      />
      {text && (
        <button
          type="button"
          aria-label="Очистити коментар"
          onClick={event => {
            event.stopPropagation();
            setText('');
            persist('');
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
