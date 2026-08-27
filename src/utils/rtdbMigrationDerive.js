/**
 * Похідні значення міграції — чисті функції без стану і без бази.
 *
 * Кожна з них відповідає на одне питання: «яке значення має отримати новий
 * вузол, і чи можна взагалі його вивести з цих даних». Друга половина питання
 * важливіша за першу: коли вивести не вдається, функція каже це вголос
 * (`warning`), а не вгадує. Саме на цій відповіді тримається головна гарантія
 * міграції — поле зникає з `newUsers` тільки після успіху.
 *
 * Резолвер поточного значення тут не власний: старі анкети тримають те саме
 * поле то скаляром, то масивом версій, і те, яку з них показує UI, вже вирішує
 * `getCurrentValue`. Міграція бере саме його, щоб `surnameShort` у стрічці не
 * розійшовся з прізвищем, яке адмін бачить у картці.
 */

import { getCurrentValue } from 'components/getCurrentValue';
import { normalizePublish } from './reactionPriority';

/** Значення, яке взагалі є. `0` і `false` — є; `''`, `null`, `undefined` — немає. */
export const hasMeaningfulValue = value => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasMeaningfulValue);
  if (typeof value === 'object') return Object.values(value).some(hasMeaningfulValue);
  return true;
};

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
 * Перший видимий символ разом із діакритикою, що на ньому висить.
 *
 * `Array.from` ріже по кодових точках, тож сурогатна пара не розпадається на
 * половину. Комбіновані знаки (`\p{M}`) добираються слідом: «Ї» у деяких
 * джерелах записана як «І» плюс діакритика, і без цього кроку з неї вийшло б «І.».
 */
const firstVisibleCharacter = text => {
  const codePoints = Array.from(text);
  if (!codePoints.length) return '';
  let result = codePoints[0];
  for (let index = 1; index < codePoints.length; index += 1) {
    if (!/\p{M}/u.test(codePoints[index])) break;
    result += codePoints[index];
  }
  return result;
};

/**
 * `surnameShort` — ініціал прізвища з крапкою. Повне прізвище живе в
 * `profileDetails`, у стрічку воно не потрапляє взагалі.
 *
 * Регістр не міняється: «перший видимий символ» — це саме той символ, що в
 * даних. Приводити «van Beethoven» до «V.» — це рішення про відображення, а
 * міграція таких рішень не ухвалює.
 */
export const deriveSurnameShort = rawSurname => {
  if (!hasMeaningfulValue(rawSurname)) return { value: undefined };

  const display = displayString(rawSurname);
  if (!display) {
    // Значення є, але дістати з нього рядок для показу не вдалось. Вигадувати
    // ініціал з обʼєкта не можна — і повне прізвище лишається чекати Profiles.
    return { value: undefined, warning: 'UNRESOLVED_SURNAME' };
  }

  const initial = firstVisibleCharacter(display);
  if (!initial) return { value: undefined, warning: 'UNRESOLVED_SURNAME' };
  return { value: `${initial}.` };
};

const RH_PATTERN = /([+-])\s*$/;

const bloodCandidates = value => {
  if (Array.isArray(value)) return value.flatMap(bloodCandidates);
  if (value && typeof value === 'object') return Object.values(value).flatMap(bloodCandidates);
  if (typeof value === 'number') return [String(value)];
  return typeof value === 'string' ? [value.trim()] : [];
};

/**
 * `rh` — тільки резус. Повна група (`2+`) лишається для `profileDetails`.
 *
 * Масив версій дає резус лише тоді, коли всі його значення сходяться: різні
 * резуси в одній анкеті — це або помилка вводу, або дві різні людини, і
 * вгадувати тут нічого не можна.
 */
export const deriveRh = rawBlood => {
  if (!hasMeaningfulValue(rawBlood)) return { value: undefined };

  const found = new Set();
  bloodCandidates(rawBlood).forEach(candidate => {
    const match = RH_PATTERN.exec(candidate);
    if (match) found.add(match[1]);
  });

  if (found.size === 0) return { value: undefined };
  if (found.size > 1) return { value: undefined, warning: 'RH_CONFLICT' };
  return { value: [...found][0] };
};

const BLOOD_GROUP_PATTERN = /^([1-4])\s*[+-]?$/;

/**
 * Номер групи крові окремо від резуса.
 *
 * Стрічка фільтрує і за групою, і за резусом, а сире `blood` — це вільний
 * текст: «2+», «2 положительная», інколи масив версій. Тож у картку йдуть два
 * впорядковані скаляри, а сире значення лишається в `profileDetails`.
 *
 * Розбіжність між версіями не вгадується, як і в резусі.
 */
