'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { changesOwnerMark, stampOwnerMarkChange, OWNER_MARK_KINDS } = require('../ownerMarks');

const memoryVersion = () => {
  const data = {};
  return {
    data,
    updateVersion: async (path, updater) => { data[path] = updater(data[path] ?? null); },
  };
};

test('однаковий запис версії не міняє', () => {
  assert.equal(changesOwnerMark({ text: 'a', updatedAt: 1 }, { text: 'a', updatedAt: 1 }), false);
  assert.equal(changesOwnerMark(null, { text: 'a', updatedAt: 1 }), true);
  assert.equal(changesOwnerMark('2026-12-01', null), true);
});

test('версія — час сервера й строго зростає', async () => {
  const db = memoryVersion();
  await stampOwnerMarkChange('owner', 'comments', { ...db, now: () => 1000 });
  assert.equal(db.data['multiData/ownerMarksAt/owner/comments'], 1000);
  await stampOwnerMarkChange('owner', 'comments', { ...db, now: () => 1000 });
  assert.equal(db.data['multiData/ownerMarksAt/owner/comments'], 1001);
  await stampOwnerMarkChange('owner', 'comments', { ...db, now: () => 900 });
  assert.equal(db.data['multiData/ownerMarksAt/owner/comments'], 1002);
});

test('невідомий вид не пишеться', async () => {
  const db = memoryVersion();
  await stampOwnerMarkChange('owner', 'edits', { ...db, now: () => 1000 });
  assert.deepEqual(db.data, {});
  assert.ok(OWNER_MARK_KINDS.includes('likedAudience'));
});

test('версія «лише для вподобаних» — в окремому вузлі', async () => {
  const db = memoryVersion();
  await stampOwnerMarkChange('viewer', 'likedAudience', { ...db, now: () => 5 });
  assert.deepEqual(db.data, { 'multiData/likedAudienceAt/viewer': 5 });
});
