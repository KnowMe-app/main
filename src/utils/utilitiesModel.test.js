import {
  buildTenantText,
  computeMonth,
  evalUtilityExpr,
  fieldStatus,
  listCarryFields,
  listMissing,
  listSuggestions,
  parseDmy,
  paymentDateLabel,
  resolveOpenMonth,
  listHistoryMonths,
  renderTemplateText,
  DEFAULT_TENANT_TEMPLATE,
} from './utilitiesModel';
import {
  applyUtilitiesPatch,
  buildInverseUtilitiesPatch,
  countPendingUtilitiesWrites,
  overlayPendingUtilitiesWrites,
} from './utilitiesOfflineWrites';
import { buildApartmentSheets, buildExportFileName } from './utilitiesExport';

// Дані з таблиці власниці: кв. 645, вересень і жовтень 2026.
const vals = (day, night, water) => ({
  light: { day: { cur: String(day) }, night: { cur: String(night) }, tDay: '4.32', tNight: '2.16' },
  water: { cur: String(water), t: '63.792' },
  zhek: { e: '1340-571.13' },
  inet: { e: '250' },
});

const buildData = () => ({
  apartments: {
    a645: {
      name: 'кв. 645',
      payDay: 19,
      order: 1,
      cats: {
        light: { name: 'Світло', type: 'meter2', unit: 'кВт·год', order: 1 },
        water: { name: 'Вода', type: 'meter', unit: 'м³', order: 2 },
        zhek: { name: 'ЖЕК', type: 'sum', order: 3 },
        inet: { name: 'Інтернет', type: 'sum', order: 4 },
      },
      init: { date: '2026-09-01', vals: { light: { day: { cur: 1881 }, night: { cur: 869 } }, water: { cur: 65 } } },
    },
    a646: { name: 'кв. 646', order: 2, cats: { light: { name: 'Світло', type: 'meter2', unit: 'кВт·год', order: 1 } } },
  },
  months: {
    a645: {
      '2026-09': { date: '2026-09-22', closed: true, vals: vals(2120, 937, 74), budget: '3500', carry: false, extras: { x1: { label: 'Різниця оплати', e: '23240-23233.15', kind: 'credit', order: 1 } } },
      '2026-10': { date: '2026-10-31', closed: true, vals: vals(2456, 1059, 84), budget: '3500', carry: false, extras: { x1: { label: 'Різниця оплати', e: '24000-23730.87', kind: 'credit', order: 1 } } },
    },
  },
});

const month = (data, mk) => ({ ...data.months.a645[mk], mk, aptId: 'a645' });

describe('evalUtilityExpr', () => {
  it('рахує вираз як клітинка Excel і не виконує чужого', () => {
    expect(evalUtilityExpr('1340-571.13')).toBeCloseTo(768.87);
    expect(evalUtilityExpr('299/31*30')).toBeCloseTo(289.3548, 3);
    expect(evalUtilityExpr('(1128,84-63,79)/30*2')).toBeCloseTo(71.0033, 3);
    expect(evalUtilityExpr('')).toBeNull();
    expect(Number.isNaN(evalUtilityExpr('alert(1)'))).toBe(true);
    expect(Number.isNaN(evalUtilityExpr('2+'))).toBe(true);
  });

  it('розуміє знаки з калькулятора: ×, ÷, −, «=» на початку', () => {
    expect(evalUtilityExpr('1340 − 571,13')).toBeCloseTo(768.87);
    expect(evalUtilityExpr('299÷31×30')).toBeCloseTo(289.3548, 3);
    expect(evalUtilityExpr('=250*2')).toBe(500);
  });
});

