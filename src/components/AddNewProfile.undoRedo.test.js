import fs from 'fs';
import path from 'path';

const addNewProfileSource = fs.readFileSync(path.join(__dirname, 'AddNewProfile.jsx'), 'utf8');

/**
 * «Відмінити» і «повернути» — це запис знімка, а не показ знімка.
 *
 * Обидві кнопки працювали так: покласти знімок у стан і зберегти його
 * звичайним `handleSubmit(знімок)`. Але збереження анкети — це `update`: воно
 * вміє записати те, що в payload є, і не знає нічого про ключ, якого там
 * немає. Тож поле, заведене **після** знімка (уперше набрана пошта, телеграм,
 * нотатка), відміну переживало: з екрана зникало разом зі станом, у базі
 * лишалось — і поверталось у картку з першим же перечитуванням.
 *
 * Друге: для анкети акаунта (довгий id) писач зводить payload із перечитаною
 * копією (`makeUploadedInfo`). Без `overwrite` відмінене значення лягало в
 * історію поля **новою** версією поруч зі старою — тобто скаляр ставав
 * масивом, а «поточним» ставало те, що відміняли.
 */
describe('кнопки відміни на екрані анкет', () => {
  it('рахують, що саме треба зняти з бекенду', () => {
    expect(addNewProfileSource).toContain("import { listKeysAddedSince } from 'utils/profileHistoryDiff';");
    expect(addNewProfileSource).toContain('const applyProfileHistorySnapshot = async (target, previousSnapshot) => {');
    expect(addNewProfileSource).toContain('listKeysAddedSince(target, previousSnapshot).forEach(key => {');
  });

  it('знімають ключ тим самим шляхом, що й хрестик у «всіх полях»', () => {
    // `pendingDeletedKeysRef` → `deletedKeys` → `null` у payload: інших
    // способів прибрати ключ у цього писача немає.
    expect(addNewProfileSource).toContain('pendingDeletedKeysRef.current.add(key);');
    expect(addNewProfileSource).toContain("await handleSubmit(target, 'overwrite');");
  });

  it('обидві кнопки йдуть одним шляхом', () => {
    expect(addNewProfileSource).toContain('await applyProfileHistorySnapshot(previous, undoneState);');
    expect(addNewProfileSource).toContain('await applyProfileHistorySnapshot(next, undoneState);');
    // Стан, який відміняємо, треба зняти **до** того, як `history.current`
    // перепишуть знімком: інакше різницю рахувати нема з чим.
    expect(addNewProfileSource).toContain('const undoneState = cloneProfileState(history.current);');
  });
});
