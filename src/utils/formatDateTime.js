import { resolveProfileLanguage } from './profileTexts';

/**
 * Дата й час мовою інтерфейсу.
 *
 * `toLocaleString('uk-UA')` стояло жорстко в кожному місці, де екран називає
 * час: у чернетці, у черзі адміна, у списку власних карток. Разом із
 * англійськими підписами поруч це давало рядок на дві мови — «Updated
 * 12.09.2025, 23:03» проти «Оновлено 12.09.2025, 23:03» різнить не сама дата,
 * а те, що поруч. Формат іде за тією самою мовою, що й підпис.
 */
export const formatDateTime = (value, language) => {
  if (value === null || value === undefined || value === '') return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(resolveProfileLanguage(language) === 'uk' ? 'uk-UA' : 'en-GB');
};

export default formatDateTime;
