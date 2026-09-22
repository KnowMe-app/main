import fs from 'fs';
import path from 'path';
import { buildMatchingCardProjection } from '../utils/matchingCardIndex';
import { PROFILE_NODES, resolveFieldOwnerNode, resolveCanonicalFieldName } from '../utils/profileNodeSchema';

// Exercise the actual backend adapter with an isolated RTDB boundary.
const source = fs.readFileSync(path.join(__dirname, 'config.js'), 'utf8');
const body = source.slice(source.indexOf('export const saveComparisonField'), source.indexOf('export const updateProfileRole'))
  .replace('export const saveComparisonField =', 'return');
const sanitizePhones = new Function(`${source.slice(source.indexOf('const normalizePhoneForStorage ='), source.indexOf('const normalizeIndexedValues ='))}\nreturn sanitizeUploadedInfoPhones;`)();

const setup = () => {
  const db = { 'matchingCards/B/height': ['160'], 'matchingCards/B/weight': ['50'] };
  const deps = {
    auth: { currentUser: { uid: 'admin' } }, database: {},
    resolveCanonicalFieldName, resolveFieldOwnerNode, PROFILE_NODES, buildMatchingCardProjection,
    normalizeStoredDates: value => value, sanitizeUploadedInfoPhones: sanitizePhones,
    ref2: (_, address) => address,
    set: jest.fn(async (address, value) => { db[address] = value; }),
    get: jest.fn(async address => ({ exists: () => address in db, val: () => db[address] })),
    readProfileFromNodes: jest.fn(async () => ({ height: ['160'], weight: ['50'] })),
    syncUserSearchIdIndex: jest.fn(), syncUserSearchKeyIndex: jest.fn(),
    refreshMatchingCardAfterProfileWrite: jest.fn(), mirrorProfileToLegacyUsers: jest.fn(),
    clearMatchingSearchResultCache: jest.fn(), setOwnerWriter: jest.fn(), setOwnerGetInTouch: jest.fn(),
  };
  return { db, deps, save: new Function(...Object.keys(deps), body)(...Object.values(deps)) };
};

it.each(['height', 'weight'])('writes %s to its canonical node and confirms it by reading', async field => {
  const { deps, save, db } = setup();
  expect(await save('B', field, ['160', '170'])).toEqual(['160', '170']);
  expect(deps.set).toHaveBeenCalledWith(`matchingCards/B/${field}`, ['160', '170']);
  expect(deps.get).toHaveBeenCalledWith(`matchingCards/B/${field}`);
  expect(db[`matchingCards/B/${field === 'height' ? 'weight' : 'height'}`]).toEqual([field === 'height' ? '50' : '160']);
  expect(deps.syncUserSearchKeyIndex).toHaveBeenCalled();
});

it('does not hide a rejected matchingCards write behind another successful node', async () => {
  const { deps, save } = setup();
  deps.set.mockRejectedValue(new Error('PERMISSION_DENIED'));
  await expect(save('B', 'height', ['170'])).rejects.toThrow('PERMISSION_DENIED');
  expect(deps.get).not.toHaveBeenCalled();
});

it('propagates a failed confirmation read', async () => {
  const { deps, save } = setup();
  deps.get.mockRejectedValue(new Error('read failed'));
  await expect(save('B', 'weight', ['60'])).rejects.toThrow('read failed');
});

it('returns the backend value, not the submitted frontend value', async () => {
  const { deps, save } = setup();
  deps.get.mockResolvedValue({ exists: () => true, val: () => ['60.0'] });
  expect(await save('B', 'weight', ['60'])).toEqual(['60.0']);
});

it('stores each phone once even when formatting differs between cards', async () => {
  const { save, deps } = setup();
  const result = await save('B', 'phone', ['+380 67 1234567', '380671234567']);
  expect(result).toEqual(['380671234567']);
  expect(deps.set).toHaveBeenCalledWith('profileContacts/B/phone', ['380671234567']);
});

it('bulk duplicate merging also returns a unique array for a single value', () => {
  const start = source.indexOf('    const mergeValues =', source.indexOf('export const mergeDuplicateUsers'));
  const mergeSource = source.slice(start, source.indexOf('    const delKeys =', start));
  const merge = new Function(`${mergeSource}\nreturn mergeValues;`)();
  expect(merge('phone', '123', ['123', '123'])).toEqual(['123']);
  expect(merge('phone', null, ['123', '123'])).toEqual(['123']);
});
