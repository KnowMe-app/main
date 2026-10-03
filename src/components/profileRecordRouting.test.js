import fs from 'fs';
import path from 'path';

/*
 * Чернетка — не готова анкета: її дані й журнал лежать у
 * `multiData/profileMutations` / `profileMutationHistory`, вузлів анкети в неї
 * немає. Екрани адміна читали й писали її як готову анкету: перечитування
 * («усі поля») питало вузли й лишало на екрані старе, а збереження заводило
 * поруч із чернеткою другу картку у вузлах і не лишало сліду в її журналі.
 *
 * Поведінку джерела перевіряє `utils/__tests__/profileRecordSource.test.js`;
 * тут — що кожен екран адміна справді йде через нього, і йде **до** писачів
 * готової анкети.
 */
const read = file => fs.readFileSync(path.join(__dirname, file), 'utf8');

const indexOrFail = (source, needle) => {
  const index = source.indexOf(needle);
  if (index < 0) throw new Error(`not found: ${needle}`);
  return index;
};

describe('екрани адміна над чернеткою', () => {
  it('AddNewProfile пише чернетку в неї саму раніше за вузли й індекси готової анкети', () => {
    const source = read('AddNewProfile.jsx');
    const remoteUpdate = source.slice(indexOrFail(source, 'async function remoteUpdate('));
    const draftBranch = indexOrFail(remoteUpdate, 'if (isDraftProfileRecord(syncedState)) {');
    expect(draftBranch).toBeLessThan(indexOrFail(remoteUpdate, 'syncUserSearchIdIndex('));
    expect(draftBranch).toBeLessThan(indexOrFail(remoteUpdate, 'updateProfileNodesInRTDB('));
    expect(remoteUpdate.slice(draftBranch, draftBranch + 400)).toContain('saveDraftProfileRecord({');
  });

  it('AddNewProfile на відкритті перечитує чернетку з її адреси, а без вузлів шукає чернетку', () => {
    const source = read('AddNewProfile.jsx');
    expect(source).toContain("fetchProfileRecordById(activeUserId, { prefer: 'draft', creatorUid: getDraftRecordCreator(base) })");
    expect(source).toContain('const data = await fetchProfileRecordById(activeUserId);');
    expect(source).toContain('if (isDraftProfileRecord(currentState)) revalidateDraftRecord(currentState);');
    expect(source).toContain('if (isDraftProfileRecord(cachedProfile)) revalidateDraftRecord(cachedProfile);');
  });

  it('EditProfile пише чернетку в неї саму раніше за вузли й legacy', () => {
    const source = read('EditProfile.jsx');
    const remoteUpdate = source.slice(indexOrFail(source, 'async function remoteUpdate('));
    const draftBranch = indexOrFail(remoteUpdate, 'if (isDraftProfileRecord(updatedState)) {');
    expect(draftBranch).toBeLessThan(indexOrFail(remoteUpdate, 'updateProfileNodesInRTDB('));
    expect(draftBranch).toBeLessThan(indexOrFail(remoteUpdate, 'updateDataInRealtimeDB('));
    expect(source).toContain('const data = await fetchProfileRecordById(userId);');
  });

  it('«усі поля» перечитують чернетку з її адреси, а не з вузлів готової анкети', () => {
    const source = read('smallCard/renderTopBlock.js');
    const refresh = source.slice(indexOrFail(source, 'const refreshCardFromBackend = async () => {'));
    expect(refresh.slice(0, 900)).toContain('fresh = await fetchProfileRecordById(cardData.userId, {');
    expect(refresh.slice(0, 900)).not.toContain('fetchUserById(cardData.userId)');
  });
});
