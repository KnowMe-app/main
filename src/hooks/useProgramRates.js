import { useCallback, useEffect, useState } from 'react';
import { fetchNbuUahExchangeRatesByDate } from '../components/config';
import {
  DEFAULT_PROGRAM_CURRENCY,
  getProgramRates,
  normalizeProgramCurrency,
  setProgramRates,
  subscribeProgramRates,
} from '../utils/programCurrency';

const toYmd = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

let ratesRequest = null;

/**
 * Курс НБУ на сьогодні — один запит на вкладку, спільний для всіх рядків.
 *
 * Той самий виклик, яким курс бере Flow (`fetchNbuUahExchangeRatesByDate`), з
 * денним кешем у `localStorage`. Якщо НБУ ще не опублікував курс на сьогодні
 * (ранок вихідного), береться вчорашній — дату курсу екран однаково
 * показує поруч з еквівалентом.
 */
const loadProgramRates = () => {
  if (ratesRequest) return ratesRequest;
  const today = new Date();
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  ratesRequest = fetchNbuUahExchangeRatesByDate(toYmd(today))
    .catch(() => fetchNbuUahExchangeRatesByDate(toYmd(yesterday)))
    .then(rates => {
      setProgramRates(rates);
      return getProgramRates();
    })
    .catch(error => {
      // Без курсу показується сама сума агенції — вигаданий еквівалент гірший.
      console.warn('[programs] не вдалося прочитати курс НБУ', error);
      ratesRequest = null;
      return null;
    });
  return ratesRequest;
};

export const useProgramRates = (enabled = true) => {
  const [rates, setRates] = useState(getProgramRates);
  useEffect(() => subscribeProgramRates(setRates), []);
  useEffect(() => {
    if (enabled && !getProgramRates()) loadProgramRates();
  }, [enabled]);
  return rates;
};

const DISPLAY_CURRENCY_KEY = 'programsDisplayCurrency';
const displayListeners = new Set();

const readDisplayCurrency = () => {
  try {
    return normalizeProgramCurrency(window.localStorage.getItem(DISPLAY_CURRENCY_KEY)) || DEFAULT_PROGRAM_CURRENCY;
  } catch {
    return DEFAULT_PROGRAM_CURRENCY;
  }
};

/**
 * У якій валюті читач хоче бачити діапазон виплат. Одна на весь застосунок і
 * памʼятається браузером: донорка, яка рахує в гривнях, не мусить щоразу
 * перемикати кожну картку.
 */
export const useProgramDisplayCurrency = () => {
  const [currency, setCurrency] = useState(readDisplayCurrency);
  useEffect(() => {
    displayListeners.add(setCurrency);
    return () => displayListeners.delete(setCurrency);
  }, []);
  const update = useCallback(next => {
    const code = normalizeProgramCurrency(next) || DEFAULT_PROGRAM_CURRENCY;
    try {
      window.localStorage.setItem(DISPLAY_CURRENCY_KEY, code);
    } catch {
      // приватне вікно: вибір живе до перезавантаження
    }
    displayListeners.forEach(listener => listener(code));
  }, []);
  return [currency, update];
};
