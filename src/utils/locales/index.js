/**
 * Мови інтерфейсу понад українську й англійську.
 *
 * Українська — мова коду (ключ кожного рядка), англійська — `uiTranslations` і
 * `profileTexts`. Решта мов живе тут, кожна одним модулем однакової форми:
 *
 * - `byUk` — рядки інтерфейсу за українським оригіналом;
 * - `byEnLabel` — підписи картки за англійським підписом макета;
 * - `uiTexts`, `derived` — статичні написи картки й «так/ні»;
 * - `optionValues`, `fieldOptionValues` — значення довідників за англійським
 *   словом, яким вони лежать у базі (поле може мати власний переклад);
 * - `sentences` — шаблони речень картки: рід і множину кожна мова тримає
 *   свої, тож код складає речення з частин, а не перекладає готове;
 * - `units`, `nav` — одиниці («міс», «тиж.») і рядок навігації.
 *
 * Місяці, дні тижня, формат дати й назви країн мовні модулі не тримають —
 * їх дає `Intl` браузера за `locale`.
 *
 * Рядок, якого в мові ще немає, читач бачить англійським: для того, хто обрав
 * не українську, англійська ближча.
 *
 * Модулі мов вантажаться на вимогу (`loadExtraLocale`), а не імпортом угорі:
 * разом вони важили ~1,2 МБ головного файлу — більше за PDF- і Excel-рушії
 * адмінки, — і їх качав кожен відвідувач, хоча майже всі читають українською.
 * Тут лишаються самі метадані мов: їх показує вибір мови, поки жоден модуль
 * не приїхав. Обрану мову `src/index.js` довантажує до першого кадру, а нову —
 * `setLanguage` перед тим, як перемкнути (`hooks/useAppSettings`).
 */
const EXTRA_LANGUAGE_INFO = [
  { code: 'es', nativeName: 'Español', locale: 'es-ES' },
  { code: 'de', nativeName: 'Deutsch', locale: 'de-DE' },
  { code: 'nl', nativeName: 'Nederlands', locale: 'nl-NL' },
  { code: 'ja', nativeName: '日本語', locale: 'ja-JP' },
  { code: 'zh', nativeName: '中文', locale: 'zh-CN' },
];

const EXTRA_LOCALE_LOADERS = {
  es: () => import(/* webpackChunkName: "locale-es" */ './es'),
  de: () => import(/* webpackChunkName: "locale-de" */ './de'),
  nl: () => import(/* webpackChunkName: "locale-nl" */ './nl'),
  ja: () => import(/* webpackChunkName: "locale-ja" */ './ja'),
  zh: () => import(/* webpackChunkName: "locale-zh" */ './zh'),
};

const LANGUAGE_INFO = [
  { code: 'uk', nativeName: 'Українська', locale: 'uk-UA' },
  { code: 'en', nativeName: 'English', locale: 'en-GB' },
  ...EXTRA_LANGUAGE_INFO,
];

/** Порядок у виборі мови: спершу мови аудиторії, далі решта. */
export const APP_LANGUAGES = Object.freeze(LANGUAGE_INFO);

export const SUPPORTED_LANGUAGE_CODES = Object.freeze(APP_LANGUAGES.map(item => item.code));

/** Мови, словник яких живе окремим модулем і вантажиться на вимогу. */
export const EXTRA_LANGUAGE_CODES = Object.freeze(EXTRA_LANGUAGE_INFO.map(item => item.code));

export const isSupportedLanguage = code => SUPPORTED_LANGUAGE_CODES.includes(code);

const loadedLocales = {};
const pendingLocales = {};

/**
 * Модуль мови понад українську й англійську, або `null` — і тоді, коли мова
 * ще не довантажилась: до того її рядки йдуть англійською, як і будь-який
 * рядок без перекладу.
 */
export const getExtraLocale = language => (
  Object.prototype.hasOwnProperty.call(loadedLocales, language) ? loadedLocales[language] : null
);

/**
 * Довантажує модуль мови; для української, англійської й невідомого коду — `null`.
 * Повторний виклик під час вантаження ділить той самий запит.
 */
export const loadExtraLocale = language => {
  const existing = getExtraLocale(language);
  if (existing) return Promise.resolve(existing);
  if (!Object.prototype.hasOwnProperty.call(EXTRA_LOCALE_LOADERS, language)) return Promise.resolve(null);
  if (!pendingLocales[language]) {
    pendingLocales[language] = EXTRA_LOCALE_LOADERS[language]()
      .then(module => {
        loadedLocales[language] = module.default;
        return module.default;
      })
      .finally(() => {
        delete pendingLocales[language];
      });
  }
  return pendingLocales[language];
};

