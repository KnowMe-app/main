import { buildUserRtdbLink } from './firebaseUserConsoleLink';

describe('buildUserRtdbLink', () => {
  it('links long Firebase Auth user IDs to users', () => {
    expect(buildUserRtdbLink('Oghb1LphfASVOY3b6JO1Ov4CDyD2')).toContain(
      '/~2Fusers~2FOghb1LphfASVOY3b6JO1Ov4CDyD2'
    );
  });

  it('links short legacy user IDs to the same single collection', () => {
    expect(buildUserRtdbLink('TG0016')).toContain('/~2Fusers~2FTG0016');
  });

  it('encodes user IDs before adding them to the Firebase path', () => {
    expect(buildUserRtdbLink('legacy/id')).toContain('/~2Fusers~2Flegacy%2Fid');
  });
});
