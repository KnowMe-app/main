import { detectSearchParams } from '../SearchBar';

describe('detectSearchParams', () => {
  it('detects phone numbers starting with 0 as phone', () => {
    const result = detectSearchParams('0957209136');
    expect(result).toEqual({ key: 'phone', value: '380957209136' });
  });

  it.each([
    'AA1234',
    'AB1234',
    'VK12345',
    '-abcd',
    '1234567890123456789012345678',
  ])('detects %s as userId', val => {
    const result = detectSearchParams(val);
    expect(result).toEqual({ key: 'userId', value: val });
  });

  it('places random string into other', () => {
    const result = detectSearchParams('randomstring');
    expect(result).toEqual({ key: 'other', value: 'randomstring' });
  });
});
