// Налаштування Flow, що живуть на пристрої (20.11, винесено з
// `components/FlowManager.jsx`): масштаб тексту, валюта міток, режим курсу,
// власний курс долара, відкриті група й розділ списку. Усе це — зручність,
// а не дані: збій `localStorage` повертає типове значення й нічого не ламає.
//
// Значення читаються вже в першому рендері (лінива ініціалізація), а не
// ефектом відновлення: `FlowManager` монтується з ключем власника, тож
// власник у межах екземпляра не міняється, а ефект відновлення давав кадр
// зі стандартними значеннями — і ще й встигав записати їх поверх
// збережених (запис курсу на першому кадрі стирав збережений курс).
import { useCallback, useEffect, useState } from 'react';
import { normalizeFlowCurrencyLabelMode, topLevelFlowGroup } from 'utils/flowView';
import {
  FLOW_TEXT_SCALES,
  flowCustomUsdRateStorageKey,
  flowDisplayCurrencyStorageKey,
  flowExchangeRateModeStorageKey,
  flowOpenGroupStorageKey,
  flowOpenSectionStorageKey,
  flowTextScaleStorageKey,
  formatCustomUsdRate,
  getValidFlowExchangeRateMode,
  normalizeCategoryPath,
} from 'utils/flowEntries';

const readItem = key => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

// Порожнє значення ключ знімає — крім відкритих групи й розділу: там порожній
// рядок означає «усе згорнуто», а відсутній ключ — «ще не обирали», і розділ
// тоді береться з відкритої групи.
const writeItem = (key, value, { keepEmpty = false } = {}) => {
  try {
    if (value || keepEmpty) localStorage.setItem(key, value || '');
    else localStorage.removeItem(key);
  } catch (error) {
    console.error('Unable to persist flow setting', error);
  }
};

const readTextScale = ownerId => {
  const saved = Number(readItem(flowTextScaleStorageKey(ownerId)));
  const max = FLOW_TEXT_SCALES[FLOW_TEXT_SCALES.length - 1];
  return saved > max ? max : FLOW_TEXT_SCALES.includes(saved) ? saved : 1;
};

export const useFlowDeviceSettings = ownerId => {
  const [exchangeRateMode, setExchangeRateMode] = useState(() =>
    getValidFlowExchangeRateMode(ownerId ? readItem(flowExchangeRateModeStorageKey(ownerId)) : null));
  const [currencyLabelMode, setCurrencyLabelMode] = useState(() =>
    normalizeFlowCurrencyLabelMode(ownerId ? readItem(flowDisplayCurrencyStorageKey(ownerId)) : null));
  const [textScale, setTextScale] = useState(() => (ownerId ? readTextScale(ownerId) : 1));
  const [customUsdRate, setCustomUsdRate] = useState(() =>
    (ownerId ? formatCustomUsdRate(readItem(flowCustomUsdRateStorageKey(ownerId))) : ''));
  const [customUsdRateDraft, setCustomUsdRateDraft] = useState(customUsdRate);

  useEffect(() => {
    if (ownerId) writeItem(flowExchangeRateModeStorageKey(ownerId), exchangeRateMode);
  }, [exchangeRateMode, ownerId]);

  useEffect(() => {
    if (ownerId) writeItem(flowCustomUsdRateStorageKey(ownerId), formatCustomUsdRate(customUsdRate));
  }, [customUsdRate, ownerId]);

  // Валюта міток: без валюти, одна ($ чи €) або дві. Ключ той самий, що й у
  // колишнього перемикача $/€ — збережений вибір лишається.
  const selectCurrencyLabelMode = mode => {
    const next = normalizeFlowCurrencyLabelMode(mode);
    setCurrencyLabelMode(next);
    if (ownerId) writeItem(flowDisplayCurrencyStorageKey(ownerId), next);
  };

  const stepTextScale = direction => {
    const index = Math.max(0, FLOW_TEXT_SCALES.indexOf(textScale));
    const next = FLOW_TEXT_SCALES[Math.min(FLOW_TEXT_SCALES.length - 1, Math.max(0, index + direction))];
    setTextScale(next);
    if (ownerId) writeItem(flowTextScaleStorageKey(ownerId), String(next));
  };

  return {
    exchangeRateMode,
    setExchangeRateMode,
    currencyLabelMode,
    selectCurrencyLabelMode,
    textScale,
    stepTextScale,
    customUsdRate,
    setCustomUsdRate,
    customUsdRateDraft,
    setCustomUsdRateDraft,
  };
};

// Відкрита група списку й відкритий розділ — по одному: друга, відкрита
// дотиком, згортає попередню (19.11, на прохання власниці продукту:
// розгорнуті розділи з десятками підгруп робили список нескінченним).
// Відкриття підгрупи — після збереження, імпорту чи дотиком — відкриває й її
// розділ.
export const useFlowOpenState = ownerId => {
  const [openGroup, setOpenGroup] = useState(() => (ownerId ? readItem(flowOpenGroupStorageKey(ownerId)) || '' : ''));
  const [openSection, setOpenSection] = useState(() => {
    if (!ownerId) return '';
    const saved = readItem(flowOpenSectionStorageKey(ownerId));
    if (saved !== null) return saved;
    return topLevelFlowGroup(normalizeCategoryPath(readItem(flowOpenGroupStorageKey(ownerId)) || '')) || '';
  });

  const rememberOpenSection = useCallback(section => {
    const next = section || '';
    setOpenSection(next);
    if (ownerId) writeItem(flowOpenSectionStorageKey(ownerId), next, { keepEmpty: true });
  }, [ownerId]);

  const rememberOpenGroup = useCallback(group => {
    const next = group || '';
    setOpenGroup(next);
    if (next) rememberOpenSection(topLevelFlowGroup(normalizeCategoryPath(next)));
    if (ownerId) writeItem(flowOpenGroupStorageKey(ownerId), next, { keepEmpty: true });
  }, [ownerId, rememberOpenSection]);

  const toggleGroup = group => rememberOpenGroup(openGroup === group ? '' : group);
  const toggleSection = section => rememberOpenSection(openSection === section ? '' : section);

  return { openGroup, openSection, rememberOpenGroup, rememberOpenSection, toggleGroup, toggleSection };
};

// Чи пристрій каже, що він у мережі (`online` / `offline`).
export const useDeviceOnline = () => {
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine !== false);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
};
