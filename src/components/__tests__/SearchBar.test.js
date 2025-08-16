import { detectSearchParams } from '../SearchBar';

describe('detectSearchParams', () => {
  it('detects phone numbers starting with 0 as phone', () => {
    const result = detectSearchParams('0957209136');
    expect(result).toEqual({ key: 'phone', value: '380957209136' });
  });

  it('detects numeric userId when not phone-like', () => {
    const result = detectSearchParams('123456');
    expect(result).toEqual({ key: 'userId', value: '123456' });
  });
});
