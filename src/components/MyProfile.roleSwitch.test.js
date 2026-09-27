import fs from 'fs';
import path from 'path';
import { buildMatchingCardProjection } from '../utils/matchingCardIndex';

const read = file => fs.readFileSync(path.join(__dirname, file), 'utf8');

/**
 * Роль анкети змінюється з `MyProfile` — і це не звичайне поле форми.
 *
 * Живе вона в картці стрічки, збирає її `deriveRole`, а той **обʼєднує**
 * `userRole` і `role`: два написання — це два записи про ту саму людину. Тобто
 * запис самого лише нового значення не замінює старе, а стає поруч, і анкета
 * лишається ще й у попередній ролі. Саме це тут і стережеться.
 */
describe('зміна ролі на MyProfile', () => {
  const myProfile = () => read('MyProfile.jsx');
  const config = () => read('config.js');

  it('дає вибір із тих самих ролей, які знають картка і фільтри', () => {
    // Перелік один на реєстрацію й на «Мій профіль» (`utils/profileRoleOptions`):
    // форма входу мала свій, із двох ролей, і батьки реєструвались під чужою.
    expect(myProfile()).toContain('const MY_PROFILE_ROLE_OPTIONS = PROFILE_ROLE_OPTIONS;');
    const options = fs.readFileSync(path.join(__dirname, '../utils/profileRoleOptions.js'), 'utf8');
    ['ed', 'sm', 'ip', 'ag', 'cl'].forEach(role => {
      expect(options).toContain(`value: '${role}'`);
    });
  });

  it('зберігає роль окремим шляхом, а не автозбереженням форми', () => {
    const source = myProfile();
    expect(source).toContain('await updateProfileRole(targetUserId, role);');
    // Поки анкети в базі немає, роль лишається в чернетці — писати нікуди.
    expect(source).toContain('if (!targetUserId) return;');
  });

  it('пише обидва написання ролі — інакше стара лишається поруч із новою', () => {
    const writer = config().slice(
      config().indexOf('export const updateProfileRole ='),
      config().indexOf('export const updateDataInRealtimeDB ='),
    );

    expect(writer).toContain("updateDataInRealtimeDB(id, { userRole: role, role }, 'update')");
    // Бакет ролі в `searchKey` — те, за чим фільтрує стрічка.
    expect(writer).toContain('syncUserSearchKeyIndex(');
  });

  // Та сама властивість, але вже на самій збірці картки: якби писали лише
  // `userRole`, у проєкції опинилися б обидві ролі.
  it('картка отримує рівно нову роль, а не обидві', () => {
    const bothKeys = buildMatchingCardProjection('AC00042', {
      userId: 'AC00042',
      name: 'Олена',
      userRole: 'ag',
      role: 'ag',
    });
    expect(bothKeys.role).toBe('ag');

    const onlyOneKey = buildMatchingCardProjection('AC00042', {
      userId: 'AC00042',
      name: 'Олена',
      userRole: 'ag',
      role: 'ed',
    });
    expect(onlyOneKey.role).toEqual(['ag', 'ed']);
  });
});
