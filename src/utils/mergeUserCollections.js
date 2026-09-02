/**
 * Злиття однієї анкети з двох legacy-колекцій — по полях, а не цілим записом.
 *
 * Файл повернуто з історії разом із міграцією: колекцій `users` і `newUsers`
 * більше немає в застосунку, але їхні вивантаження лишились, і саме з них
 * добирається те, чого новим вузлам бракує. Семантика тут та сама, що діяла,
 * поки колекції були живі, — переписувати її під міграцію означало б
 * мігрувати не ті дані, які колись показувались людям.
 *
 * `users` — primary, `newUsers` — secondary. Різниця не в «свіжості», а в
 * тому, чиє значення бачив звичайний користувач.
 */

const isPlainObject = value =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

// Firebase RTDB зберігає «діряві» масиви як обʼєкти з числовими ключами,
// тож те саме поле-список приходить з однієї колекції масивом, а з іншої —
// обʼєктом. Обидві форми зводяться до списку значень.
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

// Прибирає дублікати, лишаючи значення на позиції його ОСТАННЬОГО входження
// (а не першого). Це критично: останній елемент списку з `users` — це те, що
// бачив звичайний користувач (решта місць показує лише останній елемент
// масиву), тож він має лишитись останнім і в результаті, навіть якщо те саме
// значення вже траплялось раніше серед даних з `newUsers`.
// Порожній рядок вважається змістовним значенням і не відкидається — лише
// `undefined`/`null` означають «немає значення на цій позиції».
const dedupeKeepingLastOccurrence = values => {
  const seen = new Set();
  const result = [];
  for (let i = values.length - 1; i >= 0; i -= 1) {
    const item = values[i];
    if (item === undefined || item === null) continue;
    const key = isPlainObject(item) ? JSON.stringify(item) : item;
    if (seen.has(key)) continue;
    seen.add(key);
    result.unshift(item);
  }
  return result;
};

/** Обидві колекції дали скаляр, і скаляри різні. */
export const isScalarConflict = (primaryValue, secondaryValue) => {
  if (primaryValue === undefined || secondaryValue === undefined) return false;
  if (toListValues(primaryValue) || toListValues(secondaryValue)) return false;
  if (isPlainObject(primaryValue) && isPlainObject(secondaryValue)) return false;
  return primaryValue !== secondaryValue;
};

/**
 * @param {*} primaryValue значення поля з `users`
 * @param {*} secondaryValue значення того самого поля з `newUsers`
 * @param {{mergeConflictingScalars?: boolean}} [options]
 *   `mergeConflictingScalars` перетворює конфлікт двох скалярів на масив із
 *   обох значень. За замовчуванням вимкнено: скалярне поле лишається скаляром,
 *   як воно й лежало, а про втрачене значення каже звіт (`listScalarConflicts`).
 */
export const mergeUserFieldValue = (primaryValue, secondaryValue, options = {}) => {
  if (primaryValue === undefined) return secondaryValue;
  if (secondaryValue === undefined) return primaryValue;

  const primaryList = toListValues(primaryValue);
  const secondaryList = toListValues(secondaryValue);
  if (primaryList || secondaryList) {
    const primaryItems = primaryList || [primaryValue];
    const secondaryItems = secondaryList || [secondaryValue];
    return dedupeKeepingLastOccurrence([...secondaryItems, ...primaryItems]);
  }

  if (isPlainObject(primaryValue) && isPlainObject(secondaryValue)) {
    return { ...secondaryValue, ...primaryValue };
  }

  if (primaryValue === secondaryValue) return primaryValue;

  // Два різні скаляри — це не список, і робити з них список за замовчуванням
  // не можна: поле, яке всюди читається як одне значення, стало б масивом, а
  // «поточним» у ньому — не те, що бачили люди. Тому виграє `users`, а
  // значення з `newUsers` іде у звіт, а не в тишу.
  if (options.mergeConflictingScalars) {
    return dedupeKeepingLastOccurrence([secondaryValue, primaryValue]);
  }

  return primaryValue;
};

/** Поля, де обидві колекції дали різні скаляри: одне зі значень не поїде. */
export const listScalarConflicts = (primaryData = {}, secondaryData = {}) => {
  const primary = primaryData || {};
  const secondary = secondaryData || {};
  return [...new Set([...Object.keys(primary), ...Object.keys(secondary)])]
    .filter(key => isScalarConflict(primary[key], secondary[key]));
};

/**
 * Зливає анкету з `users` (primaryData) і `newUsers` (secondaryData) по кожному
 * полю окремо — замість повного перезапису одного набору іншим.
 */
export const mergeUserCollectionData = (primaryData = {}, secondaryData = {}, options = {}) => {
  const primary = primaryData || {};
  const secondary = secondaryData || {};
  const keys = new Set([...Object.keys(primary), ...Object.keys(secondary)]);
  const merged = {};
  keys.forEach(key => {
    merged[key] = mergeUserFieldValue(primary[key], secondary[key], options);
  });
  return merged;
};

// `userId` є «довгим» (Firebase-Auth UID), якщо довший за 20 символів — саме цю
// межу використовував запис даних для маршрутизації по колекціях, тож читання
// дотримується тієї самої.
export const isLongFormatUserId = userId => String(userId || '').length > 20;
