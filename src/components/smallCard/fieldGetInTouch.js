import { handleChange } from './actions';
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
import { updateCachedUser, setFavoriteIds } from 'utils/cache';
import { setFavorite } from 'utils/favoritesStorage';
import { setDislike } from 'utils/dislikesStorage';
import { FaTimes, FaHeart, FaRegHeart } from 'react-icons/fa';

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
  isToastOn = false,
) => {
  const handleSendToEnd = () => {
    handleChange(
      setUsers,
      setState,
      userData.userId,
      'getInTouch',
      '2099-99-99',
      true,
      { currentFilter, isDateInRange },
      isToastOn,
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
      { currentFilter, isDateInRange },
      isToastOn,
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
        setDislike(userData.userId, false);
        handleChange(
          setUsers,
          setState,
          userData.userId,
          'getInTouch',
          '',
          true,
          { currentFilter, isDateInRange },
          isToastOn,
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
        setDislike(userData.userId, true);
        if (favoriteUsers[userData.userId]) {
          try {
            await removeFavoriteUser(userData.userId);
          } catch (err) {
            console.error('Failed to remove favorite when adding dislike:', err);
          }
          const upd = { ...favoriteUsers };
          delete upd[userData.userId];
          setFavoriteUsers(upd);
          setFavoriteIds(upd);
          setFavorite(userData.userId, false);
          updateCachedUser(userData, { removeFavorite: true });
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
        setFavoriteIds(updated);
        setFavorite(userData.userId, false);
        updateCachedUser(userData, { removeFavorite: true });
      } catch (error) {
        console.error('Failed to remove favorite:', error);
      }
    } else {
      try {
        await addFavoriteUser(userData.userId);
        const updated = { ...favoriteUsers, [userData.userId]: true };
        setFavoriteUsers(updated);
        setFavoriteIds(updated);
        setFavorite(userData.userId, true);
        updateCachedUser(userData);
        if (dislikeUsers[userData.userId]) {
          try {
            await removeDislikeUser(userData.userId);
          } catch (err) {
            console.error('Failed to remove dislike when adding favorite:', err);
          }
          const upd = { ...dislikeUsers };
          delete upd[userData.userId];
          setDislikeUsers(upd);
          setDislike(userData.userId, false);
          handleChange(
            setUsers,
            setState,
            userData.userId,
            'getInTouch',
            '',
            true,
            { currentFilter, isDateInRange },
            isToastOn,
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
        onBlur={e => {
          const rawValue = e?.target?.value ?? '';
          const serverFormattedDate = formatDateToServer(
            formatDateAndFormula(rawValue)
          );

          handleChange(
            setUsers,
            setState,
            userData.userId,
            'getInTouch',
            serverFormattedDate,
            true,
            { currentFilter, isDateInRange },
            isToastOn,
          );
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
          border: `${isDisliked ? 2 : 0}px solid ${color.iconActive}`,
        }}
      >
        <FaTimes size={18} color={isDisliked ? color.iconActive : color.white} />
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
          border: `${isFavorite ? 2 : 0}px solid ${color.iconInactive}`,
        }}
      >
        {isFavorite ? (
          <FaHeart size={18} color={color.iconInactive} />
        ) : (
          <FaRegHeart size={18} color={color.white} />
        )}
      </OrangeBtn>
    </div>
  );
};
