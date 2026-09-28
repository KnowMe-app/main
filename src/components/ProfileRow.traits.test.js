import fs from 'fs';
import path from 'path';
import { buildTraitRows } from './ProfileRow';

// Нерозривні пробіли тримають число при слові; для звірки тексту вони — пробіли.
const valueOf = (rows, key) => rows.find(row => row.key === key)?.value?.replace(/\u00A0/g, ' ');
const labelOf = (rows, key) => rows.find(row => row.key === key)?.label;

// Дата пологів відносна: без сталого «сьогодні» тест старів би щомісяця.
const monthsAgo = months => {
  const date = new Date();
  date.setDate(1);
  date.setMonth(date.getMonth() - months);
  return date.toISOString().slice(0, 10);
};

/**
 * Зовнішність, пологи з донаціями й освіта — словами, під метриками рядка.
 *
 * Значення нижче — так, як вони лежать в опублікованих анкетах: колір очей і
 * волосся вибрано зі списку англійською, пологи й донації — числом, освіта —
 * одним із варіантів модалки.
 */
describe('блок характеристик у рядку стрічки', () => {
  it('складає зовнішність одною фразою мовою інтерфейсу', () => {
    const rows = buildTraitRows({ eyeColor: 'Hazel', hairColor: 'Fair', hairStructure: 'Straight' }, 'uk');
    expect(labelOf(rows, 'appearance')).toBe('Зовнішність');
    expect(valueOf(rows, 'appearance')).toBe('карі очі, русяве пряме волосся');
  });

  it('не узгоджує з «волоссям» колір, який є іменником', () => {
    const rows = buildTraitRows({ hairColor: 'Shoten', hairStructure: 'Wavy' }, 'uk');
    expect(valueOf(rows, 'appearance')).toBe('шатен, хвилясте волосся');
  });

  it('називає пологи пологами, а не дітьми, і каже давність останніх', () => {
    const rows = buildTraitRows({ ownKids: '2', lastDelivery: monthsAgo(18), experience: '1' }, 'uk');
    expect(labelOf(rows, 'reproduction')).toBe('Пологи, донації');
    expect(valueOf(rows, 'reproduction')).toBe('двоє пологів, останні 18 міс тому · 1 донація');
  });

  it('каже кесарів поруч із пологами', () => {
    expect(valueOf(buildTraitRows({ ownKids: '3', csection: '1' }, 'uk'), 'reproduction')).toBe('троє пологів · КР 1');
    expect(valueOf(buildTraitRows({ ownKids: '1', csection: 'не було' }, 'uk'), 'reproduction')).toBe('одні пологи · без КР');
  });

  it('відповідає словами на нуль і узгоджує числівник з донаціями', () => {
    expect(valueOf(buildTraitRows({ ownKids: '0', experience: '0' }, 'uk'), 'reproduction'))
      .toBe('пологів не було · донацій ще не було');
    expect(valueOf(buildTraitRows({ experience: '3' }, 'uk'), 'reproduction')).toBe('3 донації');
    expect(valueOf(buildTraitRows({ experience: '11' }, 'uk'), 'reproduction')).toBe('11 донацій');
  });

  it('називає рядок тим, що в ньому є', () => {
    expect(labelOf(buildTraitRows({ ownKids: '2' }, 'uk'), 'reproduction')).toBe('Пологи');
    expect(labelOf(buildTraitRows({ experience: '2' }, 'uk'), 'reproduction')).toBe('Донації');
  });

  it('показує освіту без повтору слова «освіта»', () => {
    expect(valueOf(buildTraitRows({ education: 'Higher' }, 'uk'), 'education')).toBe('вища');
    expect(valueOf(buildTraitRows({ education: 'Technical' }, 'uk'), 'education')).toBe('професійно-технічна');
    expect(valueOf(buildTraitRows({ education: 'Середня спеціальна' }, 'uk'), 'education')).toBe('середня спеціальна');
  });

  // «Так/ні» в освіті — відповідь на питання форми, а не назва освіти.
  it('не показує «Освіта — ні»', () => {
    expect(valueOf(buildTraitRows({ education: 'No' }, 'uk'), 'education')).toBeUndefined();
  });

  it('англійською каже те саме англійською', () => {
    const rows = buildTraitRows({
      eyeColor: 'Hazel', hairColor: 'Fair', hairStructure: 'Straight', ownKids: '2', experience: '1', education: 'Higher',
    }, 'en');
    expect(labelOf(rows, 'appearance')).toBe('Appearance');
    expect(valueOf(rows, 'appearance')).toBe('hazel eyes, fair straight hair');
    expect(labelOf(rows, 'reproduction')).toBe('Deliveries, donations');
    expect(valueOf(rows, 'reproduction')).toBe('2 deliveries · 1 donation');
    expect(valueOf(rows, 'education')).toBe('higher');
  });

  it('не відриває числа від слова при переносі', () => {
    const value = buildTraitRows({ ownKids: '2', lastDelivery: monthsAgo(6), experience: '6' }, 'uk')[0].value;
    expect(value).toBe('двоє пологів, останні 6\u00A0міс тому\u00A0· 6\u00A0донацій');
  });

  it('мовчить, коли сказати нема чого', () => {
    expect(buildTraitRows({ eyeColor: 'Other' }, 'uk')).toEqual([]);
  });

  // Пологи й кесарів тепер каже блок, тож рядок фактів їх не повторює.
  it('не лишає пологів у рядку фактів', () => {
    const source = fs.readFileSync(path.join(__dirname, 'ProfileRow.jsx'), 'utf8');
    expect(source).toContain("const TRAIT_FACT_KEYS = ['births', 'cs'];");
    expect(source).toContain('facts.filter(node => !TRAIT_FACT_KEYS.includes(node.key))');
    expect(source).not.toContain('<S.FactsRow $soft>');
  });
});
