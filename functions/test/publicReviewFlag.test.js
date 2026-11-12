'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { changesReview, changesReviewPresence, stampReviewsChange, syncPublicReviewFlag } = require('../publicReviewFlag');

const cardStore = initial => {
  const cards = { ...initial };
  return {
    cards,
    updateCard: async (id, updater) => {
      const next = updater(cards[id] ?? null);
      if (next !== undefined) cards[id] = next;
    },
  };
};

test('відгуки: тригер реагує на появу й зникнення, а не на правку тексту', () => {
  assert.equal(changesReviewPresence(null, { text: 'a' }), true);
  assert.equal(changesReviewPresence({ text: 'a' }, null), true);
  assert.equal(changesReviewPresence({ text: 'a' }, { text: 'b' }), false);
});

test('відгуки: перший відгук ставить прапорець, останній видалений — знімає', async () => {
  const store = cardStore({ c1: { name: 'Оксана' } });
  assert.equal(await syncPublicReviewFlag('c1', { readHasAny: async () => true, updateCard: store.updateCard }), true);
  assert.equal(store.cards.c1.hasPublicReview, true);
  assert.equal(store.cards.c1.name, 'Оксана');
  assert.equal(await syncPublicReviewFlag('c1', { readHasAny: async () => false, updateCard: store.updateCard }), true);
  assert.equal(store.cards.c1.hasPublicReview, false);
});

test('відгуки: ще один відгук при вже поставленому прапорці нічого не пише', async () => {
  const store = cardStore({ c1: { name: 'Оксана', hasPublicReview: true } });
  assert.equal(await syncPublicReviewFlag('c1', { readHasAny: async () => true, updateCard: store.updateCard }), false);
});

test('відгуки: картки немає — прапорця не заводимо', async () => {
  const store = cardStore({});
  assert.equal(await syncPublicReviewFlag('draft1', { readHasAny: async () => true, updateCard: store.updateCard }), false);
  assert.ok(!store.cards.draft1);
});

test('відгуки: перший виклик транзакції з null не перериває її', async () => {
  const calls = [];
  // Як SDK: спершу локальна копія (null), потім — серверна картка.
  const updateCard = async (_id, updater) => {
    const first = updater(null);
    calls.push(first);
    if (first !== undefined) calls.push(updater({ name: 'Оксана' }));
  };
  assert.equal(await syncPublicReviewFlag('c1', { readHasAny: async () => true, updateCard }), true);
  assert.deepEqual(calls, [null, { name: 'Оксана', hasPublicReview: true }]);
});

test('відгуки: непридатний id не читається', async () => {
  let read = false;
  const readHasAny = async () => { read = true; return true; };
  assert.equal(await syncPublicReviewFlag('a/b', { readHasAny, updateCard: async () => {} }), false);
  assert.equal(read, false);
});

test('відгуки: відгук, доданий поки писали «немає», повертає прапорець', async () => {
  const store = cardStore({ c1: { name: 'Оксана', hasPublicReview: true } });
  // Тригер видалення прочитав «немає», а до кінця його запису зʼявився новий
  // відгук, чий тригер уже відпрацював (прапорець і так стояв).
  const answers = [false, true, true];
  const readHasAny = async () => answers.shift();
  assert.equal(await syncPublicReviewFlag('c1', { readHasAny, updateCard: store.updateCard }), true);
  assert.equal(store.cards.c1.hasPublicReview, true);
});

test('відгуки: розбіжність, що не сходиться, — помилка для повтору тригера', async () => {
  const store = cardStore({ c1: { name: 'Оксана' } });
  let flip = false;
  const readHasAny = async () => { flip = !flip; return flip; };
  await assert.rejects(syncPublicReviewFlag('c1', { readHasAny, updateCard: store.updateCard }));
});

test('відгуки: будь-яка зміна відгуку — нова мітка reviewsAt наявної картки', async () => {
  assert.equal(changesReview({ text: 'a' }, { text: 'b' }), true);
  assert.equal(changesReview({ text: 'a' }, { text: 'a' }), false);
  const store = cardStore({ c1: { name: 'Оксана', reviewsAt: 500 } });
  assert.equal(await stampReviewsChange('c1', { updateCard: store.updateCard, now: 1000 }), true);
  assert.equal(store.cards.c1.reviewsAt, 1000);
  assert.equal(store.cards.c1.name, 'Оксана');
  // Той самий момент — однаково нова версія.
  await stampReviewsChange('c1', { updateCard: store.updateCard, now: 1000 });
  assert.equal(store.cards.c1.reviewsAt, 1001);
});

test('відгуки: картки немає — мітки не заводимо', async () => {
  const store = cardStore({});
  assert.equal(await stampReviewsChange('draft1', { updateCard: store.updateCard, now: 1000 }), false);
  assert.ok(!store.cards.draft1);
});
