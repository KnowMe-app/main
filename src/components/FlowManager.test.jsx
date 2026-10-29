import { TextDecoder, TextEncoder } from 'util';

global.TextDecoder = TextDecoder;
global.TextEncoder = TextEncoder;

jest.mock('./config', () => ({
  deleteFlowEntry: jest.fn(),
  deleteFlowCategory: jest.fn(),
  renameFlowCategory: jest.fn(),
  clearFlowData: jest.fn(),
  fetchFlowData: jest.fn(),
  fetchMonobankUahExchangeRates: jest.fn(),
  fetchNbuUahExchangeRatesByDate: jest.fn(),
  resolveFlowExchangeRatesForMode: jest.fn(),
  saveFlowEntry: jest.fn(),
  updateFlowEntry: jest.fn(),
}));

const {
  calculateFlowRowCurrencyAmount,
  flattenFlowEntriesFromBackend,
  getFlowRowDisplayCurrency,
  parseFlowEntryLine,
  sumFlowCategoryTotals,
} = require('./FlowManager');

describe('parseFlowEntryLine', () => {
  it('keeps dollar-only formulas as a persistable USD formula amount', () => {
    expect(parseFlowEntryLine('=$ lunch', '2026-07-07')).toMatchObject({
      amount: '=USD',
      description: 'lunch',
    });
  });

  it('keeps division operators inside formula amounts while parsing a line', () => {
    expect(parseFlowEntryLine('08.07.2026 =(86000-(86000*6/100)-100) Лена', '2026-07-07')).toMatchObject({
      date: '2026-07-08',
      amount: '=(86000-(86000*6/100)-100)',
      description: 'Лена',
    });
  });

  it('keeps division operators inside persisted object formula amounts', () => {
    expect(
      flattenFlowEntriesFromBackend({
        general: {
          '2026-07-08': {
            abc: {
              amount: '=(86000-(86000*6/100)-100)',
              description: 'Лена',
            },
          },
        },
      })[0]
    ).toMatchObject({
      date: '2026-07-08',
      amount: '=(86000-(86000*6/100)-100)',
      description: 'Лена',
    });
  });

  it('accepts currency tokens after localized formula operators', () => {
    expect(parseFlowEntryLine('=100×USD rent', '2026-07-07')).toMatchObject({
      amount: '=100×USD',
      description: 'rent',
    });
    expect(parseFlowEntryLine('=100÷EUR coffee', '2026-07-07')).toMatchObject({
      amount: '=100÷EUR',
      description: 'coffee',
    });
  });
});

describe('calculateFlowRowCurrencyAmount', () => {
  const { resolveFlowExchangeRatesForMode } = require('./config');

  it('converts negative amounts the same way as positive ones', () => {
    resolveFlowExchangeRatesForMode.mockReturnValue({ usd: 40, eur: 44 });
    const options = {
      currency: 'usd',
      exchangeRateMode: 'mono',
      exchangeRates: { usd: 40, eur: 44 },
      historicalRatesByDate: {},
      customUsdRate: '',
    };
    expect(calculateFlowRowCurrencyAmount({ ...options, row: { amount: '500' } })).toBe(12.5);
    expect(calculateFlowRowCurrencyAmount({ ...options, row: { amount: '-500' } })).toBe(-12.5);
  });

  it('keeps stored negative currency amounts when no rate is available', () => {
    resolveFlowExchangeRatesForMode.mockReturnValue(null);
    const options = {
      currency: 'usd',
      exchangeRateMode: 'mono',
      exchangeRates: null,
      historicalRatesByDate: {},
      customUsdRate: '',
    };
    expect(calculateFlowRowCurrencyAmount({ ...options, row: { amount: '-500', amountUsd: '-12.5' } })).toBe(-12.5);
    expect(calculateFlowRowCurrencyAmount({ ...options, row: { amount: '500', amountUsd: '12.5' } })).toBe(12.5);
  });
});

