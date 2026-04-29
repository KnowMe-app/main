import { handleChange, removeField } from './actions';
import { useRef } from 'react';
import { useAutoResize } from '../../hooks/useAutoResize';

export const FieldComment = ({ userData, setUsers, setState, submitOptions = {} }) => {
  // console.log('userData in RenderCommentInput :>> ', userData);
  const textareaRef = useRef(null);
  const autoResize = useAutoResize(textareaRef, userData.myComment);

  const handleInputChange = e => {
    handleChange(setUsers, setState, userData.userId, 'myComment', e.target.value);
  };

  // autoResize will adjust height on mount and when value changes

  return (
    <div>
      <style>{`
        .field-comment-textarea::placeholder {
          color: rgba(255,255,255,0.3);
          font-style: italic;
        }
        .field-comment-textarea:focus {
          border-color: rgba(255,255,255,0.2);
          background: rgba(255,255,255,0.07);
        }
      `}</style>
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
        className="field-comment-textarea"
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
          padding: '7px 10px',
          paddingRight: userData.myComment ? '42px' : '26px',
          borderRadius: '8px',
          border: '1px solid rgba(255,255,255,0.1)',
          background: 'rgba(255,255,255,0.04)',
          color: 'inherit',
          fontSize: '12px',
          lineHeight: 1.45,
          fontFamily: 'inherit',
          outline: 'none',
          boxSizing: 'border-box',
        }}
      />
      {userData.myComment && (
        <button
          type="button"
          aria-label="Очистити коментар"
          onClick={event => {
            event.stopPropagation();
            removeField(userData.userId, 'myComment', setUsers, setState, 'myComment', submitOptions);
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
    </div>
  );
};
