/**
 * Похідні значення міграції — чисті функції без стану і без бази.
 *
 * Кожна з них відповідає на одне питання: «яке значення має отримати новий
 * вузол, і чи можна взагалі його вивести з цих даних». Друга половина питання
 * важливіша за першу: коли вивести не вдається, функція каже це вголос
 * (`warning`), а не вгадує. Саме на цій відповіді тримається головна гарантія
 * міграції — поле зникає з `newUsers` тільки після успіху.
 *
 * Спільні з застосунком похідні (`deriveSurnameShort`, `deriveRh`,
 * `deriveRole`, `normalizeFeedDateValue`, вибір аватара) сюди не копіюються, а
 * реекспортуються з `profileFieldDerive`: писач картки стрічки бере їх звідти,
 * і друга копія рано чи пізно розійшлася б із першою. Тут лишається тільки те,
 * що потрібне самій міграції й нікому більше.
 */

import { getCurrentValue } from 'components/getCurrentValue';
import { normalizePublish } from './reactionPriority';
import {
  normalizeFeedDateValue,
  resolveMatchingCardAvatarFromProfile,
} from './profileFieldDerive';

export {
  deriveSurnameShort,
  deriveRh,
  deriveBloodGroup,
  deriveRole,
  normalizeFeedDateValue,
  resolveMatchingCardAvatarFromProfile,
  hasMeaningfulValue,
} from './profileFieldDerive';

/** Глибока копія без втрати типу: масив лишається масивом, обʼєкт — обʼєктом. */
export const deepClone = value => {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(deepClone);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, deepClone(item)]));
};

/** Порівняння за значенням — ним міряється ідемпотентність і конфлікт джерел. */
export const deepEqual = (a, b) => {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every(key => Object.prototype.hasOwnProperty.call(b, key) && deepEqual(a[key], b[key]));
};

const displayString = value => {
  const current = getCurrentValue(value);
  if (typeof current === 'number') return String(current);
  if (typeof current !== 'string') return '';
  return current.trim();
};

/**
 * `avatar` — окреме поле, якщо воно є; інакше основне фото з `photos`.
 *
 * Вибір основного фото робиться тим самим кодом, яким його робить застосунок,
 * тож аватар у стрічці і перше фото в картці — це один і той самий знімок.
 * `fromPhotos` потім вирішує долю джерела: похідне значення не дає права
 * видалити `photos`, бо повний набір фото ще потрібен `profileDetails`.
 */
export const deriveAvatar = source => {
  const direct = displayString(source?.avatar);
  if (direct) return { value: direct, fromPhotos: false };

  const fromPhotos = resolveMatchingCardAvatarFromProfile(source);
  if (fromPhotos) return { value: fromPhotos, fromPhotos: true };

  return { value: undefined, fromPhotos: false };
};

/**
 * Дата в анкеті пишеться то крапками, то через дефіс, то з часом.
 *
 * Тож при переїзді дата нормалізується. Не «переформатовується будь-що схоже»:
 * міняється рівно те, що є датою цілком і повністю, — рядок із самих цифр і
 * крапок, який дає осмислені день, місяць і рік. Усе інше (нотатка з датою
 * всередині, номер версії, «2099-99-99») лишається символ у символ.
 *
 * Обхід глибокий: масив версій поля і вкладений обʼєкт — теж дані анкети.
 */
export const normalizeLegacyDates = value => {
  if (typeof value === 'string') {
    const normalized = normalizeFeedDateValue(value);
    // Порожній результат означає «це не дата», а не «дата зникла».
    return normalized || value;
  }
  if (Array.isArray(value)) return value.map(normalizeLegacyDates);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, normalizeLegacyDates(item)]),
    );
  }
  return value;
};

/**
 * Порівняння двох дат входу — рівно настільки, наскільки це можливо чесно.
 *
 * `lastLogin` та `lastLogin2` — це «коли анкету востаннє бачили», і з двох
 * копій правдива та, що ближча до сьогодні: старіша просто відстала. Але
 * зводити їх можна тільки тоді, коли обидві справді дати: `null` каже, що
 * порівнювати нема чого, і тоді розбіжність лишається розбіжністю.
 *
 * Формат нормалізується до `YYYY-MM-DD`, тож рядки порівнюються лексикографічно
 * і без часових поясів.
 */
export const compareLoginRecency = (left, right) => {
  const a = normalizeFeedDateValue(left);
  const b = normalizeFeedDateValue(right);
  if (!a || !b) return null;
  if (a === b) return 0;
  return a > b ? 1 : -1;
};

/**
 * `feedDate` — і допуск до стрічки, і порядок у ній, одним ключем.
 *
 * Наявність ключа означає «показувати», значення — місце в порядку. Тобто
 * старий `publish` виражається не окремим прапорцем, а самим фактом існування
 * дати, і зняти картку зі стрічки — це видалити ключ.
 *
 * Стан «показувати» читається тим самим `normalizePublish`, що й у застосунку:
 * `publish` у живих даних буває і булевим, і рядком, і масивом версій.
 *
 * Показана картка без жодної придатної дати — це не привід вигадати дату.
 * Такий випадок їде у звіт як блокуючий, а `publish` лишається в `newUsers`.
 */
export const deriveFeedDate = source => {
  const published = normalizePublish(source?.publish);
  if (!published) {
    return { value: undefined, published: false, publishRepresented: true };
  }

  const fromLastLogin2 = normalizeFeedDateValue(source?.lastLogin2);
  if (fromLastLogin2) return { value: fromLastLogin2, published: true, publishRepresented: true };

  const fromLastLogin = normalizeFeedDateValue(source?.lastLogin);
  if (fromLastLogin) return { value: fromLastLogin, published: true, publishRepresented: true };

  return {
    value: undefined,
    published: true,
    publishRepresented: false,
    warning: 'FEED_DATE_MISSING_DATE',
  };
};

/**
 * Звести значення поля власника до рядка — так, як його пише сам застосунок.
 *
 * `getInTouch` і `writer` — скаляри: у базі на них стоїть
 * `.validate: newData.isString()`, а форма картки збирає `writer` через
 * `updatedCodes.join(', ')`, тобто рядком «Т, Ik, V». Але в частині старих
 * анкет туди записався сам масив, без `join` — і такий запис база не приймає.
 * Відмова приходить як PERMISSION_DENIED (провалена `.validate` не має свого
 * коду), а заливка йде порціями, тож один масив забирає з собою 199 сусідніх
 * записів і виглядає це як відсутній дозвіл на весь вузол.
 *
 * Тож масив зводиться до того самого рядка, який дав би `join(', ')`. Порожні
 * елементи відкидаються: `['Т', '', 'Ik']` — це «Т, Ik», а не «Т, , Ik».
 * Обʼєкт із числовими ключами — той самий масив, тільки з дірками: RTDB
 * повертає його так, коли всередині є `null`, і читати його треба в порядку
 * ключів, а не в порядку вставки.
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
