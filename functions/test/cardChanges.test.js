'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildCardChangePath, recordCardChange } = require('../cardChanges');

test('журнал: шлях — id картки під matchingCardChanges', () => {
  assert.equal(buildCardChangePath('abcdefghijklmnopqrst1234'), 'matchingCardChanges/abcdefghijklmnopqrst1234');
  assert.equal(buildCardChangePath('-Ndraft1'), 'matchingCardChanges/-Ndraft1');
});

test('журнал: непридатний id не пишеться', () => {
  assert.equal(buildCardChangePath(''), null);
  assert.equal(buildCardChangePath('a/b'), null);
  assert.equal(buildCardChangePath(undefined), null);
});

test('журнал: будь-який запис картки ставить час сервера', async () => {
  const written = [];
  assert.equal(await recordCardChange('card1', { setTimestamp: async path => { written.push(path); } }), true);
  assert.deepEqual(written, ['matchingCardChanges/card1']);
  assert.equal(await recordCardChange('', { setTimestamp: async path => { written.push(path); } }), false);
  assert.equal(written.length, 1);
});
