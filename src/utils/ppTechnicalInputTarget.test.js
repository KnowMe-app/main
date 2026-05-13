import { resolvePpTechnicalInputTarget } from './ppTechnicalInputTarget';
import { inputUpdateValue } from '../components/inputUpdatedValue';

describe('resolvePpTechnicalInputTarget', () => {
  it('keeps linkedin company paths instead of only saving the route segment', () => {
    expect(
      resolvePpTechnicalInputTarget('http://www.linkedin.com/company/tindall-gask-bentley-lawyers')
    ).toEqual({
      fieldName: 'linkedin',
      value: 'company/tindall-gask-bentley-lawyers',
    });
  });

  it('normalizes linkedin profile URLs to the profile id', () => {
    expect(resolvePpTechnicalInputTarget('https://www.linkedin.com/in/Some-User/')).toEqual({
      fieldName: 'linkedin',
      value: 'some-user',
    });
  });

  it('lowercases twitter handles from social URLs', () => {
    expect(resolvePpTechnicalInputTarget('http://twitter.com/TGBlawyers')).toEqual({
      fieldName: 'twitter',
      value: 'tgblawyers',
    });
  });
});

describe('inputUpdateValue twitter normalization', () => {
  it('lowercases twitter handles in regular twitter fields too', () => {
    expect(inputUpdateValue('@TGBlawyers', { name: 'twitter' })).toBe('tgblawyers');
  });
});
