import { useCallback, useEffect, useState } from 'react';
import { EXTRA_LANGUAGE_CODES, SUPPORTED_LANGUAGE_CODES, getExtraLocale, loadExtraLocale } from '../utils/locales';

// Global app settings: colour theme (light/dark) and interface language
// (any code from `utils/locales` — uk, en, es, de, nl, ja, zh).
// Persisted in localStorage and synced between mounted components via a window event,
// so the toggles in the three-dots menu update every open screen immediately.

const THEME_STORAGE_KEY = 'appThemeMode';
const LEGACY_THEME_STORAGE_KEY = 'matchingThemeMode';
const LANGUAGE_STORAGE_KEY = 'appLanguage';
const SETTINGS_EVENT = 'knowme-app-settings-change';

export const getStoredThemeMode = () => {
  try {
    const stored =
      localStorage.getItem(THEME_STORAGE_KEY)
      || localStorage.getItem(LEGACY_THEME_STORAGE_KEY)
      || sessionStorage.getItem(LEGACY_THEME_STORAGE_KEY);
    return stored === 'dark' ? 'dark' : 'light';
  } catch (error) {
    return 'light';
  }
};

// Мова за замовчуванням — українська. Стояла англійська, і людина, яка щойно
// ввійшла з українського екрана входу, опинялась в англійському застосунку:
// «Profile filled in», «Publish the profile» поруч з «Очистити все» й
// «Особисті дані», бо частина написів мову не виконує. Аудиторія застосунку —
// українська, тож англійську обирають явно, у меню трьох крапок.
export const DEFAULT_APP_LANGUAGE = 'uk';
// Перелік мов — у реєстрі `utils/locales`. Виконують їх екрани матчингу;
// адмінські мовою інтерфейсу не користуються й лишаються українськими.
export const SUPPORTED_APP_LANGUAGES = SUPPORTED_LANGUAGE_CODES;

export const getStoredLanguage = () => {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return SUPPORTED_APP_LANGUAGES.includes(stored) ? stored : DEFAULT_APP_LANGUAGE;
  } catch (error) {
    return DEFAULT_APP_LANGUAGE;
  }
};

export const applyThemeModeToDocument = mode => {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.kmTheme = mode;
  document.documentElement.dataset.matchingTheme = mode;
};

export const applyStoredAppSettings = () => {
  applyThemeModeToDocument(getStoredThemeMode());
};

const readSettingsSnapshot = () => ({
  themeMode: getStoredThemeMode(),
  language: getStoredLanguage(),
});

const notifySettingsChange = () => {
  window.dispatchEvent(new Event(SETTINGS_EVENT));
};

// Словник мови понад українську й англійську — окремий модуль, і він мусить
// приїхати до того, як мова стане поточною: інакше екран на мить перейшов би
// на англійську (запасну для рядка без перекладу) й тільки потім на обрану.
const needsLocaleModule = language => EXTRA_LANGUAGE_CODES.includes(language) && !getExtraLocale(language);

export const useAppSettings = () => {
  const [settings, setSettings] = useState(readSettingsSnapshot);

  useEffect(() => {
    const sync = () => {
      const snapshot = readSettingsSnapshot();
      if (!needsLocaleModule(snapshot.language)) {
        setSettings(snapshot);
        return;
      }
      // Мову змінили в іншій вкладці: тут її словника ще може не бути.
      loadExtraLocale(snapshot.language)
        .catch(error => console.warn('[settings] словник мови не довантажився', error))
        .finally(() => setSettings(readSettingsSnapshot()));
    };
    window.addEventListener(SETTINGS_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(SETTINGS_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const setThemeMode = useCallback(mode => {
    const nextMode = mode === 'dark' ? 'dark' : 'light';
    try {
      localStorage.setItem(THEME_STORAGE_KEY, nextMode);
      // Matching читає стару адресу теми — тримаємо її синхронізованою.
      localStorage.setItem(LEGACY_THEME_STORAGE_KEY, nextMode);
      sessionStorage.setItem(LEGACY_THEME_STORAGE_KEY, nextMode);
    } catch (error) {
      // localStorage може бути недоступним (приватний режим) — тема просто не збережеться.
    }
    applyThemeModeToDocument(nextMode);
    setSettings(prev => ({ ...prev, themeMode: nextMode }));
    notifySettingsChange();
  }, []);

  const toggleThemeMode = useCallback(() => {
    setThemeMode(getStoredThemeMode() === 'light' ? 'dark' : 'light');
  }, [setThemeMode]);

  const setLanguage = useCallback(lang => {
    const nextLanguage = SUPPORTED_APP_LANGUAGES.includes(lang) ? lang : DEFAULT_APP_LANGUAGE;
    const apply = () => {
      try {
        localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage);
      } catch (error) {
        // ignore storage errors
      }
      setSettings(prev => ({ ...prev, language: nextLanguage }));
      notifySettingsChange();
    };
    if (!needsLocaleModule(nextLanguage)) {
      apply();
      return;
    }
    // Без мережі словник не приїде — мова однаково перемикається, а рядки
    // йдуть англійською, як і будь-який рядок без перекладу.
    loadExtraLocale(nextLanguage)
      .catch(error => console.warn('[settings] словник мови не довантажився', error))
      .finally(apply);
  }, []);

  return {
    themeMode: settings.themeMode,
    language: settings.language,
    setThemeMode,
    toggleThemeMode,
    setLanguage,
  };
};
