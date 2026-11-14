import {
  describeOwnerMarks,
  planOwnerMarksRemoval,
  planOwnerMarksTransfer,
} from '../ownerMarksTransfer';

const OWNER = 'owner1';
const SRC = 'ID0006';
const DST = 'yPRy4JKtO5eAymzRrScNmPHYBlm2';

describe('planOwnerMarksTransfer', () => {
  it('переносить нотатку з датою, реакцію й дату дзвінка на порожню картку і знімає їх з дубля', () => {
    const { patch, moved } = planOwnerMarksTransfer({
      ownerId: OWNER,
      sourceCardId: SRC,
      targetCardId: DST,
      source: {
        comments: { text: 'мала кількість клітин', updatedAt: 1777334400000 },
        dislikes: true,
        getInTouch: '2099-99-99',
      },
      target: {},
    });
    expect(patch).toEqual({
      [`multiData/comments/${OWNER}/${DST}`]: { text: 'мала кількість клітин', updatedAt: 1777334400000 },
      [`multiData/comments/${OWNER}/${SRC}`]: null,
      [`multiData/dislikes/${OWNER}/${DST}`]: true,
      [`multiData/dislikes/${OWNER}/${SRC}`]: null,
      [`multiData/getInTouch/${OWNER}/${DST}`]: '2099-99-99',
      [`multiData/getInTouch/${OWNER}/${SRC}`]: null,
    });
    expect(moved).toEqual(['comments', 'dislikes', 'getInTouch']);
  });

  it('зливає нотатки й бере новішу дату', () => {
    const { patch } = planOwnerMarksTransfer({
      ownerId: OWNER,
      sourceCardId: SRC,
      targetCardId: DST,
      source: { comments: { text: 'стара', updatedAt: 10 } },
      target: { comments: { text: 'нова', updatedAt: 20 } },
    });
    expect(patch[`multiData/comments/${OWNER}/${DST}`]).toEqual({ text: 'нова\n\nстара', updatedAt: 20 });
    expect(patch[`multiData/comments/${OWNER}/${SRC}`]).toBeNull();
  });

  it('не дублює однаковий текст, але знімає його з дубля', () => {
    const { patch, moved } = planOwnerMarksTransfer({
      ownerId: OWNER,
      sourceCardId: SRC,
      targetCardId: DST,
      source: { comments: { text: 'те саме', updatedAt: 10 } },
      target: { comments: { text: 'те саме', updatedAt: 20 } },
    });
    expect(patch).toEqual({ [`multiData/comments/${OWNER}/${SRC}`]: null });
    expect(moved).toEqual([]);
  });

  it('реакція отримувача перемагає: лайк з дубля не стає поруч із дизлайком', () => {
    const { patch, moved } = planOwnerMarksTransfer({
      ownerId: OWNER,
      sourceCardId: SRC,
      targetCardId: DST,
      source: { favorites: 'ed', getInTouch: '2026-12-01' },
      target: { dislikes: 1760000000000, getInTouch: '2099-99-99' },
    });
    expect(patch).toEqual({
      [`multiData/favorites/${OWNER}/${SRC}`]: null,
      [`multiData/getInTouch/${OWNER}/${SRC}`]: null,
    });
    expect(moved).toEqual([]);
  });

  it('нічого не планує для тієї самої картки', () => {
    expect(planOwnerMarksTransfer({ ownerId: OWNER, sourceCardId: SRC, targetCardId: SRC, source: { dislikes: true } }).patch)
      .toEqual({});
  });
});

describe('planOwnerMarksRemoval', () => {
  it('знімає лише те, що лежить', () => {
    expect(planOwnerMarksRemoval({ ownerId: OWNER, cardId: SRC, marks: { comments: { text: '' }, favorites: null, dislikes: true } }).patch)
      .toEqual({
        [`multiData/comments/${OWNER}/${SRC}`]: null,
        [`multiData/dislikes/${OWNER}/${SRC}`]: null,
      });
  });
});

describe('describeOwnerMarks', () => {
  it('підписує позначки для таблиці', () => {
    expect(describeOwnerMarks({ comments: { text: 'x' }, favorites: true, getInTouch: '2026-12-01' }))
      .toEqual(['📝 x', '❤ обране', '📅 2026-12-01']);
  });
});
