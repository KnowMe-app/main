'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { CARD_CHANGE_BUCKET_MS, buildCardChangePath, recordCardChange, shouldRecordCardChange } = require('../cardChanges');

test('журнал: шлях — id картки під matchingCardChanges', () => {
  assert.equal(buildCardChangePath('abcdefghijklmnopqrst1234'), 'matchingCardChanges/abcdefghijklmnopqrst1234');
  assert.equal(buildCardChangePath('-Ndraft1'), 'matchingCardChanges/-Ndraft1');
});

test('журнал: непридатний id не пишеться', () => {
  assert.equal(buildCardChangePath(''), null);
  assert.equal(buildCardChangePath('a/b'), null);
  assert.equal(buildCardChangePath(undefined), null);
});

const LIVE = { name: 'Оксана', feedDate: '2026-11-10' };

test('журнал: правка видимої картки пише кошик часу, а не точну мітку', async () => {
  const written = [];
  const now = 1_762_800_123_456;
  const setValue = async (path, value) => { written.push([path, value]); };
  assert.equal(await recordCardChange('card1', { before: LIVE, after: { ...LIVE, name: 'Олена' }, now, setValue }), true);
  assert.deepEqual(written, [['matchingCardChanges/card1', Math.floor(now / CARD_CHANGE_BUCKET_MS) * CARD_CHANGE_BUCKET_MS]]);
  assert.equal(await recordCardChange('', { before: LIVE, after: null, now, setValue }), false);
  assert.equal(written.length, 1);
});

test('журнал: сховане до й після — не пишеться, будь-який перехід у сховане — пишеться', () => {
  const hidden = { name: 'Оксана', feedDate: false };
  assert.equal(shouldRecordCardChange(hidden, { ...hidden, name: 'Олена' }), false);
  assert.equal(shouldRecordCardChange(LIVE, hidden), true);
  assert.equal(shouldRecordCardChange(hidden, LIVE), true);
  // Неопублікована відкрита кожному (і видна в пошуку): її перехід у сховане
  // журнал мусить знати, як і її правки.
  assert.equal(shouldRecordCardChange({ name: 'x' }, { name: 'x', feedDate: false }), true);
  assert.equal(shouldRecordCardChange({ name: 'x' }, { name: 'y' }), true);
});

test('журнал: видалення видимої пишеться, схованої — ні', () => {
  assert.equal(shouldRecordCardChange(LIVE, null), true);
  assert.equal(shouldRecordCardChange({ name: 'x' }, null), true);
  assert.equal(shouldRecordCardChange({ feedDate: false }, null), false);
  assert.equal(shouldRecordCardChange(null, LIVE), true);
});

test('журнал: «лише для вподобаних» — видима картка', () => {
  const liked = { name: 'Оксана', feedDate: false, audience: 'liked' };
  assert.equal(shouldRecordCardChange(liked, { ...liked, name: 'Олена' }), true);
});

test('журнал: сама дата входу в стрічці — не пишеться', () => {
  assert.equal(shouldRecordCardChange(LIVE, { ...LIVE, feedDate: '2026-11-11' }), false);
  assert.equal(shouldRecordCardChange(LIVE, { ...LIVE, feedDate: '2026-11-11', rev: 5 }), true);
});

test('журнал: видалена схована картка не пише й не знімає запису', async () => {
  const written = [];
  const setValue = async (path, value) => { written.push([path, value]); };
  assert.equal(await recordCardChange('card1', { before: { feedDate: false }, after: null, setValue }), false);
  assert.deepEqual(written, []);
});
