import fs from 'fs';
import path from 'path';

// Поки анкета їхала з бази, «Мій профіль» малював порожню форму: «Заповнено 0
// з 10 · 0%», «бракує полів: 10», статус «Не опублікована». Людина, що
// повернулась до своєї анкети, бачила її стертою.
describe('«Мій профіль» не показує порожньої анкети, поки вона їде', () => {
  const source = fs.readFileSync(path.join(__dirname, 'MyProfile.jsx'), 'utf8');
  const loadBody = source.slice(
    source.indexOf('const loadAuthenticatedProfile = useCallback('),
    source.indexOf('const normalizeFieldValue = '),
  );

  it('чекає на анкету, щойно відомо, що людина увійшла', () => {
    expect(source).toContain('const [profileLoading, setProfileLoading] = useState(() => Boolean(auth.currentUser));');
    expect(loadBody.indexOf('setProfileLoading(true);')).toBeLessThan(loadBody.indexOf('await fetchUserById(uid)'));
  });

  it('знімає очікування і з даними, і з помилкою', () => {
    expect(loadBody.indexOf('mergeLoadedProfileData(loadedProfile, uid);'))
      .toBeLessThan(loadBody.indexOf('setProfileLoading(false);'));
    expect(loadBody.slice(loadBody.indexOf('} catch (error) {'))).toContain('setProfileLoading(false);');
  });

  it('тримає сторінку змонтованою, але невидимою, і не показує статусу до даних', () => {
    expect(source).toContain("...(profileLoading ? { visibility: 'hidden' } : null),");
    expect(source).toContain('{profileLoading ? <ProfileLoadingOverlay><ScreenLoading /></ProfileLoadingOverlay> : null}');
    expect(source).toContain('{navHeaderTarget && profileLoading ? null : navHeaderTarget ? createPortal(');
  });
});