/** BCP 47 тег для `Intl` і `toLocaleString`. */
export const getLanguageLocale = language => (
  APP_LANGUAGES.find(item => item.code === language)?.locale || 'uk-UA'
);

export const getLanguageNativeName = language => (
  APP_LANGUAGES.find(item => item.code === language)?.nativeName || language
);

/**
 * Значення зі списку посеред рядка — з малої літери («Освіта — вища»), крім
 * мов, де іменник пишуть з великої (`keepsNounCase`): німецьке
 * «Bildung — hochschulabschluss» — помилка, а не стиль.
 */
export const keepsNounCase = language => Boolean(getExtraLocale(language)?.keepsNounCase);

export const toInlineCase = (text, language) => (
  keepsNounCase(language) ? text : text.toLocaleLowerCase(getLanguageLocale(language))
);

export const toInlineCaseFirst = (text, language) => (
  !text || keepsNounCase(language)
    ? text || ''
    : text.charAt(0).toLocaleLowerCase(getLanguageLocale(language)) + text.slice(1)
);

/*
 * Словник довідника — мапа з ключами малими літерами, зібрана раз на словник.
 *
 * Поки ключ шукався перебором (`Object.keys(...).find` з `toLowerCase` обох
 * боків), кожна опція кожного списку й кожен факт кожного рядка стрічки
 * коштували прохід по сотні ключів — на кожному рендері.
 */
const lowercaseIndexes = new WeakMap();
const lookupLowercase = (dictionary, text) => {
  if (!dictionary) return undefined;
  let index = lowercaseIndexes.get(dictionary);
  if (!index) {
    index = new Map(Object.entries(dictionary).map(([key, value]) => [key.toLowerCase(), value]));
    lowercaseIndexes.set(dictionary, index);
  }
  return index.get(text.toLowerCase());
};

/** Значення довідника мовою `language`, або `null`, коли перекладу немає. */
export const translateOptionValue = (language, fieldName, value) => {
  const locale = getExtraLocale(language);
  const text = String(value ?? '').trim();
  if (!locale || !text) return null;
  return lookupLowercase(locale.fieldOptionValues?.[fieldName], text)
    ?? lookupLowercase(locale.optionValues, text)
    ?? null;
};

/*
 * `Intl`-обʼєкти дорогі в конструкторі, а питають їх по рядку: графік програми
 * — день тижня на кожну подію, стрічка — країну на кожну картку. Тож формати й
 * готові переліки тримаються раз на мову (і на параметри).
 */
const intlCache = new Map();
const cached = (key, build) => {
  if (!intlCache.has(key)) intlCache.set(key, build());
  return intlCache.get(key);
};

/** `Intl.DateTimeFormat` мовою інтерфейсу, один на мову й параметри. */
export const getDateTimeFormat = (language, options = {}) => (
  cached(`dtf|${getLanguageLocale(language)}|${JSON.stringify(options)}`,
    () => new Intl.DateTimeFormat(getLanguageLocale(language), options))
);

/**
 * Назва країни мовою інтерфейсу з `Intl.DisplayNames`; `null`, коли браузер
 * її не знає.
 */
export const formatRegionDisplayName = (language, regionCode) => (
  cached(`region|${getLanguageLocale(language)}|${regionCode}`, () => {
    try {
      const name = new Intl.DisplayNames([getLanguageLocale(language)], { type: 'region' }).of(regionCode);
      return name && name !== regionCode ? name : null;
    } catch {
      return null;
    }
  })
);

/** Назви місяців і днів тижня з `Intl` (тиждень з понеділка, якщо `mondayFirst`). */
export const listMonthNames = (language, { capitalize = true } = {}) => (
  cached(`months|${getLanguageLocale(language)}|${capitalize}`, () => {
    const formatter = getDateTimeFormat(language, { month: 'long' });
    return Object.freeze(Array.from({ length: 12 }, (_, month) => {
      const name = formatter.format(new Date(2026, month, 1));
      return capitalize ? name.charAt(0).toLocaleUpperCase() + name.slice(1) : name;
    }));
  })
);

export const listWeekdayNames = (language, { mondayFirst = false, width = 'short' } = {}) => (
  cached(`weekdays|${getLanguageLocale(language)}|${mondayFirst}|${width}`, () => {
    const formatter = getDateTimeFormat(language, { weekday: width });
    // 4 січня 2026 — неділя.
    const days = Array.from({ length: 7 }, (_, index) => formatter.format(new Date(2026, 0, 4 + index)));
    return Object.freeze(mondayFirst ? [...days.slice(1), days[0]] : days);
  })
);
