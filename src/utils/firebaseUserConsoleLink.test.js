import { buildUserRtdbLink } from './firebaseUserConsoleLink';

describe('buildUserRtdbLink', () => {
  it('links long Firebase Auth user IDs to users', () => {
    expect(buildUserRtdbLink('Oghb1LphfASVOY3b6JO1Ov4CDyD2')).toContain(
      '/~2Fusers~2FOghb1LphfASVOY3b6JO1Ov4CDyD2'
    );
  });

  it('keeps short legacy user IDs in newUsers', () => {
    expect(buildUserRtdbLink('TG0016')).toContain('/~2FnewUsers~2FTG0016');
  });

  it('honors an explicit source collection for a long user ID', () => {
    expect(buildUserRtdbLink('Oghb1LphfASVOY3b6JO1Ov4CDyD2', 'newUsers')).toContain(
      '/~2FnewUsers~2FOghb1LphfASVOY3b6JO1Ov4CDyD2'
    );
  });

  it('encodes user IDs before adding them to the Firebase path', () => {
    expect(buildUserRtdbLink('legacy/id')).toContain('/~2FnewUsers~2Flegacy%2Fid');
  });
});
