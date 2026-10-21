/**
 * Записи стану нотаток стрічки, які не міняють посилання без зміни змісту.
 *
 * Стрічка тримає нотатки двома мапами (`comments` — власні, `sharedComments` —
 * інших власників спільного доступу) і переписує їх з двох місць: ефект, що
 * обрізає мапу до показаних карток, і `loadCommentsFor`. Обидва колись
 * повертали новий обʼєкт завжди — навіть коли нічого не змінилось. Поки React
 * міг відкинути такий запис, це коштувало лише зайвого рендера. Але поки в
 * черзі лежить відкладене функціональне оновлення `users`, кожен рендер
 * перераховує `users` новим масивом, ефект на `users` знову переписує мапу,
 * та знову нова — і донорка на «Обране» → «Усі» діставала завислу вкладку.
 * Цикл розриває саме незмінне посилання: те, що не змінилось, React відкидає.
 */

const sameNoteValue = (left, right) => {
  if (left === right) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((item, index) => item === right[index]);
  }
  return false;
};

// Лишити в мапі тільки показані картки. Повертає `prev`, коли прибирати нічого.
export const keepNotesForIds = (prev, ids) => {
  const source = prev || {};
  const next = {};
  ids.forEach(id => {
    if (source[id]) next[id] = source[id];
  });
  return Object.keys(next).length === Object.keys(source).length ? source : next;
};

// Дописати прочитане. Повертає `prev`, коли кожне значення вже таке саме.
export const mergeNotes = (prev, patch) => {
  const source = prev || {};
  const changed = Object.keys(patch || {}).some(id => !sameNoteValue(source[id], patch[id]));
  return changed ? { ...source, ...patch } : source;
};
