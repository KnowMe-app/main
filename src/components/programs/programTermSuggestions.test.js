import { buildProgramTermKey, isSuggestedProgramTerm } from './programsRemote';

jest.mock('../config', () => ({ database: {}, isReactionPermissionDeniedError: () => false }));
jest.mock('firebase/database', () => ({ get: jest.fn(), ref: jest.fn(), remove: jest.fn(), set: jest.fn(), update: jest.fn() }));

describe('підказки назв доплат', () => {
  const usage = {
    [buildProgramTermKey('Доплата за повторну програму')]: 2,
    [buildProgramTermKey('Якщо є аналізи на генетику')]: 1,
    [buildProgramTermKey('Тестова доплата')]: 3,
    [buildProgramTermKey('Аналіз на тестостерон')]: 2,
  };

  it('підказує лише назви, вжиті щонайменше двома агенціями', () => {
    expect(isSuggestedProgramTerm('Доплата за повторну програму', usage)).toBe(true);
    expect(isSuggestedProgramTerm('Якщо є аналізи на генетику', usage)).toBe(false);
    expect(isSuggestedProgramTerm('Нова назва', usage)).toBe(false);
  });

  it('не підказує тестових назв, але не плутає їх зі словами, що лише так починаються', () => {
    expect(isSuggestedProgramTerm('Тестова доплата', usage)).toBe(false);
    expect(isSuggestedProgramTerm('Аналіз на тестостерон', usage)).toBe(true);
  });
});
