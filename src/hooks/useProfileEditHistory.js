import { useCallback, useEffect, useRef, useState } from 'react';

// «Назад / Вперед» правок картки, як у Word, — одна історія на обидва екрани
// адміна: `AddNewProfile` і `/edit/:userId` (`EditProfile`, на нього ведуть
// посилання з Telegram-сповіщень). Поки історія жила всередині
// `AddNewProfile`, та сама картка, відкрита за посиланням, кнопок не мала.
//
// Історія — у памʼяті екрана, на одну картку: інша картка її скидає. Крок —
// знімок стану до правки; відміна віддає знімок, а записує його вже екран
// своїм `handleSubmit` (тобто тим самим шляхом, що й звичайна правка).

const cloneProfileState = profileState => JSON.parse(JSON.stringify(profileState || {}));

// `lastAction` міняє кожне збереження, тож без нього однакові знімки
// виглядали б різними, і кожен blur ставав би кроком історії.
const toComparableHistoryState = profileState => {
  if (!profileState || typeof profileState !== 'object') return {};
  const comparable = { ...profileState };
  delete comparable.lastAction;
  return comparable;
};

const areHistorySnapshotsEqual = (left, right) =>
  JSON.stringify(toComparableHistoryState(left)) === JSON.stringify(toComparableHistoryState(right));

const emptyHistory = () => ({ userId: null, current: null, undoStack: [], redoStack: [] });

export const useProfileEditHistory = state => {
  const [, setHistoryVersion] = useState(0);
  const historyRef = useRef(emptyHistory());
  // Запис, який робить сама відміна, не мусить ставати новим кроком (і
  // стирати «Вперед»).
  const navigationRef = useRef(false);
  const bump = useCallback(() => setHistoryVersion(prev => prev + 1), []);

  const registerSnapshot = useCallback(
    snapshotState => {
      if (!snapshotState?.userId) return;
      const history = historyRef.current;

      if (history.userId !== snapshotState.userId) {
        historyRef.current = {
          userId: snapshotState.userId,
          current: cloneProfileState(snapshotState),
          undoStack: [],
          redoStack: [],
        };
        navigationRef.current = false;
        bump();
      } else if (!history.current) {
        history.current = cloneProfileState(snapshotState);
        navigationRef.current = false;
        bump();
      } else if (!areHistorySnapshotsEqual(history.current, snapshotState)) {
        if (!navigationRef.current) {
          history.undoStack.push(cloneProfileState(history.current));
          history.redoStack = [];
          bump();
        }
        history.current = cloneProfileState(snapshotState);
        navigationRef.current = false;
      } else if (navigationRef.current) {
        navigationRef.current = false;
      }
    },
    [bump],
  );

  useEffect(() => {
    if (!state?.userId) {
      historyRef.current = emptyHistory();
      bump();
      return;
    }

    const history = historyRef.current;
    if (history.userId !== state.userId) {
      historyRef.current = {
        userId: state.userId,
        current: cloneProfileState(state),
        undoStack: [],
        redoStack: [],
      };
      bump();
      return;
    }

    if (!history.current) {
      history.current = cloneProfileState(state);
      bump();
    }
  }, [bump, state]);

  const step = useCallback(
    direction => {
      if (!state?.userId) return null;
      const history = historyRef.current;
      const from = direction === 'undo' ? history.undoStack : history.redoStack;
      const to = direction === 'undo' ? history.redoStack : history.undoStack;
      if (!from.length) return null;

      const target = from.pop();
      to.push(cloneProfileState(history.current));
      history.current = cloneProfileState(target);
      navigationRef.current = true;
      bump();
      return target;
    },
    [bump, state?.userId],
  );

  const takeUndo = useCallback(() => step('undo'), [step]);
  const takeRedo = useCallback(() => step('redo'), [step]);

  return {
    registerSnapshot,
    takeUndo,
    takeRedo,
    canUndo: Boolean(state?.userId) && historyRef.current.undoStack.length > 0,
    canRedo: Boolean(state?.userId) && historyRef.current.redoStack.length > 0,
  };
};

export default useProfileEditHistory;
