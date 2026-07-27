import fs from 'fs';
import path from 'path';

// Regression test for: a hung remoteUpdate (a stuck network call, a
// backgrounded mobile tab throttling a pending request...) would wedge
// syncQueueRef forever, since every later submit on the same EditProfile
// page instance chains off syncQueueRef.current - a promise that would
// never resolve or reject. Every edit made afterwards would silently and
// permanently fail to save, with no error surfacing anywhere (no toast, no
// console message visible without devtools). Fix: race remoteUpdate against
// a timeout inside runSync, and surface any failure (timeout or otherwise)
// via toast.error so it's never silent again.
describe('enqueueProfileSync times out a hung remoteUpdate and surfaces failures to the user', () => {
  const source = fs.readFileSync(path.join(__dirname, 'EditProfile.jsx'), 'utf8');

  const runSyncBody = source.slice(
    source.indexOf('const runSync = async () => {'),
    source.indexOf('const queuedSync = syncQueueRef.current')
  );

  it('races remoteUpdate against a timeout instead of awaiting it unbounded', () => {
    expect(runSyncBody).toContain('runSyncWithTimeout(');
    expect(runSyncBody).toContain('remoteUpdate({ updatedState, overwrite, delCondition, deletedKeys })');
  });

  it('surfaces any remoteUpdate failure (including a timeout) via toast.error', () => {
    expect(runSyncBody).toContain('} catch (error) {');
    expect(runSyncBody).toContain("toast.error(`Не вдалося зберегти зміни профілю.\\n${error?.message || String(error)}`);");
  });

  it('rethrows after reporting, so syncQueueRef still recovers via its existing catch and does not treat a failed sync as successful', () => {
    const catchBlock = runSyncBody.slice(runSyncBody.indexOf('} catch (error) {'));
    expect(catchBlock).toContain('throw error;');
  });

  it('runSyncWithTimeout rejects with the given message once the timeout elapses, without leaking the timer once settled', () => {
    const helperBody = source.slice(
      source.indexOf('const runSyncWithTimeout ='),
      source.indexOf('const EditProfile = () => {')
    );
    expect(helperBody).toContain('setTimeout(() => reject(new Error(message)), timeoutMs)');
    expect(helperBody).toContain('clearTimeout(timer);');
  });
});
