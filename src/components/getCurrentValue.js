/**
 * Поточне значення поля анкети.
 *
 * Поле анкети живе в базі або скаляром, або **масивом версій**: людина ввела
 * телефон, потім змінила його, потім стерла — у вузлі лишається
 * `['+380...', '+380...', '']`. Масив тут — це історія, а не набір: у людини
 * один телефон, одне імʼя, одна пошта. Тому поточне значення — це **останній**
 * елемент, і нічого, крім нього.
 *
 * Раніше цей обхід ішов з кінця й **пропускав порожні**, тобто повертав
 * останнє непорожнє. Різниця видна рівно в тому випадку, заради якого масив і
 * заведений: людина стерла контакт, у своїй анкеті бачить порожнє поле — і
 * очікує, що його ніхто не побачить, — а стрічка показувала попередній запис.
 * Стерте значення — це відповідь «немає», а не привід дістати попереднє.
 *
 * Історію бачить той, хто редагує анкету: у формі лежить сире поле з усіма
 * версіями. Показ же питає саме про поточне значення — і отримує або його, або
 * нічого.
 *
 * Масивом версій вважається масив і той обʼєкт, у якого всі ключі числові:
 * саме так RTDB віддає масив з дірками. Обʼєкт з іменованими ключами — це мапа
 * полів, а не історія, і для нього лишається старий обхід: останнє заповнене
 * значення.
 *
 * Роль сюди не ходить: там масив — це справді набір («заявилась і агенцією, і
 * доноркою»), і його збирає `deriveRole` власним правилом.
 */

/**
 * Дірка в масиві — це відсутня версія, а не стерте значення.
 *
 * RTDB не вміє зберігати `null`: запис `null` видаляє ключ. Тож `null` усередині
 * масиву приїжджає не з анкети, а з самої бази — так SDK віддає масив з
 * пропущеними індексами (`{0:'a', 2:'c'}` стає `['a', null, 'c']`). Стирання ж
 * людина пише порожнім рядком, і саме він означає «цього поля більше немає».
 * Плутати їх не можна: на дірці треба взяти попередню версію, на порожньому
 * рядку — зупинитись.
 */
const isHole = value => value === undefined || value === null;

const isFilled = value => !isHole(value) && String(value).trim() !== '';

const asVersionList = value => {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return null;
  const keys = Object.keys(value);
  if (!keys.length || !keys.every(key => /^\d+$/.test(key))) return null;
  return keys
    .slice()
    .sort((left, right) => Number(left) - Number(right))
    .map(key => value[key]);
};

export const getCurrentValue = value => {
  const versions = asVersionList(value);
  if (versions) {
    for (let index = versions.length - 1; index >= 0; index -= 1) {
      if (isHole(versions[index])) continue;
      // Перша ж наявна версія з кінця і є поточною — далі не йдемо. Порожня
      // вона чи ні, вирішує лише те, чи є в поля значення; попередню версію
      // порожня не «пропускає».
      const current = getCurrentValue(versions[index]);
      return isFilled(current) ? current : undefined;
    }
    return undefined;
  }

  if (value && typeof value === 'object') {
    const keys = Object.keys(value);
    for (let index = keys.length - 1; index >= 0; index -= 1) {
      const current = getCurrentValue(value[keys[index]]);
      if (isFilled(current)) return current;
    }
    return undefined;
  }

  return value;
};

/** Чи є в поля поточне значення. Стерте (порожня остання версія) — немає. */
export const hasCurrentValue = value => isFilled(getCurrentValue(value));
