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
  // Інша правка — не дата, не роль і не імʼя — переліку не чіпає.
  assert.equal(await syncFeedIndexEntry('c1', { before: live, after: { ...live, city: 'Київ' }, setValue }), false);
  assert.equal(await syncFeedIndexEntry('c1', { before: live, after: { ...live, feedDate: '2026-11-14' }, setValue }), true);
  assert.equal(await syncFeedIndexEntry('c1', { before: live, after: { ...live, feedDate: false }, setValue }), true);
  assert.equal(await syncFeedIndexEntry('c1', { before: live, after: null, setValue }), true);
  assert.deepEqual(written, [
    ['matchingFeedIndex/c1', { d: '2026-11-13', r: 'ag', n: 'a' }],
    ['matchingFeedIndex/c1', { d: '2026-11-14', r: 'ag', n: 'a' }],
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

test('запис переліку несе імена для пошуку на пристрої: поточні, малими', () => {
  const { buildFeedIndexEntry: build, syncFeedIndexEntry: sync } = require('../feedIndex');
  assert.deepEqual(
    build({ feedDate: '2026-11-13', role: 'ed', name: ['Оля', 'Ольга'] }),
    { d: '2026-11-13', r: 'ed', n: 'ольга' },
  );
  assert.deepEqual(
    build({ feedDate: '2026-11-13', role: 'ag', name: 'Surrohelp', agencyName: 'SurroHelp Kyiv' }),
    { d: '2026-11-13', r: 'ag', n: 'surrohelp|surrohelp kyiv' },
  );
  // Стерте імʼя (порожній рядок останньою версією) у перелік не йде.
  assert.deepEqual(build({ feedDate: '2026-11-13', role: 'ed', name: ['Ольга', ''] }), { d: '2026-11-13', r: 'ed' });
  return (async () => {
    const writes = [];
    const changed = await sync('card1', {
      before: { feedDate: '2026-11-13', role: 'ed', name: 'Ольга' },
      after: { feedDate: '2026-11-13', role: 'ed', name: 'Олена' },
      setValue: async (path, value) => { writes.push([path, value]); },
    });
    assert.equal(changed, true);
    assert.deepEqual(writes, [['matchingFeedIndex/card1', { d: '2026-11-13', r: 'ed', n: 'олена' }]]);
  })();
});
