import { TextDecoder, TextEncoder } from 'util';
global.TextDecoder = TextDecoder;
global.TextEncoder = TextEncoder;
const { fetchFilteredUsersByPage } = require('../dateLoad');
const { PAGE_SIZE } = require('../constants');

test('fetchFilteredUsersByPage limits results to PAGE_SIZE', async () => {
  const sampleData = {
    '2024-01-05': Array.from({ length: 15 }, (_, i) => [`id${i}`, { getInTouch: '2024-01-05' }]),
    '2024-01-04': Array.from({ length: 15 }, (_, i) => [`idB${i}`, { getInTouch: '2024-01-04' }]),
  };

  const fetchStub = async (dateStr, limit) => {
    return (sampleData[dateStr] || []).slice(0, limit);
  };
  const fetchUserStub = async id => ({ userId: id });

  const res = await fetchFilteredUsersByPage(0, fetchStub, fetchUserStub);
  expect(Object.keys(res.users).length).toBeLessThanOrEqual(PAGE_SIZE);
});

test('fetchFilteredUsersByPage queries dates around today', async () => {
  const calls = [];
  const fetchStub = async (dateStr, limit) => {
    calls.push(dateStr);
    return [];
  };
  const fetchUserStub = async () => null;

  await fetchFilteredUsersByPage(0, fetchStub, fetchUserStub);

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];
  const twoDaysAgo = new Date(today);
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
  const twoDaysAgoStr = twoDaysAgo.toISOString().split('T')[0];

  expect(calls[0]).toBe(todayStr);
  expect(calls[1]).toBe(yesterdayStr);
  expect(calls[2]).toBe(twoDaysAgoStr);
});
