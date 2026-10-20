/** Помічники, спільні для мовних модулів (`utils/locales`). */

/** «a, b y c» / «a, b und c»: останній елемент — через сполучник мови. */
export const joinWithAnd = (items, and, separator = ', ') => {
  const list = items.filter(Boolean);
  if (list.length < 2) return list[0] || '';
  return `${list.slice(0, -1).join(separator)} ${and} ${list[list.length - 1]}`;
};

/** Речення з великої літери й крапкою в кінці. */
export const sentenceCase = text => (text ? `${text.charAt(0).toLocaleUpperCase()}${text.slice(1)}.` : '');

/** Однина чи множина для мов, де їх дві. */
export const plural = (count, one, many) => (count === 1 ? one : many);

/**
 * Рядок словника за ключем — лише власний ключ. Звичайний `dict[key]` на
 * «constructor» чи «toString» віддав би функцію з прототипа, і React упав би,
 * намагаючись її намалювати.
 */
export const ownEntry = (dictionary, key) => (
  dictionary && Object.prototype.hasOwnProperty.call(dictionary, key) ? dictionary[key] : undefined
);
