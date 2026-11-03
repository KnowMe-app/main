import { render } from '@testing-library/react';
import { fieldMaritalStatus } from './fieldMaritalStatus';
import { fieldBlood } from './fieldBlood';
import { fieldDeliveryInfo } from './fieldDeliveryInfo';
import { utilCalculateIMT } from './utilCalculateIMT';
import { formatValueVersions, listValueVersions } from './valueVersions';

const textOf = node => render(<>{node}</>).container.textContent;

// Після перенесення з дубліката поле стає масивом версій. Картка адміна
// показує всі версії, кожну у форматі скаляра, і стирання теж.
describe('admin card fields with value history', () => {
  it('translates a single-version array', () => {
    expect(textOf(fieldMaritalStatus(['Yes']))).toBe('Заміжня');
  });

  it('shows every version of marital status, translated', () => {
    expect(textOf(fieldMaritalStatus(['No', 'Yes']))).toBe('Незаміжня → Заміжня');
  });

  it('shows an erased marital status', () => {
    expect(textOf(fieldMaritalStatus(['Yes', '']))).toBe('Заміжня → стерто');
  });

  it('keeps scalar marital status working', () => {
    expect(textOf(fieldMaritalStatus('Ні'))).toBe('Незаміжня');
    expect(fieldMaritalStatus('')).toBeNull();
  });

  it('shows every blood version', () => {
    expect(textOf(fieldBlood(['3-', '2+']))).toBe('РК 3- → 2+');
  });

  it('skips holes but keeps erasures', () => {
    expect(listValueVersions(['a', null, 'b', ''])).toEqual(['a', 'b', '']);
    expect(listValueVersions({ 0: 'a', 2: 'b' })).toEqual(['a', 'b']);
    expect(formatValueVersions(['2017-02-25', ''], v => v.split('-').reverse().join('.')))
      .toBe('25.02.2017 → стерто');
  });

  it('computes BMI from the current versions', () => {
    expect(utilCalculateIMT(['70', '68'], ['163'])).toBe(26);
  });

  it('shows delivery history including an erased count', () => {
    const text = textOf(fieldDeliveryInfo({ userData: { ownKids: ['1', ''], lastDelivery: ['2017-02-25'] } }));
    expect(text).toContain('25.02.2017 пологи');
    expect(text).toContain('всього 1 → стерто');
  });
});
