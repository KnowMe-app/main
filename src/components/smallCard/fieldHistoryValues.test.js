import { render, screen } from '@testing-library/react';
import { fieldMaritalStatus } from './fieldMaritalStatus';
import { fieldBlood } from './fieldBlood';
import { utilCalculateIMT } from './utilCalculateIMT';

// Після перенесення з дубліката поле стає масивом версій, і картка адміна
// мусить показувати поточну версію так само, як скаляр.
describe('admin card fields with value history', () => {
  it('translates marital status from a version array', () => {
    render(<>{fieldMaritalStatus(['Yes'])}</>);
    expect(screen.getByText('Заміжня')).toBeTruthy();
  });

  it('takes the last version of marital status', () => {
    render(<>{fieldMaritalStatus(['No', 'Yes'])}</>);
    expect(screen.getByText('Заміжня')).toBeTruthy();
  });

  it('keeps scalar marital status working', () => {
    render(<>{fieldMaritalStatus('Ні')}</>);
    expect(screen.getByText('Незаміжня')).toBeTruthy();
  });

  it('shows nothing for an erased marital status', () => {
    expect(fieldMaritalStatus(['Yes', ''])).toBeNull();
  });

  it('shows the current blood version only', () => {
    render(<>{fieldBlood(['3-', '2+'])}</>);
    expect(screen.getByText('РК 2+')).toBeTruthy();
  });

  it('computes BMI from version arrays', () => {
    expect(utilCalculateIMT(['70', '68'], ['163'])).toBe(26);
  });
});
