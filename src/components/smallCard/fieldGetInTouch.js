import { handleChange, handleSubmit } from './actions';
import {
  formatDateToDisplay,
  formatDateAndFormula,
  formatDateToServer,
} from 'components/inputValidations';
import { OrangeBtn, UnderlinedInput, color } from 'components/styles';
import {
  addDislikeUser,
  removeDislikeUser,
  addFavoriteUser,
  removeFavoriteUser,
  auth,
} from '../config';

export const fieldGetInTouch = (
  userData,
  setUsers,
  setState,
  currentFilter,
  isDateInRange,
  favoriteUsers = {},
  setFavoriteUsers = () => {},
  dislikeUsers = {},
  setDislikeUsers = () => {},
) => {
  const handleSendToEnd = () => {
    handleChange(
      setUsers,
      setState,
      userData.userId,
      'getInTouch',
      '2099-99-99',
      true,
      { currentFilter, isDateInRange }
    );
  };

  const handleAddDays = days => {
    const currentDate = new Date();
    currentDate.setDate(currentDate.getDate() + days);

    // Форматуємо дату в локальному часі замість використання UTC
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0'); // Додаємо 1, оскільки місяці в Date починаються з 0
    const day = String(currentDate.getDate()).padStart(2, '0');
    const formattedDate = `${year}-${month}-${day}`; // Формат YYYY-MM-DD
    handleChange(
      setUsers,
      setState,
      userData.userId,
      'getInTouch',
      formattedDate,
      true,
      { currentFilter, isDateInRange }
    );
  };

  const isFavorite = !!favoriteUsers[userData.userId];
  const isDisliked = !!dislikeUsers[userData.userId];

  const handleDislike = async e => {
    e.stopPropagation();
    if (!auth.currentUser) {
      alert('Please sign in to manage dislikes');
      return;
    }
    if (isDisliked) {
      try {
        await removeDislikeUser(userData.userId);
        const updated = { ...dislikeUsers };
        delete updated[userData.userId];
        setDislikeUsers(updated);
        handleChange(
          setUsers,
          setState,
          userData.userId,
          'getInTouch',
          '',
          true,
          { currentFilter, isDateInRange }
        );
      } catch (error) {
        console.error('Failed to remove dislike:', error);
      }
    } else {
      handleSendToEnd();
      try {
        await addDislikeUser(userData.userId);
        const updated = { ...dislikeUsers, [userData.userId]: true };
        setDislikeUsers(updated);
        if (favoriteUsers[userData.userId]) {
          try {
            await removeFavoriteUser(userData.userId);
          } catch (err) {
            console.error('Failed to remove favorite when adding dislike:', err);
          }
          const upd = { ...favoriteUsers };
          delete upd[userData.userId];
          setFavoriteUsers(upd);
        }
      } catch (error) {
        console.error('Failed to add dislike:', error);
      }
    }
  };

  const handleLike = async e => {
    e.stopPropagation();
    if (!auth.currentUser) {
      alert('Please sign in to manage favorites');
      return;
    }
    if (isFavorite) {
      try {
        await removeFavoriteUser(userData.userId);
        const updated = { ...favoriteUsers };
        delete updated[userData.userId];
        setFavoriteUsers(updated);
      } catch (error) {
        console.error('Failed to remove favorite:', error);
      }
    } else {
      try {
        await addFavoriteUser(userData.userId);
        const updated = { ...favoriteUsers, [userData.userId]: true };
        setFavoriteUsers(updated);
        if (dislikeUsers[userData.userId]) {
          try {
            await removeDislikeUser(userData.userId);
          } catch (err) {
            console.error('Failed to remove dislike when adding favorite:', err);
          }
          const upd = { ...dislikeUsers };
          delete upd[userData.userId];
          setDislikeUsers(upd);
          handleChange(
            setUsers,
            setState,
            userData.userId,
            'getInTouch',
            '',
            true,
            { currentFilter, isDateInRange }
          );
        }
      } catch (error) {
        console.error('Failed to add favorite:', error);
      }
    }
  };

  const ActionButton = ({ label, days, onClick }) => (
    <OrangeBtn
      onClick={() => (onClick ? onClick(days) : null)}
      style={{
        width: '25px' /* Встановіть ширину, яка визначатиме розмір кнопки */,
        height: '25px' /* Встановіть висоту, яка повинна дорівнювати ширині */,
        marginLeft: '5px',
        marginRight: 0,
      }}
    >
      {label}
    </OrangeBtn>
  );

  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <UnderlinedInput
        type="text"
        value={formatDateToDisplay(formatDateAndFormula(userData.getInTouch)) || ''}
        onChange={e => {
          // Повертаємо формат YYYY-MM-DD для збереження
          const serverFormattedDate = formatDateToServer(
            formatDateAndFormula(e.target.value)
          );
          handleChange(
            setUsers,
            setState,
            userData.userId,
            'getInTouch',
            serverFormattedDate,
            false
          );
        }}
        onBlur={() => {
          handleChange(
            setUsers,
            setState,
            userData.userId,
            'getInTouch',
            userData.getInTouch,
            false,
            { currentFilter, isDateInRange }
          );
          handleSubmit(userData, 'overwrite');
        }}
        style={{
          marginLeft: 0,
          textAlign: 'left',
        }}
      />
      <ActionButton label="3д" days={3} onClick={handleAddDays} />
      {/* <ActionButton label="7д" days={7} onClick={handleAddDays} /> */}
      <ActionButton label="1м" days={30} onClick={handleAddDays} />
      <ActionButton label="3м" days={90} onClick={handleAddDays} />
      <ActionButton label="6м" days={180} onClick={handleAddDays} />
      <ActionButton label="1р" days={365} onClick={handleAddDays} />
      <OrangeBtn
        onClick={handleDislike}
        style={{
          width: '25px',
          height: '25px',
          marginLeft: '5px',
          marginRight: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: isDisliked ? '2px solid black' : 'none',
        }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill={isDisliked ? color.iconActive : 'none'}
          stroke={isDisliked ? color.iconActive : color.iconInactive}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </OrangeBtn>
      <OrangeBtn
        onClick={handleLike}
        style={{
          width: '25px',
          height: '25px',
          marginLeft: '5px',
          marginRight: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: isFavorite ? '2px solid black' : 'none',
        }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill={isFavorite ? color.iconActive : 'none'}
          stroke={isFavorite ? color.iconActive : color.iconInactive}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 6.5 3.5 5 5.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5 18.5 5 20 6.5 20 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
        </svg>
      </OrangeBtn>
    </div>
  );
};