describe('computeMonth', () => {
  it('жовтень кв. 645 дає ту саму переплату, що й таблиця (397,30)', () => {
    const data = buildData();
    const result = computeMonth(data, month(data, '2026-10'));
    expect(result.blocks[0].sum).toBeCloseTo(1715.04, 2);
    expect(result.blocks[1].sum).toBeCloseTo(637.92, 2);
    expect(result.cost).toBeCloseTo(3371.83, 2);
    expect(result.result).toBeCloseTo(397.3, 2);
  });

  it('перший місяць бере «було» з початкових показників, а ручне «було» — сильніше', () => {
    const data = buildData();
    const september = computeMonth(data, month(data, '2026-09'));
    expect(september.blocks[0].zones[0].prev).toMatchObject({ value: 1881, source: 'init' });
    expect(september.result).toBeCloseTo(734.49, 2);
    data.months.a645['2026-10'].vals.light.day.prev = '2000';
    const october = computeMonth(data, month(data, '2026-10'));
    expect(october.blocks[0].zones[0].prev).toMatchObject({ value: 2000, source: 'manual' });
  });

  it('залишок минулого місяця йде в бюджет лише з явним «перенести»', () => {
    const data = buildData();
    data.months.a645['2026-10'].carry = true;
    const october = computeMonth(data, month(data, '2026-10'));
    expect(october.carried).toBeCloseTo(734.49, 2);
    expect(october.result).toBeCloseTo(397.3 + 734.49, 2);
  });
});

describe('новий місяць', () => {
  it('порожній наступний місяць існує лише на екрані й просить усе, чого бракує', () => {
    const data = buildData();
    const open = resolveOpenMonth(data, 'a645', { today: '2026-11-20' });
    expect(open).toMatchObject({ mk: '2026-11', virtual: true, date: '2026-11-20' });
    // Минулий місяць — його останній день, а не сьогодні.
    expect(resolveOpenMonth({ ...data, months: {} }, 'a645', { today: '2026-11-20' })).toMatchObject({ mk: '2026-09', date: '2026-09-30' });
    const missing = listMissing(open, computeMonth(data, open));
    expect(missing).toEqual(expect.arrayContaining(['Світло день — показник', 'ЖЕК', 'бюджет']));
  });

  it('закритий місяць іде в попередні, а наступний — порожній', () => {
    const data = buildData();
    expect(resolveOpenMonth(data, 'a645', { today: '2026-11-19' })).toMatchObject({ mk: '2026-11', virtual: true, vals: {} });
    // Незакритий лишається поточним, хоч і заповнений.
    data.months.a645['2026-10'].closed = false;
    expect(resolveOpenMonth(data, 'a645', { today: '2027-03-01' })).toMatchObject({ mk: '2026-10', virtual: false });
    expect(listHistoryMonths(data, 'a645', '2026-10').map(m => m.mk)).toEqual(['2026-09']);
  });

  it('переносить з минулого місяця й пропонує новий тариф з іншої квартири', () => {
    const data = buildData();
    data.months.a646 = { '2026-11': { vals: { light: { tDay: '4.8' } } } };
    const open = resolveOpenMonth(data, 'a645', { today: '2026-11-20' });
    const field = listCarryFields(data.apartments.a645).find(item => item.path === 'vals.light.tDay');
    const suggestions = listSuggestions(data, open, field);
    expect(suggestions.map(item => item.label.replace(/\u00a0/g, ' '))).toEqual(['4,32 — як у жовтні', '4,8 — як у кв. 646']);
  });

  it('позначка «без змін» / «змінено · було»', () => {
    const data = buildData();
    const open = { ...resolveOpenMonth(data, 'a645', { today: '2026-11-20' }), vals: { zhek: { e: '768.87' }, inet: { e: '300' } } };
    expect(fieldStatus(data, open, 'vals.zhek.e').kind).toBe('same');
    expect(fieldStatus(data, open, 'vals.inet.e')).toMatchObject({ kind: 'changed', prevValue: '250' });
    expect(fieldStatus(data, open, 'budget').kind).toBe('empty');
  });

  it('текст для орендаря несе розрахунок і переплату', () => {
    const data = buildData();
    const october = month(data, '2026-10');
    // uk-UA ділить тисячі нерозривним пробілом — для звірки він звичайний.
    const text = buildTenantText(data.apartments.a645, october, computeMonth(data, october)).replace(/\u00a0/g, ' ');
    expect(text).toContain('кв. 645 · жовтень 2026 (показники 31.10)');
    expect(text).toContain('день 2 120→2 456 = 336 кВт·год × 4,32 = 1 451,52 ₴');
    expect(text).toContain('Переплата: 397,30 ₴');
    expect(paymentDateLabel(data.apartments.a645, '2026-10')).toBe('19.11');
  });

  it('текст для орендаря — шаблон: свої слова, числа з тегів', () => {
    const data = buildData();
    const october = month(data, '2026-10');
    const computed = computeMonth(data, october);
    const apt = { ...data.apartments.a645, tenantTemplate: 'Добрий день! За {{місяць}}: світло {{світло}} ₴, разом {{разом}} ₴.\n{{коригування}}\n{{Залишок_підпис}} {{залишок}} ₴' };
    const text = buildTenantText(apt, october, computed).replace(/\u00a0/g, ' ');
    expect(text).toContain('Добрий день! За жовтень 2026: світло 1 715,04 ₴, разом 3 371,83 ₴.');
    expect(text).toContain('Різниця оплати: +269,13 ₴');
    expect(text).toMatch(/\nПереплата 397,30 ₴$/);
    // Порожній необовʼязковий тег знімає свій рядок, невідомий — лишається.
    expect(renderTemplateText('a\n{{коригування}}\n{{невідомо}}', DEFAULT_TENANT_TEMPLATE, { tokens: { коригування: '' }, optional: new Set(['коригування']) })).toBe('a\n{{невідомо}}');
  });

  it('дата дд.мм.рррр — лише справжня', () => {
    expect(parseDmy('17.11.2026')).toBe('2026-11-17');
    expect(parseDmy('31.02.2026')).toBeNull();
  });
});

