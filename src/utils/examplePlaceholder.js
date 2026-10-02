import { uiText } from './uiTranslations';

/**
 * Сіре «168», «Україна», «Лікар» у порожньому полі читалось як уже введене —
 * і людина пропускала поле, вважаючи його заповненим. Приклад тепер
 * називається прикладом. Формат («дд.мм.рррр», «https://», «username»)
 * лишається як є: він каже, як писати, а не що.
 */
export const FORMAT_PLACEHOLDER_PATTERN = /^(дд\.|dd\.|https?:|username|\+?\d{3} \d{2} )|^(Наприклад|For example)/i;
// Підказка-прохання («Коротко розкажіть про себе») — не приклад, і
// «Наприклад:» перед нею звучало б дивно: приклад — це значення в кілька слів.
const EXAMPLE_PLACEHOLDER_MAX_WORDS = 3;
export const asExamplePlaceholder = (placeholder, language) => {
  const text = String(placeholder || '').trim();
  if (!text || FORMAT_PLACEHOLDER_PATTERN.test(text)) return text;
  if (text.split(/\s+/).length > EXAMPLE_PLACEHOLDER_MAX_WORDS) return text;
  return uiText('Наприклад: {value}', language, { value: text });
};
