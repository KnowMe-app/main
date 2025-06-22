import { TextDecoder, TextEncoder } from 'util';

global.TextDecoder = TextDecoder;
global.TextEncoder = TextEncoder;

const { fetchFilteredUsersByPage } = require('../dateLoad');
const { PAGE_SIZE } = require('../constants');

test('fetchFilteredUsersByPage limits results to PAGE_SIZE', async () => {
  const today = new Date().toISOString().split('T')[0];
  const sampleData = Array.from({ length: 25 }, (_, i) => [`id${i}`, { getInTouch: today }]);

  const fetchStub = async (dateStr, limit) => sampleData.slice(0, limit);
  const fetchUserStub = async id => ({ userId: id });

  const res = await fetchFilteredUsersByPage(0, fetchStub, fetchUserStub);
  expect(Object.keys(res.users).length).toBe(PAGE_SIZE);
  expect(res.hasMore).toBe(true);
  expect(res.lastKey).toBe(PAGE_SIZE);
});

test('fetchFilteredUsersByPage queries current date only once', async () => {
  const calls = [];
  const fetchStub = async dateStr => {
    calls.push(dateStr);
    return [];
  };
  const fetchUserStub = async () => null;

  await fetchFilteredUsersByPage(0, fetchStub, fetchUserStub);

  const todayStr = new Date().toISOString().split('T')[0];
  expect(calls).toEqual([todayStr]);
});

test('fetchFilteredUsersByPage paginates with startOffset', async () => {
  const today = new Date().toISOString().split('T')[0];
  const sampleData = Array.from({ length: 25 }, (_, i) => [`id${i}`, { getInTouch: today }]);

  const fetchStub = async (dateStr, limit) => sampleData.slice(0, limit);
  const fetchUserStub = async id => ({ userId: id });

  const first = await fetchFilteredUsersByPage(0, fetchStub, fetchUserStub);
  const second = await fetchFilteredUsersByPage(first.lastKey, fetchStub, fetchUserStub);

  expect(Object.keys(second.users).length).toBe(sampleData.length - PAGE_SIZE);
  expect(second.hasMore).toBe(false);
  expect(second.lastKey).toBe(sampleData.length);
});