describe('зауваження рецензії', () => {
  it('прибраний блок лишається в закритих місяцях, а з поточного зникає', () => {
    const data = buildData();
    data.apartments.a645.cats.water.retiredFrom = '2026-11';
    const october = computeMonth(data, month(data, '2026-10'));
    expect(october.result).toBeCloseTo(397.3, 2);
    const open = resolveOpenMonth(data, 'a645', { today: '2026-11-20' });
    expect(computeMonth(data, open).blocks.map(block => block.cat.key)).not.toContain('water');
    // Блок, доданий посеред року, минулих місяців не чіпає.
    data.apartments.a645.cats.gas = { name: 'Газ', type: 'sum', order: 5, since: '2026-11' };
    expect(computeMonth(data, month(data, '2026-10')).blocks.map(block => block.cat.key)).not.toContain('gas');
    expect(computeMonth(data, open).blocks.map(block => block.cat.key)).toContain('gas');
  });

  it('недописане коригування не дає закрити місяць', () => {
    const data = buildData();
    const october = { ...month(data, '2026-10'), extras: { x1: { label: 'Сміття', e: '250+', kind: 'charge' } } };
    expect(listMissing(october, computeMonth(data, october))).toContain('коригування «Сміття» — сума');
  });

  it('недописане «було вручну» не дає закрити місяць', () => {
    const data = buildData();
    const october = month(data, '2026-10');
    october.vals = { ...october.vals, water: { ...october.vals.water, prev: '10+' } };
    expect(listMissing(october, computeMonth(data, october))).toContain('Вода — «було»');
  });

  it('експорт тримає колонки прибраного блоку', () => {
    const data = buildData();
    data.apartments.a645.cats.water.retiredFrom = '2026-10';
    const [header, september, october] = buildApartmentSheets(data, 'a645').months;
    expect(september.length).toBe(header.length);
    expect(october.length).toBe(header.length);
    expect(september[header.indexOf('Вода: сума, ₴')]).toBeCloseTo(574.13, 2);
    expect(october[header.indexOf('Вода: сума, ₴')]).toBe('');
  });
});

