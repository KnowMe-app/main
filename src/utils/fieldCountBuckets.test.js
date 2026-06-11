import { collectFieldCountIdsFromIndexNode } from './fieldCountBuckets';

describe('collectFieldCountIdsFromIndexNode', () => {
  it('collects ids from dense numeric array snapshots for selected field count ranges', () => {
    const fieldsIndexNode = [];
    fieldsIndexNode[4] = { userLe5: true };
    fieldsIndexNode[7] = { userF6To10: true };
    fieldsIndexNode[12] = { userF11To20: true };

    expect([...collectFieldCountIdsFromIndexNode(fieldsIndexNode, ['le5', 'f6_10'])].sort()).toEqual([
      'userF6To10',
      'userLe5',
    ]);
  });
});
