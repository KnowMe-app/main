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

const { parseFlowEntryLine } = require('./FlowManager');

describe('parseFlowEntryLine', () => {
  it('keeps dollar-only formulas as a persistable USD formula amount', () => {
    expect(parseFlowEntryLine('=$ lunch', '2026-07-07')).toMatchObject({
      amount: '=USD',
      description: 'lunch',
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
