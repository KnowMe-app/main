// Куди повернути читача після входу.
//
// Посиланням діляться в месенджері, і веде воно всередину застосунку —
// `/matching`, рядок конкретної картки, форма доповнення. Незалогінений читач
// такого посилання мусить потрапити на форму входу, але сама адреса при цьому
// не має загубитись: інакше після входу він опиняється у «Моєму профілі» й
// шукає те, що йому надіслали, вручну.

export const LOGIN_ROUTE = '/login';

// Адреса приїжджає зі стану навігації, тобто з того, що колись лежало в рядку
// браузера. Пускаємо назад лише внутрішній шлях: `//evil.example` браузер читає
// як протокол-відносне посилання і виводить людину з застосунку, а `javascript:`
// виконується. Перевіряє це саме форма рядка, а не спроба відкрити.
export const sanitizeReturnTo = value => {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed.startsWith('/')) return '';
  if (trimmed.startsWith('//')) return '';
  if (trimmed.startsWith('/\\')) return '';
  // На саму форму входу повертати нема сенсу — це не місце призначення.
  if (trimmed === LOGIN_ROUTE || trimmed.startsWith(`${LOGIN_ROUTE}?`) || trimmed.startsWith(`${LOGIN_ROUTE}#`)) return '';
  return trimmed;
};

// `location` тут — об'єкт react-router: `pathname` у ньому вже без basename,
// тож зібраний рядок можна віддати `navigate` як є.
export const buildReturnToFromLocation = location => {
  if (!location) return '';
  const { pathname = '', search = '', hash = '' } = location;
  return sanitizeReturnTo(`${pathname}${search}${hash}`);
};

export const readReturnToFromState = state => sanitizeReturnTo(state?.returnTo);
