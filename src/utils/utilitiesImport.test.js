import { UTILITIES_IMPORT_SAMPLE, planUtilitiesImport } from './utilitiesImport';
import { applyUtilitiesPatch } from './utilitiesOfflineWrites';
import { computeMonth, listApartments, listMonths } from './utilitiesModel';

const OWNER = 'owner-1';
const apply = (data, plan) => applyUtilitiesPatch(
  data,
  Object.fromEntries(Object.entries(plan.patch).map(([rel, value]) => [`multiData/utilities/${OWNER}/${rel}`, value])),
  OWNER,
);

const SIMPLE = {
  apartments: [{
    name: 'кв. 645',
    payDay: 19,
    init: { date: '2026-09-01', light: { day: 1881, night: 869 }, water: 65 },
    months: [
      {
        month: '2026-09', date: '2026-09-22', closed: true,
        light: { day: 2120, night: 937, tariffDay: 4.32, tariffNight: 2.16 },
        water: { reading: 74, tariff: 63.792 },
        zhek: '1340-571.13', inet: 250, budget: 3500, carry: false,
        extras: [{ label: 'Різниця оплати', amount: '23240-23233.15', kind: 'credit' }],
      },
      {
        month: '2026-10', date: '2026-10-31', closed: true,
        light: { day: 2456, night: 1059, tariffDay: 4.32, tariffNight: 2.16 },
        water: { reading: 84, tariff: 63.792 },
        zhek: '1340-571.13', inet: 250, budget: 3500, carry: false,
        extras: [{ label: 'Різниця оплати', amount: '24000-23730.87', kind: 'credit' }],
      },
    ],
  }],
};

describe('planUtilitiesImport', () => {
  it('простий формат дає ті самі підсумки, що й таблиця', () => {
    const plan = planUtilitiesImport(JSON.stringify(SIMPLE), {}, { now: Date.UTC(2026, 10, 17) });
    expect(plan.error).toBeUndefined();
    expect(plan.warnings).toEqual([]);
    expect(plan.summary).toEqual([expect.objectContaining({ name: 'кв. 645', isNew: true, monthCount: 2, replaced: [] })]);
    const data = apply({}, plan);
    const [apt] = listApartments(data);
    const months = listMonths(data, apt.id);
    expect(computeMonth(data, months[0]).result).toBeCloseTo(734.49, 2);
    expect(computeMonth(data, months[1]).result).toBeCloseTo(397.3, 2);
  });

  it('наявну квартиру впізнає за назвою й каже, які місяці замінить', () => {
    const first = apply({}, planUtilitiesImport(JSON.stringify(SIMPLE), {}));
    const [apt] = listApartments(first);
    const again = { apartments: [{ name: '  КВ. 645 ', months: [{ month: '2026-10', budget: 4000 }, { month: '2026-11', budget: 3500 }] }] };
    const plan = planUtilitiesImport(JSON.stringify(again), first);
    expect(plan.summary).toEqual([expect.objectContaining({ aptId: apt.id, isNew: false, monthCount: 2, replaced: ['2026-10'] })]);
    expect(Object.keys(plan.patch).some(key => key.startsWith('apartments/'))).toBe(false);
    const data = apply(first, plan);
    expect(data.months[apt.id]['2026-10'].budget).toBe('4000');
    expect(data.months[apt.id]['2026-11'].budget).toBe('3500');
  });

  it('резервна копія з бази імпортується як є', () => {
    const source = apply({}, planUtilitiesImport(JSON.stringify(SIMPLE), {}));
    const plan = planUtilitiesImport(JSON.stringify(source), {});
    const data = apply({}, plan);
    const [apt] = listApartments(data);
    expect(listMonths(data, apt.id).map(month => month.mk)).toEqual(['2026-09', '2026-10']);
    expect(computeMonth(data, listMonths(data, apt.id)[1]).result).toBeCloseTo(397.3, 2);
  });

  it('биті значення пропускає з поясненням, а не пише в базу', () => {
    const broken = { apartments: [{ name: 'кв. 1', months: [
      { month: '2026-13', budget: 1 },
      { month: '2026-11', date: '17.11.2026', zhek: '250+', gas: 10, extras: [{ label: 'x', amount: 'abc' }] },
    ] }] };
    const plan = planUtilitiesImport(JSON.stringify(broken), {});
    expect(plan.warnings.join(' | ')).toMatch(/РРРР-ММ/);
    expect(plan.warnings.join(' | ')).toMatch(/ЖЕК — сума «250\+» не число/);
    expect(plan.warnings.join(' | ')).toMatch(/поле «gas»/);
    expect(plan.warnings.join(' | ')).toMatch(/коригування «x»/);
    const month = Object.entries(plan.patch).find(([key]) => key.endsWith('/2026-11'))[1];
    expect(month.vals).toBeUndefined();
    expect(month.date).toBeUndefined();
  });

  it('незрозумілий файл — зрозуміла відмова', () => {
    expect(planUtilitiesImport('{', {}).error).toMatch(/JSON/);
    expect(planUtilitiesImport('{"a":1}', {}).error).toMatch(/apartments/);
    expect(planUtilitiesImport('{"apartments":[]}', {}).error).toMatch(/жодної квартири/);
  });

  it('зразок на екрані сам імпортується без зауважень', () => {
    const plan = planUtilitiesImport(UTILITIES_IMPORT_SAMPLE, {});
    expect(plan.error).toBeUndefined();
    expect(plan.warnings).toEqual([]);
  });
});
