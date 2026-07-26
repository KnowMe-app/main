const isPlainObject = value =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

// Firebase RTDB зберігає "діряві" масиви як об'єкти з числовими ключами,
// тож той самий список-поле може прийти з однієї колекції масивом,
// а з іншої — об'єктом. Приводимо обидва варіанти до списку значень.
const toListValues = value => {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) return value;
  if (isPlainObject(value)) {
    const keys = Object.keys(value);
    const looksLikeList = keys.length > 0 && keys.every(key => /^\d+$/.test(key));
    if (looksLikeList) return Object.values(value);
  }
  return null;
};

const dedupeValues = values => {
  const seen = new Set();
  const result = [];
  values.forEach(item => {
    if (item === undefined || item === null || item === '') return;
    const key = isPlainObject(item) ? JSON.stringify(item) : item;
    if (seen.has(key)) return;
    seen.add(key);
    result.push(item);
  });
  return result;
};

// primaryValue/secondaryValue — значення того самого поля з "users" та "newUsers".
// Списки об'єднуються унікальними значеннями (нічого не втрачається і не дублюється),
// вкладені об'єкти зливаються по ключах, а для примітивів, коли значення різні,
// перемагає primary (users) як актуальніше джерело.
export const mergeUserFieldValue = (primaryValue, secondaryValue) => {
  if (primaryValue === undefined) return secondaryValue;
  if (secondaryValue === undefined) return primaryValue;

  const primaryList = toListValues(primaryValue);
  const secondaryList = toListValues(secondaryValue);
  if (primaryList || secondaryList) {
    return dedupeValues([...(primaryList || []), ...(secondaryList || [])]);
  }

  if (isPlainObject(primaryValue) && isPlainObject(secondaryValue)) {
    return { ...secondaryValue, ...primaryValue };
  }

  return primaryValue;
};

// Зливає дані картки з "users" (primaryData) та "newUsers" (secondaryData) по кожному
// полю окремо замість повного перезапису одного набору даних іншим.
export const mergeUserCollectionData = (primaryData = {}, secondaryData = {}) => {
  const primary = primaryData || {};
  const secondary = secondaryData || {};
  const keys = new Set([...Object.keys(primary), ...Object.keys(secondary)]);
  const merged = {};
  keys.forEach(key => {
    merged[key] = mergeUserFieldValue(primary[key], secondary[key]);
  });
  return merged;
};
