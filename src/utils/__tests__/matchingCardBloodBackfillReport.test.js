import { describeMatchingCardBloodBackfill } from '../matchingCardBloodBackfillReport';

describe('звіт дописки групи крові', () => {
  it('рахує дописане й пропущене', () => {
    const { tone, message } = describeMatchingCardBloodBackfill({
      published: 278, written: ['a', 'b'], unchanged: 5, noBlood: 271, failed: [],
    });
    expect(tone).toBe('success');
    expect(message).toContain('Опублікованих карток: 278');
    expect(message).toContain('Дописано: 2');
  });

  it('відмову в правах називає разом із командою деплою, а не нулем', () => {
    const { tone, message } = describeMatchingCardBloodBackfill({
      published: 2, written: [], unchanged: 0, noBlood: 0,
      failed: [{ id: 'a', permissionDenied: true }, { id: 'b', permissionDenied: true }],
    });
    expect(tone).toBe('error');
    expect(message).toContain('npx firebase deploy --only database');
  });
});
