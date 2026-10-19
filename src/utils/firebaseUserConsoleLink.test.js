import { buildUserRtdbLink } from './firebaseUserConsoleLink';

describe('buildUserRtdbLink', () => {
  // Legacy `users` закрито, тож посилання веде на картку стрічки — вона є в
  // кожної анкети незалежно від формату id.
  it('links long Firebase Auth user IDs to their matching card', () => {
    expect(buildUserRtdbLink('Oghb1LphfASVOY3b6JO1Ov4CDyD2')).toContain(
      '/~2FmatchingCards~2FOghb1LphfASVOY3b6JO1Ov4CDyD2'
    );
  });

  it('links short user IDs to the same node', () => {
    expect(buildUserRtdbLink('TG0016')).toContain('/~2FmatchingCards~2FTG0016');
    expect(buildUserRtdbLink('TG0016')).not.toContain('~2Fusers~2F');
  });

  it('encodes user IDs before adding them to the Firebase path', () => {
    expect(buildUserRtdbLink('legacy/id')).toContain('/~2FmatchingCards~2Flegacy%2Fid');
  });
});
