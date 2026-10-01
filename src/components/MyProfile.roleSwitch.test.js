import fs from 'fs';
import path from 'path';
import { buildMatchingCardProjection } from '../utils/matchingCardIndex';
import { resolveMyProfileRoles } from './MyProfile';

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
    expect(source).toContain('await updateProfileRole(targetUserId, roles);');
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

describe('кілька ролей у «Моєму профілі»', () => {
  it('основна роль — остання, і сховання її не міняє', () => {
    // Донорка, яка ще й агентка, сховала донорську анкету: картка несе
    // лише агенцію, але основною лишається донорка.
    expect(resolveMyProfileRoles({ cardRole: 'ag', storedRole: ['ag', 'ed'], hiddenRoles: 'ed' })).toEqual(['ag', 'ed']);
    expect(resolveMyProfileRoles({ cardRole: ['ag', 'ed'], storedRole: 'ed', hiddenRoles: '' })).toEqual(['ag', 'ed']);
    expect(resolveMyProfileRoles({ cardRole: 'ip', storedRole: 'ed', hiddenRoles: '' })).toEqual(['ip']);
  });

  it('малює єдиний список чекбоксів і не дозволяє зняти останню роль', () => {
    const source = read('MyProfile.jsx');
    expect(source).toContain('type="checkbox"');
    expect(source).toContain('if (selected && rolesList.length === 1) return;');
    expect(source).not.toContain('Ще одна роль');
    expect(source).not.toContain('Друга анкета');
  });

  it('збирає окрему картку попереднього перегляду для кожної видимої ролі й показує їх перемикачем', () => {
    const source = read('MyProfile.jsx');
    expect(source).toContain('const previewCards = previewRoles.map(role =>');
    expect(source).toContain('previews={previewCards}');
    expect(source).toContain('ORGANISATION_ROLES.includes(role) && ownVisiblePrograms.length');
    expect(source).not.toContain('userRole: previewRoles.length > 1');
  });

  // Видимість анкет і публікація — в одному блоці; «сховати» вгорі й
  // «приховати» внизу були тією самою дією під двома словами.
  it('тримає статус, видимість ролей і публікацію в одному блоці «Публікація»', () => {
    const source = read('MyProfile.jsx');
    const card = source.slice(source.indexOf('data-testid="publish-card"'), source.indexOf('</SubmitWrap>'));
    expect(card).toContain('role="switch"');
    expect(card).toContain('onClick={() => toggleRoleHidden(role)}');
    expect(card).toContain('onClick={publishProfile}');
    expect(card).toContain('onClick={hideProfile}');
    expect(card).not.toContain('clearRoleFields');
    expect(source).not.toContain('RoleVisibilityList');
    expect(source).not.toContain("'Приховати'");
  });

  it('очищення ролі — у меню «⋮» і через ту саму модалку, без window.confirm', () => {
    const source = read('MyProfile.jsx');
    expect(source).toContain('clearRoleItems={isProfileAccessConfirmed && rolesList.length > 1');
    expect(source).toContain('onClick={() => clearRoleFields(clearRoleTarget)}');
    expect(source).not.toContain('window.confirm');
  });
});
