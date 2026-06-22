import { handleChange } from './actions';
import { updateUserInState } from './userStateUpdate';
import {
  formatDateToDisplay,
  formatDateAndFormula,
  formatDateToServer,
} from 'components/inputValidations';
import { OrangeBtn, UnderlinedInput } from 'components/styles';
import {
  compactDateActionsStyle,
  compactDateButtonStyle,
  compactDateInputStyle,
  compactDateRowStyle,
} from './compactDateRowStyles';

export const fieldGetInTouch = (
  args,
  legacySetUsers,
  legacySetState,
  legacyCurrentFilter,
  legacyIsDateInRange,
  legacySubmitOptions = {},
  legacyTrailingActions = null,
) => {
  const {
    userData,
    setUsers,
    setState,
    currentFilter,
    isDateInRange,
    submitOptions = {},
    trailingActions = null,
  } = args && typeof args === 'object' && 'userData' in args
    ? args
    : {
        userData: args,
        setUsers: legacySetUsers,
        setState: legacySetState,
        currentFilter: legacyCurrentFilter,
        isDateInRange: legacyIsDateInRange,
        submitOptions: legacySubmitOptions,
        trailingActions: legacyTrailingActions,
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

        return updateUserInState(prev, targetId, current => ({
          ...current,
          getInTouch: nextValue,
        }));
      });
    }
  };

  const ActionButton = ({ label, days, onClick }) => (
    <OrangeBtn
      onClick={() => (onClick ? onClick(days) : null)}
      style={compactDateButtonStyle}
    >
      {label}
    </OrangeBtn>
  );

  return (
    <div style={compactDateRowStyle}>
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
        style={compactDateInputStyle}
      />
      <div style={compactDateActionsStyle}>
        <ActionButton label="3д" days={3} onClick={handleAddDays} />
        {/* <ActionButton label="7д" days={7} onClick={handleAddDays} /> */}
        <ActionButton label="1м" days={30} onClick={handleAddDays} />
        <ActionButton label="3м" days={90} onClick={handleAddDays} />
        <ActionButton label="6м" days={180} onClick={handleAddDays} />
        <ActionButton label="1р" days={365} onClick={handleAddDays} />
        {trailingActions}
      </div>
    </div>
  );
};
