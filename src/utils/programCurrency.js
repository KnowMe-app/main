/**
 * Гроші в програмах агенцій і клінік: одна сума — три валюти.
 *
 * Агенція пише виплату так, як звикла: хтось у доларах, хтось у євро, хтось у
 * гривнях. Донорка ж порівнює пропозиції між собою, і «1 600 $» поруч із
 * «1 500 €» без перерахунку читається як «перша більша», хоча це не так.
 * Звідси три правила:
 *
 * - **Сума зберігається в тій валюті, у якій її ввели** (`{ amount, currency }`),
 *   і показується першою, без «≈»: це зобовʼязання агенції, а не наша оцінка.
 * - **Еквіваленти рахуються за офіційним курсом НБУ на сьогодні** — тим самим,
 *   яким рахує Flow (`fetchNbuUahExchangeRatesByDate`), — і завжди з «≈» та
 *   датою курсу. Власного курсу агенція задати не може: саме так і з'являються
 *   «уловки по ціні».
 * - **Немає курсу — немає еквівалента.** Вигадане число гірше за його
 *   відсутність: без курсу показується лише сума в оригіналі.
 *
 * Модуль чистий — жодного запиту. Курс приносить хук `useProgramRates` і
 * кладе сюди (`setProgramRates`), а фільтр, сортування й показ читають його
 * звідси, щоб усі три рахували тим самим числом.
 */

export const PROGRAM_CURRENCIES = Object.freeze(['USD', 'EUR', 'UAH']);

export const PROGRAM_CURRENCY_SIGNS = Object.freeze({ USD: '$', EUR: '€', UAH: '₴' });

export const DEFAULT_PROGRAM_CURRENCY = 'USD';

export const normalizeProgramCurrency = value => {
  const code = String(value || '').trim().toUpperCase();
  if (code === '$' || code === 'USD') return 'USD';
  if (code === '€' || code === 'EUR') return 'EUR';
  if (code === '₴' || code === 'UAH' || code === 'ГРН') return 'UAH';
  return '';
};

