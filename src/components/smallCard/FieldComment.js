import { handleChange, removeField } from './actions';
import { useRef } from 'react';
import { useAutoResize } from '../../hooks/useAutoResize';

const buildRtdbLink = userId =>
  `https://console.firebase.google.com/u/0/project/webringitapp/database/webringitapp-default-rtdb/data/~2FnewUsers~2F${encodeURIComponent(userId || '')}`;

export const FieldComment = ({ userData, setUsers, setState, submitOptions = {} }) => {
  // console.log('userData in RenderCommentInput :>> ', userData);
  const textareaRef = useRef(null);
  const autoResize = useAutoResize(textareaRef, userData.myComment);

  const handleInputChange = e => {
    handleChange(setUsers, setState, userData.userId, 'myComment', e.target.value);
  };

  // autoResize will adjust height on mount and when value changes

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
        placeholder="Додайте коментар"
        value={userData.myComment || ''}
        onChange={e => {
          handleInputChange(e);
          autoResize(e.target);
        }}
        onBlur={() => {
          const currentComment = textareaRef.current?.value ?? '';
          handleChange(
            setUsers,
            setState,
            userData.userId,
            'myComment',
            currentComment,
            true,
            submitOptions,
          );
        }}
        style={{
          // marginLeft: '10px',
          width: '100%',
          // height: 25,
          // minHeight: '40px',
          resize: 'none',
          overflow: 'hidden',
          padding: '5px',
          paddingRight: userData.myComment ? '44px' : '26px',
        }}
      />
      {userData.userId && (
        <a
          href={buildRtdbLink(userData.userId)}
          target="_blank"
          rel="noreferrer"
          title="Відкрити профіль в Firebase RTDB"
          onClick={event => event.stopPropagation()}
          style={{
            position: 'absolute',
            top: '4px',
            right: userData.myComment ? '24px' : '6px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'inherit',
            opacity: 0.75,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3" y="3" width="18" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.7" />
            <rect x="3" y="10" width="18" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.7" />
            <rect x="3" y="17" width="18" height="4" rx="1.5" stroke="currentColor" strokeWidth="1.7" />
            <circle cx="7" cy="5.5" r="0.9" fill="currentColor" />
            <circle cx="7" cy="12.5" r="0.9" fill="currentColor" />
            <circle cx="7" cy="19" r="0.9" fill="currentColor" />
          </svg>
        </a>
      )}
      {userData.myComment && (
        <button
          type="button"
          aria-label="Очистити коментар"
          onClick={event => {
            event.stopPropagation();
            removeField(userData.userId, 'myComment', setUsers, setState);
          }}
          style={{
            position: 'absolute',
            top: '50%',
            right: '6px',
            transform: 'translateY(-50%)',
            cursor: 'pointer',
            border: 'none',
            background: 'transparent',
            color: 'inherit',
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
