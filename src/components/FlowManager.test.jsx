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
