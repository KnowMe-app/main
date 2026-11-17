import {
  buildLegacyUndatedFlowPatch,
  detectFlowIncomeGroup,
  formatFlowMoney,
  formatFlowMonthLabel,
  groupFlowRowsByMonth,
  listFlowLabelCurrencies,
  searchFlowRows,
  summarizeFlow,
} from './flowView';

describe('flowView', () => {
  it('гроші — розряди й кома', () => {
    expect(formatFlowMoney(60962.22)).toBe('60 962,22');
    expect(formatFlowMoney(1200)).toBe('1 200');
    expect(formatFlowMoney(-186.6)).toBe('−186,60');
    expect(formatFlowMoney(5, { signed: true })).toBe('+5');
  });

  it('валюта міток: жодної, одна чи дві', () => {
    expect(listFlowLabelCurrencies('none')).toEqual([]);
    expect(listFlowLabelCurrencies('eur')).toEqual(['eur']);
    expect(listFlowLabelCurrencies('both')).toEqual(['usd', 'eur']);
    expect(listFlowLabelCurrencies('щось')).toEqual(['usd']);
  });

  it('групу надходжень упізнає назва, вибір важить більше', () => {
    const groups = ['Витрати 154', 'Надходження 154 та 112', 'Податки'];
    expect(detectFlowIncomeGroup(groups)).toBe('Надходження 154 та 112');
    expect(detectFlowIncomeGroup(groups, 'Податки')).toBe('Податки');
    expect(detectFlowIncomeGroup(['Мама'])).toBe('Надходження');
  });

  it('баланс — лише коли обрано надходження', () => {
    const totalsByPath = { 'Витрати': 400, 'Двері/Витрати': 100, 'Надходження': 1000 };
    expect(summarizeFlow({ totalsByPath, incomeGroup: 'Надходження' })).toEqual({ mode: 'expenses', expenses: 500 });
    expect(summarizeFlow({ totalsByPath, incomeGroup: 'Надходження', filter: 'Двері' })).toEqual({ mode: 'group', expenses: 100 });
    expect(summarizeFlow({ totalsByPath, incomeGroup: 'Надходження', filter: 'Надходження' })).toMatchObject({
      mode: 'balance', income: 1000, expenses: 500, balance: 500, profit: true,
    });
  });

  it('місяці — від найновішого, з підсумком', () => {
    const rows = [
      { date: '2026-10-01', amount: '10', entryId: '1' },
      { date: '2026-11-02', amount: '5', entryId: '2' },
      { date: '2026-10-07', amount: '1', entryId: '3' },
    ];
    const months = groupFlowRowsByMonth(rows, row => Number(row.amount));
    expect(months.map(m => [m.key, m.total, m.items.map(r => r.entryId).join()])).toEqual([
      ['2026-11', 5, '2'],
      ['2026-10', 11, '3,1'],
    ]);
    expect(formatFlowMonthLabel('2026-10')).toMatch(/^Жовтень 2026/);
  });

  it('пошук — кожне слово запиту, по описах і сумі', () => {
    const rows = [
      { description: 'Робота плитка ванна, підрізка', group: 'Витрати', amount: '20000' },
      { description: 'штори і покривало', group: 'Витрати', amount: '3935.6' },
    ];
    expect(searchFlowRows(rows, 'ванна плитка')).toHaveLength(1);
    expect(searchFlowRows(rows, 'ШТОРИ')).toHaveLength(1);
    expect(searchFlowRows(rows, '3935')).toHaveLength(1);
    expect(searchFlowRows(rows, '  ')).toEqual([]);
  });

  it('старі записи без дати — на 1 січня, без приписки', () => {
    const data = {
      'Двері': {
        'Витрати': {
          '2026-11-16': { a1: '600 13.15 11.87_Доставка (дата оплати не вказана)', a2: '5_звичайний' },
        },
      },
      'Податки': { '2026-01-01': { b1: '864.7_Податок (дата оплати не вказана)' } },
    };
    const { patch, count } = buildLegacyUndatedFlowPatch(data, 'u1');
    expect(count).toBe(2);
    expect(patch).toEqual({
      'multiData/flow/u1/Двері/Витрати/2026-11-16/a1': null,
      'multiData/flow/u1/Двері/Витрати/2026-01-01/a1': '600 13.15 11.87_Доставка',
      'multiData/flow/u1/Податки/2026-01-01/b1': '864.7_Податок',
    });
  });
});