describe('utilitiesOfflineWrites', () => {
  const owner = 'u1';
  const root = 'multiData/utilities/u1';

  it('накладає латку й рахує латку навпаки для «Назад»', () => {
    const before = { months: { a: { '2026-11': { budget: '3500' } } } };
    const patch = { [`${root}/months/a/2026-11/budget`]: '3600', [`${root}/months/a/2026-11/vals/inet/e`]: '250' };
    const after = applyUtilitiesPatch(before, patch, owner);
    expect(after.months.a['2026-11']).toEqual({ budget: '3600', vals: { inet: { e: '250' } } });
    const inverse = buildInverseUtilitiesPatch(before, patch, owner);
    expect(applyUtilitiesPatch(after, inverse, owner)).toEqual(before);
  });

  it('недоставлене з черги лягає поверх відповіді бази, чуже — ні', () => {
    const patches = [{ [`${root}/apartments/a/name`]: 'кв. 1' }, { 'multiData/utilities/u2/apartments/a/name': 'чуже' }];
    expect(overlayPendingUtilitiesWrites({}, owner, patches)).toEqual({ apartments: { a: { name: 'кв. 1' } } });
    expect(countPendingUtilitiesWrites(owner, patches)).toBe(1);
  });
});

describe('utilitiesExport', () => {
  it('аркуш «Місяці» несе показники, тарифи й результат кожного місяця', () => {
    const sheets = buildApartmentSheets(buildData(), 'a645');
    const [header, september, october] = sheets.months;
    expect(header).toEqual(expect.arrayContaining(['Світло день: було', 'Вода: тариф', 'ЖЕК, ₴', 'Результат, ₴']));
    expect(september[0]).toBe('вересень 2026');
    expect(october[header.indexOf('Результат, ₴')]).toBeCloseTo(397.3, 2);
    expect(october[header.indexOf('ЖЕК — як записано')]).toBe('1340-571.13');
    expect(sheets.settings[0]).toEqual(['Квартира', 'кв. 645']);
    expect(buildExportFileName('кв. 645/1', '2026-11-17')).toBe('Комуналка — кв. 645 1 — 2026-11-17.xlsx');
  });
});

describe('payment for the next month', () => {
  const { buildPaymentValues, renderPaymentText, DEFAULT_PAYMENT_TEMPLATE } = require('./utilitiesModel');
  const apt = { name: 'Кв', payDay: 19 };

  it('rent + budget − overpayment, as in the owner message', () => {
    const values = buildPaymentValues(apt, { mk: '2026-10', rent: '21000' }, { budgetSet: true, budget: 3500, result: 831.54 });
    expect(renderPaymentText(null, values)).toBe([
      'Розрахунок платежу:',
      '+21000 (оренда)',
      '+3500 (приблизна комуналка)',
      '-831,54 (переплата)',
      '= 23668,46 грн платіж на IBAN.',
      '',
      'Призначення і номер рахунку без змін',
    ].join('\n'));
    expect(DEFAULT_PAYMENT_TEMPLATE).toContain('{{платіж}}');
  });

  it('debt adds to the payment, zero balance drops its line, own text stays', () => {
    const debt = buildPaymentValues(apt, { mk: '2026-10', rent: 21000 }, { budgetSet: true, budget: 3500, result: -200 });
    expect(renderPaymentText('{{залишок}} ({{залишок_підпис}}) → {{платіж}} до {{дата_платежу}}', debt)).toBe('+200 (борг) → 24700 до 19.11');
    const zero = buildPaymentValues(apt, { mk: '2026-10', rent: 21000 }, { budgetSet: true, budget: 3500, result: 0 });
    expect(renderPaymentText('a\n{{залишок}} x\n={{платіж}} {{невідомо}}', zero)).toBe('a\n=24500 {{невідомо}}');
  });

  it('no rent — no payment', () => {
    expect(buildPaymentValues(apt, { mk: '2026-10' }, { budgetSet: true, budget: 3500, result: 0 })).toBeNull();
  });
});
