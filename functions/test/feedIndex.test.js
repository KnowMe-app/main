'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildFeedIndexEntry,
  buildFeedIndexFromCards,
  buildFeedIndexPath,
  syncFeedIndexEntry,
} = require('../feedIndex');

test('перелік: лише картка з датою в стрічці', () => {
  assert.deepEqual(buildFeedIndexEntry({ feedDate: '2026-11-13', role: 'ag' }), { d: '2026-11-13', r: 'ag' });
  assert.deepEqual(buildFeedIndexEntry({ feedDate: '2026-11-13', role: ['ED', 'ag'] }), { d: '2026-11-13', r: 'ed,ag' });
  assert.deepEqual(buildFeedIndexEntry({ feedDate: '2026-11-13' }), { d: '2026-11-13', r: '' });
  assert.equal(buildFeedIndexEntry({ feedDate: false, audience: 'liked', role: 'ag' }), null);
  assert.equal(buildFeedIndexEntry({ role: 'ag' }), null);
  assert.equal(buildFeedIndexEntry(null), null);
});

test('перелік: шлях — id картки, службові й непридатні ключі не пишуться', () => {
  assert.equal(buildFeedIndexPath('-Oabc'), 'matchingFeedIndex/-Oabc');
  assert.equal(buildFeedIndexPath('_built'), null);
  assert.equal(buildFeedIndexPath('a/b'), null);
});

test('перелік: публікація пише, приховування знімає, інша правка не пише нічого', async () => {
  const written = [];
  const setValue = async (path, value) => { written.push([path, value]); };
  const live = { name: 'A', feedDate: '2026-11-13', role: 'ag' };
  assert.equal(await syncFeedIndexEntry('c1', { before: { name: 'A', role: 'ag' }, after: live, setValue }), true);
  assert.equal(await syncFeedIndexEntry('c1', { before: live, after: { ...live, name: 'B' }, setValue }), false);
  assert.equal(await syncFeedIndexEntry('c1', { before: live, after: { ...live, feedDate: '2026-11-14' }, setValue }), true);
  assert.equal(await syncFeedIndexEntry('c1', { before: live, after: { ...live, feedDate: false }, setValue }), true);
  assert.equal(await syncFeedIndexEntry('c1', { before: live, after: null, setValue }), true);
  assert.deepEqual(written, [
    ['matchingFeedIndex/c1', { d: '2026-11-13', r: 'ag' }],
    ['matchingFeedIndex/c1', { d: '2026-11-14', r: 'ag' }],
    ['matchingFeedIndex/c1', null],
    ['matchingFeedIndex/c1', null],
  ]);
});

test('перелік цілком: опубліковані й позначка повного заповнення', () => {
  const index = buildFeedIndexFromCards({
    a: { feedDate: '2026-11-01', role: 'ed' },
    b: { feedDate: false },
    c: { name: 'x' },
  }, { builtAt: 42 });
  assert.deepEqual(index, { a: { d: '2026-11-01', r: 'ed' }, _built: 42 });
});
