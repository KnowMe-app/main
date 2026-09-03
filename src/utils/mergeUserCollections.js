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

// Прибирає дублікати, залишаючи значення на позиції його ОСТАННЬОГО входження
// (а не першого). Це критично: останній елемент списку "users" — це те, що
// бачить звичайний користувач (усі інші місця показують лише останній елемент
// масиву), тож він має лишатися останнім у результаті, навіть якщо те саме
// значення вже зустрічалось раніше серед даних з "newUsers".
// Порожній рядок вважається змістовним значенням і не відкидається — лише
// undefined/null означають "немає значення на цій позиції".
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

/**
 * Чи є це значення списком — масивом або обʼєктом із числовими ключами.
 *
 * Питання не риторичне: поле-список і скалярне поле зливаються по-різному, і
 * саме на цій різниці тримається межа між «дві частини одного списку» та
 * «дві різні відповіді, розбирається людина».
 */
export const isListLikeValue = value => toListValues(value) !== null;

// primaryValue/secondaryValue — значення того самого поля з "users" (primary)
// та "newUsers" (secondary). Об'єднуємо лише справжні списки; скалярне поле
// мусить зберігати свою схему й брати значення зі своєї колекції-власника.
export const mergeUserFieldValue = (primaryValue, secondaryValue) => {
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

// userId є "довгим" (Firebase-Auth UID), якщо довший за 20 символів — саме цю межу
// вже використовує запис даних (updateDataInRealtimeDB/updateDataInNewUsersRTDB) для
// маршрутизації по колекціях, тож читання має дотримуватись тієї самої межі.
export const isLongFormatUserId = userId => String(userId || '').length > 20;
