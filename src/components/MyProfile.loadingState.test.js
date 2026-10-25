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
    expect(source).toContain('const [profileLoading, setProfileLoading] = useState(() => Boolean(auth.currentUser) && !cachedProfileView);');
    expect(loadBody.indexOf('setProfileLoading(true);')).toBeLessThan(loadBody.indexOf('await fetchUserById(uid)'));
  });

  // Перезавантаження «Мого профілю» стояло на заставці весь час читання бази,
  // хоч анкета з минулого разу не змінилась. Тепер сторінка малює анкету з
  // памʼяті пристрою, а свіжа лягає поверх без заставки.
  it('показує анкету з памʼяті пристрою одразу й не ховає її за заставкою', () => {
    expect(source).toContain('const [cachedProfileView] = useState(readCachedMyProfileView);');
    expect(loadBody).toContain('if (!showsCachedProfile) setProfileLoading(true);');
    expect(loadBody).toContain('writeMyProfileCache(uid, existingData)');
  });

  // `fetchUserById` віддає `null` і на збій мережі — порожнеча не мусить
  // стерти з екрана вже показану анкету.
  it('не підміняє показану з кеша анкету порожнечею збою', () => {
    expect(loadBody).toContain('if (!nodesProfile && showsCachedProfile) {');
    expect(loadBody.indexOf('if (!nodesProfile && showsCachedProfile) {'))
      .toBeLessThan(loadBody.indexOf('persistedProfileRef.current = { uid, data: existingData };'));
  });

  it('стирає памʼять анкети на виході', () => {
    const exitBody = source.slice(source.indexOf('const handleExit = async () => {'));
    expect(exitBody.slice(0, exitBody.indexOf('};'))).toContain('clearMyProfileCache();');
    const appSource = fs.readFileSync(path.join(__dirname, 'App.jsx'), 'utf8');
    expect(appSource).toContain('clearMyProfileCache();');
  });

  it('знімає очікування і з даними, і з помилкою', () => {
    const mergeAt = loadBody.indexOf('mergeLoadedProfileData(loadedProfile, uid);');
    const releaseAfterMerge = loadBody.indexOf('setProfileLoading(false);', mergeAt);
    expect(mergeAt).toBeGreaterThan(-1);
    expect(releaseAfterMerge).toBeGreaterThan(mergeAt);
    expect(releaseAfterMerge).toBeLessThan(loadBody.indexOf('} catch (error) {'));
    expect(loadBody.slice(loadBody.indexOf('} catch (error) {'))).toContain('setProfileLoading(false);');
  });

  it('тримає сторінку змонтованою, але невидимою, і не показує статусу до даних', () => {
    expect(source).toContain("...(profileLoading ? { visibility: 'hidden' } : null),");
    expect(source).toContain('{profileLoading ? <ProfileLoadingOverlay><ScreenLoading /></ProfileLoadingOverlay> : null}');
    expect(source).toContain('{navHeaderTarget && profileLoading ? null : navHeaderTarget ? createPortal(');
  });
});
