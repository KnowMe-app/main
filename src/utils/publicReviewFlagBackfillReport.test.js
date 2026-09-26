import { describePublicReviewFlagBackfill } from './publicReviewFlagBackfillReport';

const base = {
  readError: null,
  profilesWithComments: 0,
  alreadyFlagged: 0,
  missingCardIds: [],
  written: [],
  failed: [],
  batchError: null,
};

describe('describePublicReviewFlagBackfill', () => {
  it('does not report success when a node could not be read', () => {
    // Саме так прогін і «вдавався»: нуль після відмови читався як «усе вже є».
    const { tone, message } = describePublicReviewFlagBackfill({
      ...base,
      readError: { node: 'comments', message: 'Permission denied', permissionDenied: true },
    });
    expect(tone).toBe('error');
    expect(message).toContain('comments');
    expect(message).toContain('PERMISSION_DENIED');
    expect(message).not.toMatch(/вже мали/i);
  });

  it('counts written, already flagged and cards without projection', () => {
    const { tone, message } = describePublicReviewFlagBackfill({
      ...base,
      profilesWithComments: 5,
      alreadyFlagged: 1,
      missingCardIds: ['TG0001'],
      written: ['a', 'b', 'c'],
    });
    expect(tone).toBe('success');
    expect(message).toContain('Карток з відгуками: 5');
    expect(message).toContain('Записано прапорець: 3');
    expect(message).toContain('Уже мали прапорець: 1');
    expect(message).toContain('TG0001');
  });

  it('names failed cards and the deploy command when every write is denied', () => {
    const failed = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(profileId => ({
      profileId, message: 'PERMISSION_DENIED', permissionDenied: true,
    }));
    const { tone, message } = describePublicReviewFlagBackfill({
      ...base, profilesWithComments: 7, failed,
    });
    expect(tone).toBe('error');
    expect(message).toContain('Не вдалося: 7 — a, b, c, d, e і ще 2');
    expect(message).toContain('npx firebase deploy --only database');
  });

  it('shows the first non-permission failure with its card id', () => {
    const { tone, message } = describePublicReviewFlagBackfill({
      ...base,
      profilesWithComments: 3,
      written: ['a'],
      failed: [
        { profileId: 'b', message: 'PERMISSION_DENIED', permissionDenied: true },
        { profileId: 'c', message: 'network error', permissionDenied: false },
      ],
    });
    expect(tone).toBe('error');
    expect(message).toContain('PERMISSION_DENIED: 1');
    expect(message).toContain('c: network error');
  });

  it('says there is nothing to do only when nothing was due', () => {
    const { tone, message } = describePublicReviewFlagBackfill({
      ...base, profilesWithComments: 2, alreadyFlagged: 2,
    });
    expect(tone).toBe('success');
    expect(message).toMatch(/^Нема чого дописувати/);
  });
});
