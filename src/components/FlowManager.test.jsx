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