describe('per-row exchange rate currency', () => {
  const { resolveFlowExchangeRatesForMode } = require('./config');

  it('reads a trailing rate as dollars unless EUR or € follows the number', () => {
    expect(parseFlowEntryLine('07.10.2026 27981.29 кавоварка курс 50.75', '2026-10-07')).toMatchObject({
      amount: '27981.29',
      description: 'кавоварка',
      customUsdRate: '50.75',
      customEurRate: '',
    });
    ['курс 50.75 EUR', 'курс 50.75€', 'курс 50,75 €', 'курс EUR 50.75', 'курс євро 50.75', '€ 50.75', '1€=50.75', '50.75 грн/€'].forEach(
      suffix => {
        expect(parseFlowEntryLine(`07.10.2026 27981.29 кавоварка ${suffix}`, '2026-10-07')).toMatchObject({
          description: 'кавоварка',
          customUsdRate: '',
          customEurRate: '50.75',
        });
      }
    );
    expect(parseFlowEntryLine('07.10.2026 100 кава курс 41 $', '2026-10-07')).toMatchObject({
      customUsdRate: '41',
      customEurRate: '',
    });
  });

  it('applies a EUR rate only to euros and counts every currency from the raw UAH amount', () => {
    resolveFlowExchangeRatesForMode.mockReturnValue({ usd: 40, eur: 50 });
    const options = {
      exchangeRateMode: 'mono',
      exchangeRates: { usd: 40, eur: 50 },
      historicalRatesByDate: {},
      customUsdRate: '',
    };
    const eurRow = { amount: '1015', customEurRate: '50.75' };
    const usdRow = { amount: '1015', customUsdRate: '40.6' };

    expect(getFlowRowDisplayCurrency(eurRow)).toBe('eur');
    expect(getFlowRowDisplayCurrency(usdRow)).toBe('usd');
    // Курс, вписаний у рядок, — свідомий вибір валюти, і перемикач угорі його не перебиває.
    expect(getFlowRowDisplayCurrency(eurRow, 'usd')).toBe('eur');
    expect(getFlowRowDisplayCurrency(usdRow, 'eur')).toBe('usd');
    expect(getFlowRowDisplayCurrency({ amount: '1015' }, 'eur')).toBe('eur');
    expect(getFlowRowDisplayCurrency({ amount: '1015' }, 'usd')).toBe('usd');
    expect(getFlowRowDisplayCurrency({ amount: '1015' })).toBe('usd');
    expect(calculateFlowRowCurrencyAmount({ ...options, row: eurRow, currency: 'eur' })).toBe(20);
    expect(calculateFlowRowCurrencyAmount({ ...options, row: eurRow, currency: 'usd' })).toBe(25.375);
    expect(calculateFlowRowCurrencyAmount({ ...options, row: usdRow, currency: 'usd' })).toBe(25);
    expect(calculateFlowRowCurrencyAmount({ ...options, row: usdRow, currency: 'eur' })).toBe(20.3);
  });

  it('restores the EUR rate marker from the stored amount', () => {
    const rows = flattenFlowEntriesFromBackend({
      general: {
        '2026-10-07': {
          a: '1015 25.38 20.00 50.75EUR_кава',
          b: '1015 25.00 20.30 40.60_чай',
        },
      },
    });
    expect(rows.find(row => row.entryId === 'a')).toMatchObject({ customUsdRate: '', customEurRate: '50.75' });
    expect(rows.find(row => row.entryId === 'b')).toMatchObject({ customUsdRate: '40.6', customEurRate: '' });
  });
});

describe('sumFlowCategoryTotals', () => {
  const { resolveFlowExchangeRatesForMode } = require('./config');

  // Група «Мама» на проді: 0 грн, 0 $ і водночас 2.48 €, бо рядок 07.10 мав
  // власний курс 50.75 €, а решта йшли за поточним 50.98.
  it('keeps a per-row rate out of the group total', () => {
    resolveFlowExchangeRatesForMode.mockReturnValue({ usd: 41.6, eur: 50.98 });
    const rows = [
      { group: 'Мама', date: '2026-10-01', amount: '2221.73' },
      { group: 'Мама', date: '2026-10-02', amount: '48439' },
      { group: 'Мама', date: '2026-10-07', amount: '27981.29', customEurRate: '50.75' },
      { group: 'Мама', date: '2026-10-08', amount: '20000' },
      { group: 'Мама', date: '2026-10-24', amount: '3104' },
      { group: 'Мама', date: '2026-10-29', amount: '-101746.02' },
    ];
    const options = { exchangeRateMode: 'current', exchangeRates: { usd: 41.6, eur: 50.98 }, historicalRatesByDate: {}, customUsdRate: '' };
    const totals = sumFlowCategoryTotals({ ...options, rows }).Мама;
    expect(totals.uah).toBeCloseTo(0, 6);
    expect(totals.usd).toBeCloseTo(0, 6);
    expect(totals.eur).toBeCloseTo(0, 6);
    // Еквівалент самого рядка курс і далі тримає.
    expect(calculateFlowRowCurrencyAmount({ ...options, row: rows[2], currency: 'eur' })).toBeCloseTo(551.36, 2);
  });

  it('still totals at the global dollar rate', () => {
    resolveFlowExchangeRatesForMode.mockReturnValue({ usd: 40, eur: 50 });
    const totals = sumFlowCategoryTotals({
      rows: [{ group: 'g', date: '2026-10-01', amount: '1000' }, { group: 'g', date: '2026-10-02', amount: '600', customUsdRate: '30' }],
      exchangeRateMode: 'current',
      exchangeRates: { usd: 40, eur: 50 },
      historicalRatesByDate: {},
      customUsdRate: '32',
    }).g;
    expect(totals.uah).toBe(1600);
    expect(totals.usd).toBeCloseTo(50, 6);
    expect(totals.eur).toBeCloseTo(32, 6);
  });
});
