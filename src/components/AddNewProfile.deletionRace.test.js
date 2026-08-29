import fs from 'fs';
import path from 'path';

// Regression test for: deleting several fields in quick succession via
// renderAllFields could resurrect an earlier-deleted field and ship it back
// to the backend - only the last deletion in a rapid burst would stick.
// Root cause (two compounding bugs, ported fix from EditProfile.jsx):
//  1) handleClear/handleDelKeyValue used to call handleSubmit (which does its
//     own setState + fires an unawaited network write) *from inside* the
//     setState(prevState => ...) updater callback, and captured the computed
//     newState via a variable assigned inside that same callback. React only
//     runs a setState updater synchronously via an internal, unguaranteed
//     "eager state" optimization, which stops applying once another update
//     is already pending on the fiber - not guaranteed once handleSubmit's
//     own setState call schedules one immediately afterward. The fix reads
//     and writes a plain ref (liveFieldsRef) with ordinary synchronous JS
//     instead, which has no such scheduling ambiguity.
//  2) handleSubmit had no write serialization and no delete-only minimal
//     payload: concurrent calls' fetch+merge+write could land on the backend
//     in any order, and even a pure deletion went through the full
//     makeUploadedInfo merge, whose frozen local snapshot could resurrect a
//     sibling field a different, faster-completing call had already deleted.
describe('handleClear/handleDelKeyValue read/write liveFieldsRef synchronously instead of capturing via a setState updater', () => {
  const source = fs.readFileSync(path.join(__dirname, 'AddNewProfile.jsx'), 'utf8');

  const extractFnBody = (startMarker, endMarker) => {
    const start = source.indexOf(startMarker);
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf(endMarker, start);
    expect(end).toBeGreaterThan(start);
    return source.slice(start, end);
  };

  it('handleClear reads liveFieldsRef.current directly, writes it back, then calls handleSubmit', () => {
    const fnBody = extractFnBody(
      'const handleClear = (fieldName, idx) => {',
      'const handleDelKeyValue = fieldName => {'
    );

    expect(fnBody).not.toMatch(/setState\(\s*prev(State)?\s*=>/);
    expect(fnBody).toContain('const prevState = liveFieldsRef.current;');
    expect(fnBody.indexOf('liveFieldsRef.current = newState;')).toBeLessThan(
      fnBody.indexOf('setState(newState);')
    );
    expect(fnBody).toContain("handleSubmit(newState, 'overwrite', delCondition);");
  });

  it('handleDelKeyValue reads liveFieldsRef.current directly, writes it back, then calls handleSubmit', () => {
    const fnBody = extractFnBody(
      'const handleDelKeyValue = fieldName => {',
      'const [isEmailVerified, setIsEmailVerified] = useState(false);'
    );

    expect(fnBody).not.toMatch(/setState\(\s*prev(State)?\s*=>/);
    expect(fnBody).toContain('const prevState = liveFieldsRef.current;');
    expect(fnBody.indexOf('liveFieldsRef.current = newState;')).toBeLessThan(
      fnBody.indexOf('setState(newState);')
    );
    expect(fnBody).toContain(
      "handleSubmit(newState, 'overwrite', { [fieldName]: deletedValue });"
    );
  });

  it('handleSubmit keeps liveFieldsRef in sync with its own optimistic setState(optimisticCard) call', () => {
    const fnBody = extractFnBody(
      'const handleSubmit = (newState, overwrite, delCondition) => {',
      'const handleExit = async () => {'
    );

    expect(fnBody.indexOf('liveFieldsRef.current = optimisticCard;')).toBeLessThan(
      fnBody.indexOf('setState(optimisticCard, {')
    );
  });
});

describe("remoteUpdate is serialized through enqueueProfileSync and sends a minimal null-only payload for pure field deletions", () => {
  const source = fs.readFileSync(path.join(__dirname, 'AddNewProfile.jsx'), 'utf8');
  const remoteUpdateBody = source.slice(
    source.indexOf('async function remoteUpdate('),
    source.indexOf('const enqueueProfileSync = params => {')
  );

  it('derives deleteOnlyKeys from the accumulated deletedKeys, not just this call\'s own delCondition', () => {
    expect(remoteUpdateBody).toContain(
      "const deleteOnlyKeys = delCondition\n      ? (deletedKeys || []).filter(key => key && key !== 'userId')\n      : [];"
    );
    expect(remoteUpdateBody).toContain('const isDeleteOnlySubmit = deleteOnlyKeys.length > 0;');
  });

  it('long-userId delete-only branch nulls every deleted key + lastAction, never touching makeUploadedInfo', () => {
    const longBranch = remoteUpdateBody.slice(
      remoteUpdateBody.indexOf("if (syncedState?.userId?.length > 20) {"),
      remoteUpdateBody.indexOf('} else {\n      if (isDeleteOnlySubmit) {')
    );
    const deleteBranch = longBranch.slice(
      longBranch.indexOf('if (isDeleteOnlySubmit) {'),
      longBranch.indexOf('} else {')
    );

    expect(deleteBranch).toContain('const deletePayload = { lastAction: syncedState.lastAction };');
    // Відбору за назвою ключа тут бути не має. Він лишався з часів, коли анкета
    // була розділена між двома колекціями: половина полів належала другій, тож
    // null за таким ключем викидався з пейлоада — і writer, role, lastCycle було
    // видно на картці й неможливо видалити. Колекція одна, і знімається все.
    expect(deleteBranch).not.toContain('isUsersAllowedField');
    expect(deleteBranch).toContain('deleteOnlyKeys.forEach(key => {');
    expect(deleteBranch).toContain('deletePayload[key] = null;');
    expect(deleteBranch).not.toContain('makeUploadedInfo(');
    expect(deleteBranch).toContain(
      "await Promise.all([\n          updateDataInRealtimeDB(syncedState.userId, deletePayload, 'update'),\n          updateDataInFiresoreDB(syncedState.userId, deletePayload, 'check', delCondition),\n        ]);"
    );
  });

  it('short-userId delete-only branch writes a minimal deletePayload with no skipIndexing argument', () => {
    const shortBranch = remoteUpdateBody.slice(
      remoteUpdateBody.indexOf("} else {\n      if (isDeleteOnlySubmit) {")
    );
    const deleteBranch = shortBranch.slice(
      shortBranch.indexOf('if (isDeleteOnlySubmit) {'),
      shortBranch.indexOf('} else if (hasNewState) {')
    );

    expect(deleteBranch).toContain('const deletePayload = { lastAction: syncedState.lastAction };');
    expect(deleteBranch).toContain(
      "await updateProfileNodesInRTDB(syncedState.userId, deletePayload, 'update');"
    );
  });

  it('non-admin overlay write happens inside remoteUpdate, not inline in handleSubmit', () => {
    expect(remoteUpdateBody).toContain('if (!isAdmin) {');
    expect(remoteUpdateBody).toContain('saveOverlayForUserCard(');

    const handleSubmitBody = source.slice(
      source.indexOf('const handleSubmit = (newState, overwrite, delCondition) => {'),
      source.indexOf('const handleExit = async () => {')
    );
    expect(handleSubmitBody).not.toContain('saveOverlayForUserCard(');
  });

  it('every write is chained onto syncQueueRef so submissions execute in strict order', () => {
    const enqueueBody = source.slice(
      source.indexOf('const enqueueProfileSync = params => {'),
      source.indexOf('const handleSubmit = (newState, overwrite, delCondition) => {')
    );

    expect(enqueueBody).toContain('syncQueueRef.current');
    expect(enqueueBody).toContain('.then(runSync)');
  });
});

describe('handleBlur is left untouched by this fix (separate, pre-existing hazard)', () => {
  const source = fs.readFileSync(path.join(__dirname, 'AddNewProfile.jsx'), 'utf8');

  it('still calls handleSubmit(normalizedState, baseFieldName) unchanged', () => {
    expect(source).toContain('handleSubmit(normalizedState, baseFieldName);');
  });
});
