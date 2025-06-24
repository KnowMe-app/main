import { handleChange, handleSubmit } from './actions';
import { useEffect, useRef } from "react";

export const FieldComment = ({ userData, setUsers, setState }) => {
  // console.log('userData in RenderCommentInput :>> ', userData);
  const textareaRef = useRef(null);

  const handleInputChange = e => {
    handleChange(setUsers, setState, userData.userId, 'myComment', e.target.value);
  };

  const autoResize = textarea => {
    textarea.style.height = 'auto'; // Скидаємо висоту
    textarea.style.height = `${textarea.scrollHeight}px`; // Встановлюємо нову висоту
  };

  useEffect(() => {
    if (textareaRef.current) {
      autoResize(textareaRef.current); // Встановлюємо висоту після завантаження
    }
  }, [userData.myComment]); // Виконується при завантаженні та зміні коментаря

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
        onBlur={() => handleSubmit(userData, 'overwrite')}
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
