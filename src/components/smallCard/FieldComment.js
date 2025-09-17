import { handleChange } from './actions';
import { useRef } from 'react';
import { useAutoResize } from '../../hooks/useAutoResize';

export const FieldComment = ({ userData, setUsers, setState, isToastOn }) => {
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
            {},
            isToastOn,
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
        }}
      />
    </div>
  );
};