/** Сума з поля введення: пробіли, коми й «k» не мають її ламати. */
export const parseProgramAmount = value => {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? Math.round(value) : null;
  const text = String(value ?? '').trim().toLowerCase().replace(/\s| | /g, '');
  if (!text) return null;
  const thousands = /^(\d+(?:[.,]\d+)?)k$/.exec(text);
  const digits = text.replace(/[^\d.,]/g, '');
  // «19.000 €» і «1,600 $» у чатах агенцій — це тисячі, а не дроби: крапка чи
  // кома перед рівно трьома цифрами розділяє розряди.
  const grouped = /^\d{1,3}([.,]\d{3})+$/.test(digits);
  const n = thousands
    ? Number(thousands[1].replace(',', '.')) * 1000
    : Number(grouped ? digits.replace(/[.,]/g, '') : digits.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};

/** `{ amount, currency }` або `null`, якщо суми немає. */
export const normalizeProgramMoney = money => {
  if (!money || typeof money !== 'object') return null;
  const amount = parseProgramAmount(money.amount);
  if (!amount) return null;
  return { amount, currency: normalizeProgramCurrency(money.currency) || DEFAULT_PROGRAM_CURRENCY };
};

let ratesSnapshot = null;
const listeners = new Set();

/**
 * Курс НБУ: скільки гривень коштує одиниця валюти (`{ usd, eur, rateDate }`).
 * Та сама форма, яку вертає `fetchNbuUahExchangeRatesByDate`.
 */
export const setProgramRates = rates => {
  const usd = Number(rates?.usd);
  const eur = Number(rates?.eur);
  ratesSnapshot = usd > 0 && eur > 0 ? { usd, eur, rateDate: rates?.rateDate || '' } : null;
  listeners.forEach(listener => listener(ratesSnapshot));
};

export const getProgramRates = () => ratesSnapshot;

export const subscribeProgramRates = listener => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const uahPerUnit = (currency, rates) => {
  if (currency === 'UAH') return 1;
  if (!rates) return null;
  if (currency === 'USD') return rates.usd;
  if (currency === 'EUR') return rates.eur;
  return null;
};

/** Перерахунок через гривню за курсом НБУ; `null`, коли курсу немає. */
export const convertProgramAmount = (amount, from, to, rates = ratesSnapshot) => {
  const value = Number(amount);
  if (!Number.isFinite(value)) return null;
  const source = normalizeProgramCurrency(from);
  const target = normalizeProgramCurrency(to);
  if (!source || !target) return null;
  if (source === target) return value;
  const fromUah = uahPerUnit(source, rates);
  const toUah = uahPerUnit(target, rates);
  if (!fromUah || !toUah) return null;
  return (value * fromUah) / toUah;
};

/**
 * Округлення еквівалента: до десятків для валюти, до сотень для гривні.
 * Точність до долара тут брехала б — курс сам по собі наближений.
 */
const roundEquivalent = (value, currency) => {
  const step = currency === 'UAH' ? 100 : 10;
  return Math.round(value / step) * step;
};

const groupDigits = value => String(Math.round(Math.abs(value)))
  .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/** «20 000 $», «1 500 €», «65 000 ₴». */
export const formatProgramMoney = (amount, currency) => {
  const code = normalizeProgramCurrency(currency) || DEFAULT_PROGRAM_CURRENCY;
  const value = Number(amount);
  if (!Number.isFinite(value)) return '';
  return `${groupDigits(value)} ${PROGRAM_CURRENCY_SIGNS[code]}`;
};

/**
 * Сума в усіх трьох валютах: оригінал першим, далі еквіваленти з «≈».
 * Кожен рядок — окремий запис, щоб екран сам вирішив, як їх розкласти.
 */
export const describeProgramMoney = (money, rates = ratesSnapshot) => {
  const normalized = normalizeProgramMoney(money);
  if (!normalized) return null;
  const { amount, currency } = normalized;
  const equivalents = PROGRAM_CURRENCIES
    .filter(code => code !== currency)
    .map(code => {
      const converted = convertProgramAmount(amount, currency, code, rates);
      return converted === null ? null : { currency: code, amount: roundEquivalent(converted, code), text: `≈ ${formatProgramMoney(roundEquivalent(converted, code), code)}` };
    })
    .filter(Boolean);
  return {
    amount,
    currency,
    text: formatProgramMoney(amount, currency),
    equivalents,
    rateDate: equivalents.length ? rates?.rateDate || '' : '',
  };
};

/**
 * Сума у валюті, яку обрав читач: оригінал, якщо валюта та сама, інакше
 * еквівалент із «≈». Для рядка стрічки, де місця на три валюти немає.
 */
export const formatProgramMoneyIn = (money, displayCurrency, rates = ratesSnapshot) => {
  const normalized = normalizeProgramMoney(money);
  if (!normalized) return '';
  const target = normalizeProgramCurrency(displayCurrency) || normalized.currency;
  if (target === normalized.currency) return formatProgramMoney(normalized.amount, target);
  const converted = convertProgramAmount(normalized.amount, normalized.currency, target, rates);
  if (converted === null) return formatProgramMoney(normalized.amount, normalized.currency);
  return `≈ ${formatProgramMoney(roundEquivalent(converted, target), target)}`;
};

/** Сума в доларах для порівняння (сортування, фільтр); `null` без курсу. */
export const programMoneyInUsd = (money, rates = ratesSnapshot) => {
  const normalized = normalizeProgramMoney(money);
  if (!normalized) return null;
  return convertProgramAmount(normalized.amount, normalized.currency, 'USD', rates);
};

/** Дата курсу для підпису: «2026-09-30» → «30.09.2026». */
export const formatRateDate = value => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
  if (match) return `${match[3]}.${match[2]}.${match[1]}`;
  const dotted = /^(\d{2})\.(\d{2})\.(\d{4})/.exec(String(value || ''));
  return dotted ? `${dotted[1]}.${dotted[2]}.${dotted[3]}` : '';
};