export const deriveBloodGroup = rawBlood => {
  if (!hasMeaningfulValue(rawBlood)) return { value: undefined };

  const found = new Set();
  bloodCandidates(rawBlood).forEach(candidate => {
    const match = BLOOD_GROUP_PATTERN.exec(candidate.replace(/\s+/g, ''));
    if (match) found.add(match[1]);
  });

  if (found.size === 0) return { value: undefined };
  if (found.size > 1) return { value: undefined, warning: 'BLOOD_GROUP_CONFLICT' };
  return { value: [...found][0] };
};

const normalizePhotoList = value => {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(normalizePhotoList);
  if (typeof value === 'object') return Object.values(value).flatMap(normalizePhotoList);
  const photo = typeof value === 'string' ? value.trim() : '';
  return photo ? [photo] : [];
};

/**
 * Основне фото анкети — перше з `photos`.
 *
 * `photos` у живих даних буває і рядком, і масивом, і обʼєктом з числовими
 * ключами (так RTDB віддає масив із дірками). Розкладка тут одна на всіх, тож
 * аватар у стрічці і перше фото в картці — це один і той самий знімок.
 */
export const resolveMatchingCardAvatarFromProfile = data => normalizePhotoList(data?.photos)[0] || '';

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
 * Одна роль замість двох ключів.
 *
 * Старі анкети тримають роль то в `userRole`, то в `role`, а бувають і обидва.
 * Коли вони розходяться, міграція не вибирає мовчки: обидва лишаються в
 * `newUsers`, а розбіжність їде у звіт — це рішення людини, а не скрипта.
 */
export const deriveRole = source => {
  const hasUserRole = hasMeaningfulValue(source?.userRole);
  const hasRole = hasMeaningfulValue(source?.role);

  if (hasUserRole && hasRole) {
    if (deepEqual(source.userRole, source.role)) {
      return { value: deepClone(source.role), consumed: ['userRole', 'role'] };
    }
    return { value: undefined, conflict: 'ROLE_CONFLICT', consumed: [] };
  }

  if (hasUserRole) return { value: deepClone(source.userRole), consumed: ['userRole'] };
  if (hasRole) return { value: deepClone(source.role), consumed: ['role'] };
  return { value: undefined, consumed: [] };
};

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DDMMYYYY_DATE = /^(\d{2})\.(\d{2})\.(\d{4})$/;

const isPlausibleDate = (year, month, day) => (
  Number(year) >= 1900 && Number(year) <= 2999
  && Number(month) >= 1 && Number(month) <= 12
  && Number(day) >= 1 && Number(day) <= 31
);

/** `YYYY-MM-DD` як є, `dd.mm.yyyy` — переставленим. Решта — не дата. */
export const normalizeFeedDateValue = value => {
  const text = displayString(value);
  if (!text) return '';

  const iso = ISO_DATE.exec(text);
  if (iso && isPlausibleDate(iso[1], iso[2], iso[3])) return text;

  const legacy = DDMMYYYY_DATE.exec(text);
  if (legacy && isPlausibleDate(legacy[3], legacy[2], legacy[1])) {
    return `${legacy[3]}-${legacy[2]}-${legacy[1]}`;
  }

  return '';
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

/** Символи, яких не може містити ключ RTDB. */
const FORBIDDEN_KEY_CHARACTERS = /[.#$/[\]]/;

/**
 * Контрольні коди база теж не приймає, а в legacy-значеннях вони трапляються
 * після копіювання з таблиць — невидимі очима і фатальні для запису.
 */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = new RegExp('[\\u0000-\\u001F\\u007F]');

const utf8Length = text => (
  typeof TextEncoder === 'function'
    ? new TextEncoder().encode(text).length
    : Buffer.byteLength(text, 'utf8')
);

/**
 * Чи годиться значення `getInTouch` бути ключем.
 *
 * Legacy-значення не «виправляються»: і `2099-99-99`, і текстова нотатка
 * переносяться як є, бо саме за ними адмін їх упізнає. Непридатне значення не
 * кодується мовчки — воно лишається в `newUsers` і потрапляє у звіт, щоб його
 * розібрала людина.
 */
export const checkGetInTouchKeySafety = value => {
  const text = displayString(value);
  if (!text) return { safe: false, reason: 'EMPTY_GET_IN_TOUCH_VALUE' };
  if (FORBIDDEN_KEY_CHARACTERS.test(text) || CONTROL_CHARACTERS.test(text)) {
    return { safe: false, key: text, reason: 'UNSAFE_GET_IN_TOUCH_KEY' };
  }
  if (utf8Length(text) > 768) return { safe: false, key: text, reason: 'GET_IN_TOUCH_KEY_TOO_LONG' };
  return { safe: true, key: text };
};
