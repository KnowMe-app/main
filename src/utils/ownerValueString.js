/**
 * Звести значення поля власника до рядка — так, як його пише сам застосунок.
 *
 * `getInTouch` і `writer` — скаляри: у базі на них стоїть
 * `.validate: newData.isString()`, а форма картки збирає `writer` через
 * `updatedCodes.join(', ')`, тобто рядком «Т, Ik, V». Але в частині старих
 * анкет туди записався сам масив, без `join` — і такий запис база не приймає.
 * Відмова приходить як PERMISSION_DENIED (провалена `.validate` не має свого
 * коду), тож виглядає вона як відсутній дозвіл, а не як невірний тип.
 *
 * Тож масив зводиться до того самого рядка, який дав би `join(', ')`. Порожні
 * елементи відкидаються: `['Т', '', 'Ik']` — це «Т, Ik», а не «Т, , Ik».
 * Обʼєкт із числовими ключами — той самий масив, тільки з дірками: RTDB
 * повертає його так, коли всередині є `null`, і читати його треба в порядку
 * ключів, а не в порядку вставки.
 *
 * Жила функція серед похідних офлайн-міграції `users`/`newUsers`. Інструмент
 * міграції прибрано разом із колекцією, а писач позначок власника
 * (`config.js`) потребує її й далі — тож вона тут, сама.
 */
export const flattenOwnerValueToString = value => {
  if (typeof value === 'string') return value;

  const parts = [];

  const orderedValues = node => {
    const keys = Object.keys(node);
    const numeric = keys.every(key => /^\d+$/.test(key));
    const ordered = numeric ? [...keys].sort((a, b) => Number(a) - Number(b)) : keys;
    return ordered.map(key => node[key]);
  };

  const walk = node => {
    if (node === null || node === undefined) return;
    if (typeof node === 'string') {
      const trimmed = node.trim();
      if (trimmed) parts.push(trimmed);
      return;
    }
    if (typeof node === 'number' || typeof node === 'boolean') {
      parts.push(String(node));
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node === 'object') orderedValues(node).forEach(walk);
  };

  walk(value);

  return parts.join(', ');
};
