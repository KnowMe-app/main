import { resolvePpTechnicalInputTarget, resolvePpTechnicalInputTargets } from './ppTechnicalInputTarget';
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

  it('preserves YouTube channel URLs as channel paths with case-sensitive ids', () => {
    expect(resolvePpTechnicalInputTarget('https://www.youtube.com/channel/UC4LwxzuzRqwSpa1A64eziDQ')).toEqual({
      fieldName: 'youtube',
      value: 'channel/UC4LwxzuzRqwSpa1A64eziDQ',
    });
  });
});

describe('inputUpdateValue twitter normalization', () => {
  it('lowercases twitter handles in regular twitter fields too', () => {
    expect(inputUpdateValue('@TGBlawyers', { name: 'twitter' })).toBe('tgblawyers');
  });

  it('keeps YouTube channel paths and channel id casing in regular youtube fields too', () => {
    expect(inputUpdateValue('https://www.youtube.com/channel/UC4LwxzuzRqwSpa1A64eziDQ', { name: 'youtube' }))
      .toBe('channel/UC4LwxzuzRqwSpa1A64eziDQ');
  });
});

describe('resolvePpTechnicalInputTargets', () => {
  const normalizePhone = value => (/^\+?\d{9,}$/.test(String(value).replace(/\D/g, '')) ? String(value).replace(/\D/g, '') : '');
  const year = new Date().getFullYear();

  it('reads age shorthand as birth date', () => {
    expect(resolvePpTechnicalInputTargets('30р', { normalizePhone })).toEqual([
      { fieldName: 'birth', value: `01.01.${year - 30}` },
    ]);
    expect(resolvePpTechnicalInputTargets('30', { normalizePhone })).toEqual([
      { fieldName: 'birth', value: `01.01.${year - 30}` },
    ]);
  });

  it('splits two words into name and surname', () => {
    expect(resolvePpTechnicalInputTargets('Оксана Соколова', { normalizePhone })).toEqual([
      { fieldName: 'name', value: 'Оксана' },
      { fieldName: 'surname', value: 'Соколова' },
    ]);
    expect(resolvePpTechnicalInputTargets("Мар'яна Ганна-Марія Коваль", { normalizePhone })).toEqual([
      { fieldName: 'name', value: "Мар'яна" },
      { fieldName: 'surname', value: 'Ганна-Марія Коваль' },
    ]);
  });

  it('keeps single word and non-name text as name', () => {
    expect(resolvePpTechnicalInputTargets('Оксана', { normalizePhone })).toEqual([
      { fieldName: 'name', value: 'Оксана' },
    ]);
    expect(resolvePpTechnicalInputTargets('Оксана 2', { normalizePhone })).toEqual([
      { fieldName: 'name', value: 'Оксана 2' },
    ]);
  });

  it('still resolves phones', () => {
    expect(resolvePpTechnicalInputTargets('+380501234567', { normalizePhone })[0].fieldName).toBe('phone');
  });
});
