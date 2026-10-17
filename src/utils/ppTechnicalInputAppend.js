import { normalizePhoneValue } from 'components/inputValidations';

// Ключ порівняння для дописаного значення: той самий номер буває в анкеті з «+»
// чи пробілами, а нік — з «@» чи іншим регістром, і посимвольне порівняння
// пропускало б їх як нові.
const toAppendComparisonKey = (fieldName, value) => {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (fieldName === 'phone') return normalizePhoneValue(text) || text;
  return text.replace(/^@/, '').toLowerCase();
};

// Швидке введення дописує значення в кінець історії поля, і повторна вставка
// того самого тексту (або вставка контакту, з яким картку щойно знайшли)
// клала другою версією вже наявний номер. Тож значення, яке вже лежить у
// скалярі чи в будь-якому елементі масиву, не дописується. Виняток — стерте
// поле (остання версія порожня): тоді вставка повертає значення поточним.
export const appendFieldValue = (currentValue, nextValue, fieldName) => {
  const normalizedNextValue = String(nextValue ?? '').trim();
  if (!normalizedNextValue) return currentValue;

  const nextKey = toAppendComparisonKey(fieldName, normalizedNextValue);

  if (Array.isArray(currentValue)) {
    const lastValue = String(currentValue[currentValue.length - 1] ?? '').trim();
    const alreadyPresent = currentValue.some(item => toAppendComparisonKey(fieldName, item) === nextKey);
    if (alreadyPresent && lastValue) return currentValue;
    return [...currentValue, normalizedNextValue];
  }

  const normalizedCurrentValue = String(currentValue ?? '').trim();
  if (!normalizedCurrentValue) {
    return normalizedNextValue;
  }

  if (toAppendComparisonKey(fieldName, normalizedCurrentValue) === nextKey) {
    return currentValue;
  }

  return [normalizedCurrentValue, normalizedNextValue];
};

export const appendTextBlockValue = (currentValue, nextValue) => {
  const normalizedNextValue = String(nextValue ?? '').trim();
  if (!normalizedNextValue) return currentValue;

  // Той самий блок нотатки, вставлений удруге, не дописується.
  const currentText = (Array.isArray(currentValue) ? currentValue : [currentValue])
    .map(value => String(value ?? '').trim())
    .filter(Boolean)
    .join('\n');
  if (currentText.includes(normalizedNextValue)) return currentValue;

  if (Array.isArray(currentValue)) {
    const normalizedCurrentValues = currentValue
      .map(value => String(value ?? '').trim())
      .filter(Boolean);
    return [...normalizedCurrentValues, normalizedNextValue].join('\n');
  }

  const normalizedCurrentValue = String(currentValue ?? '').trim();
  if (!normalizedCurrentValue) {
    return normalizedNextValue;
  }

  return `${normalizedCurrentValue}\n${normalizedNextValue}`;
};
