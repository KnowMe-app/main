import { buildFlowImportText } from './flowImport';
import { parseFlowEntryLine } from 'utils/flowEntries';

const sample = {
  schemaVersion: 1,
  currency: 'UAH',
  datePolicy: { textImportFallbackDate: '2026-11-16' },
  tables: [
    {
      groupPath: 'Витрати 154 та 112',
      entries: [
        { date: null, amount: 244.9, description: 'грунтовка', side: 'expense' },
        { date: '2025-08-08', amount: 74, description: 'розетка  для роутера', side: 'expense' },
      ],
    },
    {
      groupPath: 'Двері 154 та 112',
      entries: [
        { date: null, amount: 18679, description: 'Двері в 154 + 112.', side: 'expense' },
        { date: '2025-02-03', amount: 18679, description: 'перекинула Саші', side: 'receipt_or_transfer' },
        { date: '2025-02-04', amount: 0, description: 'порожнє', side: 'expense' },
      ],
    },
  ],
};

describe('buildFlowImportText', () => {
  it('JSON таблиць стає текстом Flow, який розбирає сам Flow', () => {
    const result = buildFlowImportText(JSON.stringify(sample), { fileName: 'x.json' });
    expect(result.format).toBe('json');
    expect(result.entryCount).toBe(4);
    expect(result.undatedCount).toBe(2);
    expect(result.skippedCount).toBe(1);
    expect(result.text).toBe([
      '[Витрати 154 та 112]',
      '01.01.2026 244.9 грунтовка',
      '08.08.2025 74 розетка для роутера',
      '',
      '[Двері 154 та 112/Витрати]',
      '01.01.2026 18679 Двері в 154 + 112.',
      '',
      '[Двері 154 та 112/Перекази]',
      '03.02.2025 18679 перекинула Саші',
    ].join('\n'));

    const parsed = result.text
      .split('\n')
      .filter(line => line && !line.startsWith('['))
      .map(line => parseFlowEntryLine(line, '2026-11-16'));
    expect(parsed.every(Boolean)).toBe(true);
    expect(parsed[0]).toMatchObject({ date: '2026-01-01', amount: '244.9' });
    expect(parsed[1]).toMatchObject({ date: '2025-08-08', amount: '74' });
  });

  it('неіснуюча дата — як відсутня, а не заголовок групи', () => {
    const result = buildFlowImportText(
      JSON.stringify({ tables: [{ groupPath: 'G', entries: [
        { date: '2025-02-29', amount: 5, description: 'a' },
        { date: '2025-03-01', amount: 6, description: 'b' },
      ] }] }),
      { today: '2025-06-02' }
    );
    expect(result.text).toBe('[G]\n01.01.2025 5 a\n01.03.2025 6 b');
    expect(result.undatedCount).toBe(1);
  });

  it('таблиця з підгрупою й двома сторонами лишається у двох рівнях', () => {
    const result = buildFlowImportText(
      JSON.stringify({ tables: [{ groupPath: 'Дім/Двері', entries: [
        { date: '2025-03-01', amount: 5, description: 'a', side: 'expense' },
        { date: '2025-03-02', amount: 5, description: 'b', side: 'receipt_or_transfer' },
      ] }] }),
      { today: '2025-06-02' }
    );
    expect(result.text).toBe('[Дім/Двері · Витрати]\n01.03.2025 5 a\n\n[Дім/Двері · Перекази]\n02.03.2025 5 b');
  });

  it('без дати в datePolicy бере рік сьогоднішньої дати', () => {
    const result = buildFlowImportText(
      JSON.stringify({ tables: [{ groupPath: 'G', entries: [{ amount: 5, description: 'a' }] }] }),
      { today: '2026-01-02' }
    );
    expect(result.text).toBe('[G]\n01.01.2026 5 a');
  });

  it('текстовий список іде як є', () => {
    const result = buildFlowImportText('﻿[G]\n01.02.2025 10 кава\n', { fileName: 'a.txt' });
    expect(result).toMatchObject({ format: 'text', text: '[G]\n01.02.2025 10 кава' });
  });

  it('чужий JSON — помилка, а не порожній імпорт', () => {
    expect(() => buildFlowImportText('{"a":1}', { fileName: 'a.json' })).toThrow(/tables/);
    expect(() => buildFlowImportText('{oops', { fileName: 'a.json' })).toThrow(/JSON/);
  });
});

describe('generateFlowEntryId', () => {
  it('не повторюється навіть за ту саму мілісекунду', () => {
    // eslint-disable-next-line global-require
    const { generateFlowEntryId } = require('components/config');
    const spy = jest.spyOn(Date, 'now').mockReturnValue(1794850045350);
    const ids = Array.from({ length: 500 }, () => generateFlowEntryId());
    spy.mockRestore();
    expect(new Set(ids).size).toBe(500);
    ids.forEach(id => expect(id).toMatch(/^\d{16}$/));
  });
});
