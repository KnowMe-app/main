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
          paddingRight: userData.myComment ? '42px' : '26px',
        }}
      />
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
