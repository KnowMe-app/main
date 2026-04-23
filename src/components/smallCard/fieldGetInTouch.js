import { handleChange } from './actions';
import {
  formatDateToDisplay,
  formatDateAndFormula,
  formatDateToServer,
} from 'components/inputValidations';
import { OrangeBtn, UnderlinedInput } from 'components/styles';

export const fieldGetInTouch = (
  userData,
  setUsers,
  setState,
  currentFilter,
  isDateInRange,
  submitOptions = {},
) => {
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
      { currentFilter, isDateInRange, ...submitOptions },
    );
  };

  const targetId = userData?.userId;

  const propagateDraft = nextValue => {
    if (typeof setState === 'function') {
      setState(prev => {
        if (!prev || typeof prev !== 'object') {
          return prev;
        }
        if (targetId && prev.userId && prev.userId !== targetId) {
          return prev;
        }
        return { ...prev, getInTouch: nextValue };
      });
    }

    if (typeof setUsers === 'function' && targetId) {
      setUsers(prev => {
        if (!prev) {
          return prev;
        }

        if (Array.isArray(prev)) {
          return prev.map(item =>
            item?.userId === targetId
              ? { ...item, getInTouch: nextValue }
              : item,
          );
        }

        if (typeof prev === 'object') {
          const current = prev[targetId];
          if (!current || typeof current !== 'object') {
            return prev;
          }
          return {
            ...prev,
            [targetId]: { ...current, getInTouch: nextValue },
          };
        }

        return prev;
      });
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
          const rawValue = e?.target?.value ?? '';
          const trimmedValue = rawValue.trim();

          if (!trimmedValue) {
            handleChange(
              setUsers,
              setState,
              userData.userId,
              'getInTouch',
              '',
              false,
            );
            return;
          }

          const normalizedValue = formatDateAndFormula(trimmedValue);
          const serverFormattedDate = formatDateToServer(normalizedValue);
          const isCompleteDate =
            typeof serverFormattedDate === 'string' &&
            /^\d{4}-\d{2}-\d{2}$/.test(serverFormattedDate);

          if (isCompleteDate) {
            handleChange(
              setUsers,
              setState,
              userData.userId,
              'getInTouch',
              serverFormattedDate,
              false,
            );
          } else {
            propagateDraft(trimmedValue);
          }
        }}
        onBlur={e => {
          const rawValue = e?.target?.value ?? '';
          const trimmedValue = rawValue.trim();

          if (!trimmedValue) {
            handleChange(
              setUsers,
              setState,
              userData.userId,
              'getInTouch',
              '',
              true,
              { currentFilter, isDateInRange, ...submitOptions },
            );
            return;
          }

          const normalizedValue = formatDateAndFormula(trimmedValue);
          const serverFormattedDate = formatDateToServer(normalizedValue);
          const isCompleteDate =
            typeof serverFormattedDate === 'string' &&
            /^\d{4}-\d{2}-\d{2}$/.test(serverFormattedDate);

          if (!isCompleteDate) {
            propagateDraft(trimmedValue);
            return;
          }

          handleChange(
            setUsers,
            setState,
            userData.userId,
            'getInTouch',
            serverFormattedDate,
            true,
            { currentFilter, isDateInRange, ...submitOptions },
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
    </div>
  );
};
