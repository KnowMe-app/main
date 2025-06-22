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
