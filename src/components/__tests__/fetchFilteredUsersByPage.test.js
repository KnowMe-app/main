import { TextDecoder, TextEncoder } from 'util';

global.TextDecoder = TextDecoder;
global.TextEncoder = TextEncoder;

jest.mock('../config', () => ({
  // Simple passthrough filter for testing
  filterMain: jest.fn((users) => users),
}));

const { fetchFilteredUsersByPage } = require('../dateLoad');
const { PAGE_SIZE } = require('../constants');

test('fetchFilteredUsersByPage limits results to PAGE_SIZE', async () => {
  const today = new Date().toISOString().split('T')[0];
  const sampleData = Array.from({ length: 25 }, (_, i) => [`id${i}`, { getInTouch: today }]);

  const fetchStub = async (dateStr, limit) => sampleData.slice(0, limit);
  const fetchUserStub = async id => ({ userId: id });

  const res = await fetchFilteredUsersByPage(
    0,
    fetchStub,
    fetchUserStub,
    {},
    {},
    users => users
  );
  expect(Object.keys(res.users).length).toBe(PAGE_SIZE);
  expect(res.hasMore).toBe(true);
  expect(res.lastKey).toBe(PAGE_SIZE);
});

test('fetchFilteredUsersByPage fetches earlier dates when needed', async () => {
  const calls = [];
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const yesterdayStr = new Date(today.getTime() - 86400000)
    .toISOString()
    .split('T')[0];

  const dataMap = {
    [todayStr]: [],
    [yesterdayStr]: Array.from({ length: PAGE_SIZE + 1 }, (_, i) => [
      `id${i}`,
      { getInTouch: yesterdayStr },
    ]),
  };

  const fetchStub = async (dateStr, limit) => {
    calls.push(dateStr);
    const data = dataMap[dateStr] || [];
    return data.slice(0, limit);
  };
  const fetchUserStub = async id => ({ userId: id });

  const res = await fetchFilteredUsersByPage(
    0,
    fetchStub,
    fetchUserStub,
    {},
    {},
    users => users
  );

  expect(calls).toEqual([todayStr, '', yesterdayStr]);
  expect(Object.keys(res.users).length).toBe(PAGE_SIZE);
  expect(res.hasMore).toBe(true);
});

test('fetchFilteredUsersByPage paginates with startOffset', async () => {
  const today = new Date().toISOString().split('T')[0];
  const sampleData = Array.from({ length: 25 }, (_, i) => [
    `id${i}`,
    { getInTouch: today },
  ]);

  const dataMap = {
    [today]: sampleData,
  };

  const fetchStub = async (dateStr, limit) => {
    const arr = dataMap[dateStr] || [];
    return arr.slice(0, limit);
  };
  const fetchUserStub = async id => ({ userId: id });

  const first = await fetchFilteredUsersByPage(
    0,
    fetchStub,
    fetchUserStub,
    {},
    {},
    users => users
  );
  const second = await fetchFilteredUsersByPage(
    first.lastKey,
    fetchStub,
    fetchUserStub,
    {},
    {},
    users => users
  );

  expect(Object.keys(second.users).length).toBe(sampleData.length - PAGE_SIZE);
  expect(second.hasMore).toBe(false);
  expect(second.lastKey).toBe(sampleData.length);
});

test('fetchFilteredUsersByPage continues fetching when filters remove records', async () => {
  const calls = [];
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const yesterdayStr = new Date(today.getTime() - 86400000)
    .toISOString()
    .split('T')[0];

  const dataMap = {
    [todayStr]: Array.from({ length: PAGE_SIZE }, (_, i) => [
      `skip${i}`,
      { getInTouch: todayStr },
    ]),
    [yesterdayStr]: Array.from({ length: PAGE_SIZE }, (_, i) => [
      `id${i}`,
      { getInTouch: yesterdayStr },
    ]),
  };

  const fetchStub = jest.fn(async (dateStr, limit) => {
    calls.push(dateStr);
    const arr = dataMap[dateStr] || [];
    return arr.slice(0, limit);
  });
  const fetchUserStub = async id => ({ userId: id });

  const { filterMain } = require('../config');
  filterMain.mockImplementation(users =>
    users.filter(([id]) => !id.startsWith('skip')),
  );

  const res = await fetchFilteredUsersByPage(
    0,
    fetchStub,
    fetchUserStub,
    {},
    {},
    filterMain,
  );

  expect(fetchStub.mock.calls[0][0]).toBe(todayStr);
  expect(fetchStub.mock.calls.some(call => call[0] === yesterdayStr)).toBe(true);
  expect(Object.keys(res.users).length).toBe(PAGE_SIZE);
  expect(res.hasMore).toBe(false);
});

test('fetchFilteredUsersByPage calls progress callback with incremental results', async () => {
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  const dataMap = {
    [today]: Array.from({ length: PAGE_SIZE / 2 }, (_, i) => [`a${i}`, { getInTouch: today }]),
    [yesterday]: Array.from({ length: PAGE_SIZE }, (_, i) => [`b${i}`, { getInTouch: yesterday }]),
  };

  const fetchStub = async (dateStr, limit) => {
    const arr = dataMap[dateStr] || [];
    return arr.slice(0, limit);
  };
  const fetchUserStub = async id => ({ userId: id });

  const progress = [];
  await fetchFilteredUsersByPage(
    0,
    fetchStub,
    fetchUserStub,
    {},
    {},
    users => users,
    part => progress.push(Object.keys(part).length)
  );

  expect(progress.length).toBeGreaterThan(1);
  expect(progress[progress.length - 1]).toBe(PAGE_SIZE);
});
